import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// PATCH /api/mission の「文を直す」処理を確かめる。
// - イシューの呼び名の環境（feature.missionLabelIssue）では、直す前の文を残してから直す。本人も直せる。
// - それ以外の環境では、これまでと同じ（上司・運営の画面からだけ直せる。履歴は残さない）。
// データベースの読み書きはすべて差し替える（合成データ。実在の環境・人物・トークンは使わない）。

const TENANT = "tenant-issue";
const OTHER_TENANT = "tenant-other";
const MISSION_ID = "00000000-0000-4000-8000-0000000000aa";

const ME = { id: "p-me", token: "tok-me", name: "参加 一郎", tenantId: TENANT };
// 同じ環境にいる、同じ氏名の別の人（氏名の一致だけで本人と見なさないことを確かめる）。
const NAMESAKE = { id: "p-namesake", token: "tok-namesake", name: "参加 一郎", tenantId: TENANT };
const STRANGER = { id: "p-stranger", token: "tok-stranger", name: "参加 二郎", tenantId: TENANT };
const MANAGER = { id: "m-1", token: "tok-manager", name: "上司 次郎", isAdmin: false, tenantId: TENANT };
const OUTSIDE_MANAGER = { id: "m-2", token: "tok-outside", name: "上司 三郎", isAdmin: false, tenantId: OTHER_TENANT };

const PARTICIPANTS: Record<string, typeof ME> = {
  [ME.token]: ME,
  [NAMESAKE.token]: NAMESAKE,
  [STRANGER.token]: STRANGER,
};
const MANAGERS: Record<string, typeof MANAGER> = {
  [MANAGER.token]: MANAGER,
  [OUTSIDE_MANAGER.token]: OUTSIDE_MANAGER,
};

const BEFORE_PURPOSE = "【仮説】\nこうなっているはず\n\n【目指す状態と、これからの行動】\n来週までに確かめる";
const AFTER_PURPOSE = "【仮説】\nこうなっているはずだ\n\n【目指す状態と、これからの行動】\n来週までに確かめる";

const mocks = vi.hoisted(() => ({
  getMissionById: vi.fn(),
  updateMissionFields: vi.fn(),
  updateMissionStatus: vi.fn(),
  isFeatureEnabled: vi.fn(),
  getMissionEditTarget: vi.fn(),
  insertMissionEdit: vi.fn(),
  deleteMissionEdit: vi.fn(),
  order: [] as string[],
}));

vi.mock("@/lib/supabase", () => ({
  createMission: vi.fn(),
  updateMissionStatus: mocks.updateMissionStatus,
  updateMissionFields: mocks.updateMissionFields,
  getMissionsByParticipant: vi.fn(async () => []),
  getMissionById: mocks.getMissionById,
  getParticipantByNameCrossTenant: vi.fn(async () => null),
}));
vi.mock("@/lib/participant-db", () => ({
  getManagerByToken: vi.fn(async (token: string) => MANAGERS[token] ?? null),
  getParticipantByToken: vi.fn(async (token: string) => PARTICIPANTS[token] ?? null),
  getParticipantByName: vi.fn(async () => null),
}));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.isFeatureEnabled }));
vi.mock("@/lib/mission-edit-store", () => ({
  getMissionEditTarget: mocks.getMissionEditTarget,
  insertMissionEdit: mocks.insertMissionEdit,
  deleteMissionEdit: mocks.deleteMissionEdit,
}));
vi.mock("@/lib/email", () => ({ sendNotificationEmail: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { PATCH } from "./route";

function patch(body: Record<string, unknown>) {
  return PATCH(
    new NextRequest("http://localhost/api/mission", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

function setFlag(on: boolean) {
  mocks.isFeatureEnabled.mockImplementation(async (key: string, tenantId: string) => {
    return on && key === "feature.missionLabelIssue" && tenantId === TENANT;
  });
}

function setMission(over: { status?: string; participantId?: string; participantName?: string } = {}) {
  mocks.getMissionById.mockResolvedValue({
    id: MISSION_ID,
    tenantId: TENANT,
    title: "だれの、どんな問題を解くのか",
    participantName: over.participantName ?? ME.name,
    setDate: "2026-11-22",
    deadline: "2026-12-17",
    status: over.status ?? "進行中",
    purpose: BEFORE_PURPOSE,
    reviewMemo: null,
    finalReview: null,
    createdBy: "自己設定",
  });
  mocks.getMissionEditTarget.mockResolvedValue({
    ok: true,
    row: {
      id: MISSION_ID,
      tenantId: TENANT,
      participantId: over.participantId ?? ME.id,
      status: over.status ?? "進行中",
      title: "だれの、どんな問題を解くのか",
      purpose: BEFORE_PURPOSE,
      deadline: "2026-12-17",
    },
  });
}

const EDIT_BODY = {
  missionId: MISSION_ID,
  title: "だれの、どんな問題を解くのか",
  purpose: AFTER_PURPOSE,
  deadline: "2026-12-17",
};

function expectNoWrites() {
  expect(mocks.insertMissionEdit).not.toHaveBeenCalled();
  expect(mocks.updateMissionFields).not.toHaveBeenCalled();
  expect(mocks.deleteMissionEdit).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.length = 0;
  setFlag(true);
  setMission();
  mocks.insertMissionEdit.mockImplementation(async () => {
    mocks.order.push("history");
    return { ok: true, id: "edit-1" };
  });
  mocks.updateMissionFields.mockImplementation(async () => {
    mocks.order.push("update");
    return true;
  });
  mocks.deleteMissionEdit.mockResolvedValue(true);
  mocks.updateMissionStatus.mockResolvedValue(true);
});

describe("PATCH /api/mission：本人が、自分のイシューの文を直す（イシューの呼び名の環境）", () => {
  it("直す前の文を残してから、直す", async () => {
    const res = await patch({ token: ME.token, ...EDIT_BODY });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      changed: true,
      mission: { title: "だれの、どんな問題を解くのか", purpose: AFTER_PURPOSE, deadline: "2026-12-17" },
    });

    // 履歴に残すのは、いま表に入っている文（直す前の文）。持ち主と、だれが直したかも残す。
    expect(mocks.insertMissionEdit).toHaveBeenCalledTimes(1);
    expect(mocks.insertMissionEdit).toHaveBeenCalledWith({
      tenantId: TENANT,
      missionId: MISSION_ID,
      participantId: ME.id,
      editedBy: "participant",
      before: { title: "だれの、どんな問題を解くのか", purpose: BEFORE_PURPOSE, deadline: "2026-12-17" },
    });
    expect(mocks.updateMissionFields).toHaveBeenCalledWith(
      MISSION_ID,
      { title: "だれの、どんな問題を解くのか", purpose: AFTER_PURPOSE, deadline: "2026-12-17" },
      TENANT
    );
    // 順序：履歴が先、更新があと。
    expect(mocks.order).toEqual(["history", "update"]);
  });

  it("中身が変わっていないときは、何も書かない（履歴を増やさない）", async () => {
    const res = await patch({ token: ME.token, ...EDIT_BODY, purpose: `${BEFORE_PURPOSE}\n` });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, changed: false });
    expectNoWrites();
  });

  it("同じ氏名の別の人には、直させない（持ち主の ID で確かめる）", async () => {
    const res = await patch({ token: NAMESAKE.token, ...EDIT_BODY });
    expect(res.status).toBe(403);
    expectNoWrites();
  });

  it("ほかの人のイシューは、直させない", async () => {
    const res = await patch({ token: STRANGER.token, ...EDIT_BODY });
    expect(res.status).toBe(403);
    expectNoWrites();
  });

  it("閉じたイシューは、本人の画面からは直させない", async () => {
    setMission({ status: "完了" });
    const res = await patch({ token: ME.token, ...EDIT_BODY });
    expect(res.status).toBe(409);
    expectNoWrites();
  });

  it("問いが空のとき、期限が日付でないときは、受け付けない", async () => {
    expect((await patch({ token: ME.token, ...EDIT_BODY, title: "   " })).status).toBe(400);
    expect((await patch({ token: ME.token, ...EDIT_BODY, deadline: "12/17" })).status).toBe(400);
    expectNoWrites();
  });

  it("履歴を残せなかったときは、直さない", async () => {
    mocks.insertMissionEdit.mockResolvedValue({ ok: false });
    const res = await patch({ token: ME.token, ...EDIT_BODY });
    expect(res.status).toBe(500);
    expect(mocks.updateMissionFields).not.toHaveBeenCalled();
  });

  it("更新に失敗したときは、残した履歴を取り消す", async () => {
    mocks.updateMissionFields.mockResolvedValue(false);
    const res = await patch({ token: ME.token, ...EDIT_BODY });
    expect(res.status).toBe(500);
    expect(mocks.deleteMissionEdit).toHaveBeenCalledWith("edit-1", TENANT);
  });

  it("いまの値を読めなかったときは 500、その環境にイシューが無いときは 404", async () => {
    mocks.getMissionEditTarget.mockResolvedValue({ ok: false });
    expect((await patch({ token: ME.token, ...EDIT_BODY })).status).toBe(500);
    mocks.getMissionEditTarget.mockResolvedValue({ ok: true, row: null });
    expect((await patch({ token: ME.token, ...EDIT_BODY })).status).toBe(404);
    expectNoWrites();
  });

  it("画面から届いた文は、無害化してから比べて、保存する", async () => {
    const res = await patch({ token: ME.token, ...EDIT_BODY, title: "<b>だれの</b>、どんな問題を解くのか？" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mission.title).toBe("だれの、どんな問題を解くのか？");
    expect(mocks.updateMissionFields.mock.calls[0][1].title).toBe("だれの、どんな問題を解くのか？");
  });
});

describe("PATCH /api/mission：イシューの呼び名でない環境（これまでと同じ動き）", () => {
  beforeEach(() => setFlag(false));

  it("本人には、文を直させない", async () => {
    const res = await patch({ token: ME.token, ...EDIT_BODY });
    expect(res.status).toBe(403);
    expect(mocks.getMissionEditTarget).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("上司・運営の画面からは、これまでと同じ形で直す（履歴は残さない）", async () => {
    const res = await patch({ token: MANAGER.token, ...EDIT_BODY, title: "  題を直す  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mocks.updateMissionFields).toHaveBeenCalledTimes(1);
    expect(mocks.updateMissionFields).toHaveBeenCalledWith(
      MISSION_ID,
      { title: "題を直す", purpose: AFTER_PURPOSE, deadline: "2026-12-17" },
      TENANT
    );
    expect(mocks.getMissionEditTarget).not.toHaveBeenCalled();
    expect(mocks.insertMissionEdit).not.toHaveBeenCalled();
  });

  it("上司・運営の画面からの更新が失敗したら、これまでと同じく 500", async () => {
    mocks.updateMissionFields.mockResolvedValue(false);
    const res = await patch({ token: MANAGER.token, ...EDIT_BODY });
    expect(res.status).toBe(500);
    expect(mocks.insertMissionEdit).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/mission：上司・運営の画面から直す（イシューの呼び名の環境）", () => {
  it("直す前の文を残す。だれが直したかは「運営」として残す", async () => {
    const res = await patch({ token: MANAGER.token, ...EDIT_BODY });
    expect(res.status).toBe(200);
    expect(mocks.insertMissionEdit).toHaveBeenCalledWith(
      expect.objectContaining({ editedBy: "manager", participantId: ME.id, tenantId: TENANT })
    );
    expect(mocks.order).toEqual(["history", "update"]);
  });

  it("閉じたイシューも、これまでどおり直せる", async () => {
    setMission({ status: "完了" });
    const res = await patch({ token: MANAGER.token, ...EDIT_BODY });
    expect(res.status).toBe(200);
    expect(mocks.updateMissionFields).toHaveBeenCalledTimes(1);
  });

  it("ほかの環境の上司には、直させない（これまでと同じ）", async () => {
    const res = await patch({ token: OUTSIDE_MANAGER.token, ...EDIT_BODY });
    expect(res.status).toBe(403);
    expect(mocks.isFeatureEnabled).not.toHaveBeenCalled();
    expectNoWrites();
  });
});

describe("PATCH /api/mission：変えていない処理", () => {
  it("状態の変更（閉じる）は、これまでと同じ。スイッチも履歴も見ない", async () => {
    const res = await patch({ token: ME.token, missionId: MISSION_ID, status: "完了", finalReview: "見直した" });
    expect(res.status).toBe(200);
    expect(mocks.updateMissionStatus).toHaveBeenCalledWith(MISSION_ID, "完了", "見直した", TENANT);
    expect(mocks.isFeatureEnabled).not.toHaveBeenCalled();
    expect(mocks.getMissionEditTarget).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("知らないトークンは 403、無いイシューは 404", async () => {
    expect((await patch({ token: "tok-unknown", ...EDIT_BODY })).status).toBe(403);
    mocks.getMissionById.mockResolvedValue(null);
    expect((await patch({ token: ME.token, ...EDIT_BODY })).status).toBe(404);
    expectNoWrites();
  });
});
