import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// イシュー（ミッション）のコメントの入口が、だれに何を許すかを確かめる。
// - 参加者：自分のイシューだけ／上司・閲覧者：自分の環境だけ／管理者（is_admin）：どの環境でも。
// データベースの読み書きはすべて差し替える（合成データ。実在の環境・人物・トークンは使わない）。

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const MISSION_ID = "mission-in-a";

const OWNER = { id: "p-1", token: "tok-owner", name: "参加 一郎", tenantId: TENANT_A, managerId: "" };
const OTHER_PARTICIPANT = { id: "p-2", token: "tok-other", name: "参加 二郎", tenantId: TENANT_A, managerId: "" };
const MANAGER_A = { id: "m-a", token: "tok-manager-a", name: "上司 次郎", isAdmin: false, tenantId: TENANT_A };
const MANAGER_B = { id: "m-b", token: "tok-manager-b", name: "上司 三郎", isAdmin: false, tenantId: TENANT_B };
// ほかの環境に所属する管理者（管理者は、ほかの環境の参加者の画面を開ける）。
const ADMIN_B = { id: "m-admin", token: "tok-admin-b", name: "管理 太郎", isAdmin: true, tenantId: TENANT_B };

const PARTICIPANTS: Record<string, typeof OWNER> = {
  [OWNER.token]: OWNER,
  [OTHER_PARTICIPANT.token]: OTHER_PARTICIPANT,
};
const MANAGERS: Record<string, typeof MANAGER_A> = {
  [MANAGER_A.token]: MANAGER_A,
  [MANAGER_B.token]: MANAGER_B,
  [ADMIN_B.token]: ADMIN_B,
};

const mocks = vi.hoisted(() => ({
  getMissionById: vi.fn(),
  getMissionComments: vi.fn(),
  addMissionComment: vi.fn(),
  updateMissionComment: vi.fn(),
  deleteMissionComment: vi.fn(),
  getMissionCommentMeta: vi.fn(),
  getParticipantByName: vi.fn(),
  sendNotificationEmail: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  addMissionComment: mocks.addMissionComment,
  getMissionComments: mocks.getMissionComments,
  getMissionById: mocks.getMissionById,
  getMissionCommentMeta: mocks.getMissionCommentMeta,
  updateMissionComment: mocks.updateMissionComment,
  deleteMissionComment: mocks.deleteMissionComment,
}));
vi.mock("@/lib/participant-db", () => ({
  getManagerByToken: vi.fn(async (token: string) => MANAGERS[token] ?? null),
  getParticipantByToken: vi.fn(async (token: string) => PARTICIPANTS[token] ?? null),
  getParticipantByName: mocks.getParticipantByName,
  getManagerById: vi.fn(async () => null),
}));
vi.mock("@/lib/email", () => ({ sendNotificationEmail: mocks.sendNotificationEmail }));

import { DELETE, GET, PATCH, POST } from "./route";

const COMMENTS = [{ id: "c1", authorName: OWNER.name, authorRole: "participant", body: "合成のコメント", createdAt: "2026-11-22T01:00:00+00:00" }];

function get(query: string) {
  return GET(new NextRequest(`http://localhost/api/mission/comments${query}`));
}
function send(handler: (req: NextRequest) => Promise<Response>, method: string, body: Record<string, unknown>) {
  return handler(
    new NextRequest("http://localhost/api/mission/comments", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMissionById.mockResolvedValue({
    id: MISSION_ID,
    tenantId: TENANT_A,
    title: "合成の問い",
    participantName: OWNER.name,
    setDate: "2026-11-22",
    deadline: "",
    status: "進行中",
    purpose: null,
    reviewMemo: null,
    finalReview: null,
    createdBy: "自己設定",
  });
  mocks.getMissionComments.mockResolvedValue(COMMENTS);
  mocks.addMissionComment.mockResolvedValue(true);
  mocks.updateMissionComment.mockResolvedValue(true);
  mocks.deleteMissionComment.mockResolvedValue(true);
  mocks.getMissionCommentMeta.mockResolvedValue({
    missionId: MISSION_ID,
    tenantId: TENANT_A,
    authorName: ADMIN_B.name,
    authorRole: "manager",
  });
  mocks.getParticipantByName.mockResolvedValue(null);
});

describe("GET /api/mission/comments（コメントを読む）", () => {
  it("トークンが無いと 401（画面は、必ずトークンを付けて呼ぶ）", async () => {
    const res = await get(`?missionId=${MISSION_ID}`);
    expect(res.status).toBe(401);
    expect(mocks.getMissionComments).not.toHaveBeenCalled();
  });

  it("イシューの ID が無いと 400、知らないトークンは 401", async () => {
    expect((await get(`?token=${OWNER.token}`)).status).toBe(400);
    expect((await get(`?missionId=${MISSION_ID}&token=tok-unknown`)).status).toBe(401);
  });

  it("本人は、自分のイシューのコメントを読める", async () => {
    const res = await get(`?missionId=${MISSION_ID}&token=${OWNER.token}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ comments: COMMENTS });
  });

  it("ほかの参加者は、読めない", async () => {
    const res = await get(`?missionId=${MISSION_ID}&token=${OTHER_PARTICIPANT.token}`);
    expect(res.status).toBe(403);
    expect(mocks.getMissionComments).not.toHaveBeenCalled();
  });

  it("同じ環境の上司は読める。ほかの環境の上司は読めない", async () => {
    expect((await get(`?missionId=${MISSION_ID}&token=${MANAGER_A.token}`)).status).toBe(200);
    const res = await get(`?missionId=${MISSION_ID}&token=${MANAGER_B.token}`);
    expect(res.status).toBe(404);
    expect(mocks.getMissionComments).toHaveBeenCalledTimes(1);
  });

  it("管理者は、ほかの環境のイシューのコメントも読める", async () => {
    const res = await get(`?missionId=${MISSION_ID}&token=${ADMIN_B.token}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ comments: COMMENTS });
  });

  it("無いイシューは 404（管理者でも）", async () => {
    mocks.getMissionById.mockResolvedValue(null);
    expect((await get(`?missionId=no-such&token=${ADMIN_B.token}`)).status).toBe(404);
  });
});

describe("POST /api/mission/comments（コメントを書く）", () => {
  const body = { missionId: MISSION_ID, comment: "合成のコメント" };

  it("本人は、自分のイシューに書ける（自分の環境で書く）", async () => {
    const res = await send(POST, "POST", { token: OWNER.token, ...body });
    expect(res.status).toBe(200);
    expect(mocks.addMissionComment).toHaveBeenCalledWith(MISSION_ID, OWNER.name, "participant", "合成のコメント", TENANT_A);
  });

  it("ほかの参加者は、書けない", async () => {
    const res = await send(POST, "POST", { token: OTHER_PARTICIPANT.token, ...body });
    expect(res.status).toBe(403);
    expect(mocks.addMissionComment).not.toHaveBeenCalled();
  });

  it("ほかの環境の上司は、書けない", async () => {
    const res = await send(POST, "POST", { token: MANAGER_B.token, ...body });
    expect(res.status).toBe(404);
    expect(mocks.addMissionComment).not.toHaveBeenCalled();
  });

  it("管理者は、ほかの環境のイシューにも書ける。書く先と通知の宛先は、イシューの側の環境で引く", async () => {
    mocks.getParticipantByName.mockResolvedValue({ ...OWNER, email: "owner@mail.invalid" });
    const res = await send(POST, "POST", { token: ADMIN_B.token, ...body });
    expect(res.status).toBe(200);
    // 管理者の所属する環境（TENANT_B）ではなく、イシューの環境（TENANT_A）。
    expect(mocks.addMissionComment).toHaveBeenCalledWith(MISSION_ID, ADMIN_B.name, "manager", "合成のコメント", TENANT_A);
    expect(mocks.getParticipantByName).toHaveBeenCalledWith(OWNER.name, TENANT_A);
    expect(mocks.sendNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner@mail.invalid", type: "mission_comment", senderName: ADMIN_B.name })
    );
  });

  it("同じ環境の上司が書くと、これまでどおり、本人に通知する", async () => {
    mocks.getParticipantByName.mockResolvedValue({ ...OWNER, email: "owner@mail.invalid" });
    const res = await send(POST, "POST", { token: MANAGER_A.token, ...body });
    expect(res.status).toBe(200);
    expect(mocks.addMissionComment).toHaveBeenCalledWith(MISSION_ID, MANAGER_A.name, "manager", "合成のコメント", TENANT_A);
    expect(mocks.sendNotificationEmail).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH・DELETE /api/mission/comments（自分のコメントを直す・消す）", () => {
  it("上司・参加者は、これまでどおり、自分の環境の中で扱う（コメントの環境は引かない）", async () => {
    await send(PATCH, "PATCH", { token: MANAGER_A.token, commentId: "c1", body: " 直した文 " });
    expect(mocks.updateMissionComment).toHaveBeenCalledWith("c1", "直した文", TENANT_A, MANAGER_A.name);
    await send(DELETE, "DELETE", { token: OWNER.token, commentId: "c1" });
    expect(mocks.deleteMissionComment).toHaveBeenCalledWith("c1", TENANT_A, OWNER.name);
    expect(mocks.getMissionCommentMeta).not.toHaveBeenCalled();
  });

  it("ほかの環境の上司は、自分の環境として扱われるので、何も変えられない（共通処理が断る）", async () => {
    mocks.updateMissionComment.mockResolvedValue(false);
    const res = await send(PATCH, "PATCH", { token: MANAGER_B.token, commentId: "c1", body: "直した文" });
    expect(res.status).toBe(403);
    expect(mocks.updateMissionComment).toHaveBeenCalledWith("c1", "直した文", TENANT_B, MANAGER_B.name);
  });

  it("管理者は、ほかの環境のイシューに書いた自分のコメントを、コメントの側の環境で直す・消す", async () => {
    await send(PATCH, "PATCH", { token: ADMIN_B.token, commentId: "c1", body: "直した文" });
    expect(mocks.updateMissionComment).toHaveBeenCalledWith("c1", "直した文", TENANT_A, ADMIN_B.name);
    await send(DELETE, "DELETE", { token: ADMIN_B.token, commentId: "c1" });
    expect(mocks.deleteMissionComment).toHaveBeenCalledWith("c1", TENANT_A, ADMIN_B.name);
  });

  it("管理者でも、コメントが見つからないときは、自分の環境のまま渡す（共通処理が断る）", async () => {
    mocks.getMissionCommentMeta.mockResolvedValue(null);
    mocks.deleteMissionComment.mockResolvedValue(false);
    const res = await send(DELETE, "DELETE", { token: ADMIN_B.token, commentId: "no-such" });
    expect(res.status).toBe(403);
    expect(mocks.deleteMissionComment).toHaveBeenCalledWith("no-such", TENANT_B, ADMIN_B.name);
  });
});
