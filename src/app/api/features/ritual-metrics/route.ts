// POST /api/features/ritual-metrics
// Track micro ritual (input time) metrics
// GET /api/features/ritual-metrics?token=xxx
// Return past metrics + average duration

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getParticipantByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabledForToken } from "@/lib/feature-flags";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, date, inputType, durationSeconds } = body;

    if (
      !token ||
      !date ||
      !inputType ||
      durationSeconds === undefined ||
      durationSeconds === null
    ) {
      return NextResponse.json(
        {
          error: "Token, date, inputType, and durationSeconds are required",
        },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-e.microRitualOptimizer", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Micro ritual optimizer feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate inputType
    const validTypes = ["morning", "evening", "evening_only"];
    if (!validTypes.includes(inputType)) {
      return NextResponse.json(
        { error: `Invalid inputType. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate duration (should be positive)
    if (durationSeconds < 0) {
      return NextResponse.json(
        { error: "durationSeconds must be non-negative" },
        { status: 400 }
      );
    }

    // Store in micro_ritual_metrics table
    const client = getClient();
    const { data, error } = await client
      .from("micro_ritual_metrics")
      .insert({
        tenant_id: participant.tenantId,
        participant_id: participant.id,
        date,
        input_type: inputType,
        duration_seconds: durationSeconds,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Failed to store ritual metric" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      metricId: data.id,
    });
  } catch (error) {
    console.error("Ritual metrics POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-e.microRitualOptimizer", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Micro ritual optimizer feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch past metrics
    const client = getClient();
    const { data, error } = await client
      .from("micro_ritual_metrics")
      .select("*")
      .eq("tenant_id", participant.tenantId)
      .eq("participant_id", participant.id)
      .order("date", { ascending: false })
      .limit(60);

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch metrics" },
        { status: 500 }
      );
    }

    // Calculate statistics
    const metrics = data || [];
    const avgDuration =
      metrics.length > 0
        ? metrics.reduce((sum, m) => sum + (m.duration_seconds || 0), 0) /
          metrics.length
        : 0;

    // Calculate by input type
    const byType: Record<string, { count: number; avgDuration: number }> = {};
    for (const metric of metrics) {
      const type = metric.input_type || "unknown";
      if (!byType[type]) {
        byType[type] = { count: 0, avgDuration: 0 };
      }
      byType[type].count += 1;
      byType[type].avgDuration += metric.duration_seconds || 0;
    }

    // Finalize averages
    for (const type in byType) {
      if (byType[type].count > 0) {
        byType[type].avgDuration = byType[type].avgDuration / byType[type].count;
      }
    }

    return NextResponse.json({
      success: true,
      metrics,
      statistics: {
        totalCount: metrics.length,
        averageDuration: Math.round(avgDuration),
        byType,
      },
    });
  } catch (error) {
    console.error("Ritual metrics GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
