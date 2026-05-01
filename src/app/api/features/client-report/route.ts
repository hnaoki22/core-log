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
    const streakAvg = 0;
    let ruminationAvgScore = 0;

    // Count total participants
    try {
      const { data: participantData, error: participantError } = await client
        .from("participants")
        .select("id")
        .eq("tenant_id", tenantId);

      if (!participantError && participantData) {
        totalParticipants = participantData.length;
      }
    } catch (e) {
      console.warn("Failed to fetch participant count:", e);
    }

    // Calculate average entry rate from logs
    try {
      const { data: logsData } = await client
        .from("logs")
        .select("participant_id, date, energy")
        .eq("tenant_id", tenantId);

      if (logsData && logsData.length > 0) {
        // Calculate per-participant entry rate
        const participantLogCounts: Record<string, number> = {};
        logsData.forEach(log => {
          participantLogCounts[log.participant_id] = (participantLogCounts[log.participant_id] || 0) + 1;
        });

        const entryRates = Object.values(participantLogCounts).map(count => {
          // Assume 60 expected log days
          return Math.min((count / 60) * 100, 100);
        });
        avgEntryRate = entryRates.length > 0 ? Math.round(entryRates.reduce((a, b) => a + b, 0) / entryRates.length) : 0;

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

    // Fetch rumination scores
    try {
      const { data: ruminationData } = await client
        .from("rumination_analyses")
        .select("score")
        .eq("tenant_id", tenantId);

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
