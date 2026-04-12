// POST /api/features/aar
// Create an After Action Review entry for project reflection
// GET /api/features/aar?token=xxx
// Retrieve past AARs for the participant
// PUT /api/features/aar
// Update an AAR entry
// PATCH /api/features/aar?reflectionId=xxx
// Toggle is_shared flag on an AAR

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getParticipantByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/lib/feature-flags";



export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, projectName, expected, actual, gap, lessons, nextActions } =
      body;

    if (!token || !projectName) {
      return NextResponse.json(
        { error: "Token and projectName are required" },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-b.aar");
    if (!featureEnabled) {
      return NextResponse.json({ error: "AAR feature is not enabled" }, {
        status: 403,
      });
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tenantId = participant.tenantId || "default";

    // Store AAR in database
    const client = getClient();
    const { data, error } = await client
      .from("aar_entries")
      .insert({
        tenant_id: tenantId,
        participant_id: participant.id,
        project_name: projectName,
        expected: expected || null,
        actual: actual || null,
        gap: gap || null,
        lessons: lessons || null,
        next_actions: nextActions || null,
        is_shared: false,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Failed to store AAR" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      aarId: data.id,
    });
  } catch (error) {
    console.error("AAR POST error:", error);
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
    const featureEnabled = await isFeatureEnabled("tier-b.aar");
    if (!featureEnabled) {
      return NextResponse.json({ error: "AAR feature is not enabled" }, {
        status: 403,
      });
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tenantId = participant.tenantId || "default";

    // Fetch past AARs for this participant
    const client = getClient();
    const { data, error } = await client
      .from("aar_entries")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("participant_id", participant.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch AARs" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      aars: data || [],
      count: (data || []).length,
    });
  } catch (error) {
    console.error("AAR GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, aarId, projectName, expected, actual, gap, lessons, nextActions } =
      body;

    if (!token || !aarId) {
      return NextResponse.json(
        { error: "Token and aarId are required" },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-b.aar");
    if (!featureEnabled) {
      return NextResponse.json({ error: "AAR feature is not enabled" }, {
        status: 403,
      });
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tenantId = participant.tenantId || "default";

    // Update AAR
    const client = getClient();
    const { error } = await client
      .from("aar_entries")
      .update({
        project_name: projectName,
        expected: expected || null,
        actual: actual || null,
        gap: gap || null,
        lessons: lessons || null,
        next_actions: nextActions || null,
      })
      .eq("tenant_id", tenantId)
      .eq("participant_id", participant.id)
      .eq("id", aarId);

    if (error) {
      return NextResponse.json(
        { error: "Failed to update AAR" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("AAR PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const aarId = req.nextUrl.searchParams.get("aarId") || "";
    const token = req.nextUrl.searchParams.get("token") || "";

    if (!token || !aarId) {
      return NextResponse.json(
        { error: "Token and aarId required" },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-b.aar");
    if (!featureEnabled) {
      return NextResponse.json({ error: "AAR feature is not enabled" }, {
        status: 403,
      });
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Toggle is_shared flag
    const client = getClient();
    const { data: aar, error: fetchError } = await client
      .from("aar_entries")
      .select("is_shared")
      .eq("id", aarId)
      .eq("participant_id", participant.id)
      .single();

    if (fetchError || !aar) {
      return NextResponse.json({ error: "AAR not found" }, { status: 404 });
    }

    const { error: updateError } = await client
      .from("aar_entries")
      .update({ is_shared: !aar.is_shared })
      .eq("id", aarId);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to toggle is_shared" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, isShared: !aar.is_shared });
  } catch (error) {
    console.error("AAR PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
