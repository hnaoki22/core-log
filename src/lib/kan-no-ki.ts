// 観の期(KAN のキー)コア helper
// 仕様書: CORE_Log_観の期_AI_機能仕様書_v0.2.md
// 正典:   CORE_Log_観の期_正典_v1.1.md
// 中心動詞: 観る・観想する・映す・観た事を返す
// 禁止語(用語規律): 育てる / 自己理解 / 分析する / 診断する / リフレクション / 省察(観の期文脈) / フィードバック / コーチング

import { getClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// ===== 型定義 =====

export type KanNoKiStage =
  | "observation"          // Day 0 〜 Week 1: 観の素材を貯める
  | "initial-contour"      // Week 2 終わり: 初期の輪郭が立ち上がる
  | "word-pattern"         // Week 3 終わり: 言葉の癖の観想可能
  | "deeper-observation"   // Week 4 終わり: より深い観想可能
  | "completed";           // 道場1 移行済み

export type KanNoKiPhaseRow = {
  id: string;
  tenant_id: string;
  participant_id: string;
  started_at: string;
  completed_at: string | null;
  current_stage: KanNoKiStage;
  log_count_at_completion: number | null;
};

export type CollectiveScope = "tenant" | "cross-tenant" | "industry" | "global";

export type WeeklyObservationPayload = {
  week_num: number;
  // 記録のリズム
  rhythm: {
    days_logged: number;
    business_days_in_week: number;
    morning_count: number;
    evening_count: number;
    morning_avg_duration_sec: number | null;
    evening_avg_duration_sec: number | null;
    days_silent: string[]; // YYYY-MM-DD の配列
  };
  // 言葉の輪郭
  word_contour: {
    subject_counts: Record<string, number>; // 「私」「自分」「メンバー」等
    modal_should_count: number;             // べき/ねば/すべき
    modal_maybe_count: number;              // と思う/かもしれない/だろう/はず
    causal_count: number;                   // ので/ため/結果
    morning_avg_chars: number | null;
    evening_avg_chars: number | null;
  };
  // 感情の引き金
  emotion_trigger: {
    cognition_count: number;  // ハッ・気づ
    calm_count: number;       // 安心・落ち着
    worry_count: number;      // 不安・心配
    confusion_count: number;  // 迷い・悩・モヤモヤ・違和感
    intense_count: number;    // 焦り・怒り・辛い・苦しい
    joy_count: number;        // 嬉しい・楽しい
  };
  // 静かな抵抗の輪郭
  silence: {
    business_day_log_rate: number | null;  // 0.0〜1.0
    longest_silence_days: number;
    weekday_distribution: Record<string, number>; // 月火水木金土日
  };
  // 集合像との対比
  peer_comparison: {
    scopes: CollectiveScope[];
    by_scope: Record<string, CollectiveStatsSnapshot | null>;
    individual_snapshot: IndividualStatsSnapshot;
  };
  // 段階的シグナル
  stage_signal: {
    current_stage: KanNoKiStage;
    weeks_elapsed: number;
    log_count_in_phase: number;
    next_stage_hint: string | null;
  };
  // 身体への問いかけの記録
  body_summary: {
    prompts_triggered: number;
    responses_given: number;
  };
  // 装置の語り(観た事の文章化、断定しない)
  device_voice: {
    rhythm: string;
    word_contour: string;
    emotion_trigger: string;
    peer_comparison: string;
    silence: string;
    body_summary: string | null;
  };
};

export type CollectiveStatsSnapshot = {
  scope: CollectiveScope;
  participant_count: number;
  log_count: number;
  morning_avg_chars: number | null;
  evening_avg_chars: number | null;
  modal_should_per_log: number;
  modal_maybe_per_log: number;
  worry_per_log: number;
  calm_per_log: number;
  intense_per_log: number;
  cognition_per_log: number;
};

export type IndividualStatsSnapshot = {
  log_count: number;
  morning_avg_chars: number | null;
  evening_avg_chars: number | null;
  modal_should_per_log: number;
  modal_maybe_per_log: number;
  worry_per_log: number;
  calm_per_log: number;
  intense_per_log: number;
  cognition_per_log: number;
};

// ===== 観の期の進行状態 =====

/**
 * 参加者が観の期にあるか確認。あれば phase row を返し、なければ null。
 */
export async function getKanNoKiPhase(
  participantId: string,
  tenantId: string
): Promise<KanNoKiPhaseRow | null> {
  const { data, error } = await getClient()
    .from("kan_no_ki_phases")
    .select("id, tenant_id, participant_id, started_at, completed_at, current_stage, log_count_at_completion")
    .eq("participant_id", participantId)
    .eq("tenant_id", tenantId)
    .limit(1);
  if (error) {
    logger.error("getKanNoKiPhase failed", { error: error.message, participantId, tenantId });
    return null;
  }
  if (!data || data.length === 0) return null;
  const row = data[0] as KanNoKiPhaseRow;
  // 完了済みなら観の期ではない
  if (row.completed_at !== null) return null;
  return row;
}

/**
 * 観の期にあれば 'kan-no-ki'、それ以外は 'dojo-1' を返す。
 */
export async function resolvePhaseMode(
  participantId: string,
  tenantId: string
): Promise<"kan-no-ki" | "dojo-1"> {
  const phase = await getKanNoKiPhase(participantId, tenantId);
  return phase ? "kan-no-ki" : "dojo-1";
}

/**
 * 観の期参加者を新規登録(または既存行を返す)。
 */
export async function upsertKanNoKiPhase(
  participantId: string,
  tenantId: string,
  startedAt?: string
): Promise<KanNoKiPhaseRow | null> {
  const insertData: Record<string, unknown> = {
    participant_id: participantId,
    tenant_id: tenantId,
    current_stage: "observation",
  };
  if (startedAt) {
    insertData.started_at = startedAt;
  }
  const { data, error } = await getClient()
    .from("kan_no_ki_phases")
    .upsert(insertData, { onConflict: "tenant_id,participant_id", ignoreDuplicates: true })
    .select("id, tenant_id, participant_id, started_at, completed_at, current_stage, log_count_at_completion");
  if (error) {
    logger.error("upsertKanNoKiPhase failed", { error: error.message, participantId, tenantId });
    return null;
  }
  // ignoreDuplicates=true の場合、衝突時は0行返るので、別途SELECT
  if (!data || data.length === 0) {
    return await getKanNoKiPhase(participantId, tenantId);
  }
  return data[0] as KanNoKiPhaseRow;
}

/**
 * 観の期 → 道場1 へ移行。current_stage='completed'、completed_at=now、ログ数記録。
 */
export async function completeKanNoKiPhase(
  participantId: string,
  tenantId: string
): Promise<boolean> {
  // 観の期中のログ件数を集計
  const { count, error: countErr } = await getClient()
    .from("logs")
    .select("id", { count: "exact", head: true })
    .eq("participant_id", participantId)
    .eq("tenant_id", tenantId)
    .eq("phase_mode", "kan-no-ki");
  if (countErr) {
    logger.warn("completeKanNoKiPhase: log count failed", { error: countErr.message });
  }
  const { data, error } = await getClient()
    .from("kan_no_ki_phases")
    .update({
      current_stage: "completed",
      completed_at: new Date().toISOString(),
      log_count_at_completion: count ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("participant_id", participantId)
    .eq("tenant_id", tenantId)
    .is("completed_at", null)
    .select("id");
  if (error) {
    logger.error("completeKanNoKiPhase failed", { error: error.message, participantId });
    return false;
  }
  if (!data || data.length === 0) {
    logger.warn("completeKanNoKiPhase matched 0 rows (already completed or phase not found)", { participantId });
    return false;
  }
  return true;
}

// ===== 感情語検出と身体への問いかけ =====

// 正典 v1.1 §3 層2 の感情語辞書(11名分221件の観察ベース)
export const EMOTION_WORDS_INTENSE = [
  "不安", "心配", "焦り", "怒り", "辛い", "苦しい",
  "モヤモヤ", "違和感", "迷い", "悩",
];

export const EMOTION_WORDS_CALM = ["安心", "落ち着"];
export const EMOTION_WORDS_COGNITION = ["ハッ", "気づ"];
export const EMOTION_WORDS_JOY = ["嬉しい", "楽しい"];

/**
 * 強い感情語が含まれるか(身体プロンプト発火条件)。
 * 観察ベース: 「不安・心配」など intense / confusion 系の出現を1回以上で発火。
 */
export function detectStrongEmotion(text: string | null | undefined): boolean {
  if (!text) return false;
  return EMOTION_WORDS_INTENSE.some(w => text.includes(w));
}

/**
 * 身体への問いかけを kan_no_ki_body_prompts に INSERT。
 * 1日に同じ参加者で複数回発火しないようガード(直近24時間内に既存があればスキップ)。
 */
export async function triggerBodyPromptIfNeeded(
  participantId: string,
  tenantId: string,
  text: string,
  logId: string | null
): Promise<boolean> {
  if (!detectStrongEmotion(text)) return false;

  // 24時間ガード
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await getClient()
    .from("kan_no_ki_body_prompts")
    .select("id")
    .eq("participant_id", participantId)
    .eq("tenant_id", tenantId)
    .gte("prompted_at", twentyFourHoursAgo)
    .limit(1);
  if (existing && existing.length > 0) {
    return false;
  }

  const promptText = "その時、身体にはどんな感覚がありましたか。お気づきのものがあれば、書き添えてください。答えないままでも、観の対象の中にあります。";

  const { error } = await getClient()
    .from("kan_no_ki_body_prompts")
    .insert({
      tenant_id: tenantId,
      participant_id: participantId,
      triggered_by_log_id: logId,
      prompt_text: promptText,
    });
  if (error) {
    logger.error("triggerBodyPrompt insert failed", { error: error.message, participantId });
    return false;
  }
  return true;
}

// ===== ファクト抽出(言葉の癖の集計) =====

const SUBJECT_PATTERNS: Record<string, RegExp> = {
  "私": /私/g,
  "自分": /自分/g,
  "メンバー・部下": /メンバー|部下/g,
  "相手・彼": /相手|彼/g,
  "チーム": /チーム/g,
  "上司": /上司/g,
  "お客様": /お客様|顧客/g,
};

const MODAL_SHOULD_PATTERNS = [/べき/g, /ねば/g, /すべて/g];
const MODAL_MAYBE_PATTERNS = [/と思う/g, /かもしれない/g, /だろう/g, /はず/g];
export const CAUSAL_PATTERNS = [/ので/g, /ため/g, /結果/g];

function countMatches(text: string, patterns: RegExp[]): number {
  let total = 0;
  for (const p of patterns) {
    const m = text.match(p);
    if (m) total += m.length;
  }
  return total;
}

function countWord(text: string, word: string): number {
  if (!word) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = text.indexOf(word, idx)) !== -1) {
    count += 1;
    idx += word.length;
  }
  return count;
}

export type RawLogText = {
  date: string;
  morning_intent: string | null;
  evening_insight: string | null;
  morning_duration_sec: number | null;
  evening_duration_sec: number | null;
  day_of_week: string | null;
};

export function aggregateIndividual(logs: RawLogText[]): IndividualStatsSnapshot {
  const combined = logs
    .map(l => `${l.morning_intent ?? ""}\n${l.evening_insight ?? ""}`)
    .join("\n");
  const morningChars = logs
    .filter(l => l.morning_intent && l.morning_intent.length > 0)
    .map(l => l.morning_intent!.length);
  const eveningChars = logs
    .filter(l => l.evening_insight && l.evening_insight.length > 0)
    .map(l => l.evening_insight!.length);
  const logCount = logs.length;
  const safeAvg = (arr: number[]) =>
    arr.length === 0 ? null : Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
  const safePer = (n: number) => (logCount === 0 ? 0 : Math.round((n / logCount) * 100) / 100);
  return {
    log_count: logCount,
    morning_avg_chars: safeAvg(morningChars),
    evening_avg_chars: safeAvg(eveningChars),
    modal_should_per_log: safePer(countMatches(combined, MODAL_SHOULD_PATTERNS)),
    modal_maybe_per_log: safePer(countMatches(combined, MODAL_MAYBE_PATTERNS)),
    worry_per_log: safePer(
      EMOTION_WORDS_INTENSE
        .filter(w => ["不安", "心配"].includes(w))
        .reduce((s, w) => s + countWord(combined, w), 0)
    ),
    calm_per_log: safePer(EMOTION_WORDS_CALM.reduce((s, w) => s + countWord(combined, w), 0)),
    intense_per_log: safePer(
      EMOTION_WORDS_INTENSE
        .filter(w => ["焦り", "怒り", "辛い", "苦しい"].includes(w))
        .reduce((s, w) => s + countWord(combined, w), 0)
    ),
    cognition_per_log: safePer(EMOTION_WORDS_COGNITION.reduce((s, w) => s + countWord(combined, w), 0)),
  };
}

export function countSubjects(logs: RawLogText[]): Record<string, number> {
  const combined = logs
    .map(l => `${l.morning_intent ?? ""}\n${l.evening_insight ?? ""}`)
    .join("\n");
  const result: Record<string, number> = {};
  for (const [name, pattern] of Object.entries(SUBJECT_PATTERNS)) {
    const m = combined.match(pattern);
    result[name] = m ? m.length : 0;
  }
  return result;
}

// ===== 段階的シグナル判定 =====

export function determineCurrentStage(
  weeksElapsed: number,
  logCount: number
): KanNoKiStage {
  // 仕様書 §4.4 シグナル粒度: 3段
  if (weeksElapsed >= 4 && logCount >= 12) return "deeper-observation";
  if (weeksElapsed >= 3 && logCount >= 8) return "word-pattern";
  if (weeksElapsed >= 2 && logCount >= 4) return "initial-contour";
  return "observation";
}

export function stageSignalHint(stage: KanNoKiStage): string | null {
  switch (stage) {
    case "observation":
      return "今は、観の素材を貯める段階です。書き続けてください。";
    case "initial-contour":
      return "初期の輪郭が立ち上がってきました。";
    case "word-pattern":
      return "言葉の癖の観想が可能になりました。";
    case "deeper-observation":
      return "より深い観想が可能になりました。ここで観の期を続けてもよいですし、道場1 に進むこともできます。";
    case "completed":
      return "観の期を終え、道場1 に進みました。観の地形図は背景レイヤーとして更新され続けます。";
  }
}

// 観の期完了の最短期間(本藤さん仕様の暫定値: 21日 = 3週間)
export const KAN_NO_KI_MIN_DAYS = 21;

export function canTransitionToDojo1(
  phase: KanNoKiPhaseRow,
  stage: KanNoKiStage
): boolean {
  if (phase.completed_at !== null) return false;
  if (stage === "observation" || stage === "initial-contour") return false;
  const startedAt = new Date(phase.started_at).getTime();
  const daysElapsed = (Date.now() - startedAt) / (1000 * 60 * 60 * 24);
  return daysElapsed >= KAN_NO_KI_MIN_DAYS;
}
