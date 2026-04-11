// GET /api/features/growth-roi?token=xxx
// Calculates growth metrics for participant or org:
//   - reflection_minutes (from micro_ritual_metrics)
//   - thesis_count (from weekly_concepts where selected)
//   - entry_rate, energy_avg (from logs)
// Returns dashboard data

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getParticipantByTokenFromSupabase, getManagerByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/lib/feature-flags";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";
    const isAdmin = req.nextUrl.searchParams.get("admin") === "true";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-f.growthRoi");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Growth ROI feature is not enabled" },
        { status: 403 }
      );
    }

    const client = getClient();
    let tenantId: string | undefined;
    let participantId: string | undefined;

    if (isAdmin) {
      // Admin view - get org-wide stats
      const manager = await getManagerByTokenFromSupabase(token);
      if (!manager || !manager.isAdmin) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
      tenantId = manager.tenantId;
    } else {
      // Participant view - get personal stats
      const participant = await getParticipantByTokenFromSupabase(token);
      if (!participant) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      tenantId = participant.tenantId;
      participantId = participant.id;
    }

    // Fetch micro ritual metrics (reflection minutes)
    let reflectionMinutes = 0;
    try {
      const microQuery = client
        .from("micro_ritual_metrics")
        .select("duration_minutes")
        .eq("tenant_id", tenantId);

      if (participantId) {
        microQuery.eq("participant_id", participantId);
      }

      const { data: microData } = await microQuery;
      reflectionMinutes = (microData || []).reduce((sum, m) => sum + (m.duration_minutes || 0), 0);
    } catch (e) {
      console.warn("Failed to fetch micro ritual metrics:", e);
    }

    // Fetch thesis count (weekly concepts where selected)
    let thesisCount = 0;
    try {
      const thesisQuery = client
        .from("weekly_concepts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_selected", true);

      if (participantId) {
        thesisQuery.eq("participant_id", participantId);
      }

      const { data: thesisData } = await thesisQuery;
      thesisCount = (thesisData || []).length;
    } catch (e) {
      console.warn("Failed to fetch thesis count:", e);
    }

    // Fetch logs for entry rate and energy average
    let entryRate = 0;
    let energyAvg = 0;
    let totalLogs = 0;
    try {
      const logsQuery = client
        .from("logs")
        .select("energy, date")
        .eq("tenant_id", tenantId);

      if (participantId) {
        logsQuery.eq("participant_id", participantId);
      }

      const { data: logsData } = await logsQuery;
      totalLogs = (logsData || []).length;

      if (logsData && logsData.length > 0) {
        // Calculate entry rate (percentage of expected days)
        // Assume 5 work days per week for 12 weeks = 60 expected days
        entryRate = Math.round((totalLogs / 60) * 100);
        entryRate = Math.min(entryRate, 100); // Cap at 100%

        // Calculate average energy (map text to numeric value)
        const energyMap: { [key: string]: number } = {
          excellent: 4,
          good: 3,
          okay: 2,
          low: 1,
        };
        const energyValues = logsData
          .map(log => energyMap[log.energy as string] || 0)
          .filter(v => v > 0);

        energyAvg = energyValues.length > 0 ? Math.round((energyValues.reduce((a, b) => a + b, 0) / energyValues.length) * 100) / 100 : 0;
      }
    } catch (e) {
      console.warn("Failed to fetch logs:", e);
    }

    // Calculate ROI metrics
    const roiScore = Math.round((entryRate + (energyAvg / 4) * 100 + (thesisCount / 10) * 100) / 3);

    return NextResponse.json({
      success: true,
      metrics: {
        reflection_minutes: reflectionMinutes,
        thesis_count: thesisCount,
        total_logs: totalLogs,
        entry_rate_percent: entryRate,
        energy_avg: energyAvg,
        roi_score: roiScore,
      },
      dashboard: {
        title: isAdmin ? "Organization Growth Metrics" : "Your Growth Metrics",
        reflection: {
          label: "Reflection Minutes",
          value: reflectionMinutes,
          unit: "minutes",
        },
        learning: {
          label: "Learning Points",
          value: thesisCount,
          unit: "theses",
        },
        engagement: {
          label: "Entry Rate",
          value: entryRate,
          unit: "%",
        },
        wellbeing: {
          label: "Energy Level",
          value: energyAvg.toFixed(2),
          unit: "/4",
        },
        overall: {
          label: "Growth ROI Score",
          value: roiScore,
          unit: "/100",
        },
      },
    });
  } catch (error) {
    console.error("Growth ROI error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
