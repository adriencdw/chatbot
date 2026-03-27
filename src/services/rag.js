import Anthropic from "@anthropic-ai/sdk";
import { buildContext, getAllDocs } from "./knowledgeBase.js";
import { queryFreebusy } from "./calendar.js";

// Singleton — one client for the lifetime of the process
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Tool the agent can call ────────────────────────────────────────

const TOOLS = [
  {
    name: "query_freebusy",
    description:
      "Interroge Google Calendar pour une période donnée (heures de bureau : lun–ven, 9h–17h). " +
      "Retourne les plages OCCUPÉES (pour que tu raisonnes) et les créneaux LIBRES d'1h (qui s'afficheront en boutons). " +
      "Utilise cet outil de façon dynamique selon le contexte :\n" +
      "• Utilisateur mentionne une date précise → interroge ce jour de 09:00 à 17:00\n" +
      "• Utilisateur veut les prochaines dispos → interroge les 7 prochains jours ouvrables\n" +
      "• Utilisateur demande si un créneau précis est libre → interroge ce jour et réponds directement\n" +
      "• Utilisateur veut des dates plus tard → interroge à partir de la date demandée\n" +
      "Ne liste JAMAIS les créneaux libres en texte — ils s'affichent automatiquement en boutons cliquables.",
    input_schema: {
      type: "object",
      properties: {
        date_debut: {
          type: "string",
          description:
            "Début de la période à interroger. Format ISO 8601 sans fuseau horaire, " +
            "en heure de Bruxelles. Exemple : '2026-03-31T09:00:00'.",
        },
        date_fin: {
          type: "string",
          description:
            "Fin de la période à interroger. Format ISO 8601 sans fuseau horaire, " +
            "en heure de Bruxelles. Exemple : '2026-03-31T17:00:00'.",
        },
      },
      required: ["date_debut", "date_fin"],
    },
  },
];

// ── Tool execution ─────────────────────────────────────────────────

async function executeTool(name, input) {
  if (name === "query_freebusy") {
    return await queryFreebusy({ dateDebut: input.date_debut, dateFin: input.date_fin });
  }
  throw new Error(`Unknown tool: ${name}`);
}

// ── System prompt ──────────────────────────────────────────────────

const SYSTEM_PROMPT_TEMPLATE = `Tu es l'assistant virtuel de DigiCitoyen ASBL, une association bruxelloise d'inclusion numérique.
Date d'aujourd'hui : {{TODAY}}

Prochains jours ouvrables (référence exacte pour les dates ISO — ne calcule pas toi-même) :
{{WORKING_DAYS}}

Réponds toujours en français, de façon chaleureuse et accessible.
Sois concis (3-5 phrases max par réponse sauf si on te demande des détails).
N'utilise JAMAIS de markdown (pas de **, *, #, _, etc.). Texte brut uniquement.

BASE DE CONNAISSANCES:
{{CONTEXT}}

RÈGLES:
1. Réponds uniquement sur la base des documents ci-dessus.
2. Si une question dépasse tes connaissances, dis-le honnêtement et propose de contacter info@digicitoyen.be ou +32 2 218 44 67.
3. Ne réponds pas à des questions hors-sujet de DigiCitoyen ASBL.
4. PRISE DE RENDEZ-VOUS — utilise query_freebusy de façon intelligente :
   - Si l'utilisateur n'a pas de date précise en tête → demande : "Avez-vous une date précise en tête, ou voulez-vous voir les premières disponibilités ?"
   - Si l'utilisateur donne une date précise → interroge ce jour de 09:00 à 17:00, puis réponds directement ("Oui, 14h est disponible" ou "Ce jour-là il n'y a plus de place").
   - Si l'utilisateur veut les prochaines dispos → interroge les 7 prochains jours ouvrables.
   - Si l'utilisateur demande si un créneau précis est libre → vérifie et réponds clairement.
   - Tu reçois plages_occupees (les réservations existantes) et creneaux_libres (les créneaux disponibles d'1h).
   - Ne liste PAS les créneaux en texte — ils s'affichent automatiquement en boutons sous ta réponse.
   - Si pertinent, propose "Voir des horaires plus tôt" ou "Voir d'autres disponibilités".

FORMAT SPÉCIAL:
- Pour indiquer un document pertinent, mentionne son titre entre [crochets] dans ta réponse.`;

function buildSystemPrompt(userMessage) {
  const now = new Date();

  const today = now.toLocaleDateString("fr-BE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Europe/Brussels",
  });

  // Generate next 14 working days with their exact ISO date, so Claude never miscounts
  const workingDays = [];
  const cursor = new Date(now.toLocaleString("en-CA", { timeZone: "Europe/Brussels" }).slice(0, 10) + "T00:00:00");
  while (workingDays.length < 14) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.toLocaleDateString("en-US", { timeZone: "Europe/Brussels", weekday: "short" });
    if (dow !== "Sat" && dow !== "Sun") {
      const isoDate = cursor.toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
      const label   = cursor.toLocaleDateString("fr-BE", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
        timeZone: "Europe/Brussels",
      });
      workingDays.push(`${label} → utilisez la date ISO ${isoDate} pour cet outil`);
    }
  }

  return SYSTEM_PROMPT_TEMPLATE
    .replace("{{TODAY}}", today)
    .replace("{{WORKING_DAYS}}", workingDays.join("\n"))
    .replace("{{CONTEXT}}", buildContext(userMessage));
}

// ── Agent loop ─────────────────────────────────────────────────────

/**
 * @param {Array<{role: string, content: string}>} history
 * @param {string} userMessage
 * @returns {Promise<{reply: string, slots: Array, suggestedDocs: Array}>}
 */
export async function chat(history, userMessage) {
  const messages = [
    ...history.slice(-10),
    { role: "user", content: userMessage },
  ];

  let slotsToReturn = [];

  // Agent loop — runs until Claude stops calling tools
  while (true) {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: buildSystemPrompt(userMessage),
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "tool_use") {
      const toolResults = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        console.log("[agent] tool call:", block.name, JSON.stringify(block.input));
        let result;
        let isError = false;
        try {
          result = await executeTool(block.name, block.input);
          if (block.name === "query_freebusy") {
            // Accumulate slots across multiple tool calls (Claude may call the tool several times)
            slotsToReturn = [...slotsToReturn, ...result.slots];
          }
        } catch (err) {
          result = { error: err.message };
          isError = true;
        }

        // Send Claude the reasoning data (busy intervals + free slot labels)
        // Full slot objects (with ISO datetimes) are kept in slotsToReturn for the UI
        const contentForClaude = isError
          ? result
          : {
              creneaux_libres: result.slots.map((s) => s.label),
              plages_occupees: result.plages_occupees,
            };

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(contentForClaude),
          ...(isError && { is_error: true }),
        });
      }

      // Append Claude's tool-call turn + our results, then loop
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

    } else {
      // stop_reason === "end_turn" — final text response
      const reply = response.content.find((b) => b.type === "text")?.text ?? "";

      const replyLower = reply.toLowerCase();
      const suggestedDocs = getAllDocs().filter((doc) => {
        const keywords = doc.title.toLowerCase().split(" ").filter((w) => w.length > 4);
        return keywords.some((kw) => replyLower.includes(kw));
      });

      return { reply, slots: slotsToReturn, fullDays: [], suggestedDocs };
    }
  }
}
