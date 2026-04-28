/**
 * LLM Utility for CORE Log feature analysis.
 * Uses Anthropic Claude Sonnet for high-quality Japanese text analysis.
 * All prompts are in Japanese to match the application context.
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

const MODEL = "claude-sonnet-4-20250514";

// ---------------------------------------------------------------------------
// Generic helper
// ---------------------------------------------------------------------------
export async function llmAnalyze(
  systemPrompt: string,
  userContent: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("ANTHROPIC_API_KEY not set â returning fallback");
    return "ï¼AIåæã¯ç¾å¨å©ç¨ã§ãã¾ãããANTHROPIC_API_KEYãè¨­å®ãã¦ãã ãããï¼";
  }
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0.7,
      system: systemPrompt,
      messages: [
        { role: "user", content: userContent },
      ],
    });
    const block = res.content[0];
    return block.type === "text" ? block.text.trim() : "";
  } catch (err) {
    console.error("LLM analysis error:", err);
    return "ï¼AIåæã§ã¨ã©ã¼ãçºçãã¾ãããï¼";
  }
}

export async function llmJson<T>(
  systemPrompt: string,
  userContent: string,
  fallback: T
): Promise<T> {
  const raw = await llmAnalyze(
    systemPrompt + "\n\nå¿ãJSONå½¢å¼ã®ã¿ã§åç­ãã¦ãã ããããã¼ã¯ãã¦ã³ã®ã³ã¼ããã­ãã¯ã¯ä½¿ããªãã§ãã ããã",
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
    ? `\n\néå»ã®ã­ã°ï¼ç´è¿${recentLogs.length}æ¥åï¼:\n${recentLogs.map((l, i) => `Day-${i + 1}: ${l}`).join("\n")}`
    : "";

  return llmJson<RuminationResult>(
    `ããªãã¯çµç¹å¿çå­¦ã®å°éå®¶ã§ããã¦ã¼ã¶ã¼ã®å¤æ¹ã®æ¯ãè¿ãã­ã°ãåæãããã¬ãã£ããªåè»ï¼ruminationï¼ãã¿ã¼ã³ãæ¤åºãã¦ãã ããã

åè»ã®ååï¼
- åãå¤±æãä¸å®ãç¹°ãè¿ãè¨å
- èªè²¬çãªè¡¨ç¾ï¼ãèªåããã¡ã ãããããã¤ããããªããï¼
- è§£æ±ºç­ãªãåé¡ãå ãå·¡ã
- éå»ã®åºæ¥äºã¸ã®åºå·
- ã«ã¿ã¹ãã­ãã£ã¼æèï¼ææªã®çµæ«ãæ³åï¼

JSONå½¢å¼ã§åç­ï¼
{
  "score": 0-10ã®æ°å¤,
  "isRuminating": true/false,
  "pattern": "ãã¿ã¼ã³åï¼èªè²¬åè»/åé¡åºå·/ã«ã¿ã¹ãã­ãã£ã¼/ãªãï¼",
  "reframe": "å»ºè¨­çãªãªãã¬ã¼ãã³ã°ã®ææ¡ï¼1-2æï¼",
  "summary": "åæã®è¦ç´ï¼1æï¼"
}`,
    `ä»æ¥ã®æ¯ãè¿ã:\n${eveningText}${context}`,
    { score: 0, isRuminating: false, pattern: "ãªã", reframe: "", summary: "åæã§ãã¾ããã§ãã" }
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
    .map((l) => `[${l.date}]\næ: ${l.morning}\nå¤: ${l.evening}`)
    .join("\n\n");

  return llmJson<ConceptResult>(
    `ããªãã¯çµé¨å­¦ç¿çè«ã®å°éå®¶ã§ãã1é±éã®ãªãã¬ã¯ã·ã§ã³ã­ã°ãåæããæ¬äººã®ãæè«ï¼ãã¤ã»ãªãªã¼ï¼ãã®åè£ã3ã¤ææ¡ãã¦ãã ããã

æè«ã¨ã¯ï¼çµé¨ããæ½åºããããæ¬äººç¬èªã®è¡åååãä»äºå²å­¦ã®ãã¨ã
ä¾ï¼ãæä¸çªã®å ±åãä¿¡é ¼ãçãããåå¯¾æè¦ããä¸å¯§ã«èãã¨çªç ´å£ãè¦ããã

JSONå½¢å¼ã§åç­ï¼
{
  "theses": [
    { "title": "æè«ã¿ã¤ãã«", "description": "èª¬æï¼2-3æï¼", "confidence": 0.0-1.0 }
  ],
  "weekSummary": "é±å¨ä½ã®è¦ç´ï¼2-3æï¼"
}`,
    `ä»é±ã®ã­ã°:\n${logsText}`,
    { theses: [], weekSummary: "ã­ã°ãä¸è¶³ãã¦ãã¾ã" }
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
    .map((l) => `[${l.date}] ã¨ãã«ã®ã¼:${l.energy || "æªè¨é²"}\næ: ${l.morning}\nå¤: ${l.evening}`)
    .join("\n\n");

  const ruminationContext = ruminationScores?.length
    ? `\nåè»ã¹ã³ã¢æ¨ç§»: ${ruminationScores.join(" â ")}`
    : "";

  return llmJson<BriefingResult>(
    `ããªãã¯1on1ãã¼ãã£ã³ã°ã®å°éã³ã¼ãã§ããããã¼ã¸ã£ã¼ãé¨ä¸ã¨ã®1on1åã«ç¢ºèªããããªã¼ãã£ã³ã°ãä½æãã¦ãã ããã

JSONå½¢å¼ã§åç­ï¼
{
  "summary": "1é±éã®æ¦è¦ï¼3-4æï¼",
  "energyTrend": "ã¨ãã«ã®ã¼ã®å¾åï¼1æï¼",
  "ruminationRisk": "åè»ãªã¹ã¯ï¼ä½/ä¸­/é« + ç°¡åãªèª¬æï¼",
  "suggestedQuestions": ["è³ªå1", "è³ªå2", "è³ªå3"],
  "keyThemes": ["ãã¼ã1", "ãã¼ã2"]
}`,
    `${participantName}ããã®ä»é±ã®ã­ã°:\n${logsText}${ruminationContext}`,
    {
      summary: "ãã¼ã¿ä¸è¶³ã®ããçæã§ãã¾ããã§ãã",
      energyTrend: "ä¸æ",
      ruminationRisk: "ä¸æ",
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
    `ããªãã¯çµç¹å¿çå­¦ã®å°éå®¶ã§ããããã¼ã¸ã£ã¼ã®ãã£ã¼ãããã¯æé¢ãåæããå¿ççå®å¨æ§ã®ã·ã°ãã«ãæ¤åºãã¦ãã ããã

ãã¬ãã£ãã·ã°ãã«ï¼ç¯äººæ¢ããéé£ãèè¿«ããã¤ã¯ã­ããã¸ã¡ã³ããææçæ»æ
ãã¸ãã£ãã·ã°ãã«ï¼æ¿èªãå¥½å¥å¿ãæé·æ¯æ´ãå¤±æã®å­¦ç¿åãå±æ

JSONå½¢å¼ã§åç­ï¼
{
  "score": 0-10,
  "signals": ["ãã¬ãã£ãã·ã°ãã«ã®å·ä½ä¾"],
  "positives": ["ãã¸ãã£ãã·ã°ãã«ã®å·ä½ä¾"],
  "summary": "ç·åè©ä¾¡ï¼1-2æï¼"
}`,
    `ãã£ã¼ãããã¯ä¸è¦§:\n${texts}`,
    { score: 5, signals: [], positives: [], summary: "åæã§ãã¾ããã§ãã" }
  );
}

// ---------------------------------------------------------------------------
// Efficacy Booster â Find past "overcome" moments (Tier D)
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
    .map((l) => `[${l.date}]\næ: ${l.morning}\nå¤: ${l.evening}`)
    .join("\n\n");

  return llmJson<EfficacyMoment[]>(
    `ããªãã¯å¿ççè³æ¬(PsyCap)ã®å°éå®¶ã§ããã¦ã¼ã¶ã¼ã®ã­ã°ãããå°é£ãä¹ãè¶ããç¬éããå°ããªæåä½é¨ããæå¤§3ã¤è¦ã¤ãã¦ãã ãããèªå·±å¹åæ(Self-Efficacy)ãé«ãããªãã¤ã³ãã«ä½¿ãã¾ãã

JSONéåã§åç­ï¼
[
  { "date": "YYYY-MM-DD", "excerpt": "è©²å½ããã­ã°ã®è¦ç´", "lesson": "ããããå¾ãããæè¨ï¼1æï¼" }
]`,
    `éå»ã®ã­ã°:\n${logsText}`,
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
    `ããªãã¯çµç¹éçºã³ã³ãµã«ã¿ã³ãã§ããCORE Logã®çµç¹å¨ä½ã®çµ±è¨ãã¼ã¿ãããçµå¶å±¤åãã®ææ¬¡ãµããªã¼ãä½æãã¦ãã ããã

JSONå½¢å¼ã§åç­ï¼
{
  "executiveSummary": "ã¨ã°ã¼ã¯ãã£ããµããªã¼ï¼3-4æï¼",
  "keyFindings": ["çºè¦1", "çºè¦2", "çºè¦3"],
  "recommendations": ["æ¨å¥¨ã¢ã¯ã·ã§ã³1", "æ¨å¥¨ã¢ã¯ã·ã§ã³2"],
  "riskAreas": ["ãªã¹ã¯é å1"]
}`,
    `çµç¹çµ±è¨:\nåå èæ°: ${orgStats.totalParticipants}\nå¹³åè¨å¥ç: ${orgStats.avgEntryRate}%\nå¹³åã¨ãã«ã®ã¼ã¹ã³ã¢: ${orgStats.avgEnergyScore}/4\nå¹³åé£ç¶è¨å¥: ${orgStats.streakAvg}æ¥\nå¹³ååè»ã¹ã³ã¢: ${orgStats.ruminationAvgScore}/10`,
    {
      executiveSummary: "ãã¼ã¿ä¸è¶³ã®ããã¬ãã¼ããçæã§ãã¾ããã§ããã",
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
    `ããªãã¯çµç¹éçºã³ã³ãµã«ãã£ã³ã°ä¼ç¤¾ãHuman Matureãã®ã³ã³ãµã«ã¿ã³ãã§ãã
ã¯ã©ã¤ã¢ã³ãä¼æ¥­ã«å¯¾ããCORE Logå°å¥ææ¡ã®è¦ç¹ãä½æãã¦ãã ããã
çè«çèæ¯ï¼çµé¨å­¦ç¿ãããã«ã«ã¼ãå­¦ç¿ãå¿ççè³æ¬ï¼ã¨å®è£æ©è½ã®å¯¾å¿ãå«ãã¦ãã ããã`,
    `ä¼æ¥­å: ${companyName}\næ¥­ç¨®: ${industry}\nèª²é¡: ${challenges}`,
    { temperature: 0.5, maxTokens: 2048 }
  );
}

// ---------------------------------------------------------------------------
// Reflection Depth Analysis (Tier A – Consultant Tooling)
// ---------------------------------------------------------------------------
export type ReflectionLevel = "L1" | "L2" | "L3" | "L4";

export type ReflectionDepthResult = {
  currentLevel: ReflectionLevel;
  trajectory: "deepening" | "stable" | "flattening";
  themePersistence: {
    theme: string;
    dayCount: number;
    description: string;
  }[];
  newConcepts: string[];
  notableShift: string | null;
  summary: string;
};

export async function analyzeReflectionDepth(
  participantName: string,
  weekLogs: { date: string; morning: string; evening: string }[]
): Promise<ReflectionDepthResult> {
  const logsText = weekLogs
    .map((l) => `[${l.date}]\n朝: ${l.morning}\n夕: ${l.evening}`)
    .join("\n\n");

  return llmJson<ReflectionDepthResult>(
    `あなたは経験学習理論と省察(リフレクション)の専門家です。参加者のログを分析し、省察の深度とテーマの持続性を評価してください。

## 省察深度レベル（L1〜L4）
- L1（事実報告）: 何が起きたかの記述のみ。「会議に出た」「資料を作った」
- L2（感情・気づき）: 感じたこと、気づいたことの記述。「焦った」「意外だった」
- L3（構造的洞察）: パターンや因果関係の分析。「先回りしない方が部下が動く」「問い方を変えると反応が変わる」
- L4（行動変容・概念化）: 自分の行動原則や持論の生成・検証。概念を自分の言葉で再定義し、実践に適用している

## テーマの持続性
- 同じテーマ（例：「傾聴」「先回りしない」「問いの質」）が複数日にわたって登場しているか
- 持続している場合、そのテーマがどう深化・変容しているか

## 新しい概念の使用
- 外部から得た概念（研修、書籍、フィードバック等）をログ内で使い始めた形跡

JSON形式で回答：
{
  "currentLevel": "L1" | "L2" | "L3" | "L4",
  "trajectory": "deepening" | "stable" | "flattening",
  "themePersistence": [
    { "theme": "テーマ名", "dayCount": 何日持続, "description": "テーマの深化の様子（1文）" }
  ],
  "newConcepts": ["新しく使い始めた概念名"],
  "notableShift": "特筆すべき変化があれば1文で。なければnull",
  "summary": "この参加者の省察状態の総合評価（2-3文）"
}`,
    `${participantName}さんの直近ログ:\n${logsText}`,
    {
      currentLevel: "L1",
      trajectory: "stable",
      themePersistence: [],
      newConcepts: [],
      notableShift: null,
      summary: "ログが不足しています",
    }
  );
}

// ---------------------------------------------------------------------------
// Consultant Spotlight — "今週注目すべき参加者" (Tier A – Consultant Tooling)
// ---------------------------------------------------------------------------
export type SpotlightParticipant = {
  name: string;
  reason: string;
  reflectionLevel: ReflectionLevel;
  trajectory: "deepening" | "stable" | "flattening";
  suggestedIntervention: string;
  priority: "high" | "medium" | "low";
};

export type ConsultantSpotlightResult = {
  spotlight: SpotlightParticipant[];
  orgPulse: string;
  weekSummary: string;
};

export async function generateConsultantSpotlight(
  participantSummaries: {
    name: string;
    department: string;
    logs: { date: string; morning: string; evening: string; energy: string | null }[];
  }[]
): Promise<ConsultantSpotlightResult> {
  const summaryText = participantSummaries
    .map((p) => {
      const logLines = p.logs
        .map((l) => `  [${l.date}] E:${l.energy || "?"} 朝:${l.morning} 夕:${l.evening || "(未記入)"}`)
        .join("\n");
      return `■ ${p.name}（${p.department}）\n${logLines}`;
    })
    .join("\n\n");

  return llmJson<ConsultantSpotlightResult>(
    `あなたは組織開発コンサルタントの「目」として機能するAIです。
全参加者の直近1週間のログを読み、コンサルタントが最優先で注目すべき参加者を最大5名選んでください。

## 選定基準（優先度順）
1. **急成長の兆候**: 省察が急にL1→L3以上に深化、新概念の使用開始、行動変容の記述
2. **停滞・後退の兆候**: 以前より省察が浅くなった、エネルギーが低下傾向、ログが形骸化
3. **テーマの持続性**: 同じ問いを数日間追い続けている（良い兆候 — 強化のチャンス）
4. **介入の好機**: 「もう一押し」で飛躍しそうな参加者、問いを投げると一段深くなりそうな参加者
5. **反芻・自責の兆候**: ネガティブなパターンの繰り返し

## 介入提案の型
- 承認型:「この変化に気づいていることを伝える」
- 問い型:「○○について考えてみてください」
- 資料型:「○○に関する参考資料を共有する」
- 対話型:「次回1on1で○○について話す」
- 見守り型:「今は介入せず、自走を観察する」

JSON形式で回答：
{
  "spotlight": [
    {
      "name": "参加者名",
      "reason": "なぜこの人に注目すべきか（1-2文）",
      "reflectionLevel": "L1" | "L2" | "L3" | "L4",
      "trajectory": "deepening" | "stable" | "flattening",
      "suggestedIntervention": "推奨する介入（型名＋具体的な内容）",
      "priority": "high" | "medium" | "low"
    }
  ],
  "orgPulse": "組織全体の今週の状態（1-2文）",
  "weekSummary": "コンサルへの週次サマリー（3-4文。全体傾向、注目ポイント、推奨アクション）"
}`,
    `全参加者の直近ログ:\n${summaryText}`,
    {
      spotlight: [],
      orgPulse: "データ不足のため組織パルスを評価できません",
      weekSummary: "分析に必要なログが不足しています",
    }
  );
}
