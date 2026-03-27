import express from "express";
import { getAvailableSlots } from "../services/calendar.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const offsetDays = Math.min(Math.max(parseInt(req.query.offsetDays) || 0, 0), 60);
    const { slots, fullDays } = await getAvailableSlots({ offsetDays });
    res.json({ slots, fullDays });
  } catch (err) {
    console.error("Calendar error:", err);
    res.status(500).json({ error: "Calendrier indisponible" });
  }
});

export default router;
