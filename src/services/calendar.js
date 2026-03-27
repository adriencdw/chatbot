import { google } from "googleapis";

// Singleton — reuse the OAuth2 client and its cached access token
let _auth = null;
function getAuthClient() {
  if (!_auth) {
    _auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    _auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  }
  return _auth;
}

const SLOT_DURATION_MIN = 60;
const BUSINESS_START = 9;
const BUSINESS_END = 17;

/**
 * Queries Google Calendar freebusy for a given time range and returns:
 * - slots: all free 1h slots within business hours (9-17, Mon-Fri)
 * - plages_occupees: merged busy intervals (human-readable) for Claude to reason about
 *
 * @param {object} options
 * @param {string} options.dateDebut - ISO 8601 datetime in Brussels local time (e.g. "2026-03-31T09:00:00")
 * @param {string} options.dateFin   - ISO 8601 datetime in Brussels local time
 */
export async function queryFreebusy({ dateDebut, dateFin }) {
  const auth = getAuthClient();
  const calendar = google.calendar({ version: "v3", auth });

  // new Date("2026-03-31T09:00:00") is parsed as local time when TZ=Europe/Brussels
  const start = new Date(dateDebut);
  const end = new Date(dateFin);
  const now = new Date();

  console.log("[queryFreebusy] input:", { dateDebut, dateFin });
  console.log("[queryFreebusy] parsed start (Brussels):", start.toLocaleString("fr-BE", { timeZone: "Europe/Brussels" }));
  console.log("[queryFreebusy] parsed end   (Brussels):", end.toLocaleString("fr-BE", { timeZone: "Europe/Brussels" }));
  console.log("[queryFreebusy] querying UTC range:", start.toISOString(), "→", end.toISOString());

  const freeBusyRes = await calendar.freebusy.query({
    requestBody: {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      timeZone: "Europe/Brussels",
      items: [
        { id: process.env.CALENDAR_ID_MAIN },
        { id: process.env.CALENDAR_ID_SECONDARY },
      ],
    },
  });

  const calMain = freeBusyRes.data.calendars[process.env.CALENDAR_ID_MAIN];
  const calSec  = freeBusyRes.data.calendars[process.env.CALENDAR_ID_SECONDARY];

  console.log("[queryFreebusy] raw busy MAIN:", JSON.stringify(calMain?.busy));
  console.log("[queryFreebusy] raw busy SEC: ", JSON.stringify(calSec?.busy));

  const rawBusy = [
    ...(calMain?.busy || []),
    ...(calSec?.busy  || []),
  ]
    .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
    .sort((a, b) => a.start - b.start);

  // Merge overlapping busy intervals
  const busyMerged = [];
  for (const b of rawBusy) {
    const last = busyMerged[busyMerged.length - 1];
    if (!last || b.start >= last.end) {
      busyMerged.push({ start: new Date(b.start), end: new Date(b.end) });
    } else {
      last.end = new Date(Math.max(last.end, b.end));
    }
  }

  // Compute all free 1h slots within business hours in the queried range
  const slots = [];
  const cursor = new Date(start);
  cursor.setMinutes(0, 0, 0, 0);

  // If the range starts in the past, advance cursor to the next full hour after now
  if (cursor <= now) {
    cursor.setTime(now.getTime());
    cursor.setMinutes(0, 0, 0, 0);
    cursor.setHours(cursor.getHours() + 1);
  }

  while (cursor < end) {
    const hour = cursor.getHours(); // Brussels local (TZ=Europe/Brussels)
    const dow  = cursor.getDay();   // Brussels local

    if (dow >= 1 && dow <= 5 && hour >= BUSINESS_START && hour < BUSINESS_END) {
      const slotStart = new Date(cursor);
      const slotEnd   = new Date(cursor.getTime() + SLOT_DURATION_MIN * 60 * 1000);

      const isFree = !busyMerged.some((b) => slotStart < b.end && slotEnd > b.start);
      if (isFree) {
        slots.push({
          start: slotStart.toISOString(),
          end:   slotEnd.toISOString(),
          label: formatLabel(slotStart),
        });
      }
    }
    cursor.setHours(cursor.getHours() + 1);
  }

  // Human-readable busy intervals for Claude
  const plages_occupees = busyMerged.map((b) => ({
    debut: formatLabel(b.start),
    fin:   formatLabel(b.end),
  }));

  console.log("[queryFreebusy] merged busy:", JSON.stringify(busyMerged.map(b => ({
    start: b.start.toLocaleString("fr-BE", { timeZone: "Europe/Brussels" }),
    end:   b.end.toLocaleString("fr-BE",   { timeZone: "Europe/Brussels" }),
  }))));
  console.log("[queryFreebusy] free slots found:", slots.map(s => s.label));

  return { slots, plages_occupees };
}

/**
 * Creates a confirmed event on the main calendar.
 */
export async function createCalendarEvent({ title, start, end, attendeeEmail, description }) {
  const auth = getAuthClient();
  const calendar = google.calendar({ version: "v3", auth });

  await calendar.events.insert({
    calendarId: process.env.CALENDAR_ID_MAIN,
    requestBody: {
      summary: title,
      description,
      start: { dateTime: start, timeZone: "Europe/Brussels" },
      end:   { dateTime: end,   timeZone: "Europe/Brussels" },
      attendees: [{ email: attendeeEmail }],
    },
  });
}

function formatLabel(date) {
  return date.toLocaleString("fr-BE", {
    weekday: "long",
    day:     "numeric",
    month:   "long",
    hour:    "2-digit",
    minute:  "2-digit",
    timeZone: "Europe/Brussels",
  });
}
