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
};

/**
 * Check if morning was submitted for a log entry.
 */
export function hasMorning(log: NotionLogEntry): boolean {
  return !!log.morningIntent;
}

/**
 * Check if evening was submitted for a log entry.
 * Evening is considered submitted if eveningInsight has text,
 * OR if status is "complete" (indicating evening form was submitted),
 * OR if energy is recorded (part of evening form).
 */
export function hasEvening(log: NotionLogEntry): boolean {
  return !!(
    log.eveningInsight ||
    log.status === "complete" ||
    log.status === "fb_done" ||
    log.energy
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

  // Completion rate: weighted average
  // complete day = 1.0, partial day = 0.5, missing day = 0.0
  let completionRate = 0;
  if (submittedLogs.length > 0) {
    const dates = submittedLogs.map((l) => l.date).filter(Boolean).sort();
    const firstDate = dates[0];
    const businessDays = countBusinessDays(firstDate, todayJST);

    // Weighted score: complete days count as 1.0, partial days as 0.5
    const partialDays = entryDays - completeDays;
    const weightedScore = completeDays * 1.0 + partialDays * 0.5;

    completionRate = Math.min(
      100,
      Math.round((weightedScore / Math.max(1, businessDays)) * 100)
    );
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
  };
}

// ===== Date helpers (JST-safe) =====

function countBusinessDays(fromDate: string, toDate: string): number {
  let count = 0;
  let d = fromDate;
  for (let i = 0; i < 1000 && d <= toDate; i++) {
    const dow = getDayOfWeek(d);
    if (dow !== 0 && dow !== 6) count++;
    d = addOneDay(d);
  }
  return count;
}

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
