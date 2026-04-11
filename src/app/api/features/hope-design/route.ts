// POST /api/features/hope-design
// Accepts: { token, goal, pathways: [{description, steps}], obstacles: [{description, mitigation}], agencyThoughts }
// Quarterly work, store with quarter field
// GET returns past designs

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getParticipantByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/lib/feature-flags";

function getQuarterString(date: Date): string {
  const month = date.getMonth() + 1;
  const quarter = Math.ceil(month / 3);
  return `${date.getFullYear()}-Q${quarter}`;
}

type PathwayItem = {
  description: string;
  steps: string[];
};

type ObstacleItem = {
  description: string;
  mitigation: string;
};

function validateRequest(body: unknown): body is {
  token: string;
  goal: string;
  pathways: PathwayItem[];
  obstacles: ObstacleItem[];
  agencyThoughts: string;
} {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;

  return (
    typeof b.token === "string" &&
    typeof b.goal === "string" &&
    Array.isArray(b.pathways) &&
    b.pathways.every(
      p => {
        if (typeof p !== "object" || p === null) return false;
        const pathway = p as Record<string, unknown>;
        return (
          typeof pathway.description === "string" &&
          Array.isArray(pathway.steps) &&
          pathway.steps.every((s: unknown) => typeof s === "string")
        );
      }
    ) &&
    Array.isArray(b.obstacles) &&
    b.obstacles.every(
      o => {
        if (typeof o !== "object" || o === null) return false;
        const obstacle = o as Record<string, unknown>;
        return (
          typeof obstacle.description === "string" &&
          typeof obstacle.mitigation === "string"
        );
      }
    ) &&
    typeof b.agencyThoughts === "string"
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!validateRequest(body)) {
      return NextResponse.json(
        {
          error:
            "Invalid request format. Required: token, goal, pathways (array of {description, steps}), obstacles (array of {description, mitigation}), agencyThoughts",
        },
        { status: 400 }
      );
    }

    const { token, goal, pathways, obstacles, agencyThoughts } = body;

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-d.hopeDesign");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Hope design feature is not enabled" },
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

    // Store in hope_designs table
    const client = getClient();
    const { data, error } = await client
      .from("hope_designs")
      .insert({
        tenant_id: participant.tenantId,
        participant_id: participant.id,
        quarter,
        goal,
        pathways: pathways as unknown,
        obstacles: obstacles as unknown,
        agency_thoughts: agencyThoughts,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Hope design insert error:", error);
      return NextResponse.json(
        { error: "Failed to store design" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      designId: data.id,
      quarter,
      message: "Hope design recorded for this quarter",
    });
  } catch (error) {
    console.error("Hope design POST error:", error);
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
    const featureEnabled = await isFeatureEnabled("tier-d.hopeDesign");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Hope design feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all designs for this participant
    const client = getClient();
    const { data, error } = await client
      .from("hope_designs")
      .select("*")
      .eq("tenant_id", participant.tenantId)
      .eq("participant_id", participant.id)
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) {
      console.error("Hope design fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch designs" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      designs: data || [],
      count: (data || []).length,
    });
  } catch (error) {
    console.error("Hope design GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
