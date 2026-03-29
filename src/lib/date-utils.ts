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
