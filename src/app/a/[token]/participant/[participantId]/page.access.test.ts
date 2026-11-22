import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// 管理画面の側の、参加者 1 人のページ（/a/[token]/participant/[氏名]）が、開いた人を確かめてから
// 読むことを確かめる。入れるのは、管理画面に入れる人（管理者・閲覧者）だけ。
// データベースの読み取りはすべて差し替える（合成データ。実在の環境・人物・トークンは使わない）。

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const TENANT_S = "tenant-standalone";

const PARTICIPANT_IN_A = "参加 一郎";
const PARTICIPANT_IN_S = "商品 花子";
const UNKNOWN_NAME = "名簿に 無い人";

const MANAGERS: Record<string, { id: string; name: string; isAdmin: boolean; role: string; tenantId: string }> = {
  "tok-manager-a": { id: "m-a", name: "上司 次郎", isAdmin: false, role: "manager", tenantId: TENANT_A },
  "tok-observer-a": { id: "o-a", name: "閲覧 三郎", isAdmin: false, role: "observer", tenantId: TENANT_A },
  "tok-observer-b": { id: "o-b", name: "閲覧 四郎", isAdmin: false, role: "observer", tenantId: TENANT_B },
  "tok-admin-b": { id: "ad-b", name: "管理 太郎", isAdmin: true, role: "admin", tenantId: TENANT_B },
};
const PARTICIPANTS: Record<string, { id: string; tenantId: string }> = {
  [PARTICIPANT_IN_A]: { id: "p-in-a", tenantId: TENANT_A },
  [PARTICIPANT_IN_S]: { id: "p-in-s", tenantId: TENANT_S },
};

const mocks = vi.hoisted(() => ({
  getManagerByToken: vi.fn(),
  getParticipantByNameCrossTenant: vi.fn(),
  getLogsByParticipant: vi.fn(),
  getMissionsByParticipant: vi.fn(),
  getTenantById: vi.fn(),
  isStandaloneTenant: vi.fn(),
  isFeatureEnabled: vi.fn(),
  resolveEntryQuestionEnv: vi.fn(),
  getCoachingProfile: vi.fn(),
  getCoachActivation: vi.fn(),
  listCoachRepliesForParticipant: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getLogsByParticipant: mocks.getLogsByParticipant,
  getMissionsByParticipant: mocks.getMissionsByParticipant,
  getParticipantByNameCrossTenant: mocks.getParticipantByNameCrossTenant,
  getTenantById: mocks.getTenantById,
}));
vi.mock("@/lib/participant-db", () => ({ getManagerByToken: mocks.getManagerByToken }));
vi.mock("@/lib/standalone", () => ({ isStandaloneTenant: mocks.isStandaloneTenant }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.isFeatureEnabled }));
vi.mock("@/lib/entry-question-env", () => ({ resolveEntryQuestionEnv: mocks.resolveEntryQuestionEnv }));
vi.mock("@/lib/coaching-profile-store", () => ({ getCoachingProfile: mocks.getCoachingProfile }));
vi.mock("@/lib/coach-reply-store", () => ({
  getCoachActivation: mocks.getCoachActivation,
  listCoachRepliesForParticipant: mocks.listCoachRepliesForParticipant,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
// next/link は Next のルーターに依存するので、素の <a> に置き換える（行き先だけを見る）。
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
}));

import AdminParticipantPage from "./page";
import { ADMIN_ISSUE_VIEW_TERMS, composeIssuePurpose, missionTerms } from "@/lib/mission-context";
import { ADMIN_DAY_LOG_TERMS } from "@/lib/admin-day-log";
import { ADMIN_BLUEPRINT_TERMS, COACHING_TERMS } from "@/lib/coaching-profile";
import { COACH_BOARD_TERMS } from "@/lib/coach-reply";
import { combineQuestionAnswers } from "@/lib/daily-question-answers";
import { entryTerms } from "@/lib/entry-terms";

const NOT_FOUND = "NEXT_NOT_FOUND";

function open(token: string, name: string) {
  return AdminParticipantPage({ params: { token, participantId: encodeURIComponent(name) } });
}

function expectNothingRead() {
  expect(mocks.getLogsByParticipant).not.toHaveBeenCalled();
  expect(mocks.getMissionsByParticipant).not.toHaveBeenCalled();
  expect(mocks.isFeatureEnabled).not.toHaveBeenCalled();
  expect(mocks.resolveEntryQuestionEnv).not.toHaveBeenCalled();
  expect(mocks.getCoachingProfile).not.toHaveBeenCalled();
  expect(mocks.getCoachActivation).not.toHaveBeenCalled();
  expect(mocks.listCoachRepliesForParticipant).not.toHaveBeenCalled();
  expect(mocks.getTenantById).not.toHaveBeenCalled();
}

async function html(token: string, name: string): Promise<string> {
  return renderToStaticMarkup((await open(token, name)) as ReactElement);
}

/** 記入 1 件（合成）。 */
function log(over: Record<string, unknown>) {
  return {
    id: "log-1",
    date: "2026-01-15",
    datetime: "2026-01-15T00:10:00Z",
    dayOfWeek: "木",
    dayNum: 15,
    participantName: PARTICIPANT_IN_A,
    morningIntent: "",
    eveningInsight: null,
    energy: null,
    eveningEnergy: null,
    status: "morning_only",
    hasFeedback: false,
    hmFeedback: null,
    managerComment: null,
    managerCommentTime: null,
    managerReaction: null,
    morningTime: null,
    eveningTime: null,
    dojoPhase: "",
    weekNum: 1,
    ...over,
  };
}

const PROFILE = {
  headline: "合成の毎朝の一文",
  growthTheme: "合成の成長課題",
  actions: "合成の行動",
  expected: "",
  stallPoints: "合成の止まりそうな場面",
  eveningQuestion: "合成の夕方の問い",
  tendencies: [{ text: "合成の傾向", use: true }],
  status: "confirmed" as const,
  confirmedAt: "2026-01-10T03:00:00Z",
  updatedAt: "2026-01-10T03:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getManagerByToken.mockImplementation(async (token: string) => MANAGERS[token] ?? null);
  mocks.getParticipantByNameCrossTenant.mockImplementation(async (name: string) =>
    PARTICIPANTS[name] ? { name, id: PARTICIPANTS[name].id, tenantId: PARTICIPANTS[name].tenantId } : null
  );
  mocks.getLogsByParticipant.mockResolvedValue([]);
  mocks.getMissionsByParticipant.mockResolvedValue([]);
  mocks.getTenantById.mockImplementation(async (id: string) => ({ id, name: id, slug: `slug-${id}`, companyName: "" }));
  mocks.isFeatureEnabled.mockResolvedValue(false);
  mocks.resolveEntryQuestionEnv.mockResolvedValue(false);
  mocks.getCoachingProfile.mockResolvedValue({ ok: true, profile: null });
  mocks.getCoachActivation.mockResolvedValue({ ok: true, active: false, reason: "flag_off" });
  mocks.listCoachRepliesForParticipant.mockResolvedValue([]);
  mocks.isStandaloneTenant.mockImplementation(async (tenantId: string) => tenantId === TENANT_S);
  mocks.notFound.mockImplementation(() => {
    throw new Error(NOT_FOUND);
  });
});

describe("/a/[token]/participant/[氏名]：読ませない場合", () => {
  it("どの人のものでもないトークンでは、何も読まずに「見つからない」を返す", async () => {
    await expect(open("made-up-token", PARTICIPANT_IN_A)).rejects.toThrow(NOT_FOUND);
    expect(mocks.getParticipantByNameCrossTenant).not.toHaveBeenCalled();
    expect(mocks.isStandaloneTenant).not.toHaveBeenCalled();
    expectNothingRead();
  });

  it("参加者のトークン（運営のものでない）でも、同じ", async () => {
    await expect(open("tok-of-a-participant", PARTICIPANT_IN_A)).rejects.toThrow(NOT_FOUND);
    expectNothingRead();
  });

  it("上司（管理画面に入れない人）は、同じ環境の参加者でも、このページでは読めない", async () => {
    await expect(open("tok-manager-a", PARTICIPANT_IN_A)).rejects.toThrow(NOT_FOUND);
    expectNothingRead();
  });

  it("ほかの環境の閲覧者は、読めない（設計図・AIコーチの返信も読まない）", async () => {
    mocks.isFeatureEnabled.mockResolvedValue(true);
    mocks.getCoachActivation.mockResolvedValue({ ok: true, active: true, config: {} });
    await expect(open("tok-observer-b", PARTICIPANT_IN_A)).rejects.toThrow(NOT_FOUND);
    expectNothingRead();
  });
});

describe("/a/[token]/participant/[氏名]：読ませる場合", () => {
  it("同じ環境の閲覧者は、参加者の側の環境で、記入・イシューを読む", async () => {
    const page = await open("tok-observer-a", PARTICIPANT_IN_A);
    expect(page).toBeTruthy();
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(mocks.getLogsByParticipant).toHaveBeenCalledWith(PARTICIPANT_IN_A, TENANT_A);
    expect(mocks.getMissionsByParticipant).toHaveBeenCalledWith(PARTICIPANT_IN_A, TENANT_A);
  });

  it("管理者（is_admin）は、ほかの環境の参加者でも、参加者の側の環境で読む", async () => {
    await open("tok-admin-b", PARTICIPANT_IN_A);
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(mocks.getLogsByParticipant).toHaveBeenCalledWith(PARTICIPANT_IN_A, TENANT_A);
    expect(mocks.resolveEntryQuestionEnv).toHaveBeenCalledWith(TENANT_A);
  });

  it("氏名で参加者を引けないときは、開いた人の環境の中だけを読む。設計図と AIコーチの返信は読まない", async () => {
    mocks.isFeatureEnabled.mockResolvedValue(true);
    mocks.getCoachActivation.mockResolvedValue({ ok: true, active: true, config: {} });
    await open("tok-admin-b", UNKNOWN_NAME);
    expect(mocks.getLogsByParticipant).toHaveBeenCalledWith(UNKNOWN_NAME, TENANT_B);
    expect(mocks.getCoachingProfile).not.toHaveBeenCalled();
    expect(mocks.getCoachActivation).not.toHaveBeenCalled();
    expect(mocks.listCoachRepliesForParticipant).not.toHaveBeenCalled();
  });
});

describe("/a/[token]/participant/[氏名]：商品モードの環境", () => {
  it("管理者でも、記入・イシュー・設計図・AIコーチの返信を読まない", async () => {
    mocks.isFeatureEnabled.mockResolvedValue(true);
    const page = await open("tok-admin-b", PARTICIPANT_IN_S);
    expect(page).toBeTruthy();
    expect(mocks.isStandaloneTenant).toHaveBeenCalledWith(TENANT_S);
    expectNothingRead();
  });
});

describe("/a/[token]/participant/[氏名]：イシュー（ミッション）の欄", () => {
  const ISSUE = missionTerms(true);
  const MISSION = missionTerms(false);
  const MISSIONS = [
    {
      id: "m-1",
      title: "合成の問い",
      status: "進行中",
      purpose: composeIssuePurpose("合成の仮説", "合成の目指す状態と行動"),
    },
  ];

  it("イシューの呼び名の環境では、見出しをその呼び名にし、仮説と「目指す状態と、これからの行動」を出す", async () => {
    mocks.getMissionsByParticipant.mockResolvedValue(MISSIONS);
    mocks.isFeatureEnabled.mockImplementation(async (key: string) => key === "feature.missionLabelIssue");
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(mocks.isFeatureEnabled).toHaveBeenCalledWith("feature.missionLabelIssue", TENANT_A);
    expect(out).toContain(ISSUE.pageTitle);
    expect(out).toContain("合成の問い");
    expect(out).toContain("合成の仮説");
    expect(out).toContain(`>${ISSUE.purposeLabel}<`);
    expect(out).toContain("合成の目指す状態と行動");
  });

  it("呼び名のスイッチは、参加者の側の環境で読む（管理者がほかの環境の参加者を開いたとき）", async () => {
    mocks.getMissionsByParticipant.mockResolvedValue(MISSIONS);
    await html("tok-admin-b", PARTICIPANT_IN_A);
    expect(mocks.isFeatureEnabled).toHaveBeenCalledWith("feature.missionLabelIssue", TENANT_A);
    expect(mocks.isFeatureEnabled).not.toHaveBeenCalledWith("feature.missionLabelIssue", TENANT_B);
  });

  it("コメントを読む・書くページ（上司の側の、参加者 1 人のページ）へのリンクを出す", async () => {
    mocks.getMissionsByParticipant.mockResolvedValue(MISSIONS);
    const out = await html("tok-admin-b", PARTICIPANT_IN_A);
    expect(out).toContain(ADMIN_ISSUE_VIEW_TERMS.commentsLink);
    expect(out).toContain(`href="/m/tok-admin-b/${encodeURIComponent(PARTICIPANT_IN_A)}"`);
  });

  it("ミッションの呼び名の環境では、見出しは「ミッション」、文の見出しは「背景・目的」", async () => {
    mocks.getMissionsByParticipant.mockResolvedValue([
      { id: "m-2", title: "合成のミッション", status: "進行中", purpose: "合成の背景と目的" },
    ]);
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(out).toContain(`>${MISSION.pageTitle}<`);
    expect(out).toContain(`>${MISSION.purposeLabel}<`);
    expect(out).toContain("合成の背景と目的");
    expect(out).not.toContain(ISSUE.pageTitle);
  });

  it("1 件も無いときは、欄もリンクも出さない", async () => {
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(out).not.toContain(ADMIN_ISSUE_VIEW_TERMS.commentsLink);
    expect(out).not.toContain(`>${MISSION.pageTitle}<`);
  });

  it("呼び名のスイッチを読めなくても、ページは返し、従来の呼び名で出す", async () => {
    mocks.getMissionsByParticipant.mockResolvedValue(MISSIONS);
    mocks.isFeatureEnabled.mockRejectedValue(new Error("flags down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    errorSpy.mockRestore();
    expect(out).toContain(`>${MISSION.pageTitle}<`);
    expect(out).toContain("合成の問い");
    expect(out).toContain("合成の仮説");
    // 途中で読めなかったことは、ページの先頭に出す
    expect(out).toContain(ADMIN_DAY_LOG_TERMS.pageLoadFailed);
  });
});

describe("/a/[token]/participant/[氏名]：日ごとの記入", () => {
  const QUESTIONS = ["合成の朝の問い"];
  const EVENING_QUESTIONS = ["合成の夕方の問い1", "合成の夕方の問い2"];

  it("問いと答えの形で保存された記入は、問いごとに、問いと答えを分けて出す", async () => {
    mocks.getLogsByParticipant.mockResolvedValue([
      log({
        status: "complete",
        morningIntent: combineQuestionAnswers(QUESTIONS, ["合成の朝の答え"]),
        eveningInsight: combineQuestionAnswers(EVENING_QUESTIONS, ["合成の夕方の答え1", "合成の夕方の答え2"]),
      }),
    ]);
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(out).toContain("1月15日（木）");
    expect(out).toContain("合成の朝の問い");
    expect(out).toContain("合成の朝の答え");
    expect(out).toContain("合成の夕方の問い2");
    expect(out).toContain("合成の夕方の答え2");
    // 保存用の見出し（「A1: 」など）は、画面に出さない
    expect(out).not.toContain("A1: ");
    expect(out).not.toContain("Q1: ");
  });

  it("朝の記入の呼び名は、その環境の呼び名に合わせる（問いを出している環境は「今日の行動」）", async () => {
    mocks.getLogsByParticipant.mockResolvedValue([log({ morningIntent: "合成の自由記入" })]);
    const plain = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(plain).toContain(`>${entryTerms(false).morningEntryName}<`);

    mocks.resolveEntryQuestionEnv.mockResolvedValue(true);
    const questionEnv = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(questionEnv).toContain(`>${entryTerms(true).morningEntryName}<`);
    expect(questionEnv).not.toContain(`>${entryTerms(false).morningEntryName}<`);
  });

  it("HM フィードバックは、このページでは読まない・出さない（管理画面トップの「FB履歴」で読む）", async () => {
    // 読み取りの関数（getFeedbackByParticipant）は、上の差し替えに置いていない。ページが読もうとすれば、ここで落ちる。
    // logs の行にある旧い列（hmFeedback）に値が入っていても、出さない。
    mocks.getLogsByParticipant.mockResolvedValue([
      log({ morningIntent: "合成の自由記入", hmFeedback: "合成の旧い列の文", hasFeedback: true }),
    ]);
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(out).toContain("合成の自由記入");
    expect(out).not.toContain("合成の旧い列の文");
    // 「HMフィードバック」の語が出るのは、読む場所の案内の 1 行だけ（一覧の欄も、日ごとの枠も無い）
    expect(out).toContain(ADMIN_DAY_LOG_TERMS.feedbackNote);
    expect(out.split("HMフィードバック").length - 1).toBe(1);
    expect(out).not.toContain(ADMIN_DAY_LOG_TERMS.pageLoadFailed);
  });

  it("その日の記入に付いた上司コメントは、その日の記入の下に出す", async () => {
    mocks.getLogsByParticipant.mockResolvedValue([
      log({ morningIntent: "合成の自由記入", managerComment: "合成の上司コメント" }),
    ]);
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(out).toContain(ADMIN_DAY_LOG_TERMS.managerCommentLabel);
    expect(out).toContain("合成の上司コメント");
  });

  it("読み取りの途中で失敗したときは、読めた分だけを出し、表示が欠けているかもしれない旨を先頭に出す", async () => {
    mocks.getLogsByParticipant.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    errorSpy.mockRestore();
    expect(out).toContain(ADMIN_DAY_LOG_TERMS.pageLoadFailed);
    // 記入を読めなかったあとは、設計図も AIコーチの返信も読みに行かない
    expect(mocks.getCoachingProfile).not.toHaveBeenCalled();
    expect(mocks.listCoachRepliesForParticipant).not.toHaveBeenCalled();
  });

  it("記入が無いときは、その旨を出す", async () => {
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(out).toContain(ADMIN_DAY_LOG_TERMS.heading);
    expect(out).toContain(ADMIN_DAY_LOG_TERMS.empty);
  });
});

describe("/a/[token]/participant/[氏名]：設計図", () => {
  const flagOn = (on: string[]) => async (key: string) => on.includes(key);

  it("設計図のスイッチが OFF の環境では、読まない・出さない", async () => {
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(mocks.getCoachingProfile).not.toHaveBeenCalled();
    expect(out).not.toContain('data-testid="admin-blueprint"');
  });

  it("ON の環境では、参加者の ID と、参加者の側の環境で読み、閲覧者にも出す", async () => {
    mocks.isFeatureEnabled.mockImplementation(flagOn(["feature.coachingProfile"]));
    mocks.getCoachingProfile.mockResolvedValue({ ok: true, profile: PROFILE });
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(mocks.getCoachingProfile).toHaveBeenCalledWith("p-in-a", TENANT_A);
    expect(out).toContain(COACHING_TERMS.statusConfirmed);
    expect(out).toContain("合成の毎朝の一文");
    expect(out).toContain("合成の成長課題");
    expect(out).toContain("合成の傾向");
  });

  it("管理者がほかの環境の参加者を開いたときも、参加者の側の環境で読む", async () => {
    mocks.isFeatureEnabled.mockImplementation(flagOn(["feature.coachingProfile"]));
    await html("tok-admin-b", PARTICIPANT_IN_A);
    expect(mocks.isFeatureEnabled).toHaveBeenCalledWith("feature.coachingProfile", TENANT_A);
    expect(mocks.getCoachingProfile).toHaveBeenCalledWith("p-in-a", TENANT_A);
  });

  it("確認前の設計図は、確認前と分かる形で出す", async () => {
    mocks.isFeatureEnabled.mockImplementation(flagOn(["feature.coachingProfile"]));
    mocks.getCoachingProfile.mockResolvedValue({ ok: true, profile: { ...PROFILE, status: "draft", confirmedAt: null } });
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(out).toContain(COACHING_TERMS.statusDraft);
    expect(out).toContain(ADMIN_BLUEPRINT_TERMS.draftNote);
  });

  it("まだ無いときと、読めなかったときを、分けて出す", async () => {
    mocks.isFeatureEnabled.mockImplementation(flagOn(["feature.coachingProfile"]));
    const none = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(none).toContain(ADMIN_BLUEPRINT_TERMS.none);
    expect(none).not.toContain(ADMIN_BLUEPRINT_TERMS.loadFailed);

    mocks.getCoachingProfile.mockResolvedValue({ ok: false });
    const failed = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(failed).toContain(ADMIN_BLUEPRINT_TERMS.loadFailed);
    expect(failed).not.toContain(ADMIN_BLUEPRINT_TERMS.none);
  });
});

describe("/a/[token]/participant/[氏名]：AIコーチの返信", () => {
  const LOGS = [log({ status: "complete", morningIntent: "合成の朝", eveningInsight: "合成の夕方" })];
  const REPLY = { id: "r-1", replyDate: "2026-01-15", kind: "daily", content: "合成の返信の文", status: "delivered", createdAt: null };
  // その日の記入の下に出す、返信の枠の見出し（「読めませんでした」の文にも同じ語が入るので、要素の中身で見る）。
  const COACH_BLOCK_LABEL = `>${ADMIN_DAY_LOG_TERMS.coachLabel}<`;

  it("その環境で動いていないときは、読まない・出さない", async () => {
    mocks.getLogsByParticipant.mockResolvedValue(LOGS);
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(mocks.getCoachActivation).toHaveBeenCalledWith(TENANT_A);
    expect(mocks.listCoachRepliesForParticipant).not.toHaveBeenCalled();
    expect(out).not.toContain(COACH_BLOCK_LABEL);
    expect(out).not.toContain(ADMIN_DAY_LOG_TERMS.coachLabel);
  });

  it("動いていない環境では、「読めませんでした」も出さない", async () => {
    mocks.getLogsByParticipant.mockResolvedValue(LOGS);
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(out).not.toContain(ADMIN_DAY_LOG_TERMS.coachLoadFailed);
  });

  it("環境の設定を読めなかったときは、返信を読まず、「読めませんでした」と出す（「返信が無い」と見せない）", async () => {
    mocks.getLogsByParticipant.mockResolvedValue(LOGS);
    mocks.getCoachActivation.mockResolvedValue({ ok: false });
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(mocks.listCoachRepliesForParticipant).not.toHaveBeenCalled();
    expect(out).not.toContain(COACH_BLOCK_LABEL);
    expect(out).toContain(ADMIN_DAY_LOG_TERMS.coachLoadFailed);
  });

  it("返信を読めなかったときも、「読めませんでした」と出す", async () => {
    mocks.getLogsByParticipant.mockResolvedValue(LOGS);
    mocks.getCoachActivation.mockResolvedValue({ ok: true, active: true, config: {} });
    mocks.listCoachRepliesForParticipant.mockResolvedValue(null);
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(out).not.toContain(COACH_BLOCK_LABEL);
    expect(out).toContain(ADMIN_DAY_LOG_TERMS.coachLoadFailed);
    expect(out).toContain("合成の夕方");
  });

  it("動いている環境では、参加者の ID と環境で読み、その日の記入の下に、状態と文を出す", async () => {
    mocks.getLogsByParticipant.mockResolvedValue(LOGS);
    mocks.getCoachActivation.mockResolvedValue({ ok: true, active: true, config: {} });
    mocks.listCoachRepliesForParticipant.mockResolvedValue([REPLY]);
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(mocks.listCoachRepliesForParticipant).toHaveBeenCalledWith("p-in-a", TENANT_A, 200);
    expect(out).toContain(COACH_BLOCK_LABEL);
    expect(out).toContain(COACH_BOARD_TERMS.stateLabels.delivered);
    expect(out).not.toContain(ADMIN_DAY_LOG_TERMS.coachLoadFailed);
    expect(out).toContain("合成の返信の文");
  });

  it("「AIコーチの確認」のページ（その環境・その日）へのリンクを出す", async () => {
    mocks.getLogsByParticipant.mockResolvedValue(LOGS);
    mocks.getCoachActivation.mockResolvedValue({ ok: true, active: true, config: {} });
    mocks.listCoachRepliesForParticipant.mockResolvedValue([REPLY]);
    const out = await html("tok-admin-b", PARTICIPANT_IN_A);
    expect(mocks.getTenantById).toHaveBeenCalledWith(TENANT_A);
    expect(out).toContain(`href="/a/tok-admin-b/coach?tenant=slug-${TENANT_A}&amp;date=2026-01-15"`);
  });

  it("返信を作らなかった記入（確認待ち・文なし）は、「確認が必要」と出す", async () => {
    mocks.getLogsByParticipant.mockResolvedValue(LOGS);
    mocks.getCoachActivation.mockResolvedValue({ ok: true, active: true, config: {} });
    mocks.listCoachRepliesForParticipant.mockResolvedValue([{ ...REPLY, status: "pending_review", content: "" }]);
    const out = await html("tok-observer-a", PARTICIPANT_IN_A);
    expect(out).toContain(COACH_BOARD_TERMS.stateLabels.needs_attention);
  });
});
