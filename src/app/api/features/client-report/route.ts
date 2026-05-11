// GET /api/features/client-report?token=xxx
// Admin-only endpoint
// Calls generateReportSummary() from lib/llm.ts with org stats
// Returns report data (executive summary, findings, recommendations)

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getManagerByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabledForToken } from "@/lib/feature-flags";
import { generateReportSummary } from "@/lib/llm";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-f.clientReport", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Client report feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify admin/manager token
    const manager = await getManagerByTokenFromSupabase(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const client = getClient();
    const tenantId = manager.tenantId;

    // Gather organization statistics
    let totalParticipants = 0;
    let avgEntryRate = 0;
    let avgEnergyScore = 0;
    let streakAvg = 0;
    let ruminationAvgScore = 0;
    // Reporting window: caller can pass ?days=30 etc. Default 30 days so the
    // denominator matches a reasonable program length rather than the prior
    // hardcoded 60 (which understated entry rate for newer tenants).
    const reportWindowDays = (() => {
      const raw = parseInt(req.nextUrl.searchParams.get("days") || "30", 10);
      return Number.isFinite(raw) && raw > 0 && raw <= 365 ? raw : 30;
    })();
    const reportWindowStart = new Date(Date.now() - reportWindowDays * 24 * 60 * 60 * 1000);

    // Count total participants and capture per-participant start dates so we
    // can normalize entry rate against each participant's tenure (capped at
    // the report window), not against an arbitrary fixed denominator.
    const participantTenureDays = new Map<string, number>();
    try {
      const { data: participantData, error: participantError } = await client
        .from("participants")
        .select("id, start_date")
        .eq("tenant_id", tenantId);

      if (!participantError && participantData) {
        totalParticipants = participantData.length;
        const now = Date.now();
        participantData.forEach((p: { id: string; start_date?: string }) => {
          const startMs = p.start_date ? new Date(p.start_date).getTime() : NaN;
          const sinceMs = Number.isFinite(startMs)
            ? Math.max(0, now - startMs)
            : reportWindowDays * 24 * 60 * 60 * 1000;
          const sinceDays = Math.min(
            Math.floor(sinceMs / (24 * 60 * 60 * 1000)),
            reportWindowDays,
          );
          participantTenureDays.set(p.id, Math.max(1, sinceDays));
        });
      }
    } catch (e) {
      console.warn("Failed to fetch participant count:", e);
    }

    // Calculate average entry rate from logs within the report window
    try {
      const { data: logsData } = await client
        .from("logs")
        .select("participant_id, date, energy")
        .eq("tenant_id", tenantId)
        .gte("date", reportWindowStart.toISOString().slice(0, 10));

      if (logsData && logsData.length > 0) {
        // Per-participant log counts within the window
        const participantLogCounts: Record<string, number> = {};
        logsData.forEach(log => {
          participantLogCounts[log.participant_id] = (participantLogCounts[log.participant_id] || 0) + 1;
        });

        // Normalize by per-participant tenure (in days, capped at window).
        // A user on day 5 cannot have logged more than 5 times — using a
        // 60-day fixed denominator would unfairly score them at 5/60 = 8%.
        const entryRates = Object.entries(participantLogCounts).map(([pid, count]) => {
          const denom = participantTenureDays.get(pid) ?? reportWindowDays;
          return Math.min((count / denom) * 100, 100);
        });
        avgEntryRate = entryRates.length > 0
          ? Math.round(entryRates.reduce((a, b) => a + b, 0) / entryRates.length)
          : 0;

        // Streak average: count the maximum consecutive-day streak per
        // participant, then average. Previously hardcoded to 0 which the
        // LLM was happily summarizing as a catastrophic finding.
        const datesByParticipant = new Map<string, Set<string>>();
        logsData.forEach(log => {
          if (!log.date) return;
          let set = datesByParticipant.get(log.participant_id);
          if (!set) {
            set = new Set();
            datesByParticipant.set(log.participant_id, set);
          }
          set.add(log.date);
        });
        const streaks: number[] = [];
        datesByParticipant.forEach((dateSet) => {
          const sortedDates = Array.from(dateSet).sort();
          let bestStreak = 0;
          let currStreak = 0;
          let prev: number | null = null;
          for (const d of sortedDates) {
            const t = new Date(d).getTime();
            if (prev !== null && t - prev === 24 * 60 * 60 * 1000) {
              currStreak++;
            } else {
              currStreak = 1;
            }
            bestStreak = Math.max(bestStreak, currStreak);
            prev = t;
          }
          streaks.push(bestStreak);
        });
        streakAvg = streaks.length > 0
          ? Math.round((streaks.reduce((a, b) => a + b, 0) / streaks.length) * 10) / 10
          : 0;

        // Calculate average energy score
        const energyMap: { [key: string]: number } = {
          excellent: 4,
          good: 3,
          okay: 2,
          low: 1,
        };
        const energyScores = logsData
          .map(log => energyMap[log.energy as string] || 0)
          .filter(v => v > 0);
        avgEnergyScore = energyScores.length > 0 ? Math.round((energyScores.reduce((a, b) => a + b, 0) / energyScores.length) * 100) / 100 : 0;
      }
    } catch (e) {
      console.warn("Failed to fetch log statistics:", e);
    }

    // Fetch rumination scores within the report window
    try {
      const { data: ruminationData } = await client
        .from("rumination_analyses")
        .select("score")
        .eq("tenant_id", tenantId)
        .gte("created_at", reportWindowStart.toISOString());

      if (ruminationData && ruminationData.length > 0) {
        ruminationAvgScore = Math.round((ruminationData.reduce((sum, r) => sum + r.score, 0) / ruminationData.length) * 100) / 100;
      }
    } catch (e) {
      console.warn("Failed to fetch rumination scores:", e);
    }

    // Generate report using LLM
    const reportSummary = await generateReportSummary({
      totalParticipants,
      avgEntryRate,
      avgEnergyScore,
      streakAvg,
      ruminationAvgScore,
    });

    return NextResponse.json({
      success: true,
      report: {
        ...reportSummary,
        generatedAt: new Date().toISOString(),
        organizationStats: {
          totalParticipants,
          avgEntryRate,
          avgEnergyScore,
          streakAvg,
          ruminationAvgScore,
        },
      },
    });
  } catch (error) {
    console.error("Client report error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
