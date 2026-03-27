import nodemailer from "nodemailer";

// Singleton — reuse SMTP connection across all emails
let _transporter = null;
function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return _transporter;
}

// Escape user-supplied strings before injecting into HTML
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendManagerNotification({ token, name, email, reason, slotLabel }) {
  const base = process.env.BASE_URL;
  const confirmUrl = `${base}/api/confirm/${token}`;
  const rejectUrl = `${base}/api/reject/${token}`;

  await getTransporter().sendMail({
    from: `"DigiCitoyen Chatbot" <${process.env.SMTP_USER}>`,
    to: process.env.MANAGER_EMAIL,
    subject: `[DigiCitoyen] Nouvelle demande de RDV — ${esc(name)}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px">
        <h2 style="color:#2B5DB8">Nouvelle demande de rendez-vous</h2>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:6px 0;color:#555;width:130px"><strong>Nom</strong></td><td>${esc(name)}</td></tr>
          <tr><td style="padding:6px 0;color:#555"><strong>Email</strong></td><td>${esc(email)}</td></tr>
          <tr><td style="padding:6px 0;color:#555"><strong>Créneau</strong></td><td>${esc(slotLabel)}</td></tr>
          <tr><td style="padding:6px 0;color:#555"><strong>Motif</strong></td><td>${esc(reason) || "Non précisé"}</td></tr>
        </table>
        <div style="margin-top:24px">
          <a href="${confirmUrl}" style="background:#2d7a2d;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block">
            CONFIRMER le RDV
          </a>
          &nbsp;&nbsp;
          <a href="${rejectUrl}" style="background:#c0392b;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block">
            REFUSER le RDV
          </a>
        </div>
        <p style="color:#999;font-size:11px;margin-top:16px">Ce lien expire dans 24h.</p>
      </div>
    `,
  });
}

export async function sendUserConfirmation({ name, email, slotLabel, reason }) {
  await getTransporter().sendMail({
    from: `"DigiCitoyen ASBL" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `[DigiCitoyen] Votre rendez-vous est confirmé !`,
    html: `
      <div style="font-family:sans-serif;max-width:520px">
        <h2 style="color:#2B5DB8">Votre rendez-vous est confirmé</h2>
        <p>Bonjour ${esc(name)},</p>
        <p>Votre rendez-vous a bien été confirmé :</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0">
          <tr><td style="padding:6px 0;color:#555;width:100px"><strong>Quand</strong></td><td>${esc(slotLabel)}</td></tr>
          <tr><td style="padding:6px 0;color:#555"><strong>Motif</strong></td><td>${esc(reason) || "Non précisé"}</td></tr>
          <tr><td style="padding:6px 0;color:#555"><strong>Lieu</strong></td><td>Rue du Progrès 44, 1210 Saint-Josse-ten-Noode</td></tr>
        </table>
        <p>En cas d'empêchement, merci de nous contacter au moins 48h à l'avance :<br>
        <a href="mailto:info@digicitoyen.be">info@digicitoyen.be</a> | +32 2 218 44 67</p>
        <p>À bientôt,<br><strong>L'équipe DigiCitoyen</strong></p>
      </div>
    `,
  });
}

export async function sendUserRejection({ name, email }) {
  await getTransporter().sendMail({
    from: `"DigiCitoyen ASBL" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `[DigiCitoyen] Suite à votre demande de rendez-vous`,
    html: `
      <div style="font-family:sans-serif;max-width:520px">
        <p>Bonjour ${esc(name)},</p>
        <p>Malheureusement, nous ne pouvons pas confirmer votre rendez-vous pour ce créneau.</p>
        <p>N'hésitez pas à nous recontacter pour trouver une autre date :<br>
        <a href="mailto:info@digicitoyen.be">info@digicitoyen.be</a> | +32 2 218 44 67</p>
        <p>Cordialement,<br><strong>L'équipe DigiCitoyen</strong></p>
      </div>
    `,
  });
}
