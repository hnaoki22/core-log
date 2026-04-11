// POST /api/features/peer-reflection
// Send a peer reflection (one participant sends feedback to another)
// GET /api/features/peer-reflection?token=xxx
// Retrieve team members, pending requests, and received reflections
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
    const { token, toParticipantId, question, reflection } = body;

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

    // Look up the target participant's name
    const client = getClient();
    const { data: targetParticipant } = await client
      .from("participants")
      .select("id, name")
      .eq("id", toParticipantId)
      .single();

    if (!targetParticipant) {
      return NextResponse.json(
        { error: "Target participant not found" },
        { status: 404 }
      );
    }

    // Create peer reflection
    const { data, error } = await client
      .from("peer_reflections")
      .insert({
        tenant_id: TENANT_ID,
        from_participant_id: participant.id,
        to_participant_id: toParticipantId,
        from_name: participant.name,
        to_name: targetParticipant.name,
        question,
        answer: reflection || null,
        status: reflection ? "answered" : "pending",
        created_at: new Date().toISOString(),
        answered_at: reflection ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Peer reflection insert error:", error);
      return NextResponse.json(
        { error: "Failed to create peer reflection" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      reflectionId: data.id,
    });
  } catch {
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

    // Fetch team members (same tenant, exclude self)
    const { data: members } = await client
      .from("participants")
      .select("id, name, role")
      .eq("tenant_id", TENANT_ID)
      .neq("id", participant.id)
      .order("name");

    // Fetch reflections received (sent TO this participant, pending answer)
    const { data: pendingForMe } = await client
      .from("peer_reflections")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .eq("to_participant_id", participant.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    // Fetch reflections sent BY this participant (to see their status)
    const { data: sentByMe } = await client
      .from("peer_reflections")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .eq("from_participant_id", participant.id)
      .order("created_at", { ascending: false });

    // Fetch reflections received (answered ones sent TO this participant)
    const { data: receivedAnswers } = await client
      .from("peer_reflections")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .eq("to_participant_id", participant.id)
      .eq("status", "answered")
      .order("created_at", { ascending: false });

    return NextResponse.json({
      success: true,
      currentParticipant: { id: participant.id, name: participant.name },
      members: (members || []).filter((m: { role: string }) => m.role === "参加者"),
      pendingForMe: pendingForMe || [],
      sentByMe: sentByMe || [],
      receivedAnswers: receivedAnswers || [],
    });
  } catch {
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

    if (reflection.status === "answered") {
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
        status: "answered",
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
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
