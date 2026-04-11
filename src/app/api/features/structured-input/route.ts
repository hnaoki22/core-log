// POST /api/features/structured-input
// Store structured entry (fact/observation/lesson) in database
// GET /api/features/structured-input?token=xxx
// Return past structured entries for the participant

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getParticipantByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/lib/feature-flags";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, logId, date, fact, observation, lesson } = body;

    if (!token || !logId || !date || !fact || !observation || !lesson) {
      return NextResponse.json(
        {
          error:
            "Token, logId, date, fact, observation, and lesson are required",
        },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-s.structuredInput");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Structured input feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Store in structured_entries table
    const client = getClient();
    const { data, error } = await client
      .from("structured_entries")
      .insert({
        tenant_id: participant.tenantId,
        participant_id: participant.id,
        log_id: logId,
        date,
        fact,
        observation,
        lesson,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Failed to store structured entry" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      entryId: data.id,
    });
  } catch (error) {
    console.error("Structured input POST error:", error);
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
    const featureEnabled = await isFeatureEnabled("tier-s.structuredInput");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Structured input feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch past structured entries
    const client = getClient();
    const { data, error } = await client
      .from("structured_entries")
      .select("*")
      .eq("tenant_id", participant.tenantId)
      .eq("participant_id", participant.id)
      .order("date", { ascending: false })
      .limit(30);

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch structured entries" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      entries: data || [],
      count: (data || []).length,
    });
  } catch (error) {
    console.error("Structured input GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
