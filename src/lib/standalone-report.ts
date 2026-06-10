// 21日AIレポート v0（商品版最終型仕様書 v1.0 §8）
//
// 2レンズ構成（相関検証レポート 2026-06-10 の設計指針）:
//   - 相関レンズ: 気分（朝夕）×意図達成の勾配、ローソク足のトレンド、体調記述の引用。
//     気分に変動がある人向け。
//   - テーマ反復レンズ: 意図テキストから支配的テーマと反復・習熟を抽出。
//     気分が動かない人（毛利型）はこちらが主役。
//   片方しか出ない人がいる前提で、両レンズ必須。
//
// スキップの扱い: 沈黙も情報として、咎めずに返す（§8）。
// トーン: 正典 v1.1 準拠 — 診断しない・断定しない・仮説として返す・本人の言葉を引用。
// 用語規律: 「育てる/育成/育む/整える」不使用（「調える」「育つ」は可）。
//
// LLM 呼び出しは llm.ts の llmJson / truncateForLLM 経由。
// 出力は standalone_reports に永続化（kan_no_ki_observations は観の期の
// 週次ドメイン専用のため再利用しない＝プリフライト判断）。

import { llmJson, truncateForLLM } from "@/lib/llm";
import { getClient, NotionLogEntry, getSkipReasonsByParticipant } from "@/lib/supabase";
import { isLogSubmitted } from "@/lib/stats";
import { logger } from "@/lib/logger";

export type StandaloneReport = {
  correlationLens: string;
  themeLens: string;
  skipNote: string | null;
  // プロンプト v1（2026-06-10夜 本藤さん承認）で追加。観た事から自然に
  // 立ち上がる「次の問い」を1文だけ置く（助言・提案の形にしない）。
  // standalone_reports.report は jsonb のため既存行とは後方互換。
  nextQuestion: string;
};

export type StoredStandaloneReport = {
  id: string;
  report: StandaloneReport;
  periodStart: string;
  periodEnd: string;
  entryDays: number;
  createdAt: string;
};

const MOOD_LABEL: Record<string, string> = {
  excellent: "絶好調",
  good: "良い",
  okay: "まあまあ",
  low: "低調",
};

function moodLabel(v: string | null | undefined): string {
  return v ? MOOD_LABEL[v] ?? v : "未記入";
}

/**
 * 直近の生成済みレポートを取得（24時間以内のものをキャッシュとして扱う）。
 */
export async function getLatestStandaloneReport(
  participantId: string,
  tenantId: string,
  maxAgeHours = 24
): Promise<StoredStandaloneReport | null> {
  const since = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await getClient()
    .from("standalone_reports")
    .select("id, report, period_start, period_end, entry_days, created_at")
    .eq("participant_id", participantId)
    .eq("tenant_id", tenantId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.error("getLatestStandaloneReport failed", { error: error.message, participantId });
    return null;
  }
  if (!data) return null;
  return {
    id: data.id,
    report: data.report as StandaloneReport,
    periodStart: data.period_start,
    periodEnd: data.period_end,
    entryDays: data.entry_days,
    createdAt: data.created_at,
  };
}

/**
 * 21日レポートを生成して standalone_reports に永続化する。
 * logs は本人の全ログ（includeKanNoKi: true で取得したもの）を渡す。
 */
export async function generateStandaloneReport(
  participant: { id: string; name: string },
  tenantId: string,
  logs: NotionLogEntry[],
  todayJST: string
): Promise<StoredStandaloneReport | null> {
  const submitted = logs
    .filter(isLogSubmitted)
    .filter((l) => !!l.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (submitted.length === 0) return null;

  const periodStart = submitted[0].date;
  const periodEnd = submitted[submitted.length - 1].date;
  const entryDays = new Set(submitted.map((l) => l.date)).size;

  // 日次データの整形（フィールドごとに切り詰めて総量を抑える）
  const dailyLines = submitted.map((l) => {
    const parts = [
      `${l.date}: 朝の気分=${moodLabel(l.energy)} / 夕の気分=${moodLabel(l.eveningEnergy)}`,
    ];
    if (l.morningCondition) parts.push(`  朝の体調「${truncateForLLM(l.morningCondition, 80)}」`);
    if (l.eveningCondition) parts.push(`  夕の体調「${truncateForLLM(l.eveningCondition, 80)}」`);
    if (l.morningIntent) parts.push(`  朝の意図「${truncateForLLM(l.morningIntent, 160)}」`);
    if (l.eveningInsight) parts.push(`  夕の振り返り「${truncateForLLM(l.eveningInsight, 160)}」`);
    return parts.join("\n");
  });

  // スキップ記録（沈黙も情報として・咎めない素材に）
  const skips = await getSkipReasonsByParticipant(participant.id, tenantId);
  const skipLines = skips.map((s) => {
    const r = s.reason ? `本人の言葉「${truncateForLLM(s.reason, 120)}」` : "（理由は無回答）";
    return `${s.gapStart}〜${s.gapEnd}（平日${s.gapWeekdays}日） ${r}`;
  });

  // プロンプト v1（2026-06-10夜 本藤さん承認済みの確定版。本藤さん実ログでの
  // サンプル生成を承認済み。雰囲気=「静かな観察＋原文引用＋最後に問いがひとつ」）
  const systemPrompt = `あなたはCORE Logの「装置」です。参加者の約3週間分のログを観て、観た事を本人にだけ映し返します。

絶対の規律:
- 診断しない。断定しない。観た事はすべて仮説として「〜かもしれません」「〜ように見えます」の形で返す
- 本人の言葉を必ず「」で原文のまま引用する（各レンズに最低1つ）
- 助言・処方箋・改善指示・評価を出さない
- 書かなかった日を咎めない。沈黙も大切な情報として静かに扱う
- 「育てる」「育成」「育む」「整える」という語は使わない（「調える」「育つ」は使ってよい）
- 文体は丁寧で静か。煽らない。

2つのレンズで観ます（両方必須。素材が薄いレンズは薄いなりに正直に書く）:
1. 相関レンズ: 朝の気分と夕の気分の動き（朝より上がった日・下がった日のパターン）。気分の高い日と低めの日とで、朝の意図のテーマがどう変わるか、そして意図がどこまで果たされたか（達成の勾配）。体調の記述と気分の関係。
2. テーマ反復レンズ: 朝の意図に繰り返し現れるテーマや言葉。期間の最初と最近とで、同じテーマの言葉の使い方・扱いがどう変わったか（反復と習熟の輪郭）。気分があまり動かない人ではこちらを主役に。

最後に「次の問い」をひとつだけ置きます。観た事から自然に立ち上がる問いを1文で。助言や提案の形にしない。可能なら本人の言葉をひとつ含める。

JSON形式のみで返答:
{
  "correlationLens": "相関レンズで観た事（300〜450字。本人の言葉の引用を含める）",
  "themeLens": "テーマ反復レンズで観た事（300〜450字。本人の言葉の引用を含める）",
  "skipNote": "書かなかった日があれば、その前後で観えた事を咎めずに1〜2文。なければ null",
  "nextQuestion": "次の問い（1文。助言にしない）"
}`;

  const userContent = `## 参加者: ${participant.name}
## 期間: ${periodStart} 〜 ${periodEnd}（本日: ${todayJST} / 記入${entryDays}日）

### 日次ログ
${dailyLines.join("\n")}
${skipLines.length > 0 ? `\n### 書かなかった期間（本人の任意回答つき）\n${skipLines.join("\n")}` : ""}`;

  const fallback: StandaloneReport = {
    correlationLens: "（レポートの生成に失敗しました。少し時間をおいてから、もう一度お試しください。）",
    themeLens: "",
    skipNote: null,
    nextQuestion: "",
  };

  const report = await llmJson<StandaloneReport>(systemPrompt, userContent, fallback, {
    maxTokens: 2000,
    cacheSystem: true,
  });

  // 生成失敗（フォールバック）の場合は永続化しない
  if (report.correlationLens === fallback.correlationLens && report.themeLens === "") {
    return null;
  }

  const { data, error } = await getClient()
    .from("standalone_reports")
    .insert({
      tenant_id: tenantId,
      participant_id: participant.id,
      period_start: periodStart,
      period_end: periodEnd,
      entry_days: entryDays,
      report,
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    })
    .select("id, created_at")
    .single();
  if (error || !data) {
    logger.error("standalone report insert failed", { error: error?.message, participantId: participant.id });
    // 永続化に失敗しても生成結果は返す（本人体験を優先）
    return {
      id: "",
      report,
      periodStart,
      periodEnd,
      entryDays,
      createdAt: new Date().toISOString(),
    };
  }

  return {
    id: data.id,
    report,
    periodStart,
    periodEnd,
    entryDays,
    createdAt: data.created_at,
  };
}
