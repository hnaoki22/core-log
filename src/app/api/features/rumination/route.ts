// POST /api/features/rumination
// Analyze evening text for rumination patterns and store result
// GET /api/features/rumination?token=xxx
// Retrieve past rumination analyses for the participant

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getParticipantByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { analyzeRumination } from "@/lib/llm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, logId, eveningText } = body;

    if (!token || !logId || !eveningText) {
      return NextResponse.json(
        { error: "Token, logId, and eveningText are required" },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-s.ruminationDetection");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Rumination detection feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Analyze rumination using LLM
    const analysis = await analyzeRumination(eveningText);

    // Store result in rumination_analyses table
    const client = getClient();
    const { data, error } = await client
      .from("rumination_analyses")
      .insert({
        tenant_id: participant.tenantId,
        participant_id: participant.id,
        log_id: logId,
        evening_text: eveningText,
        score: analysis.score,
        is_ruminating: analysis.isRuminating,
        pattern: analysis.pattern,
        reframe: analysis.reframe,
        summary: analysis.summary,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Failed to store rumination analysis" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      analysisId: data.id,
      analysis,
    });
  } catch (error) {
    console.error("Rumination analysis error:", error);
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
    const featureEnabled = await isFeatureEnabled("tier-s.ruminationDetection");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Rumination detection feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch past analyses for this participant
    const client = getClient();
    const { data, error } = await client
      .from("rumination_analyses")
      .select("*")
      .eq("tenant_id", participant.tenantId)
      .eq("participant_id", participant.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch analyses" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      analyses: data || [],
      count: (data || []).length,
    });
  } catch (error) {
    console.error("Rumination GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
