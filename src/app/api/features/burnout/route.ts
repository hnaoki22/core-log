// GET /api/features/burnout?token=xxx
// Calculate burnout risk scores for all managed participants
// Returns: list of burnout scores with risk levels

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getManagerByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { resolveManagerTenantStrict } from "@/lib/tenant-context";

type EnergyLevel = "excellent" | "good" | "okay" | "low" | null;

interface LogEntry {
  id?: string;
  energy?: EnergyLevel;
  status?: string;
  participant_id?: string;
  tenant_id?: string;
  datetime?: string;
}

interface RuminationEntry {
  score: number;
}

function energyToScore(energy: EnergyLevel): number {
  switch (energy) {
    case "excellent":
      return 4;
    case "good":
      return 3;
    case "okay":
      return 2;
    case "low":
      return 1;
    default:
      return 2; // default to "okay"
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-a.burnoutScore");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Burnout score feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify manager token
    const manager = await getManagerByTokenFromSupabase(token);
    if (!manager) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tenantResult = resolveManagerTenantStrict(manager);
    if (!tenantResult.ok) {
      return NextResponse.json(tenantResult.errorBody, { status: tenantResult.status });
    }
    const tenantId = tenantResult.tenantId;

    const client = getClient();
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const scores = [];

    // Calculate scores for each managed participant
    for (const participantId of manager.participantIds) {
      // Get participant info
      const { data: participant } = await client
        .from("participants")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", participantId)
        .single();

      if (!participant) continue;

      // Fetch logs for last 14 days
      const { data: logs } = await client
        .from("logs")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("participant_id", participantId)
        .gte("datetime", fourteenDaysAgo.toISOString());

      // Calculate energy average
      const energyScores = (logs || [])
        .map((log: LogEntry) => energyToScore(log.energy as EnergyLevel))
        .filter((score) => score > 0);

      const energyAvg =
        energyScores.length > 0
          ? energyScores.reduce((a, b) => a + b, 0) / energyScores.length
          : 2;

      // Calculate entry rate (completion rate)
      const totalDays = Math.min(logs?.length || 0, 14);
      const completedDays = (logs || []).filter(
        (log: LogEntry) => log.status === "complete"
      ).length;
      const entryRate = totalDays > 0 ? completedDays / totalDays : 0;

      // Fetch rumination scores
      const { data: ruminationData } = await client
        .from("rumination_analyses")
        .select("score")
        .eq("tenant_id", tenantId)
        .eq("participant_id", participantId)
        .gte("created_at", fourteenDaysAgo.toISOString());

      const ruminationScores = (ruminationData || []).map(
        (r: RuminationEntry) => r.score
      );
      const ruminationAvg =
        ruminationScores.length > 0
          ? ruminationScores.reduce((a, b) => a + b, 0) / ruminationScores.length
          : 0;

      // Calculate composite score
      const energyComponent = ((4 - energyAvg) / 3) * 0.4;
      const entryComponent = (1 - entryRate) * 0.3;
      const ruminationComponent = (ruminationAvg / 10) * 0.3;
      const composite = energyComponent + entryComponent + ruminationComponent;

      // Determine risk level
      let riskLevel: "low" | "medium" | "high";
      if (composite < 0.3) {
        riskLevel = "low";
      } else if (composite < 0.6) {
        riskLevel = "medium";
      } else {
        riskLevel = "high";
      }

      scores.push({
        participantId,
        participantName: participant.name,
        energyAvg: Math.round(energyAvg * 100) / 100,
        entryRate: Math.round(entryRate * 100),
        ruminationAvg: Math.round(ruminationAvg * 100) / 100,
        composite: Math.round(composite * 1000) / 1000,
        riskLevel,
      });
    }

    // Store burnout scores in database
    const timestamp = new Date().toISOString();
    const { error: storeError } = await client
      .from("burnout_scores")
      .insert(
        scores.map((score) => ({
          tenant_id: tenantId,
          manager_id: manager.id,
          participant_id: score.participantId,
          energy_avg: score.energyAvg,
          entry_rate: score.entryRate,
          rumination_avg: score.ruminationAvg,
          composite_score: score.composite,
          risk_level: score.riskLevel,
          created_at: timestamp,
        }))
      );

    if (storeError) {
      console.error("Failed to store burnout scores:", storeError);
      // Continue anyway and return calculated scores
    }

    return NextResponse.json({
      success: true,
      managerId: manager.id,
      scores,
      timestamp,
    });
  } catch (error) {
    console.error("Burnout score calculation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
