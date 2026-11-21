// POST /api/feedback/draft
// AI-generated feedback draft using Claude API
// Analyzes participant's recent logs and generates personalized feedback

import { NextRequest, NextResponse } from "next/server";
import { getManagerByToken } from "@/lib/participant-db";
import { getAiSystemPrompt as getAiSystemPromptFromSupabase, getTenantBySlug } from "@/lib/supabase";
import { resolveManagerTenantStrict } from "@/lib/tenant-context";
import { standaloneGuard } from "@/lib/standalone";
import { logger } from "@/lib/logger";
import {
  buildFeedbackDraftRequestBody,
  interpretFeedbackDraftResponse,
  isFeedbackEffortMisconfigured,
  readUsage,
} from "@/lib/feedback-draft";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

// Current models think before answering, so a draft can take longer than the
// default function timeout. Same ceiling as the other LLM / Whisper routes.
export const maxDuration = 60;

// Abort the upstream call a little before the platform stops the function, so
// the admin sees a clear message instead of a generic gateway timeout.
const UPSTREAM_TIMEOUT_MS = 55_000;

type LogEntry = {
  date: string;
  dayOfWeek: string;
  morningIntent: string;
  eveningInsight: string | null;
  energy: string | null;
  managerComment: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, participantName, logs, dojoPhase, fbPolicy } = body as {
      token: string;
      participantName: string;
      logs: LogEntry[];
      dojoPhase?: string;
      fbPolicy?: string;
    };

    // Auth check — also determines backend for AI settings
    const manager = await getManagerByToken(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // standalone §7-1/§7-3: FB下書き生成はログ本文をLLMへ渡す経路。機能ごと無効。
    const blocked = await standaloneGuard(manager.tenantId, "feedback-draft");
    if (blocked) return blocked;

    // 対象テナントの解決（core-log-review Trap 3）。
    // 管理画面は閲覧中のテナントを ?tenant=<slug> で渡す（指示文の保存先である
    // /api/admin/ai-settings と同じ規約）。従来は管理者の home テナントの
    // system_prompt しか読まず、閲覧中のテナントに保存した指示文が下書きに
    // 反映されなかった。slug 未指定（全テナント表示）のときは従来どおり home。
    const homeTenant = resolveManagerTenantStrict(manager);
    if (!homeTenant.ok) {
      return NextResponse.json(homeTenant.errorBody, { status: homeTenant.status });
    }
    let targetTenantId = homeTenant.tenantId;
    const tenantSlug = request.nextUrl.searchParams.get("tenant");
    if (tenantSlug) {
      const targetTenant = await getTenantBySlug(tenantSlug);
      if (!targetTenant) {
        // 不明な slug を home に読み替えると、別テナントの指示文で下書きを作ってしまう。
        return NextResponse.json({ error: "指定されたテナントが見つかりません" }, { status: 404 });
      }
      targetTenantId = targetTenant.id;
      if (targetTenantId !== manager.tenantId) {
        // 対象が standalone テナントなら、home が通常テナントでも遮断する。
        const targetBlocked = await standaloneGuard(targetTenantId, "feedback-draft");
        if (targetBlocked) return targetBlocked;
      }
    }

    if (!participantName || !logs || logs.length === 0) {
      return NextResponse.json({ error: "参加者名とログデータが必要です" }, { status: 400 });
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY が設定されていません" }, { status: 500 });
    }

    // Build log summary for the prompt
    const logSummary = logs.map((log) => {
      const energyMap: Record<string, string> = {
        excellent: "絶好調🔥",
        good: "良い😊",
        okay: "まあまあ😐",
        low: "低調😞",
      };
      const energyStr = log.energy ? energyMap[log.energy] || log.energy : "未記入";
      let entry = `【${log.date} (${log.dayOfWeek})】エネルギー: ${energyStr}`;
      entry += `\n  朝の意図: ${log.morningIntent || "未記入"}`;
      if (log.eveningInsight) {
        entry += `\n  本日の振り返り: ${log.eveningInsight}`;
      }
      if (log.managerComment) {
        entry += `\n  上司コメント: ${log.managerComment}`;
      }
      return entry;
    }).join("\n\n");

    // Get system prompt from Supabase (target tenant resolved above)
    let systemPrompt = await getAiSystemPromptFromSupabase(targetTenantId);
    if (!systemPrompt) {
      systemPrompt = `あなたは「Human Mature」という戦略・組織開発コンサルティング会社のシニアコンサルタントです。
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
    }

    // Build user prompt with customization
    let userPrompt = `以下は ${participantName} さんの直近1週間のCORE Logです。\n\n`;

    if (dojoPhase) {
      userPrompt += `現在の道場フェーズ: ${dojoPhase}\n`;
    }

    if (fbPolicy) {
      userPrompt += `\n【この参加者へのフィードバック方針】\n${fbPolicy}\n`;
    }

    userPrompt += `\n--- ログデータ ---\n${logSummary}\n\n---\n\n上記のログを分析し、今週のフィードバック文面を作成してください。`;

    // Call Claude API
    // モデルの選択・出力の上限・応答の読み取りは src/lib/feedback-draft.ts に
    // 集約している（テスト付き）。モデルは ANTHROPIC_MODEL_FEEDBACK で切り替える。
    if (isFeedbackEffortMisconfigured()) {
      logger.warn("ANTHROPIC_FEEDBACK_EFFORT has an unknown value and is ignored", {
        value: process.env.ANTHROPIC_FEEDBACK_EFFORT,
      });
    }
    const requestBody = buildFeedbackDraftRequestBody({ systemPrompt, userPrompt });

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch (fetchError) {
      const timedOut =
        fetchError instanceof Error &&
        (fetchError.name === "TimeoutError" || fetchError.name === "AbortError");
      logger.error("AI draft request did not complete", {
        participantName,
        model: requestBody.model,
        timedOut,
        error: String(fetchError),
      });
      return NextResponse.json(
        {
          error: timedOut
            ? "AIの応答に時間がかかり、中断しました。もう一度お試しください"
            : "AI生成に失敗しました（接続エラー）",
        },
        { status: timedOut ? 504 : 502 }
      );
    }

    if (!response.ok) {
      const errText = await response.text();
      logger.error("AI draft generation failed", {
        participantName,
        model: requestBody.model,
        statusCode: response.status,
        error: errText,
      });
      return NextResponse.json(
        { error: `AI生成に失敗しました（APIエラー ${response.status}）` },
        { status: 500 }
      );
    }

    const result: unknown = await response.json();
    const outcome = interpretFeedbackDraftResponse(result);
    const usage = readUsage(result);

    if (!outcome.ok) {
      // 以前は本文なしでも { draft: "" } を 200 で返し、画面上は何も起きなかった。
      logger.error("AI draft returned no text", {
        participantName,
        model: requestBody.model,
        reason: outcome.reason,
        stopReason: outcome.stopReason,
        ...usage,
      });
      const message =
        outcome.reason === "max_tokens"
          ? "AIの出力が上限に達し、本文が生成されませんでした。もう一度お試しください"
          : outcome.reason === "refusal"
            ? "AIが下書きを作成できませんでした"
            : "AIから本文が返りませんでした";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    if (outcome.truncated) {
      logger.warn("AI draft was cut short by max_tokens", {
        participantName,
        model: requestBody.model,
        ...usage,
      });
    }
    logger.info("AI draft generated", {
      participantName,
      logCount: logs.length,
      model: requestBody.model,
      stopReason: outcome.stopReason,
      ...usage,
    });
    return NextResponse.json({ draft: outcome.draft });
  } catch (error) {
    logger.error("Feedback draft API error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
