import Anthropic from "@anthropic-ai/sdk";
import { buildContext, getAllDocs } from "./knowledgeBase.js";

// Singleton — one client for the lifetime of the process
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT_TEMPLATE = `Tu es l'assistant virtuel de DigiCitoyen ASBL, une association bruxelloise d'inclusion numérique.
Date d'aujourd'hui : {{TODAY}}

Réponds toujours en français, de façon chaleureuse et accessible.
Sois concis (3-5 phrases max par réponse sauf si on te demande des détails).
N'utilise JAMAIS de markdown (pas de **, *, #, _, etc.). Texte brut uniquement.

BASE DE CONNAISSANCES:
{{CONTEXT}}

RÈGLES:
1. Réponds uniquement sur la base des documents ci-dessus.
2. Si une question dépasse tes connaissances, dis-le honnêtement et propose de contacter info@digicitoyen.be ou d'appeler le +32 2 218 44 67.
3. Ne réponds pas à des questions hors-sujet de DigiCitoyen ASBL.
4. RÈGLE ABSOLUE — vérification du calendrier :
   Dès que l'utilisateur mentionne une date, une disponibilité, "demain", "cette semaine", "quand", "à quelle heure", "est-ce possible", ou veut prendre rendez-vous/s'inscrire :
   - Réponds UNIQUEMENT avec une courte phrase comme "Je vérifie les créneaux disponibles..." ou "Je consulte le calendrier pour vous."
   - NE pose AUCUNE question supplémentaire sur le type de service ou l'heure.
   - Termine TOUJOURS par ##INTENT:BOOK_APPOINTMENT##
   - Le système affichera automatiquement les vrais créneaux libres (lundi–vendredi, 9h–17h). Si jeudi est complet, les créneaux de vendredi seront proposés automatiquement.

FORMAT SPÉCIAL:
- Pour indiquer un document pertinent, mentionne son titre entre [crochets] dans ta réponse.`;

function buildSystemPrompt(userMessage) {
  const today = new Date().toLocaleDateString("fr-BE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Europe/Brussels",
  });
  const context = buildContext(userMessage);
  return SYSTEM_PROMPT_TEMPLATE
    .replace("{{TODAY}}", today)
    .replace("{{CONTEXT}}", context);
}

/**
 * @param {Array<{role: string, content: string}>} history
 * @param {string} userMessage
 * @returns {Promise<{reply: string, intent: string|null, suggestedDocs: Array}>}
 */
export async function chat(history, userMessage) {
  const messages = [
    ...history.slice(-10), // 10 messages = 5 turns — enough context, cheaper than 20
    { role: "user", content: userMessage },
  ];

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    system: buildSystemPrompt(userMessage),
    messages,
  });

  const rawText = response.content[0].text;

  let intent = null;
  let reply = rawText;

  if (rawText.includes("##INTENT:BOOK_APPOINTMENT##")) {
    intent = "BOOK_APPOINTMENT";
    reply = rawText.replace("##INTENT:BOOK_APPOINTMENT##", "").trim();
  }

  // Match relevant docs from the loaded knowledge base
  const replyLower = reply.toLowerCase();
  const suggestedDocs = getAllDocs().filter((doc) => {
    const keywords = doc.title.toLowerCase().split(" ").filter((w) => w.length > 4);
    return keywords.some((kw) => replyLower.includes(kw));
  });

  return { reply, intent, suggestedDocs };
}
