// POST /api/admin/members
// Add a new participant or manager via the admin dashboard
// Requires admin token for authorization

import { NextRequest, NextResponse } from "next/server";
import {
  createParticipantInSupabase as createParticipant,
  createManagerInSupabase as createManager,
  getAllManagersFromSupabase as getAllManagers,
  getManagerByTokenFromSupabase as getManagerByTokenSupabase,
  getTenantBySlug,
} from "@/lib/supabase";
import { resolveAdminTenantContext, resolveManagerTenantStrict } from "@/lib/tenant-context";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, type, data } = body;

    // Admin authorization check
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const manager = await getManagerByTokenSupabase(token);
    if (!manager) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // For create operations, require a specific target tenant.
    // Admin with ?tenant=slug → that tenant. Otherwise admin's home tenant.
    // If admin is in 全テナント mode, reject (ambiguous target).
    const tenantSlug = request.nextUrl.searchParams.get("tenant");
    const tenantResult = resolveManagerTenantStrict(manager);
    if (!tenantResult.ok) {
      return NextResponse.json(tenantResult.errorBody, { status: tenantResult.status });
    }
    let tenantId = tenantResult.tenantId;
    if (manager.isAdmin && tenantSlug) {
      const t = await getTenantBySlug(tenantSlug);
      if (t) tenantId = t.id;
    } else if (manager.isAdmin && !tenantSlug && !manager.tenantId) {
      return NextResponse.json(
        { error: "作成先テナントを指定してください（全テナント状態では作成できません）" },
        { status: 400 }
      );
    }

    if (type === "participant") {
      const { name, email, department, dojoPhase, managerId } = data;
      if (!name || !email) {
        return NextResponse.json({ error: "名前とメールは必須です" }, { status: 400 });
      }

      const result = await createParticipant({
        name,
        email,
        department: department || "",
        dojoPhase: dojoPhase || "道場1 覚醒",
        managerId: managerId || undefined,
        fbPolicy: "",
      }, tenantId);

      if (!result) {
        return NextResponse.json({ error: "参加者の作成に失敗しました" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `${name}さんを追加しました`,
        participant: {
          id: result.id,
          token: result.token,
          name,
        },
      });
    }

    if (type === "manager") {
      const { name, email, department, isAdmin, role } = data;
      if (!name || !email) {
        return NextResponse.json({ error: "名前とメールは必須です" }, { status: 400 });
      }

      // role の入力検証。許可値以外は無視して既定値（manager 相当）にフォールバック
      const allowedRoles = ["admin", "manager", "observer"] as const;
      type AllowedRole = (typeof allowedRoles)[number];
      const normalizedRole: AllowedRole | undefined =
        typeof role === "string" && (allowedRoles as readonly string[]).includes(role)
          ? (role as AllowedRole)
          : undefined;
      // role が "admin" の場合は isAdmin も連動させる（編集画面の挙動と整合）
      const finalIsAdmin = normalizedRole === "admin" ? true : isAdmin ?? false;

      const result = await createManager({
        name,
        email,
        department: department || "",
        isAdmin: finalIsAdmin,
        role: normalizedRole,
      }, tenantId);

      if (!result) {
        return NextResponse.json({ error: "マネージャーの作成に失敗しました" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `${name}さんをマネージャーとして追加しました`,
        manager: {
          id: result.id,
          token: result.token,
          name,
        },
      });
    }

    return NextResponse.json({ error: "Invalid type. Use 'participant' or 'manager'" }, { status: 400 });
  } catch (error) {
    console.error("Error in POST /api/admin/members:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/admin/members?token=xxx
// Returns list of managers for the dropdown when adding participants
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const manager = await getManagerByTokenSupabase(token);
  if (!manager) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const ctx = await resolveAdminTenantContext(request, manager);

  try {
    // For the dropdown, tenantId=null (全テナント) returns managers from all tenants
    const managers = await getAllManagers(ctx.tenantId ?? undefined);
    return NextResponse.json({
      managers: managers.map((m) => ({
        id: m.id,
        name: m.name,
      })),
    });
  } catch {
    return NextResponse.json({ managers: [] });
  }
}
