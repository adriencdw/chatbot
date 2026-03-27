/**
 * Dynamic knowledge base — reads all PDFs from /pdfs/ at startup.
 * Uses TF-IDF scoring to find the most relevant docs for each query.
 * No embeddings API needed. Add/remove PDFs without code changes.
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
import { readFileSync, readdirSync } from "fs";
import { join, basename, extname } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF_DIR = join(__dirname, "../../pdfs");

// ── Load all PDFs at startup ──────────────────────────────────────

let docs = []; // { id, title, pdfUrl, content, tokens }
let cachedIDF = null; // pre-computed once after loadKnowledgeBase(), never stale

export async function loadKnowledgeBase() {
  const files = readdirSync(PDF_DIR).filter((f) => extname(f) === ".pdf");

  const loaded = await Promise.all(
    files.map(async (file) => {
      try {
        const buffer = readFileSync(join(PDF_DIR, file));
        const parsed = await pdfParse(buffer);
        const title = basename(file, ".pdf")
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        return {
          id: basename(file, ".pdf"),
          title,
          pdfUrl: `/pdfs/${file}`,
          content: parsed.text.trim(),
          tokens: tokenize(parsed.text),
        };
      } catch (err) {
        console.warn(`Could not parse ${file}:`, err.message);
        return null;
      }
    })
  );

  docs = loaded.filter(Boolean);
  cachedIDF = computeIDF(docs); // compute once — docs never change after startup
  console.log(`Knowledge base loaded: ${docs.length} PDF(s)`);
}

// ── TF-IDF retrieval ─────────────────────────────────────────────

/**
 * Returns the top-k most relevant docs for a query string.
 */
export function getRelevantDocs(query, topK = 3) {
  if (docs.length === 0) return [];

  const queryTokens = tokenize(query);
  const idf = cachedIDF ?? computeIDF(docs);

  const scored = docs.map((doc) => ({
    doc,
    score: tfidfScore(queryTokens, doc.tokens, idf),
  }));

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.doc);
}

/**
 * Returns all docs as a formatted text block for the system prompt.
 * Only includes docs relevant to the query if provided.
 */
export function buildContext(query) {
  const relevant = query ? getRelevantDocs(query, 4) : docs.slice(0, 4);
  if (relevant.length === 0) {
    // Fallback: use all docs (works if there are only a few)
    return docs.map((d) => `=== ${d.title} ===\n${d.content}`).join("\n\n");
  }
  return relevant.map((d) => `=== ${d.title} ===\n${d.content}`).join("\n\n");
}

export function getAllDocs() {
  return docs.map(({ id, title, pdfUrl }) => ({ id, title, pdfUrl }));
}

// ── Helpers ──────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "le", "la", "les", "de", "du", "des", "un", "une", "et", "en", "au", "aux",
  "est", "sont", "pour", "par", "sur", "dans", "avec", "qui", "que", "ou",
  "à", "il", "elle", "nous", "vous", "ils", "elles", "se", "ce", "si",
  "the", "a", "an", "of", "in", "to", "and", "is", "for", "on", "with",
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-zàâäéèêëîïôùûüç0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function computeIDF(allDocs) {
  const df = {};
  for (const doc of allDocs) {
    const unique = new Set(doc.tokens);
    for (const token of unique) {
      df[token] = (df[token] || 0) + 1;
    }
  }
  const N = allDocs.length;
  const idf = {};
  for (const [token, count] of Object.entries(df)) {
    idf[token] = Math.log((N + 1) / (count + 1)) + 1;
  }
  return idf;
}

function tfidfScore(queryTokens, docTokens, idf) {
  const tf = {};
  for (const t of docTokens) tf[t] = (tf[t] || 0) + 1;
  const total = docTokens.length || 1;

  return queryTokens.reduce((sum, qt) => {
    const tfScore = (tf[qt] || 0) / total;
    const idfScore = idf[qt] || 0;
    return sum + tfScore * idfScore;
  }, 0);
}
