import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import chatRouter from "./src/routes/chat.js";
import calendarRouter from "./src/routes/calendar.js";
import appointmentRouter from "./src/routes/appointment.js";
import { loadKnowledgeBase } from "./src/services/knowledgeBase.js";

dotenv.config();
await loadKnowledgeBase();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1); // Modal runs behind a reverse proxy

const allowedOrigins = [
  process.env.FRONTEND_ORIGIN || "https://build-ai.be",
  "http://localhost:5173",
  "http://localhost:4173",
];
app.use(cors({
  origin: (origin, cb) => {
    // allow requests with no origin (curl, Postman, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
}));
app.use(express.json({ limit: "50kb" }));

app.use("/api/chat", chatRouter);
app.use("/api/slots", calendarRouter);
app.use("/api", appointmentRouter);

// Serve generated PDFs statically
app.use("/pdfs", express.static(join(__dirname, "pdfs")));

app.get("/api/health", (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Global error handler — catches any unhandled errors from routes
// Returns clean JSON instead of raw stack traces
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Erreur interne du serveur" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`DigiCitoyen backend running on port ${PORT}`));
