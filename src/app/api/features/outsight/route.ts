// GET /api/features/outsight?token=xxx
// Returns current week's task (if any)
// POST to create/assign: { token, taskDescription } (admin only)
// PUT to complete: { token, taskId, reflection }

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getParticipantByTokenFromSupabase, getManagerByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabledForToken } from "@/lib/feature-flags";

/**
 * Compute the JST ISO-week string for the given instant.
 *
 * Previously this called `date.getFullYear()`/`getDay()` directly, which use
 * the server's timezone (UTC on Vercel). Around UTC midnight, two callers in
 * Japan could fall into different weeks. Anchor everything to JST.
 */
function getWeekString(date: Date): string {
  const jstISO = new Date(date.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10); // YYYY-MM-DD in JST
  const [y, m, d] = jstISO.split("-").map((n) => parseInt(n, 10));
  // Compute ISO-week via the "Thursday" rule.
  const target = new Date(Date.UTC(y, m - 1, d));
  const dayNum = target.getUTCDay() || 7; // Sun=0 -> 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-c.outsightTask", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Outsight task feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current week string
    const weekString = getWeekString(new Date());

    // Fetch current week's task for this participant
    const client = getClient();
    const { data, error } = await client
      .from("outsight_tasks")
      .select("*")
      .eq("tenant_id", participant.tenantId)
      .eq("participant_id", participant.id)
      .eq("week_string", weekString)
      .eq("is_completed", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 means no rows found (expected)
      console.error("Outsight task fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch task" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      task: data || null,
      weekString,
    });
  } catch (error) {
    console.error("Outsight GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, taskDescription, participantId } = body;

    if (!token || !taskDescription) {
      return NextResponse.json(
        { error: "Token and taskDescription are required" },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-c.outsightTask", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Outsight task feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify admin/manager token
    const manager = await getManagerByTokenFromSupabase(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    if (!participantId) {
      return NextResponse.json({ error: "participantId is required" }, { status: 400 });
    }
    if (!manager.tenantId) {
      return NextResponse.json({ error: "Tenant unresolved" }, { status: 500 });
    }

    // Confirm the target participant belongs to the manager's tenant so an
    // admin in tenant A cannot assign a task to a participant in tenant B
    // by guessing the participant id.
    const client = getClient();
    const { data: targetOk } = await client
      .from("participants")
      .select("id")
      .eq("id", participantId)
      .eq("tenant_id", manager.tenantId)
      .maybeSingle();
    if (!targetOk) {
      return NextResponse.json({ error: "Target participant not found" }, { status: 404 });
    }

    // Get current week string
    const weekString = getWeekString(new Date());

    // Store in outsight_tasks table
    const { data, error } = await client
      .from("outsight_tasks")
      .insert({
        tenant_id: manager.tenantId,
        participant_id: participantId,
        week_string: weekString,
        task_description: taskDescription,
        is_completed: false,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Outsight insert error:", error);
      return NextResponse.json(
        { error: "Failed to create task" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      taskId: data.id,
      weekString,
    });
  } catch (error) {
    console.error("Outsight POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, taskId, reflection } = body;

    if (!token || !taskId || !reflection) {
      return NextResponse.json(
        { error: "Token, taskId, and reflection are required" },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-c.outsightTask", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Outsight task feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Update task with completion
    const client = getClient();
    const { error } = await client
      .from("outsight_tasks")
      .update({
        is_completed: true,
        reflection,
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .eq("tenant_id", participant.tenantId)
      .eq("participant_id", participant.id);

    if (error) {
      console.error("Outsight update error:", error);
      return NextResponse.json(
        { error: "Failed to complete task" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      taskId,
      message: "Task completed successfully",
    });
  } catch (error) {
    console.error("Outsight PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
