// POST /api/features/identity
// Track identity evolution with past/current self, biggest change, trigger event
// Quarterly - store with quarter field (e.g. "2026-Q2")
// GET returns past entries

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getParticipantByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabledForToken } from "@/lib/feature-flags";

function getQuarterString(date: Date): string {
  const month = date.getMonth() + 1;
  const quarter = Math.ceil(month / 3);
  return `${date.getFullYear()}-Q${quarter}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, pastSelf, currentSelf, biggestChange, triggerEvent } = body;

    if (!token || !pastSelf || !currentSelf || !biggestChange || !triggerEvent) {
      return NextResponse.json(
        { error: "Token, pastSelf, currentSelf, biggestChange, and triggerEvent are required" },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-c.identityTracking", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Identity tracking feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Generate quarter string
    const quarter = getQuarterString(new Date());

    // Store in identity_entries table
    const client = getClient();
    const { data, error } = await client
      .from("identity_entries")
      .insert({
        tenant_id: participant.tenantId,
        participant_id: participant.id,
        quarter,
        past_self: pastSelf,
        current_self: currentSelf,
        biggest_change: biggestChange,
        trigger_event: triggerEvent,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Identity insert error:", error);
      return NextResponse.json(
        { error: "Failed to store identity entry" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      entryId: data.id,
      quarter,
    });
  } catch (error) {
    console.error("Identity tracking error:", error);
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
    const featureEnabled = await isFeatureEnabledForToken("tier-c.identityTracking", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Identity tracking feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch past entries for this participant
    const client = getClient();
    const { data, error } = await client
      .from("identity_entries")
      .select("*")
      .eq("tenant_id", participant.tenantId)
      .eq("participant_id", participant.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch entries" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      entries: data || [],
      count: (data || []).length,
    });
  } catch (error) {
    console.error("Identity GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
