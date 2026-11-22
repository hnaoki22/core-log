import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// POST /api/mission/edits（本人のイシュー 1 件の「直した履歴」）が、だれに何を返すかを確かめる。
// データベースの読み書きはすべて差し替える（合成データ。実在の環境・人物・トークンは使わない）。

const TENANT = "tenant-issue";
const MISSION_ID = "00000000-0000-4000-8000-0000000000aa";
const ME = { id: "p-me", token: "tok-me", name: "参加 一郎", tenantId: TENANT };

const mocks = vi.hoisted(() => ({
  getParticipantByToken: vi.fn(),
  isFeatureEnabled: vi.fn(),
  listMissionEdits: vi.fn(),
}));

vi.mock("@/lib/participant-db", () => ({ getParticipantByToken: mocks.getParticipantByToken }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.isFeatureEnabled }));
vi.mock("@/lib/mission-edit-store", () => ({ listMissionEdits: mocks.listMissionEdits }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { POST } from "./route";
import { MISSION_EDIT_LIST_MAX } from "@/lib/mission-edit";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/mission/edits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

const EDITS = [
  {
    id: "e1",
    editedAt: "2026-11-22T08:50:00+00:00",
    editedBy: "participant",
    before: { title: "題（直す前）", purpose: null, deadline: null },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getParticipantByToken.mockImplementation(async (token: string) => (token === ME.token ? ME : null));
  mocks.isFeatureEnabled.mockResolvedValue(true);
  mocks.listMissionEdits.mockResolvedValue({ ok: true, edits: EDITS });
});

describe("POST /api/mission/edits", () => {
  it("本人に、そのイシューの履歴を返す。行は、トークンから引いた持ち主で絞る", async () => {
    const res = await post({ token: ME.token, missionId: MISSION_ID });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true, edits: EDITS });
    expect(mocks.isFeatureEnabled).toHaveBeenCalledWith("feature.missionLabelIssue", TENANT);
    expect(mocks.listMissionEdits).toHaveBeenCalledWith({
      missionId: MISSION_ID,
      tenantId: TENANT,
      participantId: ME.id,
      limit: MISSION_EDIT_LIST_MAX,
    });
  });

  it("本文に入れたテナントや参加者の ID は、使わない", async () => {
    await post({ token: ME.token, missionId: MISSION_ID, tenantId: "tenant-x", participantId: "p-x" });
    expect(mocks.listMissionEdits).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, participantId: ME.id })
    );
  });

  it("イシューの呼び名でない環境には、履歴を返さない（読みにも行かない）", async () => {
    mocks.isFeatureEnabled.mockResolvedValue(false);
    const res = await post({ token: ME.token, missionId: MISSION_ID });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false, edits: [] });
    expect(mocks.listMissionEdits).not.toHaveBeenCalled();
  });

  it("読めなかったときは 500（履歴なしとして返さない）", async () => {
    mocks.listMissionEdits.mockResolvedValue({ ok: false });
    const res = await post({ token: ME.token, missionId: MISSION_ID });
    expect(res.status).toBe(500);
  });

  it("トークンが無い・知らないトークン（上司・運営のトークンを含む）は 401", async () => {
    expect((await post({ missionId: MISSION_ID })).status).toBe(401);
    expect((await post({ token: "", missionId: MISSION_ID })).status).toBe(401);
    expect((await post({ token: "tok-manager", missionId: MISSION_ID })).status).toBe(401);
    expect(mocks.listMissionEdits).not.toHaveBeenCalled();
  });

  it("参加者の ID やテナントを引けないトークンは 401", async () => {
    mocks.getParticipantByToken.mockResolvedValue({ ...ME, tenantId: undefined });
    expect((await post({ token: ME.token, missionId: MISSION_ID })).status).toBe(401);
    mocks.getParticipantByToken.mockResolvedValue({ ...ME, id: "" });
    expect((await post({ token: ME.token, missionId: MISSION_ID })).status).toBe(401);
    expect(mocks.listMissionEdits).not.toHaveBeenCalled();
  });

  it("イシューの ID が無い・形が違うときは 400（データベースには問い合わせない）", async () => {
    expect((await post({ token: ME.token })).status).toBe(400);
    expect((await post({ token: ME.token, missionId: "not-a-uuid" })).status).toBe(400);
    expect((await post({ token: ME.token, missionId: 123 })).status).toBe(400);
    expect((await post("{not json")).status).toBe(400);
    expect(mocks.getParticipantByToken).not.toHaveBeenCalled();
  });
});
