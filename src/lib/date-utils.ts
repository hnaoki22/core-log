// Date utilities for JST (Japan Standard Time)
// All date calculations should use JST since users are in Japan

/**
 * Business day boundary: 4:00 AM JST.
 *
 * Submissions between 0:00–3:59 AM JST are treated as the PREVIOUS calendar day.
 * This prevents late-night evening reflections from being misclassified as the
 * next day's morning entry.
 *
 * Design rationale (2026-04-16):
 *   A user who finishes overtime at 0:30 AM and writes their evening reflection
 *   should have it recorded on the day they actually worked, not on the next
 *   calendar day.  The 4:00 AM cutoff is safe because virtually no CORE Log
 *   user begins their workday before 4:00 AM.
 */
export const BUSINESS_DAY_START_HOUR = 4;

/**
 * Get today's "business date" in YYYY-MM-DD format in JST.
 *
 * During the grace period (0:00–3:59 AM JST) the returned date is the
 * previous calendar day.  From 4:00 AM onward, it is the current calendar day.
 */
export function getTodayJST(): string {
  const now = new Date();
  // Subtract BUSINESS_DAY_START_HOUR to shift the day boundary.
  // At 3:59 AM → shifted to 23:59 previous day → previous date.
  // At 4:00 AM → shifted to 00:00 same day → current date.
  const shifted = new Date(now.getTime() - BUSINESS_DAY_START_HOUR * 60 * 60 * 1000);
  return shifted.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/**
 * Get current hour in JST (0-23).
 * Returns the ACTUAL clock hour — NOT shifted by the business-day boundary.
 */
export function getCurrentHourJST(): number {
  return parseInt(
    new Date().toLocaleString("en-US", {
      timeZone: "Asia/Tokyo",
      hour: "numeric",
      hour12: false,
    }),
    10
  );
}

/**
 * Returns true when current JST time is in the grace period (0:00–3:59 AM).
 * During this window, the business date is the previous calendar day, so
 * morning submissions should be blocked (the morning window for that business
 * day closed at noon the previous day).
 */
export function isGracePeriod(): boolean {
  return getCurrentHourJST() < BUSINESS_DAY_START_HOUR;
}

/**
 * Calculate the week number from a start date.
 * Week 1 = days 1-7, Week 2 = days 8-14, etc.
 * Returns 0 if startDate is empty or in the future.
 */
export function calculateWeekNum(startDate: string): number {
  if (!startDate) return 0;
  const start = new Date(startDate);
  const now = new Date();
  // Use JST for comparison
  const jstOffset = 9 * 60 * 60 * 1000;
  const startJST = new Date(start.getTime() + jstOffset);
  const nowJST = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + jstOffset);

  const diffMs = nowJST.getTime() - startJST.getTime();
  if (diffMs < 0) return 0; // Not started yet

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

/**
 * Check if a participant's program has ended based on their endDate.
 * Returns true if endDate is set and today is past the endDate.
 */
export function isProgramEnded(endDate: string): boolean {
  if (!endDate) return false;
  const end = new Date(endDate);
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const endJST = new Date(end.getTime() + jstOffset);
  const nowJST = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + jstOffset);

  // End date is inclusive, so ended means nowJST is after the end of that day
  endJST.setHours(23, 59, 59, 999);
  return nowJST.getTime() > endJST.getTime();
}

/**
 * Check if a participant's program has not started yet.
 */
export function isProgramNotStarted(startDate: string): boolean {
  if (!startDate) return false;
  const start = new Date(startDate);
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const startJST = new Date(start.getTime() + jstOffset);
  const nowJST = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + jstOffset);

  startJST.setHours(0, 0, 0, 0);
  return nowJST.getTime() < startJST.getTime();
}

/**
 * Convert an ISO timestamp to a JST Date object.
 * Works correctly regardless of server/browser timezone.
 */
function toJST(d: Date): Date {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000);
}

/**
 * Format an ISO datetime string to "YYYY/M/D HH:mm" in JST.
 * If datetime is missing/invalid, falls back to formatting just the date.
 */
export function formatDateTimeJST(datetime: string | undefined, date: string): string {
  if (datetime && datetime.includes("T")) {
    const jst = toJST(new Date(datetime));
    return `${jst.getUTCFullYear()}/${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${jst.getUTCHours().toString().padStart(2, "0")}:${jst.getUTCMinutes().toString().padStart(2, "0")}`;
  }
  // date-only string (YYYY-MM-DD) — just format the date portion
  const parts = date.split("-");
  if (parts.length === 3) {
    return `${parseInt(parts[0])}/${parseInt(parts[1])}/${parseInt(parts[2])}`;
  }
  return date;
}

/**
 * Format an ISO timestamp to "HH:mm" in JST.
 * Returns empty string if input is null/undefined/invalid.
 */
export function formatTimeJST(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  try {
    const jst = toJST(new Date(isoStr));
    const h = jst.getUTCHours().toString().padStart(2, "0");
    const m = jst.getUTCMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  } catch {
    return "";
  }
}

/**
 * Format an ISO timestamp to "YYYY/M/D HH:mm" in JST (full datetime).
 * Returns empty string if input is null/undefined/invalid.
 */
export function formatFullDateTimeJST(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  try {
    const jst = toJST(new Date(isoStr));
    return `${jst.getUTCFullYear()}/${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${jst.getUTCHours().toString().padStart(2, "0")}:${jst.getUTCMinutes().toString().padStart(2, "0")}`;
  } catch {
    return "";
  }
}


/**
 * Japanese weekday labels (short and full).
 * Used by the JST-aware helpers below.
 */
const WEEKDAYS_JP_SHORT = ["日", "月", "火", "水", "木", "金", "土"];
const WEEKDAYS_JP_FULL = [
  "日曜日",
  "月曜日",
  "火曜日",
  "水曜日",
  "木曜日",
  "金曜日",
  "土曜日",
];

/**
 * Get the day-of-week index (0=Sunday, 6=Saturday) in JST for a given Date.
 * This avoids the common bug where Date#getDay() returns the host/UTC timezone
 * weekday instead of the JST weekday on servers (e.g. Vercel) running in UTC.
 */
export function getDayOfWeekJST(d: Date): number {
  return toJST(d).getUTCDay();
}

/**
 * Short Japanese weekday label (e.g. "火") computed in JST.
 */
export function getDayOfWeekJPShort(d: Date): string {
  return WEEKDAYS_JP_SHORT[getDayOfWeekJST(d)] || "";
}

/**
 * Full Japanese weekday label (e.g. "火曜日") computed in JST.
 */
export function getDayOfWeekJPFull(d: Date): string {
  return WEEKDAYS_JP_FULL[getDayOfWeekJST(d)] || "";
}

/**
 * Format an ISO timestamp to "YYYY/M/D HH:mm（曜）" in JST with short JP weekday.
 * Returns empty string if input is null/undefined/invalid.
 */
export function formatFullDateTimeWithWeekdayJST(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    const jst = toJST(d);
    const dow = getDayOfWeekJPShort(d);
    return `${jst.getUTCFullYear()}/${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${jst.getUTCHours().toString().padStart(2, "0")}:${jst.getUTCMinutes().toString().padStart(2, "0")}（${dow}）`;
  } catch {
    return "";
  }
}
