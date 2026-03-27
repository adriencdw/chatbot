import Anthropic from "@anthropic-ai/sdk";
import { buildContext, getAllDocs } from "./knowledgeBase.js";
import { getAvailableSlots } from "./calendar.js";

// Singleton — one client for the lifetime of the process
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Tools the agent can call ──────────────────────────────────────

const TOOLS = [
  {
    name: "get_available_slots",
    description:
      "Consulte le calendrier DigiCitoyen et retourne les créneaux libres (lundi–vendredi, 9h–17h, durée 1h). " +
      "Appelle cet outil dès que l'utilisateur mentionne une date, demande des disponibilités, ou veut prendre rendez-vous. " +
      "Ne pose pas de questions avant d'appeler l'outil.",
    input_schema: {
      type: "object",
      properties: {
        offset_days: {
          type: "number",
          description:
            "Nombre de jours à partir d'aujourd'hui pour commencer la recherche. " +
            "0 par défaut (prochains créneaux). Utiliser une valeur positive si l'utilisateur veut des créneaux plus éloignés.",
        },
      },
      required: [],
    },
  },
];

// ── Tool execution ────────────────────────────────────────────────

async function executeTool(name, input) {
  if (name === "get_available_slots") {
    return await getAvailableSlots({ offsetDays: input.offset_days || 0 });
  }
  throw new Error(`Unknown tool: ${name}`);
}

// ── System prompt ─────────────────────────────────────────────────

const SYSTEM_PROMPT_TEMPLATE = `Tu es l'assistant virtuel de DigiCitoyen ASBL, une association bruxelloise d'inclusion numérique.
Date d'aujourd'hui : {{TODAY}}

Réponds toujours en français, de façon chaleureuse et accessible.
Sois concis (3-5 phrases max par réponse sauf si on te demande des détails).
N'utilise JAMAIS de markdown (pas de **, *, #, _, etc.). Texte brut uniquement.

BASE DE CONNAISSANCES:
{{CONTEXT}}

RÈGLES:
1. Réponds uniquement sur la base des documents ci-dessus.
2. Si une question dépasse tes connaissances, dis-le honnêtement et propose de contacter info@digicitoyen.be ou +32 2 218 44 67.
3. Ne réponds pas à des questions hors-sujet de DigiCitoyen ASBL.
4. PRISE DE RENDEZ-VOUS : Dès que l'utilisateur mentionne une date, une disponibilité, ou veut prendre rendez-vous :
   - Utilise immédiatement l'outil get_available_slots pour consulter le vrai calendrier.
   - Explique la situation dans ta réponse (ex : "Lundi est complet, voici les prochains créneaux disponibles :").
   - Ne liste PAS les créneaux en texte — ils s'afficheront automatiquement sous forme de boutons cliquables.
   - Si l'utilisateur veut des créneaux plus tard, rappelle l'outil avec un offset_days approprié.

FORMAT SPÉCIAL:
- Pour indiquer un document pertinent, mentionne son titre entre [crochets] dans ta réponse.`;

function buildSystemPrompt(userMessage) {
  const today = new Date().toLocaleDateString("fr-BE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Europe/Brussels",
  });
  return SYSTEM_PROMPT_TEMPLATE
    .replace("{{TODAY}}", today)
    .replace("{{CONTEXT}}", buildContext(userMessage));
}

// ── Agent loop ────────────────────────────────────────────────────

/**
 * @param {Array<{role: string, content: string}>} history
 * @param {string} userMessage
 * @returns {Promise<{reply: string, slots: Array, fullDays: Array, suggestedDocs: Array}>}
 */
export async function chat(history, userMessage) {
  const messages = [
    ...history.slice(-10),
    { role: "user", content: userMessage },
  ];

  let slotsToReturn = [];
  let fullDaysToReturn = [];

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
      // Execute every tool Claude requested in this turn
      const toolResults = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        let result;
        let isError = false;
        try {
          result = await executeTool(block.name, block.input);
          if (block.name === "get_available_slots") {
            slotsToReturn = result.slots;
            fullDaysToReturn = result.fullDays;
          }
        } catch (err) {
          result = { error: err.message };
          isError = true;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
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

      return { reply, slots: slotsToReturn, fullDays: fullDaysToReturn, suggestedDocs };
    }
  }
}
