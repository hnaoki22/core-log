// ===== Stats Computation Utility =====
// Computes participant statistics from Notion log entries
// Design: "1 day = morning + evening". Both must be completed for 100%.

import { NotionLogEntry } from "./supabase";

export type ParticipantStats = {
  /** Days with ANY submission (morning or evening or both) */
  entryDays: number;
  /** Days with BOTH morning AND evening completed */
  completeDays: number;
  /** Morning-only submission count */
  morningCount: number;
  /** Evening-only submission count */
  eveningCount: number;
  /** Completion rate: weighted average (both=100%, one=50%) / business days */
  completionRate: number;
  /** Consecutive business days with BOTH morning+evening from today */
  streak: number;
  /** HM feedback count */
  fbCount: number;
  /** Today's status: "complete" | "morning_only" | "evening_only" | "none" */
  todayStatus: "complete" | "morning_only" | "evening_only" | "none";
  /** Business days elapsed since first submission (inclusive of today). 0 if no submissions. */
  businessDaysElapsed: number;
};

// ===== Time-of-day boundary for completion rate =====
// Before 13:00 JST: today's evening slot hasn't "opened" yet, so the denominator for today
// starts at 0.5 (morning only). At/after 13:00 JST, denominator becomes 1.0 (both slots).
// To avoid completion rate exceeding 100% when a user writes evening before 13:00, we use
// max(time-based minimum, actual submitted weight) as the per-day denominator.
const EVENING_OPEN_HOUR_JST = 13;

function getCurrentJSTHour(): number {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jstNow.getUTCHours();
}

/**
 * Check if morning was submitted for a log entry.
 */
export function hasMorning(log: NotionLogEntry): boolean {
  return !!log.morningIntent;
}

/**
 * Check if evening was submitted for a log entry.
 * Evening is considered submitted if eveningInsight has text,
 * OR if status is "complete" / "fb_done" (set only by updateEveningEntry / createEveningOnlyEntry).
 *
 * NOTE: energy is NOT used here because it is recorded in BOTH
 * morning and evening forms. Using it would incorrectly flag
 * morning-only entries as having evening data.
 */
export function hasEvening(log: NotionLogEntry): boolean {
  return !!(
    log.eveningInsight ||
    log.status === "complete" ||
    log.status === "fb_done"
  );
}

/**
 * Determine if a log entry counts as "submitted" (any interaction).
 * Used for backward compatibility and basic filtering.
 */
export function isLogSubmitted(log: NotionLogEntry): boolean {
  return hasMorning(log) || hasEvening(log);
}

/**
 * Get the daily completion status for a single log entry.
 * Returns "complete" if both morning and evening, "morning_only" or "evening_only" if partial.
 */
export function getDayStatus(log: NotionLogEntry): "complete" | "morning_only" | "evening_only" | "none" {
  const m = hasMorning(log);
  const e = hasEvening(log);
  if (m && e) return "complete";
  if (m) return "morning_only";
  if (e) return "evening_only";
  return "none";
}

/**
 * Compute participant statistics from Notion log entries.
 *
 * Key design principle: "1 day = morning + evening"
 * - completeDays: days with BOTH morning and evening
 * - completionRate: weighted score (both=1.0, one=0.5) / business days × 100
 * - streak: consecutive business days with BOTH from today
 * - todayStatus: ◎ complete / △ partial / ー none
 */
export function computeParticipantStats(
  logs: NotionLogEntry[],
  todayJST: string
): ParticipantStats {
  // Classify each submitted log
  let completeDays = 0;
  let morningCount = 0;
  let eveningCount = 0;
  let todayStatus: ParticipantStats["todayStatus"] = "none";

  const submittedLogs = logs.filter(isLogSubmitted);
  const completeDateSet = new Set<string>();

  for (const log of submittedLogs) {
    const m = hasMorning(log);
    const e = hasEvening(log);

    if (m) morningCount++;
    if (e) eveningCount++;
    if (m && e) {
      completeDays++;
      completeDateSet.add(log.date);
    }

    if (log.date === todayJST) {
      todayStatus = getDayStatus(log);
    }
  }

  const entryDays = submittedLogs.length;

  // FB count: logs with HM feedback
  const fbCount = logs.filter((l) => l.hmFeedback).length;

  // ===== Completion rate (time-aware, monotonic denominator) =====
  //
  // Per-day weight:
  //   numerator (score)   = 1.0 if both morning+evening, 0.5 if one, 0 if none
  //   denominator (cap)   = 1.0 for past business days
  //                       = today: max(time-based minimum, numerator)
  //                         where time-based minimum = 0.5 before 13:00 JST, 1.0 after
  //
  // This ensures:
  //   - Before 13:00 JST: morning-only is 100% (evening hasn't "opened" yet)
  //   - Early evening writers never exceed 100% (denominator lifts to match numerator)
  //   - After 13:00 JST: missing evening correctly pulls the rate down
  let completionRate = 0;
  let businessDaysElapsed = 0;
  if (submittedLogs.length > 0) {
    const dates = submittedLogs.map((l) => l.date).filter(Boolean).sort();
    const firstDate = dates[0];
    const logByDate = new Map<string, NotionLogEntry>();
    for (const log of submittedLogs) {
      logByDate.set(log.date, log);
    }

    const jstHour = getCurrentJSTHour();
    const todayTimeMin = jstHour < EVENING_OPEN_HOUR_JST ? 0.5 : 1.0;

    let totalScore = 0;
    let totalDenom = 0;
    let d = firstDate;
    for (let i = 0; i < 1000 && d <= todayJST; i++) {
      const dow = getDayOfWeek(d);
      if (dow !== 0 && dow !== 6) {
        businessDaysElapsed++;
        const log = logByDate.get(d);
        let dayScore = 0;
        if (log) {
          const m = hasMorning(log);
          const e = hasEvening(log);
          if (m && e) dayScore = 1.0;
          else if (m || e) dayScore = 0.5;
        }
        const dayDenom = d === todayJST ? Math.max(todayTimeMin, dayScore) : 1.0;
        totalScore += dayScore;
        totalDenom += dayDenom;
      }
      d = addOneDay(d);
    }

    if (totalDenom > 0) {
      completionRate = Math.min(100, Math.round((totalScore / totalDenom) * 100));
    }
  }

  // Streak: consecutive business days with BOTH morning+evening from today
  let streak = 0;
  let checkDate = todayJST;
  for (let i = 0; i < 365; i++) {
    const dow = getDayOfWeek(checkDate);
    if (dow === 0 || dow === 6) {
      checkDate = subtractOneDay(checkDate);
      continue;
    }
    if (completeDateSet.has(checkDate)) {
      streak++;
      checkDate = subtractOneDay(checkDate);
    } else {
      break;
    }
  }

  return {
    entryDays,
    completeDays,
    morningCount,
    eveningCount,
    completionRate,
    streak,
    fbCount,
    todayStatus,
    businessDaysElapsed,
  };
}

// ===== Date helpers (JST-safe) =====

function getDayOfWeek(dateStr: string): number {
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
