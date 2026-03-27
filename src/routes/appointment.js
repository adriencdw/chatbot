import express from "express";
import { randomUUID } from "crypto";
import rateLimit from "express-rate-limit";
import { saveAppointment, getAppointment, deleteAppointment } from "../services/tokenStore.js";
import { sendManagerNotification, sendUserConfirmation, sendUserRejection } from "../services/email.js";
import { createCalendarEvent } from "../services/calendar.js";

const router = express.Router();

const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/appointment — create pending appointment, email manager
router.post("/appointment", bookingLimiter, async (req, res) => {
  try {
    const { name, email, reason, slot } = req.body;

    if (!name || !email || !slot?.start || !slot?.end || !slot?.label) {
      return res.status(400).json({ error: "name, email et slot requis" });
    }
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
      return res.status(400).json({ error: "nom invalide (2–100 caractères)" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
      return res.status(400).json({ error: "email invalide" });
    }
    if (reason && (typeof reason !== "string" || reason.length > 500)) {
      return res.status(400).json({ error: "motif trop long (max 500 caractères)" });
    }
    // Validate slot dates are valid ISO strings
    if (isNaN(Date.parse(slot.start)) || isNaN(Date.parse(slot.end))) {
      return res.status(400).json({ error: "créneau invalide" });
    }

    const token = randomUUID();
    saveAppointment(token, {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      reason: reason?.trim() || "",
      slotStart: slot.start,
      slotEnd: slot.end,
      slotLabel: slot.label,
    });

    await sendManagerNotification({
      token,
      name: name.trim(),
      email: email.trim(),
      reason: reason?.trim() || "",
      slotLabel: slot.label,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Appointment error:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// GET /api/confirm/:token — manager confirms
router.get("/confirm/:token", async (req, res) => {
  try {
    const appt = getAppointment(req.params.token);
    if (!appt) {
      return res.status(410).send(htmlPage("Lien invalide ou expiré", "Ce lien n'est plus valide (expiré après 24h ou déjà utilisé).", "#c0392b"));
    }

    await createCalendarEvent({
      title: `asbl-simple x ${appt.name}`,
      start: appt.slotStart,
      end: appt.slotEnd,
      attendeeEmail: appt.email,
      description: `Motif: ${appt.reason}\nContact: ${appt.email}`,
    });

    await sendUserConfirmation({
      name: appt.name,
      email: appt.email,
      slotLabel: appt.slotLabel,
      reason: appt.reason,
    });

    deleteAppointment(req.params.token);

    res.send(htmlPage(
      "RDV confirmé !",
      `L'événement a été ajouté au calendrier.<br>${appt.name} (${appt.email}) a reçu un email de confirmation.`,
      "#2d7a2d"
    ));
  } catch (err) {
    console.error("Confirm error:", err);
    res.status(500).send(htmlPage("Erreur", "Une erreur s'est produite lors de la confirmation.", "#c0392b"));
  }
});

// GET /api/reject/:token — manager rejects
router.get("/reject/:token", async (req, res) => {
  try {
    const appt = getAppointment(req.params.token);
    if (!appt) {
      return res.status(410).send(htmlPage("Lien invalide ou expiré", "Ce lien n'est plus valide.", "#c0392b"));
    }

    await sendUserRejection({ name: appt.name, email: appt.email });
    deleteAppointment(req.params.token);

    res.send(htmlPage(
      "RDV refusé",
      `${appt.name} a été informé(e) par email.`,
      "#555"
    ));
  } catch (err) {
    console.error("Reject error:", err);
    res.status(500).send(htmlPage("Erreur", "Une erreur s'est produite.", "#c0392b"));
  }
});

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlPage(title, body, color) {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body style="font-family:sans-serif;max-width:500px;margin:60px auto;text-align:center;padding:0 20px">
  <h2 style="color:${esc(color)}">${esc(title)}</h2>
  <p style="color:#444;line-height:1.6">${body}</p>
  <p style="margin-top:32px"><a href="https://build-ai.be" style="color:#2B5DB8">← Retour au site</a></p>
</body></html>`;
}

export default router;
