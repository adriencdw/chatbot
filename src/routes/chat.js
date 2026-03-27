import express from "express";
import rateLimit from "express-rate-limit";
import { chat } from "../services/rag.js";

const router = express.Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/", limiter, async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "message requis" });
    }
    if (message.length > 500) {
      return res.status(400).json({ error: "message trop long (max 500 caractères)" });
    }

    const result = await chat(history, message.trim());
    res.json(result);
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
