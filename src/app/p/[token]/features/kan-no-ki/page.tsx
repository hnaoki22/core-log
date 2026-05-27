"use client";

// 観の期(KAN のキー)参加者ページ
// 装置の振る舞い:観た事をお返しする / 集合像との対比 / 段階的シグナル / 道場1 移行
// 用語規律:断定・診断・処方箋・コーチング・フィードバック・自己理解・分析 を画面に出さない

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

type StageKey =
  | "observation"
  | "initial-contour"
  | "word-pattern"
  | "deeper-observation"
  | "completed";

type ObservationResponse = {
  phase: {
    id: string;
    started_at: string;
    current_stage: StageKey;
    weeks_elapsed: number;
    log_count_in_phase: number;
    can_transition_to_dojo1: boolean;
    next_stage_hint: string | null;
  };
  week_num: number;
  window: { from: string; to: string };
  rhythm: {
    days_logged: number;
    business_days_in_week: number;
    morning_count: number;
    evening_count: number;
    morning_avg_duration_sec: number | null;
    evening_avg_duration_sec: number | null;
  };
  word_contour: {
    subject_counts: Record<string, number>;
    modal_should_count: number;
    modal_maybe_count: number;
    morning_avg_chars: number | null;
    evening_avg_chars: number | null;
  };
  emotion_trigger: {
    cognition_count: number;
    calm_count: number;
    worry_count: number;
    confusion_count: number;
    intense_count: number;
    joy_count: number;
  };
  silence: {
    business_day_log_rate: number | null;
    longest_silence_days: number;
    weekday_distribution: Record<string, number>;
  };
  peer_comparison: {
    scopes: string[];
    by_scope: Record<string, {
      scope: string;
      participant_count: number;
      log_count: number;
      modal_should_per_log: number;
      modal_maybe_per_log: number;
      worry_per_log: number;
      calm_per_log: number;
      intense_per_log: number;
      cognition_per_log: number;
    } | null>;
    individual_snapshot: {
      log_count: number;
      modal_should_per_log: number;
      modal_maybe_per_log: number;
      worry_per_log: number;
      calm_per_log: number;
      intense_per_log: number;
      cognition_per_log: number;
    };
  };
  body_summary: { prompts_triggered: number; responses_given: number };
  device_voice: {
    rhythm: string;
    word_contour: string;
    emotion_trigger: string;
    peer_comparison: string;
    silence: string;
    body_summary: string | null;
  };
};

const STAGE_LABEL: Record<StageKey, string> = {
  "observation": "観の素材を貯める段階",
  "initial-contour": "初期の輪郭",
  "word-pattern": "言葉の癖の観想",
  "deeper-observation": "より深い観想",
  "completed": "道場1 に移行済み",
};

function fmtSeconds(sec: number | null): string {
  if (sec === null) return "—";
  if (sec < 60) return `${sec} 秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} 分 ${s} 秒`;
}

export default function KanNoKiPage() {
  const params = useParams();
  const token = params.token as string;
  const { isOn } = useFeatures();
  const [data, setData] = useState<ObservationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const fetchObs = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/features/kan-no-ki?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const json = (await res.json()) as ObservationResponse;
        setData(json);
      } else {
        const j = await res.json().catch(() => ({}));
        setErrorMsg(j?.error || "観の期の情報を取得できませんでした。");
      }
    } catch {
      setErrorMsg("通信に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchObs();
  }, [fetchObs]);

  async function handleTransition() {
    if (!data) return;
    if (!confirm("道場1 に進みますか。これまでの観の地形図は、背景レイヤーとして更新され続けます。")) return;
    setTransitioning(true);
    try {
      const res = await fetch(`/api/features/kan-no-ki`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "transition-to-dojo-1" }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        alert(j?.message ?? "道場1 に進みました。");
        await fetchObs();
      } else {
        alert(j?.error ?? "移行に失敗しました。");
      }
    } catch {
      alert("通信に失敗しました。");
    } finally {
      setTransitioning(false);
    }
  }

  if (!isOn("tier-0.kanNoKi")) {
    return (
      <div className="min-h-screen bg-stone-50 pb-24">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-medium text-stone-800 mb-4">観の期(KAN のキー)</h1>
          <p className="text-stone-600">この機能は、このテナントでは有効化されていません。</p>
        </div>
        <BottomNav active="home" baseUrl={`/p/${token}`} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Link href={`/p/${token}`} className="text-sm text-stone-500 hover:text-stone-700">
            ← ホームに戻る
          </Link>
        </div>

        <header className="mb-8">
          <h1 className="text-2xl font-medium text-stone-800 tracking-wide">観の期(KAN のキー)</h1>
          <p className="text-sm text-stone-500 mt-1">
            介入前の自己観想の期間。装置は観た事を映し返すのみです。
          </p>
        </header>

        {loading && (
          <div className="text-stone-500">観た事を集めています…</div>
        )}

        {errorMsg && !loading && (
          <div className="bg-amber-50 border border-amber-200 rounded p-4 text-amber-900">
            {errorMsg}
          </div>
        )}

        {data && !loading && (
          <>
            {/* 段階的シグナル */}
            <section className="bg-white border border-stone-200 rounded-lg p-5 mb-5">
              <div className="text-xs uppercase tracking-wider text-stone-400 mb-1">段階</div>
              <div className="text-lg font-medium text-stone-800 mb-2">
                {STAGE_LABEL[data.phase.current_stage]} ・ Week {data.phase.weeks_elapsed}
              </div>
              {data.phase.next_stage_hint && (
                <p className="text-stone-600 text-sm leading-relaxed">{data.phase.next_stage_hint}</p>
              )}
              {data.phase.current_stage !== "completed" && (
                <div className="mt-4">
                  <button
                    type="button"
                    disabled={!data.phase.can_transition_to_dojo1 || transitioning}
                    onClick={handleTransition}
                    className={`px-4 py-2 rounded text-sm font-medium ${
                      data.phase.can_transition_to_dojo1
                        ? "bg-stone-800 text-stone-50 hover:bg-stone-700"
                        : "bg-stone-200 text-stone-400 cursor-not-allowed"
                    }`}
                  >
                    {transitioning ? "移行中…" : "道場1 に進む"}
                  </button>
                  {!data.phase.can_transition_to_dojo1 && (
                    <p className="text-xs text-stone-400 mt-2">
                      もう少し観の期を続けると、移行が選べるようになります。
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* 記録のリズム */}
            <section className="bg-white border border-stone-200 rounded-lg p-5 mb-5">
              <div className="text-xs uppercase tracking-wider text-stone-400 mb-2">記録のリズム</div>
              <p className="text-stone-700 text-sm leading-relaxed mb-3">{data.device_voice.rhythm}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-stone-500">記した日数</dt>
                <dd className="text-stone-700 text-right">{data.rhythm.days_logged} 日</dd>
                <dt className="text-stone-500">朝の記録</dt>
                <dd className="text-stone-700 text-right">{data.rhythm.morning_count} 件</dd>
                <dt className="text-stone-500">夕の記録</dt>
                <dd className="text-stone-700 text-right">{data.rhythm.evening_count} 件</dd>
                <dt className="text-stone-500">朝の所要(平均)</dt>
                <dd className="text-stone-700 text-right">{fmtSeconds(data.rhythm.morning_avg_duration_sec)}</dd>
                <dt className="text-stone-500">夕の所要(平均)</dt>
                <dd className="text-stone-700 text-right">{fmtSeconds(data.rhythm.evening_avg_duration_sec)}</dd>
              </dl>
            </section>

            {/* 言葉の輪郭 */}
            <section className="bg-white border border-stone-200 rounded-lg p-5 mb-5">
              <div className="text-xs uppercase tracking-wider text-stone-400 mb-2">言葉の輪郭</div>
              <p className="text-stone-700 text-sm leading-relaxed mb-3">{data.device_voice.word_contour}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {Object.entries(data.word_contour.subject_counts)
                  .filter(([, v]) => v > 0)
                  .map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-stone-500">主語「{k}」</dt>
                      <dd className="text-stone-700 text-right">{v} 回</dd>
                    </div>
                  ))}
                <dt className="text-stone-500">朝の平均文字数</dt>
                <dd className="text-stone-700 text-right">{data.word_contour.morning_avg_chars ?? "—"} 字</dd>
                <dt className="text-stone-500">夕の平均文字数</dt>
                <dd className="text-stone-700 text-right">{data.word_contour.evening_avg_chars ?? "—"} 字</dd>
              </dl>
            </section>

            {/* 感情の引き金 */}
            <section className="bg-white border border-stone-200 rounded-lg p-5 mb-5">
              <div className="text-xs uppercase tracking-wider text-stone-400 mb-2">感情の引き金</div>
              <p className="text-stone-700 text-sm leading-relaxed mb-3">{data.device_voice.emotion_trigger}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-stone-500">気づき(ハッ・気づ)</dt>
                <dd className="text-stone-700 text-right">{data.emotion_trigger.cognition_count} 回</dd>
                <dt className="text-stone-500">安心(安心・落ち着)</dt>
                <dd className="text-stone-700 text-right">{data.emotion_trigger.calm_count} 回</dd>
                <dt className="text-stone-500">心配(不安・心配)</dt>
                <dd className="text-stone-700 text-right">{data.emotion_trigger.worry_count} 回</dd>
                <dt className="text-stone-500">迷い(モヤモヤ・違和感)</dt>
                <dd className="text-stone-700 text-right">{data.emotion_trigger.confusion_count} 回</dd>
                <dt className="text-stone-500">激情(焦り・怒り・辛い)</dt>
                <dd className="text-stone-700 text-right">{data.emotion_trigger.intense_count} 回</dd>
                <dt className="text-stone-500">喜び(嬉しい・楽しい)</dt>
                <dd className="text-stone-700 text-right">{data.emotion_trigger.joy_count} 回</dd>
              </dl>
            </section>

            {/* 集合像との対比 */}
            {data.peer_comparison.scopes.length > 0 && (
              <section className="bg-white border border-stone-200 rounded-lg p-5 mb-5">
                <div className="text-xs uppercase tracking-wider text-stone-400 mb-2">集合像との対比</div>
                <p className="text-stone-700 text-sm leading-relaxed mb-3">{data.device_voice.peer_comparison}</p>
                {Object.entries(data.peer_comparison.by_scope).map(([scope, stat]) => {
                  if (!stat) {
                    return (
                      <div key={scope} className="text-stone-400 text-xs mt-2">
                        {scope}: 集合像は今は立ち上がっていません(N&lt;2)。
                      </div>
                    );
                  }
                  const ind = data.peer_comparison.individual_snapshot;
                  return (
                    <div key={scope} className="border-t border-stone-100 pt-3 mt-3">
                      <div className="text-xs text-stone-500 mb-2">
                        スコープ:{scope}({stat.participant_count} 名、{stat.log_count} 件)
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="text-stone-400">指標</div>
                        <div className="text-stone-400 text-right">集合</div>
                        <div className="text-stone-400 text-right">あなた</div>
                        <div className="text-stone-600">「べき」/ログ</div>
                        <div className="text-right">{stat.modal_should_per_log}</div>
                        <div className="text-right">{ind.modal_should_per_log}</div>
                        <div className="text-stone-600">推量/ログ</div>
                        <div className="text-right">{stat.modal_maybe_per_log}</div>
                        <div className="text-right">{ind.modal_maybe_per_log}</div>
                        <div className="text-stone-600">心配語/ログ</div>
                        <div className="text-right">{stat.worry_per_log}</div>
                        <div className="text-right">{ind.worry_per_log}</div>
                        <div className="text-stone-600">安心語/ログ</div>
                        <div className="text-right">{stat.calm_per_log}</div>
                        <div className="text-right">{ind.calm_per_log}</div>
                        <div className="text-stone-600">気づき語/ログ</div>
                        <div className="text-right">{stat.cognition_per_log}</div>
                        <div className="text-right">{ind.cognition_per_log}</div>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            {/* 静かな抵抗の輪郭 */}
            <section className="bg-white border border-stone-200 rounded-lg p-5 mb-5">
              <div className="text-xs uppercase tracking-wider text-stone-400 mb-2">静かな抵抗の輪郭</div>
              <p className="text-stone-700 text-sm leading-relaxed mb-3">{data.device_voice.silence}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-stone-500">営業日記録率</dt>
                <dd className="text-stone-700 text-right">
                  {data.silence.business_day_log_rate === null ? "—" : `${Math.round(data.silence.business_day_log_rate * 100)}%`}
                </dd>
                <dt className="text-stone-500">最長の連続沈黙</dt>
                <dd className="text-stone-700 text-right">{data.silence.longest_silence_days} 日</dd>
              </dl>
            </section>

            {/* 身体への問いかけ */}
            {data.device_voice.body_summary && (
              <section className="bg-white border border-stone-200 rounded-lg p-5 mb-5">
                <div className="text-xs uppercase tracking-wider text-stone-400 mb-2">身体への問いかけ</div>
                <p className="text-stone-700 text-sm leading-relaxed">{data.device_voice.body_summary}</p>
              </section>
            )}

            {/* 装置の自己宣言 */}
            <section className="text-xs text-stone-400 leading-relaxed mt-8 mb-4">
              装置は、観た事をお返しするだけです。解釈・診断・処方箋を出しません。
              「これは何を意味するか」「これからどうするか」は、あなた自身に委ねます。
            </section>
          </>
        )}
      </div>
      <BottomNav active="home" baseUrl={`/p/${token}`} />
    </div>
  );
}
