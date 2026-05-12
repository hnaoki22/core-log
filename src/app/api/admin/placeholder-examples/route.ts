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

    const ctx = await resolveAdminTenantContext(request, manager);
    if (!ctx.tenantId) {
      return NextResponse.json(
        { error: "テナントを指定してください" },
        { status: 400 }
      );
    }
    const store = await getPlaceholderStoreData(ctx.tenantId);

    return NextResponse.json({
      success: true,
      data: store ?? { approved: [], draft: [], updatedAt: null },
      tenantId: ctx.tenantId,
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
    if (!ctx.tenantId) {
      return NextResponse.json(
        { error: "テナントを指定してください" },
        { status: 400 }
      );
    }
    const tenantId = ctx.tenantId;

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
