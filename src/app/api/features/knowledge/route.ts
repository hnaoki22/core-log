// GET /api/features/knowledge?token=xxx
// Returns all shared knowledge items for the tenant
// POST /api/features/knowledge
// Create a new knowledge item (from conceptualization or manual creation)

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getParticipantByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/lib/feature-flags";

const TENANT_ID = "81f91c26-214e-4da2-9893-6ac6c8984062";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-b.knowledgeLibrary");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Knowledge library feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all shared knowledge items for this tenant
    const client = getClient();
    const { data, error } = await client
      .from("knowledge_items")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .eq("is_shared", true)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch knowledge items" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      items: data || [],
      count: (data || []).length,
    });
  } catch (error) {
    console.error("Knowledge GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, title, content, tags, isAnonymous } = body;

    if (!token || !title || !content) {
      return NextResponse.json(
        { error: "Token, title, and content are required" },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-b.knowledgeLibrary");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Knowledge library feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Store knowledge item in database
    const client = getClient();
    const { data, error } = await client
      .from("knowledge_items")
      .insert({
        tenant_id: TENANT_ID,
        participant_id: participant.id,
        title,
        content,
        tags: tags || [],
        is_shared: true, // New items are shared by default
        is_anonymous: isAnonymous || false,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Failed to create knowledge item" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      itemId: data.id,
    });
  } catch (error) {
    console.error("Knowledge POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
