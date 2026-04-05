// Structured logging utility
// Outputs JSON to console with timestamp in JST (ISO 8601)
// In production, debug level is skipped

type LogLevel = "debug" | "info" | "warn" | "error";

function getJSTTimestamp(): string {
  const now = new Date();
  const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = jstDate.getUTCFullYear();
  const month = String(jstDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jstDate.getUTCDate()).padStart(2, "0");
  const hours = String(jstDate.getUTCHours()).padStart(2, "0");
  const minutes = String(jstDate.getUTCMinutes()).padStart(2, "0");
  const seconds = String(jstDate.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+09:00`;
}

function formatLog(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): string {
  const logEntry = {
    level,
    message,
    timestamp: getJSTTimestamp(),
    ...meta,
  };
  return JSON.stringify(logEntry);
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    // Skip debug in production
    if (process.env.NODE_ENV === "production") {
      return;
    }
    console.log(formatLog("debug", message, meta));
  },

  info(message: string, meta?: Record<string, unknown>): void {
    console.log(formatLog("info", message, meta));
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    console.log(formatLog("warn", message, meta));
  },

  error(message: string, meta?: Record<string, unknown>): void {
    console.log(formatLog("error", message, meta));
  },
};
