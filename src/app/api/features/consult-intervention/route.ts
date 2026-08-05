// POST /api/features/consult-intervention
// Accepts: { token, consultantName, interventionType, date (YYYY-MM-DD),
//            participantIds, description, durationMinutes, notes? }
// Admin-only
// Stores in consult_interventions
// GET returns the tenant's interventions as camelCase DTOs:
//   { id, date, consultantName, interventionType, description,
//     participantIds, participantNames, durationMinutes, notes }
// participant_ids が保存契約（ID保存は改名に強い）。表示名は GET 時に
// participants を引いて解決する（名前で保存すると Trap 6: 改名で陳腐化）。
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

type ConsultInterventionRow = {
  id: string;
  date: string;
  consultant_name: string | null;
  intervention_type: string | null;
  description: string | null;
  participant_ids: string[] | null;
  duration_minutes: number | null;
  notes: string | null;
};

// PostgreSQL の date 型は空文字を受け付けない（22007 → 500）。
// バリデーション段階で YYYY-MM-DD を強制して 400 で返す（Trap 5）。
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
    DATE_PATTERN.test(b.date) &&
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
            "Invalid request format. Required: token, consultantName, interventionType, date (YYYY-MM-DD), participantIds (array), description, durationMinutes (> 0). Optional: notes",
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

    const interventions = (data || []) as ConsultInterventionRow[];

    // Resolve display names from the stored participant_ids. Insert-time
    // validation guarantees same-tenant ids, so the tenant filter is safe
    // (and prevents cross-tenant name leakage on legacy rows).
    const referencedIds = Array.from(
      new Set(interventions.flatMap((i) => i.participant_ids || []))
    );
    const nameById = new Map<string, string>();
    if (referencedIds.length > 0) {
      const { data: participantRows, error: participantError } = await client
        .from("participants")
        .select("id, name")
        .in("id", referencedIds)
        .eq("tenant_id", tenantId);
      if (participantError) {
        console.error("Consult intervention participant name fetch error:", participantError);
        return NextResponse.json(
          { error: "Failed to resolve participant names" },
          { status: 500 }
        );
      }
      for (const row of participantRows || []) {
        nameById.set(row.id, row.name);
      }
    }

    // Calculate summary stats
    const interventionTypesSet = new Set(interventions.map(i => i.intervention_type));
    const stats = {
      totalInterventions: interventions.length,
      totalParticipantSessions: interventions.reduce((sum, i) => sum + (i.participant_ids?.length || 0), 0),
      totalMinutes: interventions.reduce((sum, i) => sum + (i.duration_minutes || 0), 0),
      interventionTypes: Array.from(interventionTypesSet),
    };

    return NextResponse.json({
      success: true,
      interventions: interventions.map((row) => ({
        id: row.id,
        date: row.date,
        consultantName: row.consultant_name || "",
        interventionType: row.intervention_type || "",
        description: row.description || "",
        participantIds: row.participant_ids || [],
        // 削除済み参加者などで名前が引けない場合は ID をそのまま出す
        //（silent に落とすと「参加者が消えた」ように見えるため）
        participantNames: (row.participant_ids || []).map((id) => nameById.get(id) ?? id),
        durationMinutes: row.duration_minutes || 0,
        notes: row.notes || "",
      })),
      stats,
      count: interventions.length,
    });
  } catch (error) {
    console.error("Consult intervention GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
