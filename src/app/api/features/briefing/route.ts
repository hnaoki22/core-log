// GET /api/features/briefing?token=xxx
// Admin endpoint to get 1:1 briefing for a specific participant
// Returns weekly summary and recommendations for manager

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getManagerByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { generate1on1Briefing } from "@/lib/llm";



interface LogData {
  date: string;
  morning_intent?: string;
  evening_insight?: string;
  energy?: string;
}

interface RuminationData {
  score: number;
}

interface ParticipantData {
  id: string;
  name: string;
  tenant_id: string;
}

async function handleSelectConcept(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, conceptId, selectedIndex } = body;

    if (!token || !conceptId || selectedIndex === undefined) {
      return NextResponse.json(
        { error: "Token, conceptId, and selectedIndex are required" },
        { status: 400 }
      );
    }

    // Verify manager token
    const manager = await getManagerByTokenFromSupabase(token);
    if (!manager) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = manager.tenantId || "default";
    // Update concept selection
    const client = getClient();
    const { data, error } = await client
      .from("weekly_concepts")
      .update({ selected_index: selectedIndex })
      .eq("id", conceptId)
      .eq("tenant_id", tenantId)
      .select("id")
      .single();

    if (error || !data) {
      console.error("Concept selection error:", error);
      return NextResponse.json(
        { error: "Failed to update concept selection" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Concept selected successfully",
    });
  } catch (error) {
    console.error("Concept selection error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";
    const participantId = req.nextUrl.searchParams.get("participantId") || "";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-a.oneOnOneBriefing");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Briefing feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify manager token
    const manager = await getManagerByTokenFromSupabase(token);
    if (!manager) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tenantId = manager.tenantId || "default";

    if (!participantId) {
      return NextResponse.json({ error: "Participant ID required" }, { status: 400 });
    }

    const client = getClient();

    // Fetch participant data
    const { data: participantData, error: participantError } = await client
      .from("participants")
      .select("*")
      .eq("id", participantId)
      .eq("tenant_id", tenantId)
      .single();

    if (participantError || !participantData) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }

    // Fetch logs from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: logs, error: logsError } = await client
      .from("logs")
      .select("date, morning_intent, evening_insight, energy")
      .eq("tenant_id", tenantId)
      .eq("participant_id", participantId)
      .gte("created_at", sevenDaysAgo)
      .order("date", { ascending: true });

    if (logsError) {
      return NextResponse.json(
        { error: "Failed to fetch logs" },
        { status: 500 }
      );
    }

    // Transform logs to briefing format with proper typing
    const weekLogs = (logs || []).map((log: LogData) => ({
      date: log.date || "",
      morning: log.morning_intent || "",
      evening: log.evening_insight || "",
      energy: log.energy || null,
    }));

    // Get rumination scores if available
    const { data: ruminationData } = await client
      .from("rumination_analyses")
      .select("score")
      .eq("tenant_id", tenantId)
      .eq("participant_id", participantId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: true });

    const ruminationScores = (ruminationData || []).map((r: RuminationData) => r.score);

    // Generate briefing using LLM
    const briefing = await generate1on1Briefing(
      (participantData as ParticipantData).name,
      weekLogs,
      ruminationScores
    );

    return NextResponse.json({
      success: true,
      briefing: {
        participantId,
        participantName: (participantData as ParticipantData).name,
        weekLogs,
        ruminationScores,
        ...briefing,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Briefing GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = body;

    // Check if this is a selection endpoint
    const pathname = req.nextUrl.pathname;
    if (pathname.includes("select")) {
      return handleSelectConcept(req);
    }

    // Otherwise, generate new conceptualization
    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "POST endpoint for briefing",
    });
  } catch (error) {
    console.error("Briefing POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
