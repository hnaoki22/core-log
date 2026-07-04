// GET /api/admin/participants/[id]
//   Returns the full participant record for the admin edit modal so the
//   form can be populated with the real email / start_date / end_date /
//   emailEnabled / fb_policy values — NOT empty strings.
//
// PUT /api/admin/participants/[id]
//   Update participant fields (name, email, department, dojoPhase, managerId,
//   fbPolicy, emailEnabled, startDate, endDate).
//
// Tenant resolution: looks up the participant's ACTUAL tenant via a SELECT
// before updating, then validates that the caller has access to that tenant.
// Previously the code forced the WHERE clause to `tenant_id = admin.homeTenant`,
// which silently 0-row updated when a super-admin (or admin with ?tenant=slug
// selected) edited a participant outside their home tenant. The dropdown
// change appeared to fail because the WHERE filter excluded the target row.

import { NextRequest, NextResponse } from "next/server";
import { getManagerByToken } from "@/lib/participant-db";
import { getClient, updateParticipantInSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Shared admin auth + target-tenant lookup. Returns either a permitted
// access context with the target's actual tenant_id, or an error response.
async function authorizeAdminForParticipant(
  request: NextRequest,
  participantId: string,
): Promise<
  | { ok: true; targetTenantId: string; managerTenantId: string | undefined; isSuperAdmin: boolean }
  | { ok: false; response: NextResponse }
> {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  // PUT also passes token in the body; the caller will fall back to that.
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 403 }) };
  }
  return authorizeWithToken(token, participantId);
}

async function authorizeWithToken(
  token: string,
  participantId: string,
): Promise<
  | { ok: true; targetTenantId: string; managerTenantId: string | undefined; isSuperAdmin: boolean }
  | { ok: false; response: NextResponse }
> {
  const manager = await getManagerByToken(token);
  if (!manager || !manager.isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 403 }) };
  }
  if (!participantId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "参加者IDが必要です" }, { status: 400 }),
    };
  }
  const { data: existing, error: lookupErr } = await getClient()
    .from("participants")
    .select("tenant_id")
    .eq("id", participantId)
    .maybeSingle();
  if (lookupErr) {
    console.error("Participant lookup failed:", lookupErr.message);
    return {
      ok: false,
      response: NextResponse.json({ error: "Lookup failed" }, { status: 500 }),
    };
  }
  if (!existing) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Participant not found" }, { status: 404 }),
    };
  }
  const targetTenantId = existing.tenant_id as string;

  // Cross-tenant access follows the same convention as the rest of the admin
  // API (resolveAdminTenantContext): is_admin=true managers operate on any
  // tenant. The old rule (`!manager.tenantId` = super-admin) matched zero
  // rows in production — every admin row has a tenant_id — so cross-tenant
  // edits always 403'd even though the dashboard listed those participants.
  const isSuperAdmin = !!manager.isAdmin;
  const allowed = isSuperAdmin || manager.tenantId === targetTenantId;
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: cross-tenant edit not allowed" },
        { status: 403 },
      ),
    };
  }
  return {
    ok: true,
    targetTenantId,
    managerTenantId: manager.tenantId ?? undefined,
    isSuperAdmin,
  };
}

// ---------- GET ----------
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await authorizeAdminForParticipant(request, params.id);
    if (!auth.ok) return auth.response;

    const { data: row, error } = await getClient()
      .from("participants")
      .select(
        "id, tenant_id, token, name, email, department, dojo_phase, manager_id, fb_policy, email_enabled, start_date, end_date, role",
      )
      .eq("id", params.id)
      .eq("tenant_id", auth.targetTenantId)
      .maybeSingle();
    if (error || !row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Normalize: convert PostgreSQL NULL → "" for text fields the form
    // expects, but keep date fields as the actual stored value (string in
    // YYYY-MM-DD form, or "" if NULL — date <input> handles both).
    return NextResponse.json({
      participant: {
        id: row.id,
        tenantId: row.tenant_id,
        token: row.token,
        name: row.name,
        email: row.email ?? "",
        department: row.department ?? "",
        dojoPhase: row.dojo_phase ?? "",
        managerId: row.manager_id ?? "",
        fbPolicy: row.fb_policy ?? "",
        emailEnabled: row.email_enabled ?? true,
        startDate: row.start_date ?? "",
        endDate: row.end_date ?? "",
        role: row.role ?? "参加者",
      },
    });
  } catch (error) {
    console.error("Error in GET /api/admin/participants/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------- PUT ----------
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json();
    const { token, ...updates } = body as { token?: string } & Record<string, unknown>;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const auth = await authorizeWithToken(token, params.id);
    if (!auth.ok) return auth.response;

    // Validate allowed fields
    const allowedFields = [
      "name",
      "email",
      "department",
      "dojoPhase",
      "managerId",
      "fbPolicy",
      "emailEnabled",
      "startDate",
      "endDate",
    ];
    const updateData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        updateData[key] = updates[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "更新するフィールドが指定されていません" },
        { status: 400 },
      );
    }

    const success = await updateParticipantInSupabase(
      params.id,
      updateData as Parameters<typeof updateParticipantInSupabase>[1],
      auth.targetTenantId,
    );

    if (!success) {
      return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PUT /api/admin/participants/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
