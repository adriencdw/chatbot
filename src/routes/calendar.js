import express from "express";
import { getAvailableSlots } from "../services/calendar.js";

const router = express.Router();

router.get("/", async (_, res) => {
  try {
    const { slots, fullDays } = await getAvailableSlots();
    res.json({ slots, fullDays });
  } catch (err) {
    console.error("Calendar error:", err);
    res.status(500).json({ error: "Calendrier indisponible" });
  }
});

export default router;
