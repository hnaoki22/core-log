// GET /api/admin/ai-settings?token=xxx - Get AI system prompt
// PUT /api/admin/ai-settings - Update AI system prompt

import { NextRequest, NextResponse } from "next/server";
import { getManagerByToken } from "@/lib/participant-db";
import { getAiSystemPrompt as getAiSystemPromptFromSupabase, updateAiSystemPrompt as updateAiSystemPromptFromSupabase, getTenantBySlug } from "@/lib/supabase";
import { resolveManagerTenantStrict } from "@/lib/tenant-context";

// Resolve target tenant for per-tenant admin settings.
// 1. Admin with ?tenant=slug → that specific tenant
// 2. Otherwise → strict resolver (admin's home tenant or 403)
// Super-admin without tenantId still resolves to DEFAULT via strict resolver.
type SettingsTenantResult =
  | { ok: true; tenantId: string }
  | { ok: false; status: number; errorBody: { error: string; detail?: string } };

async function resolveSettingsTenantId(
  request: NextRequest,
  manager: { tenantId?: string | null; isAdmin?: boolean }
): Promise<SettingsTenantResult> {
  const slug = request.nextUrl.searchParams.get("tenant");
  if (manager.isAdmin && slug) {
    const t = await getTenantBySlug(slug);
    if (t) return { ok: true, tenantId: t.id };
  }
  const strict = resolveManagerTenantStrict(manager);
  if (!strict.ok) {
    return { ok: false, status: strict.status, errorBody: strict.errorBody };
  }
  return { ok: true, tenantId: strict.tenantId };
}

const DEFAULT_SYSTEM_PROMPT = `あなたは「Human Mature」という戦略・組織開発コンサルティング会社のシニアコンサルタントです。
クライアント企業の参加者に対して、週次のフィードバック（CORE Logフィードバック）を作成します。

# フィードバックの基本方針
- 参加者の成長を促進するコーチングの視点で書く
- 具体的な行動や記述を引用し、「見ている」ことが伝わるように
- 一方的な評価ではなく、問いかけや示唆を含める
- 参加者のエネルギー状態の変化パターンにも注目する
- 「できたこと」を承認しつつ、「次の一歩」への気づきを促す
- 温かみがありつつもプロフェッショナルなトーンで
- 300〜500文字程度で簡潔にまとめる
- 「〜さん」で呼びかけて始める
- 末尾は来週に向けた前向きな一言で締める`;

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const manager = await getManagerByToken(token);
  if (!manager || !manager.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const tenantResult = await resolveSettingsTenantId(request, manager);
  if (!tenantResult.ok) {
    return NextResponse.json(tenantResult.errorBody, { status: tenantResult.status });
  }

  try {
    const prompt = await getAiSystemPromptFromSupabase(tenantResult.tenantId);
    return NextResponse.json({
      systemPrompt: prompt || DEFAULT_SYSTEM_PROMPT,
      isDefault: !prompt,
    });
  } catch {
    return NextResponse.json({
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      isDefault: true,
    });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, systemPrompt } = body as { token: string; systemPrompt: string };

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const manager = await getManagerByToken(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!systemPrompt || !systemPrompt.trim()) {
      return NextResponse.json({ error: "プロンプトが空です" }, { status: 400 });
    }

    const tenantResult = await resolveSettingsTenantId(request, manager);
    if (!tenantResult.ok) {
      return NextResponse.json(tenantResult.errorBody, { status: tenantResult.status });
    }
    const success = await updateAiSystemPromptFromSupabase(tenantResult.tenantId, systemPrompt.trim());
    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: "AI設定の更新に失敗しました" }, { status: 500 });
    }
  } catch (error) {
    console.error("Error updating AI settings:", error);
    return NextResponse.json({ error: "設定の更新に失敗しました" }, { status: 500 });
  }
}
