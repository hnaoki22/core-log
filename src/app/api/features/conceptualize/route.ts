// POST /api/features/conceptualize
// Fetch last 5 days of logs and generate weekly conceptualization
// GET /api/features/conceptualize?token=xxx
// Return past concepts for the participant
// POST /api/features/conceptualize/select
// Save selected concept index

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getParticipantByTokenFromSupabase, getLogsByParticipant } from "@/lib/supabase";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { generateWeeklyConcepts } from "@/lib/llm";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-s.weeklyConceptualization");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Weekly conceptualization feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch past concepts
    const client = getClient();
    const { data, error } = await client
      .from("weekly_concepts")
      .select("*")
      .eq("tenant_id", participant.tenantId)
      .eq("participant_id", participant.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch concepts" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      concepts: data || [],
      count: (data || []).length,
    });
  } catch (error) {
    console.error("Conceptualize GET error:", error);
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

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-s.weeklyConceptualization");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Weekly conceptualization feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch last 5 days of logs
    const allLogs = await getLogsByParticipant(participant.name, participant.tenantId);
    const recentLogs = allLogs.slice(0, 5).reverse(); // Last 5 days, chronological order

    if (recentLogs.length === 0) {
      return NextResponse.json(
        { error: "Not enough logs to generate concepts. Need at least 1 log." },
        { status: 400 }
      );
    }

    // Transform logs to format expected by generateWeeklyConcepts
    const weekLogs = recentLogs.map((log) => ({
      date: log.date,
      morning: log.morningIntent,
      evening: log.eveningInsight || "",
    }));

    // Generate concepts using LLM
    const conceptResult = await generateWeeklyConcepts(weekLogs);

    // Store in database
    const client = getClient();
    const { data, error } = await client
      .from("weekly_concepts")
      .insert({
        tenant_id: participant.tenantId,
        participant_id: participant.id,
        week_start_date: recentLogs[0].date,
        week_end_date: recentLogs[recentLogs.length - 1].date,
        week_summary: conceptResult.weekSummary,
        theses: conceptResult.theses,
        selected_index: null,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Failed to store conceptualization" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      conceptId: data.id,
      result: conceptResult,
    });
  } catch (error) {
    console.error("Conceptualize POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
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

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Update the selected index
    const client = getClient();
    const { error } = await client
      .from("weekly_concepts")
      .update({ selected_index: selectedIndex })
      .eq("id", conceptId)
      .eq("participant_id", participant.id);

    if (error) {
      return NextResponse.json(
        { error: "Failed to save selection" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Concept selection saved",
    });
  } catch (error) {
    console.error("Select concept error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
