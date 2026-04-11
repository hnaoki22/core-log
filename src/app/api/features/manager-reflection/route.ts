// POST /api/features/manager-reflection
// Manager records their own reflection on leadership and team interactions
// GET /api/features/manager-reflection?token=xxx
// Retrieve past manager reflections

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getManagerByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/lib/feature-flags";

const TENANT_ID = "81f91c26-214e-4da2-9893-6ac6c8984062";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, reflection, supportActions, challenges } = body;

    if (!token || !reflection) {
      return NextResponse.json(
        { error: "Token and reflection are required" },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-a.managerSelfReflection");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Manager self-reflection feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify manager token
    const manager = await getManagerByTokenFromSupabase(token);
    if (!manager) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Store reflection in database
    const client = getClient();
    const { data, error } = await client
      .from("manager_reflections")
      .insert({
        tenant_id: TENANT_ID,
        manager_id: manager.id,
        reflection,
        support_actions: supportActions || null,
        challenges: challenges || null,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Failed to store reflection" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      reflectionId: data.id,
    });
  } catch (error) {
    console.error("Manager reflection POST error:", error);
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
    const featureEnabled = await isFeatureEnabled("tier-a.managerSelfReflection");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Manager self-reflection feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify manager token
    const manager = await getManagerByTokenFromSupabase(token);
    if (!manager) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch past reflections for this manager
    const client = getClient();
    const { data, error } = await client
      .from("manager_reflections")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .eq("manager_id", manager.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch reflections" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      reflections: data || [],
      count: (data || []).length,
    });
  } catch (error) {
    console.error("Manager reflection GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
