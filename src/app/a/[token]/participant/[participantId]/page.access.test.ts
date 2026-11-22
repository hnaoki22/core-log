import { describe, it, expect, vi, beforeEach } from "vitest";

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
const PARTICIPANT_TENANTS: Record<string, string> = {
  [PARTICIPANT_IN_A]: TENANT_A,
  [PARTICIPANT_IN_S]: TENANT_S,
};

const mocks = vi.hoisted(() => ({
  getManagerByToken: vi.fn(),
  getParticipantByNameCrossTenant: vi.fn(),
  getLogsByParticipant: vi.fn(),
  getMissionsByParticipant: vi.fn(),
  getFeedbackByParticipant: vi.fn(),
  isStandaloneTenant: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getLogsByParticipant: mocks.getLogsByParticipant,
  getMissionsByParticipant: mocks.getMissionsByParticipant,
  getFeedbackByParticipant: mocks.getFeedbackByParticipant,
  getParticipantByNameCrossTenant: mocks.getParticipantByNameCrossTenant,
}));
vi.mock("@/lib/participant-db", () => ({ getManagerByToken: mocks.getManagerByToken }));
vi.mock("@/lib/standalone", () => ({ isStandaloneTenant: mocks.isStandaloneTenant }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import AdminParticipantPage from "./page";

const NOT_FOUND = "NEXT_NOT_FOUND";

function open(token: string, name: string) {
  return AdminParticipantPage({ params: { token, participantId: encodeURIComponent(name) } });
}

function expectNothingRead() {
  expect(mocks.getLogsByParticipant).not.toHaveBeenCalled();
  expect(mocks.getMissionsByParticipant).not.toHaveBeenCalled();
  expect(mocks.getFeedbackByParticipant).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getManagerByToken.mockImplementation(async (token: string) => MANAGERS[token] ?? null);
  mocks.getParticipantByNameCrossTenant.mockImplementation(async (name: string) =>
    PARTICIPANT_TENANTS[name] ? { name, tenantId: PARTICIPANT_TENANTS[name] } : null
  );
  mocks.getLogsByParticipant.mockResolvedValue([]);
  mocks.getMissionsByParticipant.mockResolvedValue([]);
  mocks.getFeedbackByParticipant.mockResolvedValue([]);
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

  it("ほかの環境の閲覧者は、読めない", async () => {
    await expect(open("tok-observer-b", PARTICIPANT_IN_A)).rejects.toThrow(NOT_FOUND);
    expectNothingRead();
  });
});

describe("/a/[token]/participant/[氏名]：読ませる場合", () => {
  it("同じ環境の閲覧者は、参加者の側の環境で、記入・イシュー・フィードバックを読む", async () => {
    const page = await open("tok-observer-a", PARTICIPANT_IN_A);
    expect(page).toBeTruthy();
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(mocks.getLogsByParticipant).toHaveBeenCalledWith(PARTICIPANT_IN_A, TENANT_A);
    expect(mocks.getMissionsByParticipant).toHaveBeenCalledWith(PARTICIPANT_IN_A, TENANT_A);
    expect(mocks.getFeedbackByParticipant).toHaveBeenCalledWith(PARTICIPANT_IN_A, TENANT_A);
  });

  it("管理者（is_admin）は、ほかの環境の参加者でも、参加者の側の環境で読む", async () => {
    await open("tok-admin-b", PARTICIPANT_IN_A);
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(mocks.getLogsByParticipant).toHaveBeenCalledWith(PARTICIPANT_IN_A, TENANT_A);
    expect(mocks.getFeedbackByParticipant).toHaveBeenCalledWith(PARTICIPANT_IN_A, TENANT_A);
  });

  it("氏名で参加者を引けないときは、開いた人の環境の中だけを読む", async () => {
    await open("tok-admin-b", UNKNOWN_NAME);
    expect(mocks.getLogsByParticipant).toHaveBeenCalledWith(UNKNOWN_NAME, TENANT_B);
  });
});

describe("/a/[token]/participant/[氏名]：商品モードの環境", () => {
  it("管理者でも、記入・イシュー・フィードバックを読まない", async () => {
    const page = await open("tok-admin-b", PARTICIPANT_IN_S);
    expect(page).toBeTruthy();
    expect(mocks.isStandaloneTenant).toHaveBeenCalledWith(TENANT_S);
    expectNothingRead();
  });
});
