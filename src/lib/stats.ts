// ===== Stats Computation Utility =====
// Computes participant statistics from Notion log entries

import { NotionLogEntry } from "./supabase";

export type ParticipantStats = {
  entryDays: number;
  entryRate: number;
  streak: number;
  fbCount: number;
};

/**
 * Determine if a log entry counts as "submitted" by the participant.
 * A log is submitted if it has text content (morning/evening) OR
 * a non-empty status (indicating the participant interacted with the form).
 */
export function isLogSubmitted(log: NotionLogEntry): boolean {
  return !!(
    log.morningIntent ||
    log.eveningInsight ||
    (log.status && log.status !== "empty") ||
    log.energy
  );
}

/**
 * Compute participant statistics from Notion log entries
 */
export function computeParticipantStats(
  logs: NotionLogEntry[],
  todayJST: string
): ParticipantStats {
  // Entry days: count logs where participant actually submitted something
  const entryLogs = logs.filter(isLogSubmitted);
  const entryDays = entryLogs.length;

  // FB count: logs with HM feedback
  const fbCount = logs.filter((l) => l.hmFeedback).length;

  // Entry rate: entry days / business days since first entry
  let entryRate = 0;
  if (entryLogs.length > 0) {
    const dates = entryLogs
      .map((l) => l.date)
      .filter(Boolean)
      .sort();
    const firstDate = dates[0];
    const businessDays = countBusinessDays(firstDate, todayJST);
    entryRate = Math.min(
      100,
      Math.round((entryDays / Math.max(1, businessDays)) * 100)
    );
  }

  // Streak: consecutive business days from today backwards with entries
  const entryDateSet = new Set(entryLogs.map((l) => l.date));
  let streak = 0;
  let checkDate = todayJST;
  for (let i = 0; i < 365; i++) {
    const dow = getDayOfWeek(checkDate);
    if (dow === 0 || dow === 6) {
      // Skip weekends
      checkDate = subtractOneDay(checkDate);
      continue;
    }
    if (entryDateSet.has(checkDate)) {
      streak++;
      checkDate = subtractOneDay(checkDate);
    } else {
      break;
    }
  }

  return { entryDays, entryRate, streak, fbCount };
}

// ===== Date helpers (JST-safe) =====

function countBusinessDays(fromDate: string, toDate: string): number {
  let count = 0;
  let d = fromDate;
  // Safety limit
  for (let i = 0; i < 1000 && d <= toDate; i++) {
    const dow = getDayOfWeek(d);
    if (dow !== 0 && dow !== 6) count++;
    d = addOneDay(d);
  }
  return count;
}

function getDayOfWeek(dateStr: string): number {
  // Use noon JST to avoid timezone ambiguity
  return new Date(dateStr + "T12:00:00+09:00").getUTCDay();
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  d.setUTCDate(d.getUTCDate() + 1);
  return formatUTCDate(d);
}

function subtractOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  d.setUTCDate(d.getUTCDate() - 1);
  return formatUTCDate(d);
}

function formatUTCDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
