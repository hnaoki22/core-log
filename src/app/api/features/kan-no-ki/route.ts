// GET  /api/features/kan-no-ki?token=...&week=W       観の期 週次の観た事を返す
// POST /api/features/kan-no-ki                          観の期 → 道場1 への移行確定
//
// 仕様書 §5.1 / §4.3 / §4.5 準拠。LLM を使わず静的集計のみで観た事を返す MVP 実装。
// 装置の語り口は「観た事をお返しします」「立ち上がっています」型に限定。断定・診断・処方箋を出さない。

import { NextRequest, NextResponse } from "next/server";
import { getParticipantByToken } from "@/lib/participant-db";
import { getClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  getKanNoKiPhase,
  completeKanNoKiPhase,
  aggregateIndividual,
  countSubjects,
  determineCurrentStage,
  stageSignalHint,
  canTransitionToDojo1,
  EMOTION_WORDS_CALM,
  EMOTION_WORDS_COGNITION,
  EMOTION_WORDS_JOY,
  type RawLogText,
  type CollectiveScope,
  type CollectiveStatsSnapshot,
} from "@/lib/kan-no-ki";

// ===== 期間計算 =====

function weekStartISO(weekNum: number, phaseStart: string): string {
  const start = new Date(phaseStart);
  start.setUTCDate(start.getUTCDate() + (weekNum - 1) * 7);
  return start.toISOString();
}

function weekEndISO(weekNum: number, phaseStart: string): string {
  const start = new Date(phaseStart);
  start.setUTCDate(start.getUTCDate() + weekNum * 7);
  return start.toISOString();
}

function weeksElapsed(phaseStart: string): number {
  const ms = Date.now() - new Date(phaseStart).getTime();
  return Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24 * 7)) + 1);
}

// ===== ログ取得 =====

type LogRow = {
  id: string;
  date: string;
  morning_intent: string | null;
  evening_insight: string | null;
  morning_duration_sec: number | null;
  evening_duration_sec: number | null;
  day_of_week: string | null;
  participant_id: string;
  tenant_id: string;
};

async function fetchLogs(filter: {
  participantId?: string;
  tenantId?: string;
  tenantIds?: string[];
  startISO: string;
  endISO: string;
  phaseMode: "kan-no-ki" | "dojo-1" | "any";
}): Promise<LogRow[]> {
  let query = getClient()
    .from("logs")
    .select("id, date, morning_intent, evening_insight, morning_duration_sec, evening_duration_sec, day_of_week, participant_id, tenant_id")
    .gte("date", filter.startISO.slice(0, 10))
    .lt("date", filter.endISO.slice(0, 10));
  if (filter.phaseMode !== "any") {
    query = query.eq("phase_mode", filter.phaseMode);
  }
  if (filter.participantId) {
    query = query.eq("participant_id", filter.participantId);
  }
  if (filter.tenantId) {
    query = query.eq("tenant_id", filter.tenantId);
  }
  if (filter.tenantIds && filter.tenantIds.length > 0) {
    query = query.in("tenant_id", filter.tenantIds);
  }
  const { data, error } = await query;
  if (error) {
    logger.error("fetchLogs failed", { error: error.message, filter });
    return [];
  }
  return (data as LogRow[]) || [];
}

function toRawLogTexts(logs: LogRow[]): RawLogText[] {
  return logs.map(l => ({
    date: l.date,
    morning_intent: l.morning_intent,
    evening_insight: l.evening_insight,
    morning_duration_sec: l.morning_duration_sec,
    evening_duration_sec: l.evening_duration_sec,
    day_of_week: l.day_of_week,
  }));
}

// ===== 集合像集計 =====

function aggregateCollective(scope: CollectiveScope, logs: LogRow[]): CollectiveStatsSnapshot | null {
  if (logs.length === 0) return null;
  const participants = new Set(logs.map(l => l.participant_id));
  // 集合像最低 N=2(reflection-lab 想定。1名だと自己との対比になる)
  if (participants.size < 2) return null;
  const ind = aggregateIndividual(toRawLogTexts(logs));
  return {
    scope,
    participant_count: participants.size,
    log_count: logs.length,
    morning_avg_chars: ind.morning_avg_chars,
    evening_avg_chars: ind.evening_avg_chars,
    modal_should_per_log: ind.modal_should_per_log,
    modal_maybe_per_log: ind.modal_maybe_per_log,
    worry_per_log: ind.worry_per_log,
    calm_per_log: ind.calm_per_log,
    intense_per_log: ind.intense_per_log,
    cognition_per_log: ind.cognition_per_log,
  };
}

// ===== 装置の語り(観た事の文章化、断定・診断・処方箋を出さない) =====

function craftRhythmVoice(stats: ReturnType<typeof computeRhythm>): string {
  if (stats.days_logged === 0) {
    return "今週は、まだ記がありません。書かないという選択も、観の対象の中にあります。";
  }
  return `今週は ${stats.days_logged} 日、記しました。朝の記録は ${stats.morning_count} 件、夕の記録は ${stats.evening_count} 件。朝に ${stats.morning_avg_duration_sec ?? "—"} 秒、夕に ${stats.evening_avg_duration_sec ?? "—"} 秒を費やしました。`;
}

function craftWordContourVoice(
  individual: ReturnType<typeof aggregateIndividual>,
  subjects: Record<string, number>
): string {
  const topSubject = Object.entries(subjects).reduce((a, b) => (b[1] > a[1] ? b : a), ["—", 0]);
  return `主語の中心は「${topSubject[0]}」(${topSubject[1]}回)。文末では「べき」「ねば」「すべて」の絶対化が 1ログあたり ${individual.modal_should_per_log} 回、「と思う」「かもしれない」の推量が ${individual.modal_maybe_per_log} 回 立ち上がっています。`;
}

function craftEmotionTriggerVoice(emo: {
  cognition_count: number;
  calm_count: number;
  worry_count: number;
  confusion_count: number;
  intense_count: number;
  joy_count: number;
}): string {
  const total = emo.cognition_count + emo.calm_count + emo.worry_count + emo.confusion_count + emo.intense_count + emo.joy_count;
  if (total === 0) {
    return "感情語の出現は、今週は静かでした。";
  }
  return `気づきの語「ハッ・気づ」が ${emo.cognition_count} 回、心配の語「不安・心配」が ${emo.worry_count} 回、迷いの語「迷い・モヤモヤ」が ${emo.confusion_count} 回 立ち上がっています。`;
}

function craftPeerComparisonVoice(
  individual: ReturnType<typeof aggregateIndividual>,
  scopes: CollectiveScope[],
  byScope: Record<string, CollectiveStatsSnapshot | null>
): string {
  // 同テナント集合像を優先表示。集合像が成立しない場合(N<2)はその旨を返す。
  const primary = byScope["tenant"] ?? Object.values(byScope).find(v => v !== null) ?? null;
  if (!primary) {
    return scopes.length === 0
      ? "集合像との対比は今は無効です。"
      : "集合像との対比はまだ立ち上がっていません(集合の人数が満たないため)。";
  }
  return `集合像(${primary.scope}, ${primary.participant_count}名)では「べき」が 1ログあたり ${primary.modal_should_per_log} 回、心配の語が ${primary.worry_per_log} 回。あなたの記述は「べき」が ${individual.modal_should_per_log} 回、心配の語が ${individual.worry_per_log} 回。`;
}

function craftSilenceVoice(silence: ReturnType<typeof computeSilence>): string {
  if (silence.business_day_log_rate === null) {
    return "営業日の記録率は、まだ計測できません。";
  }
  return `今週の営業日記録率は ${Math.round(silence.business_day_log_rate * 100)}%。最長の連続沈黙は ${silence.longest_silence_days} 日。書かない時間そのものが観の対象の中にあります。`;
}

function craftBodySummaryVoice(prompts: number, responses: number): string | null {
  if (prompts === 0) return null;
  return `今週、強い感情語が立ち上がった日が ${prompts} 回ありました。身体への問いかけを添えました。回答は ${responses} 件です。`;
}

// ===== ファクト計算 =====

function computeRhythm(logs: LogRow[]) {
  const morningLogs = logs.filter(l => l.morning_intent && l.morning_intent.length > 0);
  const eveningLogs = logs.filter(l => l.evening_insight && l.evening_insight.length > 0);
  const morningDurations = morningLogs.map(l => l.morning_duration_sec).filter((v): v is number => typeof v === "number");
  const eveningDurations = eveningLogs.map(l => l.evening_duration_sec).filter((v): v is number => typeof v === "number");
  const safeAvg = (arr: number[]) => arr.length === 0 ? null : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  const uniqueDates = new Set(logs.map(l => l.date));
  return {
    days_logged: uniqueDates.size,
    business_days_in_week: 5,
    morning_count: morningLogs.length,
    evening_count: eveningLogs.length,
    morning_avg_duration_sec: safeAvg(morningDurations),
    evening_avg_duration_sec: safeAvg(eveningDurations),
    days_silent: [],
  };
}

function computeEmotion(logs: LogRow[]) {
  const text = logs.map(l => `${l.morning_intent ?? ""}\n${l.evening_insight ?? ""}`).join("\n");
  const countWords = (words: string[]) => words.reduce((s, w) => s + (text.split(w).length - 1), 0);
  return {
    cognition_count: countWords(EMOTION_WORDS_COGNITION),
    calm_count: countWords(EMOTION_WORDS_CALM),
    worry_count: countWords(["不安", "心配"]),
    confusion_count: countWords(["モヤモヤ", "違和感", "迷い", "悩"]),
    intense_count: countWords(["焦り", "怒り", "辛い", "苦しい"]),
    joy_count: countWords(EMOTION_WORDS_JOY),
  };
}

function computeSilence(logs: LogRow[], weekStartISO: string) {
  if (logs.length === 0) return { business_day_log_rate: null, longest_silence_days: 0, weekday_distribution: {} };
  const dayWeekdayCount: Record<string, number> = {};
  for (const l of logs) {
    const d = new Date(l.date).getUTCDay(); // 0=Sun
    const labels = ["日", "月", "火", "水", "木", "金", "土"];
    const label = labels[d];
    dayWeekdayCount[label] = (dayWeekdayCount[label] ?? 0) + 1;
  }
  const datesLogged = new Set(logs.map(l => l.date));
  const start = new Date(weekStartISO);
  let businessDayCount = 0;
  let businessDayLogged = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    businessDayCount += 1;
    const iso = d.toISOString().slice(0, 10);
    if (datesLogged.has(iso)) businessDayLogged += 1;
  }
  const rate = businessDayCount === 0 ? null : Math.round((businessDayLogged / businessDayCount) * 100) / 100;
  // longest silence (consecutive days without log within the week)
  let longest = 0;
  let current = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    if (datesLogged.has(iso)) {
      current = 0;
    } else {
      current += 1;
      if (current > longest) longest = current;
    }
  }
  return { business_day_log_rate: rate, longest_silence_days: longest, weekday_distribution: dayWeekdayCount };
}

async function computeBodyPromptSummary(participantId: string, tenantId: string, startISO: string, endISO: string) {
  const { data, error } = await getClient()
    .from("kan_no_ki_body_prompts")
    .select("id, response_text")
    .eq("participant_id", participantId)
    .eq("tenant_id", tenantId)
    .gte("prompted_at", startISO)
    .lt("prompted_at", endISO);
  if (error) {
    logger.warn("computeBodyPromptSummary failed", { error: error.message });
    return { prompts_triggered: 0, responses_given: 0 };
  }
  const rows = (data ?? []) as Array<{ id: string; response_text: string | null }>;
  return {
    prompts_triggered: rows.length,
    responses_given: rows.filter(r => r.response_text && r.response_text.length > 0).length,
  };
}

// ===== ハンドラー =====

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }
  const participant = await getParticipantByToken(token);
  if (!participant) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }
  if (!participant.tenantId) {
    return NextResponse.json({ error: "Participant tenant unresolved" }, { status: 500 });
  }
  const tenantId = participant.tenantId;
  const participantId = participant.id;

  // フラグ確認
  const flagEnabled = await isFeatureEnabled("tier-0.kanNoKi", tenantId);
  if (!flagEnabled) {
    return NextResponse.json({ error: "観の期は、このテナントでは有効化されていません" }, { status: 403 });
  }

  // 観の期に在籍しているか
  const phase = await getKanNoKiPhase(participantId, tenantId);
  if (!phase) {
    return NextResponse.json({ error: "観の期に在籍していません" }, { status: 403 });
  }

  // 今週の番号(phaseStart から何週目か)
  const elapsed = weeksElapsed(phase.started_at);
  const requestedWeek = url.searchParams.get("week");
  const weekNum = requestedWeek ? Math.max(1, parseInt(requestedWeek, 10)) : elapsed;
  const startISO = weekStartISO(weekNum, phase.started_at);
  const endISO = weekEndISO(weekNum, phase.started_at);

  // 個別ログ
  const individualLogs = await fetchLogs({
    participantId,
    tenantId,
    startISO,
    endISO,
    phaseMode: "kan-no-ki",
  });
  const indRaw = toRawLogTexts(individualLogs);
  const individual = aggregateIndividual(indRaw);
  const subjects = countSubjects(indRaw);
  const rhythm = computeRhythm(individualLogs);
  const emotion = computeEmotion(individualLogs);
  const silence = computeSilence(individualLogs, startISO);

  // 集合像(同テナント / 横断 / 業界 / 全体)— フラグで制御
  const scopes: CollectiveScope[] = [];
  if (await isFeatureEnabled("tier-0.kanNoKi.peerComparison.tenant", tenantId)) scopes.push("tenant");
  if (await isFeatureEnabled("tier-0.kanNoKi.peerComparison.crossTenant", tenantId)) scopes.push("cross-tenant");
  if (await isFeatureEnabled("tier-0.kanNoKi.peerComparison.industry", tenantId)) scopes.push("industry");
  if (await isFeatureEnabled("tier-0.kanNoKi.peerComparison.global", tenantId)) scopes.push("global");

  const byScope: Record<string, CollectiveStatsSnapshot | null> = {};
  for (const sc of scopes) {
    let logs: LogRow[] = [];
    if (sc === "tenant") {
      logs = await fetchLogs({ tenantId, startISO, endISO, phaseMode: "kan-no-ki" });
    } else if (sc === "global") {
      logs = await fetchLogs({ startISO, endISO, phaseMode: "kan-no-ki" });
    } else if (sc === "cross-tenant") {
      logs = await fetchLogs({ startISO, endISO, phaseMode: "kan-no-ki" });
    } else if (sc === "industry") {
      // 同 industry のテナント群を取得
      const { data: ownTenant } = await getClient().from("tenants").select("industry").eq("id", tenantId).single();
      const industry = (ownTenant as { industry: string | null } | null)?.industry ?? null;
      if (industry) {
        const { data: tenants } = await getClient().from("tenants").select("id").eq("industry", industry);
        const tenantIds = ((tenants as Array<{ id: string }> | null) ?? []).map(t => t.id);
        if (tenantIds.length > 0) {
          logs = await fetchLogs({ tenantIds, startISO, endISO, phaseMode: "kan-no-ki" });
        }
      }
    }
    byScope[sc] = aggregateCollective(sc, logs);
  }

  // 段階的シグナル(本人のログ件数で判定)
  const { count: phaseTotalLogs } = await getClient()
    .from("logs")
    .select("id", { count: "exact", head: true })
    .eq("participant_id", participantId)
    .eq("tenant_id", tenantId)
    .eq("phase_mode", "kan-no-ki");
  const stage = determineCurrentStage(elapsed, phaseTotalLogs ?? 0);
  const canTransition = canTransitionToDojo1(phase, stage);

  // 身体への問いかけの集計
  const bodySummary = await computeBodyPromptSummary(participantId, tenantId, startISO, endISO);

  // 装置の語り
  const deviceVoice = {
    rhythm: craftRhythmVoice(rhythm),
    word_contour: craftWordContourVoice(individual, subjects),
    emotion_trigger: craftEmotionTriggerVoice(emotion),
    peer_comparison: craftPeerComparisonVoice(individual, scopes, byScope),
    silence: craftSilenceVoice(silence),
    body_summary: craftBodySummaryVoice(bodySummary.prompts_triggered, bodySummary.responses_given),
  };

  return NextResponse.json({
    phase: {
      id: phase.id,
      started_at: phase.started_at,
      current_stage: stage,
      weeks_elapsed: elapsed,
      log_count_in_phase: phaseTotalLogs ?? 0,
      can_transition_to_dojo1: canTransition,
      next_stage_hint: stageSignalHint(stage),
    },
    week_num: weekNum,
    window: { from: startISO, to: endISO },
    rhythm,
    word_contour: {
      subject_counts: subjects,
      modal_should_count: Math.round(individual.modal_should_per_log * individual.log_count),
      modal_maybe_count: Math.round(individual.modal_maybe_per_log * individual.log_count),
      causal_count: 0,
      morning_avg_chars: individual.morning_avg_chars,
      evening_avg_chars: individual.evening_avg_chars,
    },
    emotion_trigger: emotion,
    silence,
    peer_comparison: {
      scopes,
      by_scope: byScope,
      individual_snapshot: individual,
    },
    stage_signal: {
      current_stage: stage,
      weeks_elapsed: elapsed,
      log_count_in_phase: phaseTotalLogs ?? 0,
      next_stage_hint: stageSignalHint(stage),
    },
    body_summary: bodySummary,
    device_voice: deviceVoice,
  });
}

// POST: 観の期 → 道場1 への移行確定
export async function POST(request: NextRequest) {
  let payload: { token?: string; action?: string } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { token, action } = payload;
  if (!token || action !== "transition-to-dojo-1") {
    return NextResponse.json({ error: "token と action='transition-to-dojo-1' が必要です" }, { status: 400 });
  }
  const participant = await getParticipantByToken(token);
  if (!participant) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }
  if (!participant.tenantId) {
    return NextResponse.json({ error: "Participant tenant unresolved" }, { status: 500 });
  }
  const tenantId = participant.tenantId;
  const participantId = participant.id;

  const phase = await getKanNoKiPhase(participantId, tenantId);
  if (!phase) {
    return NextResponse.json({ error: "観の期に在籍していません" }, { status: 403 });
  }
  // 段階チェック
  const elapsed = weeksElapsed(phase.started_at);
  const { count } = await getClient()
    .from("logs")
    .select("id", { count: "exact", head: true })
    .eq("participant_id", participantId)
    .eq("tenant_id", tenantId)
    .eq("phase_mode", "kan-no-ki");
  const stage = determineCurrentStage(elapsed, count ?? 0);
  if (!canTransitionToDojo1(phase, stage)) {
    return NextResponse.json(
      { error: "まだ移行できる段階ではありません。観の期を続けてください。" },
      { status: 403 }
    );
  }
  const ok = await completeKanNoKiPhase(participantId, tenantId);
  if (!ok) {
    return NextResponse.json({ error: "移行処理に失敗しました" }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    message: "これまでの観の期で立ち上がった地形図は、道場1 でも背景レイヤーとして更新されます。",
  });
}
