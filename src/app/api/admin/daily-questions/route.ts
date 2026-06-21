// GET/POST /api/admin/daily-questions
// 毎日の問い（7曜日 × 軸 × 朝/夕）の per-tenant 管理。admin（manager.isAdmin）専用。
// placeholder-examples の admin API と同一の認証・テナント解決パターンに準拠。

import { NextRequest, NextResponse } from "next/server";
import {
  getManagerByTokenFromSupabase as getManagerByToken,
  getAllTenants,
  DEFAULT_TENANT_ID,
} from "@/lib/supabase";
import { resolveAdminTenantContext } from "@/lib/tenant-context";
import { getWeeklyForTenant, saveWeeklyForTenant } from "@/lib/daily-questions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

    const manager = await getManagerByToken(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const ctx = await resolveAdminTenantContext(request, manager);
    const tenantId = ctx.tenantId ?? manager.tenantId ?? DEFAULT_TENANT_ID;

    const weekly = await getWeeklyForTenant(tenantId);
    const allTenants = await getAllTenants();
    const currentTenant = allTenants.find((t) => t.id === tenantId);

    return NextResponse.json({
      success: true,
      weekly: weekly ?? null,
      tenantId,
      tenantSlug: currentTenant?.slug ?? null,
      tenantName: currentTenant?.name ?? null,
      isSuperAdmin: !!manager.isAdmin,
      allTenants: allTenants.map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
    });
  } catch (err) {
    console.error("GET /api/admin/daily-questions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, action, weekly } = body;
    if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

    const manager = await getManagerByToken(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const ctx = await resolveAdminTenantContext(request, manager);
    const tenantId = ctx.tenantId ?? manager.tenantId ?? DEFAULT_TENANT_ID;

    if (action !== "save") {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
    if (!weekly || typeof weekly !== "object") {
      return NextResponse.json({ error: "weekly object is required" }, { status: 400 });
    }

    const ok = await saveWeeklyForTenant(tenantId, weekly);
    return ok
      ? NextResponse.json({ success: true })
      : NextResponse.json({ error: "保存に失敗しました（内容が空、または保存エラー）" }, { status: 400 });
  } catch (err) {
    console.error("POST /api/admin/daily-questions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
