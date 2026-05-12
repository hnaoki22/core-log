// PUT /api/admin/participants/[id]
// Update participant fields (name, email, department, dojoPhase, managerId, fbPolicy, emailEnabled, startDate, endDate)
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

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { token, ...updates } = body;

    // Auth check
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const manager = await getManagerByToken(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const participantId = params.id;
    if (!participantId) {
      return NextResponse.json(
        { error: "参加者IDが必要です" },
        { status: 400 }
      );
    }

    // Discover the participant's actual tenant. We update via this tenant so
    // super-admins (and admins working across tenants via the dropdown) can
    // legitimately edit anyone they are authorized for.
    const { data: existing, error: lookupErr } = await getClient()
      .from("participants")
      .select("tenant_id")
      .eq("id", participantId)
      .maybeSingle();
    if (lookupErr) {
      console.error("Participant lookup failed:", lookupErr.message);
      return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }
    const targetTenantId = existing.tenant_id as string;

    // Access check: super-admin (no tenantId) can edit anyone; tenant-admin
    // can only edit participants within their own tenant.
    const isSuperAdmin = !manager.tenantId;
    const allowed = isSuperAdmin || manager.tenantId === targetTenantId;
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden: cross-tenant edit not allowed" },
        { status: 403 }
      );
    }

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
        { status: 400 }
      );
    }

    const success = await updateParticipantInSupabase(
      participantId,
      updateData as Parameters<typeof updateParticipantInSupabase>[1],
      targetTenantId,
    );

    if (!success) {
      return NextResponse.json(
        { error: "更新に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PUT /api/admin/participants/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
