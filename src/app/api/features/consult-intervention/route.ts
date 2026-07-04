// POST /api/features/consult-intervention
// Accepts: { token, consultantName, interventionType, date, participantIds, description, durationMinutes, notes }
// Admin-only
// Stores in consult_interventions
// GET returns all interventions for the tenant
//
// Tenant resolution: ?tenant=slug（admin がダッシュボードで選択中のテナント）を
// 最優先で解決する（Trap 3）。従来は manager.tenantId を直接 insert しており、
// テナント無所属 super-admin では tenant_id=null、テナント所属 admin では
// 選択中テナントと無関係にホームテナントへ書かれていた（silent wrong-tenant write）。
// feature flag も actor ではなく TARGET テナントで判定する。

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getManagerByTokenFromSupabase } from "@/lib/supabase";
import { resolveAdminTargetTenant } from "@/lib/tenant-context";
import { isFeatureEnabled } from "@/lib/feature-flags";

function validatePostRequest(body: unknown): body is {
  token: string;
  consultantName: string;
  interventionType: string;
  date: string;
  participantIds: string[];
  description: string;
  durationMinutes: number;
  notes?: string;
} {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;

  return (
    typeof b.token === "string" &&
    typeof b.consultantName === "string" &&
    typeof b.interventionType === "string" &&
    typeof b.date === "string" &&
    Array.isArray(b.participantIds) &&
    b.participantIds.every((id: unknown) => typeof id === "string") &&
    typeof b.description === "string" &&
    typeof b.durationMinutes === "number" &&
    b.durationMinutes > 0 &&
    (!("notes" in b) || typeof b.notes === "string")
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!validatePostRequest(body)) {
      return NextResponse.json(
        {
          error:
            "Invalid request format. Required: token, consultantName, interventionType, date, participantIds (array), description, durationMinutes. Optional: notes",
        },
        { status: 400 }
      );
    }

    const { token, consultantName, interventionType, date, participantIds, description, durationMinutes, notes } = body;

    // Verify admin/manager token
    const manager = await getManagerByTokenFromSupabase(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Trap 3: resolve the TARGET tenant (?tenant=slug for admins)
    const tenantResult = await resolveAdminTargetTenant(
      manager,
      req.nextUrl.searchParams.get("tenant")
    );
    if (!tenantResult.ok) {
      return NextResponse.json(tenantResult.errorBody, { status: tenantResult.status });
    }
    const tenantId = tenantResult.tenantId;

    // Check feature flag for the TARGET tenant
    const featureEnabled = await isFeatureEnabled("tier-g.consultIntervention", tenantId);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Consult intervention feature is not enabled" },
        { status: 403 }
      );
    }

    // Validate that every referenced participant belongs to the target tenant
    // (prevents recording interventions against rows the write never matches).
    const client = getClient();
    if (participantIds.length > 0) {
      const { data: targetRows, error: targetError } = await client
        .from("participants")
        .select("id")
        .in("id", participantIds)
        .eq("tenant_id", tenantId);
      if (targetError) {
        console.error("Consult intervention participant check error:", targetError);
        return NextResponse.json({ error: "Failed to validate participants" }, { status: 500 });
      }
      const foundIds = new Set((targetRows || []).map((r) => r.id));
      const missing = participantIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        return NextResponse.json(
          { error: "Some participants are not in the target tenant", detail: missing.join(", ") },
          { status: 400 }
        );
      }
    }

    // Store in consult_interventions table
    const { data, error } = await client
      .from("consult_interventions")
      .insert({
        tenant_id: tenantId,
        consultant_name: consultantName,
        intervention_type: interventionType,
        date,
        participant_ids: participantIds,
        description,
        duration_minutes: durationMinutes,
        notes: notes || null,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Consult intervention insert error:", error);
      return NextResponse.json(
        { error: "Failed to store intervention" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      interventionId: data.id,
      message: `Intervention recorded for ${participantIds.length} participant(s)`,
    });
  } catch (error) {
    console.error("Consult intervention POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Verify admin/manager token
    const manager = await getManagerByTokenFromSupabase(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Trap 3: resolve the TARGET tenant (?tenant=slug for admins). Also fixes
    // the tenantless super-admin case where .eq("tenant_id", null) silently
    // matched 0 rows (Trap 2a).
    const tenantResult = await resolveAdminTargetTenant(
      manager,
      req.nextUrl.searchParams.get("tenant")
    );
    if (!tenantResult.ok) {
      return NextResponse.json(tenantResult.errorBody, { status: tenantResult.status });
    }
    const tenantId = tenantResult.tenantId;

    // Check feature flag for the TARGET tenant
    const featureEnabled = await isFeatureEnabled("tier-g.consultIntervention", tenantId);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Consult intervention feature is not enabled" },
        { status: 403 }
      );
    }

    // Fetch all interventions for this tenant
    const client = getClient();
    const { data, error } = await client
      .from("consult_interventions")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("date", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Consult intervention fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch interventions" },
        { status: 500 }
      );
    }

    // Calculate summary stats
    const interventions = data || [];
    const interventionTypesSet = new Set(interventions.map(i => i.intervention_type));
    const stats = {
      totalInterventions: interventions.length,
      totalParticipantSessions: interventions.reduce((sum, i) => sum + (i.participant_ids?.length || 0), 0),
      totalMinutes: interventions.reduce((sum, i) => sum + (i.duration_minutes || 0), 0),
      interventionTypes: Array.from(interventionTypesSet),
    };

    return NextResponse.json({
      success: true,
      interventions,
      stats,
      count: interventions.length,
    });
  } catch (error) {
    console.error("Consult intervention GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
