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
 * Returns up to 3 available 1h slots across both calendars (next 7 working days).
 */
export async function getAvailableSlots() {
  const auth = getAuthClient();
  const calendar = google.calendar({ version: "v3", auth });

  const now = new Date();
  const in8Days = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

  const freeBusyRes = await calendar.freebusy.query({
    requestBody: {
      timeMin: now.toISOString(),
      timeMax: in8Days.toISOString(),
      timeZone: "Europe/Brussels",
      items: [
        { id: process.env.CALENDAR_ID_MAIN },
        { id: process.env.CALENDAR_ID_SECONDARY },
      ],
    },
  });

  const calMain = freeBusyRes.data.calendars[process.env.CALENDAR_ID_MAIN];
  const calSec = freeBusyRes.data.calendars[process.env.CALENDAR_ID_SECONDARY];

  const busyIntervals = [
    ...(calMain?.busy || []),
    ...(calSec?.busy || []),
  ].map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));

  // Generate candidate slots
  const candidates = [];
  const cursor = new Date(now);
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(cursor.getHours() + 1);

  while (cursor < in8Days && candidates.length < 3) {
    const day = cursor.getDay(); // 0=Sun, 6=Sat
    const hour = cursor.getHours();

    if (day >= 1 && day <= 5 && hour >= BUSINESS_START && hour < BUSINESS_END) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor.getTime() + SLOT_DURATION_MIN * 60 * 1000);

      const isFree = !busyIntervals.some(
        (b) => slotStart < b.end && slotEnd > b.start
      );

      if (isFree) {
        candidates.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          label: formatLabel(slotStart),
        });
      }
    }
    cursor.setHours(cursor.getHours() + 1);
  }

  // Detect fully booked working days (days with no free slot at all)
  const fullDays = [];
  const checkedDays = new Set();
  // Start from tomorrow to avoid showing today as "complet"
  const dayCursor = new Date(now);
  dayCursor.setDate(dayCursor.getDate() + 1);
  dayCursor.setHours(BUSINESS_START, 0, 0, 0);

  while (dayCursor < in8Days) {
    const day = dayCursor.getDay();
    if (day >= 1 && day <= 5) {
      const dateKey = dayCursor.toLocaleDateString("fr-BE", { timeZone: "Europe/Brussels" });
      if (!checkedDays.has(dateKey)) {
        // Check if this day has at least one free slot
        let dayHasFreeSlot = false;
        for (let h = BUSINESS_START; h < BUSINESS_END; h++) {
          const s = new Date(dayCursor);
          s.setHours(h, 0, 0, 0);
          const e = new Date(s.getTime() + SLOT_DURATION_MIN * 60 * 1000);
          if (s > now && !busyIntervals.some((b) => s < b.end && e > b.start)) {
            dayHasFreeSlot = true;
            break;
          }
        }
        if (!dayHasFreeSlot) {
          fullDays.push(dayCursor.toLocaleDateString("fr-BE", {
            weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Brussels",
          }));
        }
        checkedDays.add(dateKey);
      }
    }
    dayCursor.setDate(dayCursor.getDate() + 1);
  }

  return { slots: candidates, fullDays };
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
      end: { dateTime: end, timeZone: "Europe/Brussels" },
      attendees: [{ email: attendeeEmail }],
    },
  });
}

function formatLabel(date) {
  return date.toLocaleString("fr-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Brussels",
  });
}
