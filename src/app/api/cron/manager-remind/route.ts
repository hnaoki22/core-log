// GET /api/cron/manager-remind
// Called by Vercel Cron: once daily at JST 10:00 on weekdays
// - Reminds managers who haven't engaged with participants in 3+ days
// - On Fridays, sends weekly summary to all managers

import { NextRequest, NextResponse } from "next/server";
import { isBusinessDay, getJSTDateString, getJSTDayOfWeek } from "@/lib/calendar";
import { getLogsByParticipant } from "@/lib/supabase";
import { getAllParticipants, getAllManagers } from "@/lib/participant-db";
import { isProgramEnded } from "@/lib/date-utils";
import { logger } from "@/lib/logger";

const CRON_SECRET = process.env.CRON_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const FROM_EMAIL = process.env.REMIND_FROM_EMAIL || "CORE Log <noreply@resend.dev>";
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://core-log-lilac.vercel.app";

export async function GET(request: NextRequest) {
  // Authenticate cron request:
  // 1. Vercel Cron automatically includes `x-vercel-cron: 1` header for scheduled runs
  // 2. Manual invocations must include Bearer CRON_SECRET (if configured)
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";
  const authHeader = request.headers.get("authorization");
  const hasValidSecret = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;

  if (!isVercelCron && !hasValidSecret) {
    logger.warn("Manager cron unauthorized", {
      hasCronHeader: !!request.headers.get("x-vercel-cron"),
      hasAuth: !!authHeader,
      secretConfigured: !!CRON_SECRET,
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const todayStr = getJSTDateString();
  if (!isBusinessDay(todayStr)) {
    logger.info("Manager remind skipped: not a business day", { date: todayStr });
    return NextResponse.json({ message: "Skipped: not a business day", date: todayStr });
  }

  const participants = await getAllParticipants();
  const managers = await getAllManagers();
  const isFriday = getJSTDayOfWeek() === 5;

  const results: { managerName: string; type: string; sent: boolean; reason?: string }[] = [];

  for (const manager of managers) {
    if (!manager.email) continue;

    // Find this manager's participants
    const myParticipants = participants.filter((p) => p.managerId === manager.id);
    if (myParticipants.length === 0) continue;

    // Check for each participant if manager has commented recently
    const participantsNeedingAttention: string[] = [];
    const participantStats: {
      name: string;
      entryDays: number;
      lastEntry: string | null;
      streak: number;
    }[] = [];

    for (const p of myParticipants) {
      // Skip participants whose program hasn't started yet
      if (p.startDate && todayStr < p.startDate) continue;
      // Skip ended programs
      if (p.endDate && isProgramEnded(p.endDate)) continue;

      try {
        const logs = await getLogsByParticipant(p.name, "81f91c26-214e-4da2-9893-6ac6c8984062");

        // Check if manager commented in last 3 days
        const recentLogs = logs.filter((l) => {
          const diff = daysBetween(l.date, todayStr);
          return diff >= 0 && diff <= 3;
        });
        const hasRecentComment = recentLogs.some((l) => l.managerComment);
        if (!hasRecentComment && logs.length > 0) {
          participantsNeedingAttention.push(p.name);
        }

        // Weekly stats for Friday summary
        if (isFriday) {
          const weekLogs = logs.filter((l) => {
            const diff = daysBetween(l.date, todayStr);
            return diff >= 0 && diff < 7;
          });
          const entryDays = weekLogs.filter((l) => l.morningIntent).length;

          // Calculate streak
          let streak = 0;
          const entryDates = new Set(logs.filter((l) => l.morningIntent).map((l) => l.date));
          let checkDate = todayStr;
          for (let i = 0; i < 30; i++) {
            if (entryDates.has(checkDate)) {
              streak++;
            } else if (getDayOfWeek(checkDate) !== 0 && getDayOfWeek(checkDate) !== 6) {
              break;
            }
            checkDate = subtractOneDay(checkDate);
          }

          participantStats.push({
            name: p.name,
            entryDays,
            lastEntry: logs[0]?.date || null,
            streak,
          });
        }
      } catch {
        // skip this participant
      }
    }

    // Send nudge reminder if needed
    if (participantsNeedingAttention.length > 0) {
      const sent = await sendManagerNudge(
        manager.email,
        manager.name,
        manager.token,
        participantsNeedingAttention
      );
      results.push({
        managerName: manager.name,
        type: "nudge",
        sent,
        reason: `${participantsNeedingAttention.length} participants need attention`,
      });
    }

    // Send weekly summary on Fridays
    if (isFriday && participantStats.length > 0) {
      const sent = await sendWeeklySummary(
        manager.email,
        manager.name,
        manager.token,
        participantStats
      );
      results.push({ managerName: manager.name, type: "weekly_summary", sent });
    }
  }

  const nudgeCount = results.filter((r) => r.type === "nudge" && r.sent).length;
  const summaryCount = results.filter((r) => r.type === "weekly_summary" && r.sent).length;
  logger.info("Manager reminders processed", { date: todayStr, isFriday, nudgesSent: nudgeCount, summariesSent: summaryCount });

  return NextResponse.json({
    message: "Manager reminders processed",
    date: todayStr,
    isFriday,
    results,
  });
}

// Helper functions

function daysBetween(from: string, to: string): number {
  const f = new Date(from + "T12:00:00+09:00");
  const t = new Date(to + "T12:00:00+09:00");
  return Math.abs(Math.round((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24)));
}

function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr + "T12:00:00+09:00").getUTCDay();
}

function subtractOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

async function sendManagerNudge(
  to: string,
  managerName: string,
  managerToken: string,
  participantNames: string[]
): Promise<boolean> {
  if (!RESEND_API_KEY) {
    logger.info("Manager nudge skipped: no API key", { managerName, participantCount: participantNames.length });
    return false;
  }

  const url = `${APP_BASE_URL}/m/${managerToken}`;
  const nameList = participantNames.map((n) => `・${n}さん`).join("<br>");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: `【CORE Log】${participantNames.length}名の部下に最近コメントがありません`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <div style="background: linear-gradient(135deg, #C17817, #C17817); border-radius: 12px; padding: 20px; color: white; text-align: center; margin-bottom: 24px;">
              <h1 style="margin: 0; font-size: 20px;">💬 コメントリマインド</h1>
            </div>
            <p>${managerName}さん</p>
            <p>以下の部下に3日以上コメントがありません。<br>一言でも声かけがあると、日報の継続率が大きく変わります。</p>
            <div style="background: #F5E5BF; border-left: 4px solid #C17817; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
              <p style="margin: 0; color: #9A3412; font-size: 14px;">${nameList}</p>
            </div>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${url}" style="display: inline-block; background: #C17817; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 15px;">
                ダッシュボードを開く →
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 11px;">Project CORE — Powered by Human Mature</p>
          </div>
        `,
      }),
    });
    if (res.ok) {
      logger.info("Manager nudge sent", { managerName, participantCount: participantNames.length });
    } else {
      logger.error("Manager nudge failed", { managerName, statusCode: res.status });
    }
    return res.ok;
  } catch (error) {
    logger.error("Manager nudge error", { managerName, error: String(error) });
    return false;
  }
}

async function sendWeeklySummary(
  to: string,
  managerName: string,
  managerToken: string,
  stats: { name: string; entryDays: number; lastEntry: string | null; streak: number }[]
): Promise<boolean> {
  if (!RESEND_API_KEY) {
    logger.info("Weekly summary skipped: no API key", { managerName });
    return false;
  }

  const url = `${APP_BASE_URL}/m/${managerToken}`;
  const statsRows = stats
    .map(
      (s) => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #EFE8DD; font-size: 14px;">${s.name}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #EFE8DD; text-align: center; font-size: 14px;">${s.entryDays}/5日</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #EFE8DD; text-align: center; font-size: 14px;">${s.streak}日連続</td>
    </tr>
  `
    )
    .join("");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: "【CORE Log】今週の週次サマリー",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <div style="background: linear-gradient(135deg, #1A1A2E, #1A1A2E); border-radius: 12px; padding: 20px; color: white; text-align: center; margin-bottom: 24px;">
              <h1 style="margin: 0; font-size: 20px;">📊 週次サマリー</h1>
              <p style="margin: 8px 0 0; opacity: 0.8; font-size: 14px;">今週の振り返り</p>
            </div>
            <p>${managerName}さん、お疲れさまでした。</p>
            <p>担当する部下の今週の状況をお伝えします。</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <thead>
                <tr style="background: #F5F0EB;">
                  <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #5B5560;">名前</th>
                  <th style="padding: 8px 12px; text-align: center; font-size: 12px; color: #5B5560;">今週記入</th>
                  <th style="padding: 8px 12px; text-align: center; font-size: 12px; color: #5B5560;">連続記入</th>
                </tr>
              </thead>
              <tbody>${statsRows}</tbody>
            </table>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${url}" style="display: inline-block; background: #1A1A2E; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 15px;">
                詳細を確認する →
              </a>
            </div>
            <p style="color: #666; font-size: 13px;">来週も一言コメントで部下のモチベーションを支えましょう。</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 11px;">Project CORE — Powered by Human Mature</p>
          </div>
        `,
      }),
    });
    if (res.ok) {
      logger.info("Weekly summary sent", { managerName });
    } else {
      logger.error("Weekly summary failed", { managerName, statusCode: res.status });
    }
    return res.ok;
  } catch (error) {
    logger.error("Weekly summary error", { managerName, error: String(error) });
    return false;
  }
}
