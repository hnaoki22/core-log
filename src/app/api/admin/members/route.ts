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
import { resolveAdminTenantContext } from "@/lib/tenant-context";
import { buildLoginPath, managerKind } from "@/lib/admin-directory";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, type, data } = body;

    // 追加できるのは管理者（is_admin）だけ。
    // これまでは、有効なマネージャーのトークンなら役割を問わず通っていた（閲覧者・
    // マネージャーのトークンでも、参加者や管理者のアカウントを作れた）。
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const manager = await getManagerByTokenSupabase(token);
    if (!manager || manager.isAdmin !== true) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 追加先の環境（テナント）は、必ず ?tenant=slug で受け取る。
    // これまでは、指定がないと管理者の所属テナントに黙って追加していた。全環境を表示した
    // まま追加すると、意図しない環境に入り、どこに入ったのかが画面で分からなかった。
    // 知らない slug のときも、所属テナントには落とさずに断る。
    const tenantSlug = request.nextUrl.searchParams.get("tenant");
    if (!tenantSlug) {
      return NextResponse.json({ error: "追加先の環境を選んでください" }, { status: 400 });
    }
    const targetTenant = await getTenantBySlug(tenantSlug);
    if (!targetTenant) {
      return NextResponse.json({ error: "追加先の環境が見つかりません" }, { status: 400 });
    }
    const tenantId = targetTenant.id;
    const tenantInfo = {
      id: targetTenant.id,
      slug: targetTenant.slug,
      name: targetTenant.name,
      companyName: targetTenant.companyName,
    };

    if (type === "participant") {
      const { name, email, department, dojoPhase, managerId } = data;
      if (!name || !email) {
        return NextResponse.json({ error: "名前とメールは必須です" }, { status: 400 });
      }

      const result = await createParticipant({
        name,
        email,
        department: department || "",
        dojoPhase: dojoPhase || "",
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
          // ログイン用のパス。画面はこれを使う（これまでは返しておらず、追加後の表示の URL が欠けていた）
          url: buildLoginPath("participant", result.token),
        },
        tenant: tenantInfo,
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
          url: buildLoginPath(managerKind(normalizedRole, finalIsAdmin), result.token),
        },
        tenant: tenantInfo,
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
