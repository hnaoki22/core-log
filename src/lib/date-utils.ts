// Date utilities for JST (Japan Standard Time)
// All date calculations should use JST since users are in Japan

/**
 * Get today's date in YYYY-MM-DD format in JST
 */
export function getTodayJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/**
 * Get current hour in JST (0-23)
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
