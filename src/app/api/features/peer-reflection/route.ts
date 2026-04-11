// POST /api/features/peer-reflection
// Create a peer reflection request (one participant asks another for feedback)
// GET /api/features/peer-reflection?token=xxx
// Retrieve pending/received reflections for the participant
// PUT /api/features/peer-reflection
// Answer a peer reflection request

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getParticipantByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/lib/feature-flags";

const TENANT_ID = "81f91c26-214e-4da2-9893-6ac6c8984062";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, toParticipantId, question } = body;

    if (!token || !toParticipantId || !question) {
      return NextResponse.json(
        { error: "Token, toParticipantId, and question are required" },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-b.peerReflection");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Peer reflection feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create peer reflection request
    const client = getClient();
    const { data, error } = await client
      .from("peer_reflections")
      .insert({
        tenant_id: TENANT_ID,
        from_participant_id: participant.id,
        to_participant_id: toParticipantId,
        question,
        answer: null,
        is_answered: false,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Failed to create peer reflection request" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      reflectionId: data.id,
    });
  } catch (error) {
    console.error("Peer reflection POST error:", error);
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
    const featureEnabled = await isFeatureEnabled("tier-b.peerReflection");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Peer reflection feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = getClient();

    // Fetch pending reflections (sent to this participant)
    const { data: pending, error: pendingError } = await client
      .from("peer_reflections")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .eq("to_participant_id", participant.id)
      .eq("is_answered", false)
      .order("created_at", { ascending: false });

    if (pendingError) {
      return NextResponse.json(
        { error: "Failed to fetch pending reflections" },
        { status: 500 }
      );
    }

    // Fetch received reflections (sent by this participant)
    const { data: sent, error: sentError } = await client
      .from("peer_reflections")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .eq("from_participant_id", participant.id)
      .order("created_at", { ascending: false });

    if (sentError) {
      return NextResponse.json(
        { error: "Failed to fetch sent reflections" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      pending: pending || [],
      sent: sent || [],
      pendingCount: (pending || []).length,
      sentCount: (sent || []).length,
    });
  } catch (error) {
    console.error("Peer reflection GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, reflectionId, answer } = body;

    if (!token || !reflectionId || !answer) {
      return NextResponse.json(
        { error: "Token, reflectionId, and answer are required" },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-b.peerReflection");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Peer reflection feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify this participant can answer this reflection
    const client = getClient();
    const { data: reflection, error: fetchError } = await client
      .from("peer_reflections")
      .select("*")
      .eq("id", reflectionId)
      .eq("to_participant_id", participant.id)
      .single();

    if (fetchError || !reflection) {
      return NextResponse.json(
        { error: "Peer reflection not found or access denied" },
        { status: 404 }
      );
    }

    if (reflection.is_answered) {
      return NextResponse.json(
        { error: "This reflection has already been answered" },
        { status: 409 }
      );
    }

    // Update reflection with answer
    const { error: updateError } = await client
      .from("peer_reflections")
      .update({
        answer,
        is_answered: true,
        answered_at: new Date().toISOString(),
      })
      .eq("id", reflectionId);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to save answer" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Peer reflection PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
