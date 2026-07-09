// Server Component for /p/[token]/input.
//
// Combines participant + logs into ONE Supabase nested-select to avoid the
// "ParticipantByToken → wait → LogsByParticipant" sequential round trip.
// Logs timing to the Vercel function log (visible in Vercel dashboard) so
// we can SEE where the time goes per request.

import { notFound } from "next/navigation";
import { getParticipantWithLogsByToken } from "@/lib/supabase";
import { getTodayJST, getCurrentHourJST, isGracePeriod, calculateWeekNum } from "@/lib/date-utils";
import { getFlagsForTenant } from "@/lib/feature-flags";
import { getKanNoKiPhase } from "@/lib/kan-no-ki";
import { getTodayQuestionsForTenant, getTodayDayKey } from "@/lib/daily-questions";
import InputClient, { type InputPageInitialData } from "./InputClient";
import StandaloneInputClient, { type PrevDayRecord } from "./StandaloneInputClient";
import { gaugesToRaws } from "@/lib/condition-gauges";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InputPageServer({
  params,
}: {
  params: { token: string };
}) {
  const t0 = Date.now();
  const token = params.token;

  const result = await getParticipantWithLogsByToken(token);
  const tFetched = Date.now();

  if (!result?.participant || !result.participant.tenantId) {
    notFound();
  }
  const participant = result.participant;
  const logs = result.logs;

  const today = getTodayJST();
  const todayEntry = logs.find((l) => l.date === today);

  const hour = getCurrentHourJST();
  const inGracePeriod = isGracePeriod();

  let initialIsMorning = true;
  let initialMorningClosed = false;
  let initialAlreadyCompleted = false;
  let initialTodayLog: InputPageInitialData["todayLog"] = null;

  if (todayEntry && todayEntry.morningIntent) {
    initialTodayLog = {
      id: todayEntry.id,
      morningIntent: todayEntry.morningIntent,
      status: todayEntry.status,
    };
    if (todayEntry.status === "complete" || todayEntry.status === "fb_done") {
      initialAlreadyCompleted = true;
    } else {
      initialIsMorning = false;
    }
  } else if (hour >= 12 || inGracePeriod) {
    initialIsMorning = false;
    initialMorningClosed = true;
  }

  // 初期描画でフォームが「シンプル入力 → デイリークエスチョン → 観の期バナー」
  // とチラつかないよう、機能フラグ・観の期状態・デイリークエスチョンを
  // すべてサーバー側で先読みしてクライアントに渡す。
  // フェッチは並列化(Promise.all)で SSR レイテンシへの影響を最小化。
  const [flagMap, knkPhase, dailyQ] = await Promise.all([
    getFlagsForTenant(participant.tenantId).catch(() => ({} as Record<string, boolean>)),
    getKanNoKiPhase(participant.id, participant.tenantId).catch(() => null),
    getTodayQuestionsForTenant(participant.tenantId).catch(() => null),
  ]);

  const initialKanNoKiPhase = knkPhase
    ? {
        current_stage: knkPhase.current_stage,
        // weeks_elapsed は started_at からの経過週数
        weeks_elapsed: Math.max(
          1,
          Math.floor((Date.now() - new Date(knkPhase.started_at).getTime()) / (1000 * 60 * 60 * 24 * 7)) + 1
        ),
        next_stage_hint:
          knkPhase.current_stage === "observation"
            ? "今は、観の素材を貯める段階です。書き続けてください。"
            : knkPhase.current_stage === "initial-contour"
              ? "初期の輪郭が立ち上がってきました。"
              : knkPhase.current_stage === "word-pattern"
                ? "言葉の癖の観想が可能になりました。"
                : knkPhase.current_stage === "deeper-observation"
                  ? "より深い観想が可能になりました。ここで観の期を続けてもよいですし、道場1 に進むこともできます。"
                  : null,
      }
    : null;

  // standalone商品モード（§3）: 入力フローはサーバー側で確定して分岐する。
  // クライアントのフラグ読込タイミングに依存しないため、§10 で報告された
  // 「個人ごとに画面が違う」類の表示差がフロー選択には発生しない。
  if (flagMap["standalone_mode"] === true) {
    // standalone 専用の todayLog 構築（2026-06-10 夜・本藤さんフィードバック対応）:
    // 夕②で「今朝の記録」（気分・体調・意図）を完全再掲するため、
    // morningIntent の有無に関わらず todayEntry があれば全フィールドを渡す。
    // （共通ロジックは morningIntent 非空が条件のため、夕のみ記入で complete に
    //   なった日が「完了済み」と判定されない既存挙動もここで補正する。
    //   従来フロー（InputClient/大幸）には触れない）
    let saTodayLog: {
      id: string;
      morningIntent: string;
      status: string;
      morningEnergy: string | null;
      morningCondition: string | null;
    } | null = null;
    let saAlreadyCompleted = initialAlreadyCompleted;
    if (todayEntry) {
      saTodayLog = {
        id: todayEntry.id,
        morningIntent: todayEntry.morningIntent || "",
        status: todayEntry.status,
        morningEnergy: todayEntry.energy ?? null,
        morningCondition: todayEntry.morningCondition ?? null,
      };
      if (todayEntry.status === "complete" || todayEntry.status === "fb_done") {
        saAlreadyCompleted = true;
      }
    }
    // logform v2（朝夕ログ刷新）: standalone の上に重ねるレイヤー。
    const logformV2 = flagMap["logform_v2"] === true;
    // F4 前日ログ: デフォルト非表示のためデータだけ渡す（開示・引き継ぎはクライアント側）。
    // 「昨日」は getTodayJST()（グレースピリオド調整済み）から1日引く。
    let prevDay: PrevDayRecord | null = null;
    if (logformV2) {
      const [py, pm, pd] = today.split("-").map(Number);
      const pdt = new Date(Date.UTC(py, pm - 1, pd));
      pdt.setUTCDate(pdt.getUTCDate() - 1);
      const prevDate = `${pdt.getUTCFullYear()}-${String(pdt.getUTCMonth() + 1).padStart(2, "0")}-${String(pdt.getUTCDate()).padStart(2, "0")}`;
      const prevEntry = logs.find((l) => l.date === prevDate);
      if (prevEntry) {
        prevDay = {
          date: prevDate,
          morningIntent: prevEntry.morningIntent || null,
          morningAction: prevEntry.morningAction ?? null,
          eveningInsight: prevEntry.eveningInsight ?? null,
          eveningState: prevEntry.eveningState ?? null,
          gauges: gaugesToRaws(prevEntry.morningConditionGauges ?? prevEntry.eveningConditionGauges),
        };
      }
    }
    return (
      <StandaloneInputClient
        token={token}
        initialData={{
          participant: {
            name: participant.name,
            dojoPhase: participant.dojoPhase,
            weekNum: calculateWeekNum(participant.startDate || ""),
          },
          todayLog: saTodayLog,
          initialIsMorning,
          initialMorningClosed,
          initialAlreadyCompleted: saAlreadyCompleted,
          logformV2,
          prevDay,
        }}
      />
    );
  }

  // デイリークエスチョン: 機能フラグ ON かつ今日の質問が登録されていれば有効
  const dailyQuestionsFlagOn = flagMap["feature.dailyQuestions"] === true;
  const dailyQuestionsHasData =
    dailyQ != null && ((dailyQ.morning?.length ?? 0) > 0 || (dailyQ.evening?.length ?? 0) > 0);
  const initialDailyQuestions = {
    enabled: dailyQuestionsFlagOn && dailyQuestionsHasData,
    morning: dailyQ?.morning ?? [],
    evening: dailyQ?.evening ?? [],
    axis: dailyQ?.axis ?? "",
    day: getTodayDayKey(),
  };

  const initialData: InputPageInitialData = {
    participant: {
      name: participant.name,
      dojoPhase: participant.dojoPhase,
      weekNum: calculateWeekNum(participant.startDate || ""),
    },
    todayLog: initialTodayLog,
    initialIsMorning,
    initialMorningClosed,
    initialAlreadyCompleted,
    initialFlags: flagMap,
    initialKanNoKiPhase,
    initialDailyQuestions,
  };

  const tDone = Date.now();
  console.log(`[perf] /p/[token]/input total=${tDone - t0}ms (fetch=${tFetched - t0}ms, build=${tDone - tFetched}ms)`);

  return (
    <>
      {/* TEMPORARY diagnostic: capture client-side errors (incl. React
          hydration errors, which only surface via console.error) and forward
          them to the Vercel function log via /api/client-log. Inline so it
          runs during HTML parse — before React hydrates — and can therefore
          observe the very first hydration error. Remove once the blank-screen
          root cause is identified. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var orig=console.error;function send(k,m,s){try{fetch("/api/client-log",{method:"POST",headers:{"Content-Type":"application/json"},keepalive:true,body:JSON.stringify({kind:k,message:String(m||"").slice(0,4000),stack:String(s||"").slice(0,4000),url:location.href})}).catch(function(){})}catch(e){}}console.error=function(){try{var p=[];for(var i=0;i<arguments.length;i++){var a=arguments[i];p.push(a&&a.stack?(a.message+"\\n"+a.stack):(typeof a==="string"?a:(function(){try{return JSON.stringify(a)}catch(e){return String(a)}})()))}var t=p.join(" ");if(/hydrat|did not match|server rendered|reconcil|Minified React error|Switch to client/i.test(t))send("console.error",t)}catch(e){}return orig.apply(console,arguments)};window.addEventListener("error",function(e){send("window.onerror",e.message,e.error&&e.error.stack)});window.addEventListener("unhandledrejection",function(e){var r=e.reason;send("unhandledrejection",r&&r.message?r.message:String(r),r&&r.stack)})}catch(e){}})();`,
        }}
      />
      <InputClient token={token} initialData={initialData} />
    </>
  );
}
