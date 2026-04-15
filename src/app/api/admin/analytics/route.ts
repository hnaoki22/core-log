// GET /api/admin/analytics?token=xxx
// Returns analytics data for admin dashboard

import { NextRequest, NextResponse } from "next/server";
import { getAllLogsForTenant } from "@/lib/supabase";
import { getAllParticipants, getManagerByToken } from "@/lib/participant-db";
import { getTodayJST } from "@/lib/date-utils";
import { hasMorning, hasEvening, isLogSubmitted } from "@/lib/stats";
import { resolveAdminTenantContext } from "@/lib/tenant-context";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token)
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const manager = await getManagerByToken(token);
  if (!manager || (!manager.isAdmin && manager.role !== "observer"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const ctx = await resolveAdminTenantContext(request, manager);
  // Batch-fetch: 2 queries total (supports 全テナント when ctx.tenantId is null)
  const [participants, logsByName] = await Promise.all([
    getAllParticipants(ctx.tenantId),
    getAllLogsForTenant(ctx.tenantId ?? undefined),
  ]);
  const todayJST = getTodayJST();

  // Collect all logs
  const allParticipantLogs: {
    name: string;
    logs: {
      date: string;
      energy: string | null;
      morningIntent: string;
      eveningInsight: string | null;
      status: string;
      managerComment: string | null;
      hmFeedback: string | null;
    }[];
  }[] = participants.map((p) => {
    const logs = logsByName.get(p.name) || [];
    return {
      name: p.name,
      logs: logs.map((l) => ({
        date: l.date,
        energy: l.energy,
        morningIntent: l.morningIntent,
        eveningInsight: l.eveningInsight,
        status: l.status,
        managerComment: l.managerComment,
        hmFeedback: l.hmFeedback,
      })),
    };
  });

  // 1. Weekly entry rate trend (last 8 weeks)
  const weeklyTrend = calculateWeeklyTrend(allParticipantLogs, todayJST, 8);

  // 2. Energy distribution
  const allEnergies = allParticipantLogs
    .flatMap((p) => p.logs.map((l) => l.energy).filter(Boolean));
  const energyDistribution = {
    excellent: allEnergies.filter((e) => e === "excellent").length,
    good: allEnergies.filter((e) => e === "good").length,
    okay: allEnergies.filter((e) => e === "okay").length,
    low: allEnergies.filter((e) => e === "low").length,
  };

  // 3. Per-participant weekly energy trend (last 4 weeks)
  const participantTrends = allParticipantLogs.map((p) => {
    const weeklyEnergy = getWeeklyEnergyAvg(p.logs, todayJST, 4);
    const totalEntries = p.logs.filter((l) => isLogSubmitted(l as Parameters<typeof isLogSubmitted>[0])).length;
    const last7 = p.logs.filter((l) => {
      const diff = daysBetween(l.date, todayJST);
      return diff >= 0 && diff < 7;
    });
    const last7Rate = last7.length;
    return {
      name: p.name,
      totalEntries,
      last7Days: last7Rate,
      weeklyEnergy,
    };
  });

  // 4. Manager engagement (who commented recently)
  const managerActivity = allParticipantLogs.map((p) => {
    const withComment = p.logs.filter((l) => l.managerComment);
    const lastCommentDate = withComment.length > 0 ? withComment[0].date : null;
    const daysSinceComment =
      lastCommentDate !== null ? daysBetween(lastCommentDate, todayJST) : 999;
    return {
      participantName: p.name,
      totalComments: withComment.length,
      lastCommentDate,
      daysSinceComment,
      needsAttention: daysSinceComment > 3,
    };
  });

  return NextResponse.json({
    weeklyTrend,
    energyDistribution,
    participantTrends,
    managerActivity,
    generatedAt: todayJST,
  });
}

// Helper: calculate days between two YYYY-MM-DD strings
function daysBetween(from: string, to: string): number {
  const f = new Date(from + "T12:00:00+09:00");
  const t = new Date(to + "T12:00:00+09:00");
  return Math.round((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24));
}

// Helper: get the Monday of the week containing dateStr
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  d.setUTCDate(d.getUTCDate() - diff);
  return formatDate(d);
}

function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function subtractWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  d.setUTCDate(d.getUTCDate() - weeks * 7);
  return formatDate(d);
}

// Weekly trend: for each of the last N weeks, calculate completion rate
// Uses weighted scoring: both morning+evening = 1.0, partial = 0.5
function calculateWeeklyTrend(
  participantLogs: {
    name: string;
    logs: { date: string; morningIntent: string; eveningInsight: string | null; status: string; energy: string | null }[];
  }[],
  today: string,
  weeks: number
) {
  const result: {
    weekStart: string;
    weekLabel: string;
    entryRate: number;
    completionRate: number;
    totalEntries: number;
  }[] = [];
  const currentWeekStart = getWeekStart(today);

  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = subtractWeeks(currentWeekStart, w);
    const weekEnd = subtractWeeks(currentWeekStart, w - 1);

    let totalPossible = 0;
    let weightedScore = 0;
    let totalEntries = 0;

    for (const p of participantLogs) {
      const weekLogs = p.logs.filter(
        (l) => l.date >= weekStart && l.date < weekEnd && isLogSubmitted(l as Parameters<typeof isLogSubmitted>[0])
      );
      totalEntries += weekLogs.length;

      for (const l of weekLogs) {
        const m = hasMorning(l as Parameters<typeof hasMorning>[0]);
        const e = hasEvening(l as Parameters<typeof hasEvening>[0]);
        if (m && e) {
          weightedScore += 1.0;
        } else {
          weightedScore += 0.5;
        }
      }
      totalPossible += 5; // 5 business days per week per participant
    }

    const completionRate =
      totalPossible > 0
        ? Math.round((weightedScore / totalPossible) * 100)
        : 0;
    const entryRate =
      totalPossible > 0
        ? Math.round((totalEntries / totalPossible) * 100)
        : 0;
    // Format week label like "3/31〜"
    const ws = new Date(weekStart + "T12:00:00+09:00");
    const weekLabel = `${ws.getUTCMonth() + 1}/${ws.getUTCDate()}〜`;

    result.push({ weekStart, weekLabel, entryRate, completionRate, totalEntries });
  }

  return result;
}

// Weekly energy average per participant
function getWeeklyEnergyAvg(
  logs: { date: string; energy: string | null }[],
  today: string,
  weeks: number
): { weekLabel: string; avg: number }[] {
  const energyScore: Record<string, number> = {
    excellent: 4,
    good: 3,
    okay: 2,
    low: 1,
  };
  const result: { weekLabel: string; avg: number }[] = [];
  const currentWeekStart = getWeekStart(today);

  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = subtractWeeks(currentWeekStart, w);
    const weekEnd = subtractWeeks(currentWeekStart, w - 1);

    const weekLogs = logs.filter(
      (l) => l.date >= weekStart && l.date < weekEnd && l.energy
    );
    const scores = weekLogs
      .map((l) => energyScore[l.energy!] || 0)
      .filter((s) => s > 0);
    const avg =
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) /
          10
        : 0;

    const ws = new Date(weekStart + "T12:00:00+09:00");
    const weekLabel = `${ws.getUTCMonth() + 1}/${ws.getUTCDate()}〜`;
    result.push({ weekLabel, avg });
  }

  return result;
}
