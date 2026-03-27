import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// DATA_DIR env var lets Modal (or any deployment) point to a persistent volume
const DATA_DIR = process.env.DATA_DIR ?? join(__dirname, "../../data");
mkdirSync(DATA_DIR, { recursive: true }); // ensure directory exists (e.g. Modal volume on first boot)
const db = new Database(join(DATA_DIR, "appointments.db"));

// Create table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS appointments (
    token TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    reason TEXT,
    slot_start TEXT NOT NULL,
    slot_end TEXT NOT NULL,
    slot_label TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

// Clean up expired tokens on startup
const ttlMs = (parseInt(process.env.TOKEN_TTL_MINUTES) || 1440) * 60 * 1000;
db.prepare("DELETE FROM appointments WHERE created_at < ?").run(Date.now() - ttlMs);

export function saveAppointment(token, data) {
  db.prepare(`
    INSERT INTO appointments (token, name, email, reason, slot_start, slot_end, slot_label, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(token, data.name, data.email, data.reason || "", data.slotStart, data.slotEnd, data.slotLabel, Date.now());
}

export function getAppointment(token) {
  const row = db.prepare("SELECT * FROM appointments WHERE token = ?").get(token);
  if (!row) return null;

  const ttl = (parseInt(process.env.TOKEN_TTL_MINUTES) || 1440) * 60 * 1000;
  if (Date.now() - row.created_at > ttl) {
    db.prepare("DELETE FROM appointments WHERE token = ?").run(token);
    return null;
  }

  return {
    name: row.name,
    email: row.email,
    reason: row.reason,
    slotStart: row.slot_start,
    slotEnd: row.slot_end,
    slotLabel: row.slot_label,
  };
}

export function deleteAppointment(token) {
  db.prepare("DELETE FROM appointments WHERE token = ?").run(token);
}
