import express from "express";
import { queryFreebusy } from "../services/calendar.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const offsetDays = Math.min(Math.max(parseInt(req.query.offsetDays) || 0, 0), 60);
    const now = new Date();
    const start = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    const end   = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    // Format as Brussels local ISO string (TZ=Europe/Brussels is set)
    const toLocalISO = (d) => {
      const s = d.toLocaleString("sv-SE", { timeZone: "Europe/Brussels" });
      return s.replace(" ", "T");
    };
    const { slots } = await queryFreebusy({ dateDebut: toLocalISO(start), dateFin: toLocalISO(end) });
    res.json({ slots, fullDays: [] });
  } catch (err) {
    console.error("Calendar error:", err);
    res.status(500).json({ error: "Calendrier indisponible" });
  }
});

export default router;
