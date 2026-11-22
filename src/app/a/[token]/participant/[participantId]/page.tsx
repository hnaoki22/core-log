// Admin — Individual Participant Log View
// 管理画面の、参加者 1 人のページ（読むだけ）。その人の設計図・イシュー・日ごとの記入を、1 か所で読む。
// - 記入は、1 日＝1 枚（AdminDayLogList）。その日の AIコーチの返信と上司コメントを、その日の記入の下に並べる。
// - HM フィードバックは、このページでは読まない・出さない（管理画面トップの「FB履歴」で読む。
//   HM フィードバックは、日ではなく、人と期間に付けて feedback 表に保存している）。
// - 設計図（AdminBlueprintCard）と AIコーチの返信を読めるのは、記入を読める人と同じ範囲
//   （このページを開ける人＝管理者と、その環境の閲覧者。2026-11-23 の決定）。

import Link from "next/link";
import { notFound } from "next/navigation";
import { getLogsByParticipant, getMissionsByParticipant, getParticipantByNameCrossTenant, getTenantById, NotionLogEntry } from "@/lib/supabase";
import { getManagerByToken } from "@/lib/participant-db";
import { decideStaffParticipantView, managerParticipantPagePath } from "@/lib/staff-page-access";
import { isStandaloneTenant } from "@/lib/standalone";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { missionTerms } from "@/lib/mission-context";
import { formatTimeJST } from "@/lib/date-utils";
import { hasMorning, hasEvening, getDayStatus, computeParticipantStats } from "@/lib/stats";
import { entryTerms } from "@/lib/entry-terms";
import { resolveEntryQuestionEnv } from "@/lib/entry-question-env";
import { getCoachingProfile } from "@/lib/coaching-profile-store";
import type { CoachingProfile } from "@/lib/coaching-profile";
import { getCoachActivation, listCoachRepliesForParticipant } from "@/lib/coach-reply-store";
import type { CoachReply } from "@/lib/coach-reply";
import { ADMIN_DAY_LOG_TERMS, buildAdminDayLogViews } from "@/lib/admin-day-log";
import { AdminIssueList } from "@/components/admin/AdminIssueList";
import { AdminBlueprintCard } from "@/components/admin/AdminBlueprintCard";
import { AdminDayLogList } from "@/components/admin/AdminDayLogList";

/** 1 人の返信を読む件数の上限（新しい順）。記入の一覧に結ぶだけなので、古い分は出なくてよい。 */
const COACH_REPLY_READ_LIMIT = 200;

type Params = {
  params: {
    token: string;
    participantId: string;
  };
};

export default async function AdminParticipantPage({ params }: Params) {
  const { token, participantId } = params;
  const participantName = decodeURIComponent(participantId);

  // 読む前に、開いた人（URL のトークン）を確かめる。決まりは src/lib/staff-page-access.ts。
  // ここを通るまで、記入・イシュー・設計図・AIコーチの返信を読まない。notFound() は、下の try の中で
  // 呼ばない（catch に入って、確かめないまま先へ進んでしまう）。
  const viewer = await getManagerByToken(token);
  if (!viewer) notFound();
  // Admin views participants across tenants, so we must resolve
  // the participant's own tenantId — not the admin's tenantId.
  // When the lookup fails, only the viewer's own tenant is read.
  const participant = await getParticipantByNameCrossTenant(participantName);
  const access = decideStaffParticipantView({
    surface: "admin",
    viewer,
    participantTenantId: participant?.tenantId ?? null,
  });
  if (!access.ok) notFound();
  const tenantId = access.tenantId;

  let logs: NotionLogEntry[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let missions: any[] = [];
  // イシュー（ミッション）の欄の呼び名。参加者の側の環境のスイッチで決める。読めないときは、従来の呼び名。
  let useIssueLabel = false;
  // 朝・夕の記入の呼び名。「朝・夕の問い」を出している環境かどうかで決める。読めないときは、従来の呼び名。
  let questionEnv = false;
  // 設計図。null = 欄を出さない（スイッチが OFF、または、参加者を特定できなかった）。
  // 読めなかったときは loadFailed（「まだ無い」と見せない）。
  let blueprint: { profile: CoachingProfile | null; loadFailed: boolean } | null = null;
  // AIコーチの返信。その環境で動いているときだけ読む（動いていない環境では、読まない・出さない）。
  let coachReplies: CoachReply[] | null = null;
  // 動いているかどうか、または、返信そのものを読めなかったとき true（「返信が無い」と見せず、その旨を出す）。
  let coachLoadFailed = false;
  // 「AIコーチの確認」のページへのリンクに使う、環境の slug。分からないときは、リンクを出さない。
  let tenantSlug: string | null = null;
  // 下の読み取りの途中で例外が出たとき true（読めた分だけを出し、表示が欠けているかもしれない旨を出す）。
  let loadFailed = false;

  try {
    // standalone §7-1: 管理者の個別ログ閲覧ページもサーバー側で遮断
    if (await isStandaloneTenant(tenantId)) {
      return (
        <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
          <div className="max-w-md mx-auto text-center">
            <h2 className="text-lg font-semibold text-[#1A1A2E] mb-2">このログは本人と装置だけが見ます</h2>
            <p className="text-sm text-[#5B5560] mb-6 leading-relaxed">
              このテナントは standalone モードで運用されています。
              ログの本文はマネージャー・管理者には表示されません。
            </p>
            <Link href={`/a/${token}`} className="text-[#1A1A2E] font-medium text-sm hover:underline">
              ダッシュボードに戻る
            </Link>
          </div>
        </div>
      );
    }

    const [fetchedLogs, fetchedMissions] = await Promise.all([
      getLogsByParticipant(participantName, tenantId),
      getMissionsByParticipant(participantName, tenantId),
    ]);
    logs = fetchedLogs;
    missions = fetchedMissions;
    useIssueLabel = await isFeatureEnabled("feature.missionLabelIssue", tenantId);
    questionEnv = await resolveEntryQuestionEnv(tenantId);

    // 設計図と AIコーチの返信は、参加者の ID で読む。参加者を特定できて、その人の環境が、
    // ここで読む環境（tenantId）と同じときだけ読む（読み取りも、環境と参加者の両方で絞っている）。
    const participantId = participant?.id && participant.tenantId === tenantId ? participant.id : null;
    if (participantId) {
      if (await isFeatureEnabled("feature.coachingProfile", tenantId)) {
        const read = await getCoachingProfile(participantId, tenantId);
        blueprint = read.ok ? { profile: read.profile, loadFailed: false } : { profile: null, loadFailed: true };
      }
      const activation = await getCoachActivation(tenantId);
      if (!activation.ok) {
        // スイッチは ON だが、環境の設定を読めなかった（動いているかどうかが分からない）。返信は読まない。
        coachLoadFailed = true;
      } else if (activation.active) {
        const replies = await listCoachRepliesForParticipant(participantId, tenantId, COACH_REPLY_READ_LIMIT);
        if (replies === null) coachLoadFailed = true;
        else coachReplies = replies;
        tenantSlug = (await getTenantById(tenantId))?.slug ?? null;
      }
    }
  } catch (e) {
    console.error("Failed to fetch data:", e);
    loadFailed = true;
  }

  const issueTerms = missionTerms(useIssueLabel);
  const entryNames = entryTerms(questionEnv);
  const dayViews = buildAdminDayLogViews(
    logs.map((entry: NotionLogEntry) => ({
      id: entry.id,
      date: entry.date,
      dayOfWeek: entry.dayOfWeek,
      status: getDayStatus(entry),
      energy: entry.energy,
      morningIntent: entry.morningIntent,
      eveningInsight: entry.eveningInsight,
      morningTime: entry.morningTime,
      eveningTime: entry.eveningTime,
      managerComment: entry.managerComment,
    })),
    coachReplies
  );
  const coachBoardHref = tenantSlug
    ? (date: string) =>
        `/a/${encodeURIComponent(token)}/coach?tenant=${encodeURIComponent(tenantSlug as string)}&date=${encodeURIComponent(date)}`
    : null;

  // Stats — use the same completion logic as the dashboard
  const todayJST = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const stats = computeParticipantStats(logs, todayJST);
  const logsWithMorning = logs.filter((l) => hasMorning(l)).length;
  const logsWithEvening = logs.filter((l) => hasEvening(l)).length;

  return (
    <div className="min-h-screen bg-[#F5F0EB]">
      {/* Header — admin style */}
      <header className="gradient-header-admin text-white px-5 pt-12 pb-6">
        <div className="max-w-2xl mx-auto relative z-10">
          <Link
            href={`/a/${token}`}
            className="inline-flex items-center gap-1 text-[#C9BDAE] hover:text-white text-sm mb-3 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            管理者ダッシュボードに戻る
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">{participantName}</h1>
          <p className="text-xs text-[#C9BDAE] mt-1">個人ログ詳細</p>
        </div>
      </header>

      <main className="px-5 py-5 space-y-5 max-w-2xl mx-auto animate-fade-up">
        {/* 読み取りの途中で失敗したとき：読めた分だけを出しているので、その旨を先頭に出す */}
        {loadFailed && (
          <p
            className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 leading-relaxed"
            role="status"
            data-testid="admin-participant-load-failed"
          >
            {ADMIN_DAY_LOG_TERMS.pageLoadFailed}
          </p>
        )}

        {/* Summary Stats */}
        <section className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFE8DD]">
            <h2 className="text-xs font-semibold text-[#5B5560] tracking-wide uppercase">
              サマリー
            </h2>
          </div>
          <div className="grid grid-cols-4 divide-x divide-[#EFE8DD]">
            <div className="p-4 text-center">
              <div className="text-2xl font-bold text-[#1A1A2E]">{stats.completeDays}</div>
              <div className="text-[10px] text-[#8B8489] mt-1">完了日数</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-2xl font-bold text-[#1A1A2E]">{logsWithMorning}</div>
              <div className="text-[10px] text-[#8B8489] mt-1">朝</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-2xl font-bold text-[#1A1A2E]">{logsWithEvening}</div>
              <div className="text-[10px] text-[#8B8489] mt-1">夕</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-2xl font-bold text-[#1A1A2E]">{stats.completionRate}%</div>
              <div className="text-[10px] text-[#8B8489] mt-1">完了率</div>
            </div>
          </div>
        </section>

        {/* 設計図（feature.coachingProfile の環境だけ）。読めるのは、このページを開ける人（記入と同じ範囲） */}
        {blueprint && <AdminBlueprintCard profile={blueprint.profile} loadFailed={blueprint.loadFailed} />}

        {/* イシュー（ミッション）：題・状態・背景と目的（仮説）。コメントは、リンク先のページで読む・書く */}
        <AdminIssueList
          missions={missions}
          heading={issueTerms.pageTitle}
          purposeLabel={issueTerms.purposeLabel}
          commentsHref={managerParticipantPagePath(token, participantName)}
        />

        {/* 日ごとの記入：1 日＝1 枚。その日の AIコーチの返信・上司コメントを、その日の下に並べる。
            HM フィードバックは、ここには出さない（管理画面トップの「FB履歴」で読む） */}
        <AdminDayLogList
          days={dayViews}
          morningLabel={entryNames.morningEntryName}
          eveningLabel={entryNames.eveningEntryName}
          formatTime={formatTimeJST}
          coachBoardHref={coachBoardHref}
          coachLoadFailed={coachLoadFailed}
        />
      </main>
    </div>
  );
}
