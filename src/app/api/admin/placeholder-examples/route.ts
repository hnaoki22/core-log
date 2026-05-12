// GET/POST/PUT /api/admin/placeholder-examples
// Manage per-tenant placeholder examples (draft + approved).
//
// GET  ?token=xxx[&tenant=slug]  → 現在の例示データ（draft + approved）
// POST  { token, action: "approve" }  → ドラフトを承認
// POST  { token, action: "save_draft", draft: [...] }  → ドラフトを手動保存
// POST  { token, action: "save_approved", approved: [...] }  → 承認済みを直接保存（編集後）
// POST  { token, action: "clear" }  → テナントのカスタム例示を削除（ハードコードにフォールバック）

import { NextRequest, NextResponse } from "next/server";
import {
  getManagerByTokenFromSupabase as getManagerByToken,
  getAllTenants,
  DEFAULT_TENANT_ID,
} from "@/lib/supabase";
import { resolveAdminTenantContext } from "@/lib/tenant-context";
import {
  getPlaceholderStoreData,
  savePlaceholderStoreData,
  approveDrafts,
  saveDraftExamples,
  type PlaceholderStoreData,
  type StoredExampleSet,
} from "@/lib/placeholder-store";
import { getDefaultExamples } from "@/lib/placeholder-examples";

export const dynamic = "force-dynamic";

// ---------- GET ----------
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const manager = await getManagerByToken(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Resolve tenant — for this per-tenant feature, fall back to manager's own
    // tenant when no ?tenant= slug is provided (全テナント mode is not useful here).
    const ctx = await resolveAdminTenantContext(request, manager);
    const tenantId = ctx.tenantId ?? manager.tenantId ?? DEFAULT_TENANT_ID;

    const store = await getPlaceholderStoreData(tenantId);

    // Build tenant metadata for UI (tenant switcher)
    const allTenants = manager.isAdmin ? await getAllTenants() : [];
    const currentTenant = allTenants.find((t) => t.id === tenantId);

    return NextResponse.json({
      success: true,
      data: store ?? { approved: [], draft: [], updatedAt: null },
      defaults: getDefaultExamples(),
      tenantId,
      tenantSlug: currentTenant?.slug ?? null,
      tenantName: currentTenant?.name ?? null,
      isSuperAdmin: !!manager.isAdmin,
      allTenants: allTenants.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        companyName: t.companyName,
      })),
    });
  } catch (err) {
    console.error("GET /api/admin/placeholder-examples error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------- POST ----------
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, action } = body;

    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }
    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    const manager = await getManagerByToken(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const ctx = await resolveAdminTenantContext(request, manager);
    const tenantId = ctx.tenantId ?? manager.tenantId ?? DEFAULT_TENANT_ID;

    switch (action) {
      case "approve": {
        const ok = await approveDrafts(tenantId);
        if (!ok) {
          return NextResponse.json(
            { error: "No drafts to approve or save failed" },
            { status: 400 }
          );
        }
        return NextResponse.json({ success: true });
      }

      case "save_draft": {
        const drafts = body.draft as StoredExampleSet[] | undefined;
        if (!drafts || !Array.isArray(drafts)) {
          return NextResponse.json(
            { error: "draft must be an array of example sets" },
            { status: 400 }
          );
        }
        const ok = await saveDraftExamples(tenantId, drafts, body.generationContext);
        return ok
          ? NextResponse.json({ success: true })
          : NextResponse.json({ error: "Save failed" }, { status: 500 });
      }

      case "save_approved": {
        const approved = body.approved as StoredExampleSet[] | undefined;
        if (!approved || !Array.isArray(approved)) {
          return NextResponse.json(
            { error: "approved must be an array of example sets" },
            { status: 400 }
          );
        }
        const existing = await getPlaceholderStoreData(tenantId);
        const store: PlaceholderStoreData = {
          approved,
          draft: existing?.draft ?? [],
          updatedAt: new Date().toISOString(),
          generationContext: existing?.generationContext,
        };
        const ok = await savePlaceholderStoreData(tenantId, store);
        return ok
          ? NextResponse.json({ success: true })
          : NextResponse.json({ error: "Save failed" }, { status: 500 });
      }

      case "clear": {
        const store: PlaceholderStoreData = {
          approved: [],
          draft: [],
          updatedAt: new Date().toISOString(),
        };
        const ok = await savePlaceholderStoreData(tenantId, store);
        return ok
          ? NextResponse.json({ success: true })
          : NextResponse.json({ error: "Clear failed" }, { status: 500 });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("POST /api/admin/placeholder-examples error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
