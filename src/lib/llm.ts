/**
 * LLM Utility for CORE Log feature analysis.
 * Uses OpenAI GPT-4o-mini for cost-efficient analysis tasks.
 * All prompts are in Japanese to match the application context.
 */

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

const MODEL = "gpt-4o-mini";

// ---------------------------------------------------------------------------
// Generic helper
// ---------------------------------------------------------------------------
export async function llmAnalyze(
  systemPrompt: string,
  userContent: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY not set – returning fallback");
    return "（AI分析は現在利用できません。OPENAI_API_KEYを設定してください。）";
  }
  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });
    return res.choices[0]?.message?.content?.trim() || "";
  } catch (err) {
    console.error("LLM analysis error:", err);
    return "（AI分析でエラーが発生しました。）";
  }
}

export async function llmJson<T>(
  systemPrompt: string,
  userContent: string,
  fallback: T
): Promise<T> {
  const raw = await llmAnalyze(
    systemPrompt + "\n\n必ずJSON形式のみで回答してください。マークダウンのコードブロックは使わないでください。",
    userContent,
    { temperature: 0.3 }
  );
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    console.error("LLM JSON parse error. Raw:", raw);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Rumination Detection (Tier S)
// ---------------------------------------------------------------------------
export type RuminationResult = {
  score: number;          // 0-10 (0=none, 10=severe)
  isRuminating: boolean;  // score >= 6
  pattern: string;        // detected pattern type
  reframe: string;        // constructive reframing suggestion
  summary: string;        // brief analysis summary
};

export async function analyzeRumination(
  eveningText: string,
  recentLogs?: string[]
): Promise<RuminationResult> {
  const context = recentLogs?.length
    ? `\n\n過去のログ（直近${recentLogs.length}日分）:\n${recentLogs.map((l, i) => `Day-${i + 1}: ${l}`).join("\n")}`
    : "";

  return llmJson<RuminationResult>(
    `あなたは組織心理学の専門家です。ユーザーの夕方の振り返りログを分析し、ネガティブな反芻（rumination）パターンを検出してください。

反芻の兆候：
- 同じ失敗や不安を繰り返し言及
- 自責的な表現（「自分がダメだから」「いつもこうなる」）
- 解決策なく問題を堂々巡り
- 過去の出来事への固執
- カタストロフィー思考（最悪の結末を想像）

JSON形式で回答：
{
  "score": 0-10の数値,
  "isRuminating": true/false,
  "pattern": "パターン名（自責反芻/問題固執/カタストロフィー/なし）",
  "reframe": "建設的なリフレーミングの提案（1-2文）",
  "summary": "分析の要約（1文）"
}`,
    `今日の振り返り:\n${eveningText}${context}`,
    { score: 0, isRuminating: false, pattern: "なし", reframe: "", summary: "分析できませんでした" }
  );
}

// ---------------------------------------------------------------------------
// Weekly Conceptualization / Thesis Generation (Tier S)
// ---------------------------------------------------------------------------
export type ConceptResult = {
  theses: { title: string; description: string; confidence: number }[];
  weekSummary: string;
};

export async function generateWeeklyConcepts(
  weekLogs: { date: string; morning: string; evening: string }[]
): Promise<ConceptResult> {
  const logsText = weekLogs
    .map((l) => `[${l.date}]\n朝: ${l.morning}\n夕: ${l.evening}`)
    .join("\n\n");

  return llmJson<ConceptResult>(
    `あなたは経験学習理論の専門家です。1週間のリフレクションログを分析し、本人の「持論（マイセオリー）」の候補を3つ提案してください。

持論とは：経験から抽出された、本人独自の行動原則や仕事哲学のこと。
例：「朝一番の報告が信頼を生む」「反対意見こそ丁寧に聞くと突破口が見える」

JSON形式で回答：
{
  "theses": [
    { "title": "持論タイトル", "description": "説明（2-3文）", "confidence": 0.0-1.0 }
  ],
  "weekSummary": "週全体の要約（2-3文）"
}`,
    `今週のログ:\n${logsText}`,
    { theses: [], weekSummary: "ログが不足しています" }
  );
}

// ---------------------------------------------------------------------------
// 1on1 Briefing Generation (Tier A)
// ---------------------------------------------------------------------------
export type BriefingResult = {
  summary: string;
  energyTrend: string;
  ruminationRisk: string;
  suggestedQuestions: string[];
  keyThemes: string[];
};

export async function generate1on1Briefing(
  participantName: string,
  weekLogs: { date: string; morning: string; evening: string; energy: string | null }[],
  ruminationScores?: number[]
): Promise<BriefingResult> {
  const logsText = weekLogs
    .map((l) => `[${l.date}] エネルギー:${l.energy || "未記録"}\n朝: ${l.morning}\n夕: ${l.evening}`)
    .join("\n\n");

  const ruminationContext = ruminationScores?.length
    ? `\n反芻スコア推移: ${ruminationScores.join(" → ")}`
    : "";

  return llmJson<BriefingResult>(
    `あなたは1on1ミーティングの専門コーチです。マネージャーが部下との1on1前に確認するブリーフィングを作成してください。

JSON形式で回答：
{
  "summary": "1週間の概要（3-4文）",
  "energyTrend": "エネルギーの傾向（1文）",
  "ruminationRisk": "反芻リスク（低/中/高 + 簡単な説明）",
  "suggestedQuestions": ["質問1", "質問2", "質問3"],
  "keyThemes": ["テーマ1", "テーマ2"]
}`,
    `${participantName}さんの今週のログ:\n${logsText}${ruminationContext}`,
    {
      summary: "データ不足のため生成できませんでした",
      energyTrend: "不明",
      ruminationRisk: "不明",
      suggestedQuestions: [],
      keyThemes: [],
    }
  );
}

// ---------------------------------------------------------------------------
// Psychological Safety Analysis (Tier A)
// ---------------------------------------------------------------------------
export type PsychSafetyResult = {
  score: number;        // 0-10 (10 = very safe)
  signals: string[];    // detected negative signals
  positives: string[];  // detected positive signals
  summary: string;
};

export async function analyzePsychSafety(
  feedbackTexts: { author: string; content: string; date: string }[]
): Promise<PsychSafetyResult> {
  const texts = feedbackTexts
    .map((f) => `[${f.date}] ${f.author}: ${f.content}`)
    .join("\n");

  return llmJson<PsychSafetyResult>(
    `あなたは組織心理学の専門家です。マネージャーのフィードバック文面を分析し、心理的安全性のシグナルを検出してください。

ネガティブシグナル：犯人探し、非難、脅迫、マイクロマネジメント、感情的攻撃
ポジティブシグナル：承認、好奇心、成長支援、失敗の学習化、共感

JSON形式で回答：
{
  "score": 0-10,
  "signals": ["ネガティブシグナルの具体例"],
  "positives": ["ポジティブシグナルの具体例"],
  "summary": "総合評価（1-2文）"
}`,
    `フィードバック一覧:\n${texts}`,
    { score: 5, signals: [], positives: [], summary: "分析できませんでした" }
  );
}

// ---------------------------------------------------------------------------
// Efficacy Booster — Find past "overcome" moments (Tier D)
// ---------------------------------------------------------------------------
export type EfficacyMoment = {
  date: string;
  excerpt: string;
  lesson: string;
};

export async function findEfficacyMoments(
  logs: { date: string; morning: string; evening: string }[]
): Promise<EfficacyMoment[]> {
  const logsText = logs
    .map((l) => `[${l.date}]\n朝: ${l.morning}\n夕: ${l.evening}`)
    .join("\n\n");

  return llmJson<EfficacyMoment[]>(
    `あなたは心理的資本(PsyCap)の専門家です。ユーザーのログから「困難を乗り越えた瞬間」「小さな成功体験」を最大3つ見つけてください。自己効力感(Self-Efficacy)を高めるリマインドに使います。

JSON配列で回答：
[
  { "date": "YYYY-MM-DD", "excerpt": "該当するログの要約", "lesson": "ここから得られた教訓（1文）" }
]`,
    `過去のログ:\n${logsText}`,
    []
  );
}

// ---------------------------------------------------------------------------
// Client Report Summary (Tier F)
// ---------------------------------------------------------------------------
export type ReportSummary = {
  executiveSummary: string;
  keyFindings: string[];
  recommendations: string[];
  riskAreas: string[];
};

export async function generateReportSummary(
  orgStats: {
    totalParticipants: number;
    avgEntryRate: number;
    avgEnergyScore: number;
    streakAvg: number;
    ruminationAvgScore: number;
  }
): Promise<ReportSummary> {
  return llmJson<ReportSummary>(
    `あなたは組織開発コンサルタントです。CORE Logの組織全体の統計データから、経営層向けの月次サマリーを作成してください。

JSON形式で回答：
{
  "executiveSummary": "エグゼクティブサマリー（3-4文）",
  "keyFindings": ["発見1", "発見2", "発見3"],
  "recommendations": ["推奨アクション1", "推奨アクション2"],
  "riskAreas": ["リスク領域1"]
}`,
    `組織統計:\n参加者数: ${orgStats.totalParticipants}\n平均記入率: ${orgStats.avgEntryRate}%\n平均エネルギースコア: ${orgStats.avgEnergyScore}/4\n平均連続記入: ${orgStats.streakAvg}日\n平均反芻スコア: ${orgStats.ruminationAvgScore}/10`,
    {
      executiveSummary: "データ不足のためレポートを生成できませんでした。",
      keyFindings: [],
      recommendations: [],
      riskAreas: [],
    }
  );
}

// ---------------------------------------------------------------------------
// Pitch Generator (Tier G)
// ---------------------------------------------------------------------------
export async function generatePitchContent(
  companyName: string,
  industry: string,
  challenges: string
): Promise<string> {
  return llmAnalyze(
    `あなたは組織開発コンサルティング会社「Human Mature」のコンサルタントです。
クライアント企業に対するCORE Log導入提案の要点を作成してください。
理論的背景（経験学習、ダブルループ学習、心理的資本）と実装機能の対応を含めてください。`,
    `企業名: ${companyName}\n業種: ${industry}\n課題: ${challenges}`,
    { temperature: 0.5, maxTokens: 2048 }
  );
}
