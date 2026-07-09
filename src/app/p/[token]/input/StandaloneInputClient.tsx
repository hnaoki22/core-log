"use client";

// standalone商品モードの入力フロー（商品版最終型仕様書 v1.0 §3）
//
// 朝・夕とも3画面遷移。所要目標: 朝1分・夕3分（「朝晩あわせて5分」）。
//   朝: ①体調「今朝、体はどんな感じですか？」（自由記述・空のまま次へ進める）
//       → ②意図「今日の意図」 → ③気分（4段階。energy に保存）
//   夕: ①体調「今、体はどんな感じですか？」
//       → ②結果「今朝の意図、やってみてどうでしたか？」（朝の意図を上部に再掲）
//       → ③気分（4段階。evening_energy に保存）
//
// 設計メモ:
// - standalone か否かはサーバー（input/page.tsx）が SSR 時に判定して
//   このコンポーネントを選ぶ。クライアント側のフラグ読込race（§10 の
//   個人別表示差の温床）をフローの分岐に持ち込まない。
// - 1画面1問。選択は5秒で済むこと（文字起こし01:35）。
// - 体調は空で進めてもログは成立する（強制は「重い」体験に直結）。

import { useRouter } from "next/navigation";
import { getTodayJST } from "@/lib/date-utils";
import { getPlaceholderExample } from "@/lib/placeholder-examples";
import { useState, useRef } from "react";
import { EnergyGlyph, ENERGY_COLORS, ENERGY_TINTS } from "@/components/EnergyGlyph";
import { ConditionGauges } from "@/components/features/ConditionGauges";
import { type GaugeRaws } from "@/lib/condition-gauges";

type TodayLog = {
  id: string;
  morningIntent: string;
  status: string;
  // 夕②「今朝の記録」カード用（2026-06-10 本藤さんフィードバック）:
  // 朝に選んだ気分・書いた体調も参照しながら振り返れるようにする
  morningEnergy?: string | null;
  morningCondition?: string | null;
};

type ParticipantBasic = {
  name: string;
  dojoPhase: string;
  weekNum?: number;
};

// 4段階セレクタ（InputClient と同一の選択肢・配色。standalone では
// ラベルを「気分」として提示する）
const moodOptions = [
  { id: "excellent", label: "絶好調" },
  { id: "good", label: "良い" },
  { id: "okay", label: "まあまあ" },
  { id: "low", label: "低調" },
] as const;

export type SkipFollowup = {
  gapWeekdays: number;
  question: string;
  returnLogId: string;
};

// logform v2（F4）: 前日ログの引き継ぎ元。ボタン開示 → 項目単位で「引き継ぐ」。
export type PrevDayRecord = {
  date: string;
  morningIntent: string | null;
  morningAction: string | null;
  eveningInsight: string | null;
  eveningState: string | null;
  gauges: GaugeRaws | null;
};

export type StandaloneInputInitialData = {
  participant: ParticipantBasic;
  todayLog: TodayLog | null;
  initialIsMorning: boolean;
  initialMorningClosed: boolean;
  initialAlreadyCompleted: boolean;
  // logform v2 レイヤー（standalone_mode の上に重ねる）。OFF のときは従来 standalone 挙動。
  logformV2: boolean;
  prevDay: PrevDayRecord | null;
  inertiaNudge: string | null;  // F5 惰性検知の翌朝メッセージ（表示する時だけ非null）
};

interface Props {
  token: string;
  initialData: StandaloneInputInitialData;
}

// F4: 前日ログの1項目 + 「引き継ぐ」ボタン（項目単位のコピー。一括ボタンは作らない）
function PrevItem({ label, text, onCarry }: { label: string; text: string; onCarry: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm text-[#5B5560] leading-relaxed whitespace-pre-wrap flex-1">
        <span className="text-[#8B8489] text-xs mr-2">{label}</span>
        {text}
      </p>
      <button
        type="button"
        onClick={onCarry}
        className="text-xs text-[#2D6A4F] border border-[#2D6A4F]/30 rounded-full px-3 py-1 hover:bg-[#EFF5F1] transition-colors shrink-0"
      >
        引き継ぐ
      </button>
    </div>
  );
}

export default function StandaloneInputClient({ token, initialData }: Props) {
  const router = useRouter();
  const participant = initialData.participant;
  const todayLog = initialData.todayLog;
  const isMorning = initialData.initialIsMorning;
  const morningClosed = initialData.initialMorningClosed;
  const logformV2 = initialData.logformV2;   // logform v2 レイヤー
  const prevDay = initialData.prevDay;
  const inertiaNudge = initialData.inertiaNudge; // F5 惰性検知メッセージ

  const [step, setStep] = useState(1);
  const [condition, setCondition] = useState("");   // ①体調・自由記述（v1）。v2 ではゲージに置換
  const [gauges, setGauges] = useState<GaugeRaws>({}); // ①体調3ゲージ（v2 F1/F3）
  const [mainText, setMainText] = useState("");      // ②Q1（意図/結果）
  const [secondText, setSecondText] = useState("");  // ②Q2（v2: 行動/状態一言）
  const [carriedOver, setCarriedOver] = useState<string[]>([]); // F4 引き継ぎメタ
  const [showPrevDay, setShowPrevDay] = useState(false);        // F4 前日ログ開示
  const [mood, setMood] = useState<string | null>(null); // ③気分

  // F4: 前日の項目を今日の入力へ引き継ぐ（引き継いだ項目名を記録する）
  const carryText = (key: string, text: string, target: "main" | "second") => {
    if (target === "main") setMainText(text);
    else setSecondText(text);
    setCarriedOver((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };
  const carryGauges = () => {
    if (!prevDay?.gauges) return;
    setGauges(prevDay.gauges);
    setCarriedOver((prev) => Array.from(new Set([...prev, ...Object.keys(prevDay.gauges!)])));
  };
  const [completed, setCompleted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [skipFollowup, setSkipFollowup] = useState<SkipFollowup | null>(null);
  const [skipReasonText, setSkipReasonText] = useState("");
  const [skipCardDone, setSkipCardDone] = useState(false);

  const focusedAtRef = useRef<number | null>(null);
  const handleFocus = () => {
    if (focusedAtRef.current === null) {
      focusedAtRef.current = Date.now();
    }
  };

  const today = getTodayJST();

  // 夕②/③で参照する「今朝の記録」。気分は絵文字・ラベルに解決しておく
  const morningMood = todayLog?.morningEnergy
    ? moodOptions.find((o) => o.id === todayLog.morningEnergy) ?? null
    : null;
  const hasMorningRecord = !!(morningMood || todayLog?.morningCondition || todayLog?.morningIntent);

  if (initialData.initialAlreadyCompleted) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="max-w-md mx-auto text-center animate-fade-up">
          <div className="w-16 h-16 bg-[#EFF5F1] border border-[#2D6A4F]/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#1A1A2E] mb-2">今日の記入は完了済みです</h2>
          <p className="text-[#5B5560] text-sm mb-8">朝と夕、どちらも記入されています</p>
          <button
            onClick={() => router.push(`/p/${token}`)}
            className="btn-primary w-full py-3.5 text-sm"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  const submitEntry = async () => {
    setIsSubmitting(true);
    setSubmitError("");

    let durationSec: number | null = null;
    if (focusedAtRef.current !== null) {
      const elapsed = Math.round((Date.now() - focusedAtRef.current) / 1000);
      if (elapsed >= 0 && elapsed <= 1800) durationSec = elapsed;
      else if (elapsed > 1800) durationSec = 1800;
    }

    try {
      let body: Record<string, unknown>;
      if (isMorning) {
        body = {
          type: "morning",
          token,
          participantName: participant.name,
          date: today,
          morningIntent: mainText,
          energy: mood,
          dojoPhase: participant.dojoPhase || "守",
          weekNum: participant.weekNum || 1,
          morningDurationSec: durationSec,
        };
        if (condition.trim().length > 0) {
          body.morningCondition = condition.trim();
        }
      } else if (morningClosed && !todayLog) {
        body = {
          type: "evening_only",
          token,
          participantName: participant.name,
          date: today,
          eveningInsight: mainText,
          energy: mood,
          dojoPhase: participant.dojoPhase || "守",
          weekNum: participant.weekNum || 1,
          eveningDurationSec: durationSec,
        };
        if (condition.trim().length > 0) {
          body.eveningCondition = condition.trim();
        }
      } else {
        body = {
          type: "evening",
          token,
          pageId: todayLog?.id || "",
          eveningInsight: mainText,
          energy: mood,
          eveningDurationSec: durationSec,
        };
        if (condition.trim().length > 0) {
          body.eveningCondition = condition.trim();
        }
      }

      // logform v2 追加フィールド（standalone の body に上乗せ）。
      // v2 では体調は自由記述ではなく3ゲージ。Q2（朝=行動 / 夕=状態一言）と
      // 引き継ぎメタ（F4）も送る。すべて任意・空なら送らない（咎めない原則）。
      if (logformV2) {
        body.conditionGauges = gauges;
        if (secondText.trim().length > 0) {
          body[isMorning ? "morningAction" : "eveningState"] = secondText.trim();
        }
        if (carriedOver.length > 0) {
          body.carriedOver = carriedOver;
        }
      }

      const res = await fetch("/api/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        // §5 未記入フォローアップ: サーバーが復帰日と判定した場合のみ
        // skipFollowup が返る。完了画面で「書いた後にポッと」1枚だけ出す。
        try {
          const data = await res.json();
          if (data.skipFollowup && typeof data.skipFollowup.question === "string") {
            setSkipFollowup(data.skipFollowup as SkipFollowup);
          }
        } catch {
          // レスポンス本文が読めなくても記入自体は成功している
        }
        setCompleted(true);
      } else {
        const data = await res.json();
        setSubmitError(data.error || "保存に失敗しました");
      }
    } catch {
      setSubmitError("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitSkipReason = async (reason: string | null) => {
    // ギャップの事実はサーバーが記録済み。ここでは回答テキストだけを追記する。
    // 失敗してもユーザー体験は止めない（咎めない・引き止めない）。
    setSkipCardDone(true);
    if (!skipFollowup || !reason) return; // スキップ＝事実のみ記録（既に保存済み）
    try {
      await fetch("/api/standalone/skip-reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason, returnLogId: skipFollowup.returnLogId }),
      });
    } catch {
      // 記録失敗は黙って許容
    }
  };

  const handleNext = () => {
    // ①体調は空でも進める。②本文は必須。③気分は必須。
    if (step === 2 && !mainText.trim()) return;
    if (step === 3) {
      if (!mood) return;
      submitEntry();
      return;
    }
    setStep(step + 1);
  };

  const stepTwoReady = mainText.trim().length > 0;

  if (completed) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="max-w-md mx-auto text-center animate-scale-in w-full">
          <div className="w-16 h-16 bg-[#EFF5F1] border border-[#2D6A4F]/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#1A1A2E] mb-2">記入完了</h2>
          <p className="text-[#5B5560] text-sm mb-6">
            {isMorning ? "今日の意図が記録されました" : "今日の振り返りが記録されました"}
          </p>

          {/* §5 未記入フォローアップカード — 復帰日のログ完了「後」にのみ表示。
              任意・1問のみ・スキップ可。咎めるコピーは入れない。 */}
          {skipFollowup && !skipCardDone && (
            <div className="card p-5 text-left mb-6 animate-fade-up">
              <p className="text-sm text-[#1A1A2E] leading-relaxed mb-3">{skipFollowup.question}</p>
              <textarea
                value={skipReasonText}
                onChange={(e) => setSkipReasonText(e.target.value)}
                placeholder="ひとことでも、空欄のままでも大丈夫です"
                className="input-field min-h-[72px] resize-none text-sm leading-relaxed mb-3"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => submitSkipReason(skipReasonText.trim().length > 0 ? skipReasonText.trim() : null)}
                  className="btn-primary flex-1 py-2.5 text-sm"
                >
                  送信
                </button>
                <button
                  onClick={() => submitSkipReason(null)}
                  className="btn-secondary flex-1 py-2.5 text-sm"
                >
                  スキップ
                </button>
              </div>
            </div>
          )}
          {skipFollowup && skipCardDone && (
            <p className="text-xs text-[#8B8489] mb-6">ありがとうございます。</p>
          )}

          <button
            onClick={() => router.push(`/p/${token}`)}
            className="btn-primary w-full py-3.5 text-sm"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F0EB] pb-32">
      <div className="gradient-header text-white px-6 pt-12 pb-6">
        <div className="max-w-md mx-auto relative z-10">
          <button
            onClick={() => router.push(`/p/${token}`)}
            className="text-indigo-200 hover:text-white text-sm mb-4 flex items-center gap-1 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            戻る
          </button>
          <h1 className="text-xl font-semibold tracking-tight">
            {isMorning ? "朝の記入" : "夕の記入"}
          </h1>
          <p className="text-indigo-200 text-sm mt-1.5 font-light">
            {isMorning ? "1分で大丈夫です" : "3分で大丈夫です"}
          </p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-6 animate-fade-up">
        {/* 3画面プログレスバー */}
        <div className="flex gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex-1 h-1 rounded-full transition-colors duration-300 ${
                step >= s ? "bg-[#1A1A2E]" : "bg-[#E5DCD0]"
              }`}
            ></div>
          ))}
        </div>

        {/* ①体調（v1=自由記述 / v2=3ゲージ。いずれも空のまま次へ進める） */}
        {step === 1 && (
          <div className="space-y-4">
            {/* F5: 惰性検知の翌朝メッセージ（静かに問いかける。評価語なし・咎めない）。 */}
            {inertiaNudge && (
              <div className="bg-[#FBF8F4] border border-[#EFE8DD] rounded-2xl p-4">
                <p className="text-sm text-[#1A1A2E] leading-relaxed">{inertiaNudge}</p>
              </div>
            )}
            {/* F4: 前日ログはデフォルト非表示。ボタンで開示し、項目単位で引き継ぐ。 */}
            {logformV2 && prevDay && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowPrevDay((v) => !v)}
                  className="text-sm text-[#5B5560] underline underline-offset-2 hover:text-[#1A1A2E] transition-colors"
                >
                  {showPrevDay ? "昨日の記録を閉じる" : "昨日の記録を見る"}
                </button>
                {showPrevDay && (
                  <div className="mt-3 bg-[#FBF8F4] border border-[#EFE8DD] p-4 rounded-2xl space-y-3">
                    <p className="text-[10px] text-[#8B8489] font-medium tracking-wide uppercase">
                      昨日の記録（{prevDay.date}）
                    </p>
                    {isMorning ? (
                      <>
                        {prevDay.morningIntent && (
                          <PrevItem
                            label="意図"
                            text={prevDay.morningIntent}
                            onCarry={() => carryText("morningIntent", prevDay.morningIntent!, "main")}
                          />
                        )}
                        {prevDay.morningAction && (
                          <PrevItem
                            label="場面・行動"
                            text={prevDay.morningAction}
                            onCarry={() => carryText("morningAction", prevDay.morningAction!, "second")}
                          />
                        )}
                      </>
                    ) : (
                      <>
                        {prevDay.eveningInsight && (
                          <PrevItem
                            label="やってみたこと"
                            text={prevDay.eveningInsight}
                            onCarry={() => carryText("eveningInsight", prevDay.eveningInsight!, "main")}
                          />
                        )}
                        {prevDay.eveningState && (
                          <PrevItem
                            label="状態"
                            text={prevDay.eveningState}
                            onCarry={() => carryText("eveningState", prevDay.eveningState!, "second")}
                          />
                        )}
                      </>
                    )}
                    {prevDay.gauges && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-[#5B5560]">
                          <span className="text-[#8B8489] text-xs mr-2">体調</span>
                          昨日のゲージ
                        </span>
                        <button
                          type="button"
                          onClick={carryGauges}
                          className="text-xs text-[#2D6A4F] border border-[#2D6A4F]/30 rounded-full px-3 py-1 hover:bg-[#EFF5F1] transition-colors shrink-0"
                        >
                          引き継ぐ
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <p className="text-[#1A1A2E] font-medium text-base leading-relaxed">
              {isMorning ? "今朝、体はどんな感じですか？" : "今、体はどんな感じですか？"}
            </p>
            {logformV2 ? (
              <ConditionGauges value={gauges} onChange={setGauges} onFirstInteract={handleFocus} />
            ) : (
              <textarea
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                onFocus={handleFocus}
                placeholder="例：少しだるい／よく眠れた（空欄のままでも進めます）"
                className="input-field min-h-[88px] resize-none leading-relaxed"
              />
            )}
          </div>
        )}

        {/* ②意図（朝）/ 結果（夕・朝の意図を再掲） */}
        {step === 2 && (
          <div className="space-y-4">
            {isMorning ? (
              logformV2 ? (
                <>
                  {/* F2 Q1: アウトカム型の意図 */}
                  <p className="text-[#1A1A2E] font-medium text-base leading-relaxed">
                    今日の終わりに、どんな状態の自分でいられたらいいですか
                  </p>
                  <textarea
                    value={mainText}
                    onChange={(e) => setMainText(e.target.value)}
                    onFocus={handleFocus}
                    placeholder="（例文は科学検証仕様書 v1.0 の文言に差し替え予定）"
                    className="input-field min-h-[120px] resize-none leading-relaxed"
                  />
                  {/* F2 Q2: Q1 と同時に必ず表示（畳まない）。任意・咎めない（送信ブロックしない）。 */}
                  <p className="text-[#1A1A2E] font-medium text-base leading-relaxed pt-2">
                    そのために、今日どんな場面で、何をしますか（一つで十分です）
                  </p>
                  <textarea
                    value={secondText}
                    onChange={(e) => setSecondText(e.target.value)}
                    onFocus={handleFocus}
                    placeholder="（例文は科学検証仕様書 v1.0 の文言に差し替え予定）"
                    className="input-field min-h-[100px] resize-none leading-relaxed"
                  />
                </>
              ) : (
                <>
                  <p className="text-[#1A1A2E] font-medium text-base leading-relaxed">今日の意図</p>
                  <textarea
                    value={mainText}
                    onChange={(e) => setMainText(e.target.value)}
                    onFocus={handleFocus}
                    placeholder={getPlaceholderExample({
                      token,
                      dojoPhase: participant.dojoPhase,
                      date: today,
                      type: "morning",
                      customExamples: null,
                    })}
                    className="input-field min-h-[180px] resize-none leading-relaxed"
                  />
                </>
              )
            ) : (
              <>
                {/* 今朝の記録カード — 気分→体調→意図の順で、あるものだけを再掲。
                    参照であって主役ではない（muted 配色・入力欄より目立たせない） */}
                {hasMorningRecord ? (
                  <div className="bg-[#FBF8F4] border border-[#EFE8DD] p-4 rounded-2xl space-y-2.5">
                    <p className="text-[10px] text-[#8B8489] font-medium tracking-wide uppercase">今朝の記録</p>
                    {morningMood && (
                      <p className="text-sm text-[#5B5560] leading-relaxed">
                        <span className="text-[#8B8489] text-xs mr-2">気分</span>
                        <EnergyGlyph level={morningMood.id} size={15} className="inline align-[-3px] mr-1" /> {morningMood.label}
                      </p>
                    )}
                    {todayLog?.morningCondition && (
                      <p className="text-sm text-[#5B5560] leading-relaxed">
                        <span className="text-[#8B8489] text-xs mr-2">体調</span>
                        {todayLog.morningCondition}
                      </p>
                    )}
                    {todayLog?.morningIntent && (
                      <p className="text-sm text-[#5B5560] leading-relaxed whitespace-pre-wrap">
                        <span className="text-[#8B8489] text-xs mr-2">意図</span>
                        {todayLog.morningIntent}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[#8B8489] leading-relaxed">
                    今朝の記録はありません。夕方だけの記入でも大丈夫です。
                  </p>
                )}
                {logformV2 ? (
                  <>
                    {/* F3 Q1: 行動（採点語を使わない） */}
                    <p className="text-[#1A1A2E] font-medium text-base leading-relaxed">今日、実際にやってみたことは？</p>
                    <textarea
                      value={mainText}
                      onChange={(e) => setMainText(e.target.value)}
                      onFocus={handleFocus}
                      placeholder="やってみたことを、そのまま"
                      className="input-field min-h-[120px] resize-none leading-relaxed"
                    />
                    {/* F3 Q2: 意識・状態 */}
                    <p className="text-[#1A1A2E] font-medium text-base leading-relaxed pt-2">いまの自分の状態を一言でいうと？</p>
                    <textarea
                      value={secondText}
                      onChange={(e) => setSecondText(e.target.value)}
                      onFocus={handleFocus}
                      placeholder="ひとことで"
                      className="input-field min-h-[80px] resize-none leading-relaxed"
                    />
                  </>
                ) : (
                  <>
                    <p className="text-[#1A1A2E] font-medium text-base leading-relaxed">
                      {todayLog && todayLog.morningIntent
                        ? "今朝の意図、やってみてどうでしたか？"
                        : "今日、やってみてどうでしたか？"}
                    </p>
                    <textarea
                      value={mainText}
                      onChange={(e) => setMainText(e.target.value)}
                      onFocus={handleFocus}
                      placeholder="うまくいったこと、いかなかったこと、気づいたこと"
                      className="input-field min-h-[180px] resize-none leading-relaxed"
                    />
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ③気分（4段階。朝→energy / 夕→evening_energy はサーバー側で分岐） */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-[#1A1A2E] font-medium text-base leading-relaxed">
              いまの気分に近いものは？
            </p>
            {/* 夕は今朝の気分を1行だけ参照表示（朝夕差を意識して選べるように） */}
            {!isMorning && morningMood && (
              <p className="text-xs text-[#8B8489]">
                今朝の気分: <EnergyGlyph level={morningMood.id} size={14} className="inline align-[-3px] mx-0.5" /> {morningMood.label}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {moodOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setMood(option.id)}
                  style={
                    mood === option.id
                      ? { borderColor: ENERGY_COLORS[option.id], backgroundColor: ENERGY_TINTS[option.id] }
                      : undefined
                  }
                  className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                    mood === option.id
                      ? "shadow-sm"
                      : "border-[#E5DCD0] bg-white hover:border-[#C9BDAE]"
                  }`}
                >
                  <div className="flex justify-center mb-2"><EnergyGlyph level={option.id} size={30} /></div>
                  <div className="text-sm font-medium text-[#1A1A2E]">{option.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 space-y-3">
          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <p className="text-red-600 text-sm">{submitError}</p>
            </div>
          )}
          <button
            onClick={handleNext}
            disabled={
              isSubmitting ||
              (step === 2 && !stepTwoReady) ||
              (step === 3 && !mood)
            }
            className="btn-primary w-full py-3.5 text-sm"
          >
            {isSubmitting ? "保存中..." : step === 3 ? "記入を完了する" : "次へ"}
          </button>
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="btn-secondary w-full py-3.5 text-sm"
            >
              戻る
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
