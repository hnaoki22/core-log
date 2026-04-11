// POST /api/features/unlearn
// Record unlearning challenge with situation, strength that failed, insight, new approach
// Monthly challenge - store with month_year field (e.g. "2026-04")
// GET returns past entries

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getParticipantByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/lib/feature-flags";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, situation, strengthThatFailed, insight, newApproach } = body;

    if (!token || !situation || !strengthThatFailed || !insight || !newApproach) {
      return NextResponse.json(
        { error: "Token, situation, strengthThatFailed, insight, and newApproach are required" },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-c.unlearnChallenge");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Unlearn challenge feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Generate month_year in format YYYY-MM
    const now = new Date();
    const month_year = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Store in unlearn_entries table
    const client = getClient();
    const { data, error } = await client
      .from("unlearn_entries")
      .insert({
        tenant_id: participant.tenantId,
        participant_id: participant.id,
        month_year,
        situation,
        strength_that_failed: strengthThatFailed,
        insight,
        new_approach: newApproach,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Unlearn insert error:", error);
      return NextResponse.json(
        { error: "Failed to store unlearn entry" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      entryId: data.id,
      month_year,
    });
  } catch (error) {
    console.error("Unlearn challenge error:", error);
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
    const featureEnabled = await isFeatureEnabled("tier-c.unlearnChallenge");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Unlearn challenge feature is not enabled" },
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
      .from("unlearn_entries")
      .select("*")
      .eq("tenant_id", participant.tenantId)
      .eq("participant_id", participant.id)
      .order("created_at", { ascending: false })
      .limit(50);

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
    console.error("Unlearn GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
