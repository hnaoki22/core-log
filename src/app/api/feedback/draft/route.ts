// POST /api/feedback/draft
// AI-generated feedback draft using Claude API
// Analyzes participant's recent logs and generates personalized feedback

import { NextRequest, NextResponse } from "next/server";
import { isAdminToken } from "@/lib/participant-db";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

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

    // Auth check
    const authorized = await isAdminToken(token);
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
        entry += `\n  夕の気づき: ${log.eveningInsight}`;
      }
      if (log.managerComment) {
        entry += `\n  上司コメント: ${log.managerComment}`;
      }
      return entry;
    }).join("\n\n");

    // Build the system prompt
    const systemPrompt = `あなたは「Human Mature」という戦略・組織開発コンサルティング会社のシニアコンサルタントです。
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
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[AI Draft ERROR]", errText);
      return NextResponse.json({ error: "AI生成に失敗しました" }, { status: 500 });
    }

    const result = await response.json();
    const draft = result.content?.[0]?.text || "";

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("Feedback draft API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
