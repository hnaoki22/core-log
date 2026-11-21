import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 管理画面まわりの 3 つの取得口が「だれに何を返すか」を確かめる。
// データベースの読み書きはすべて差し替える（合成データ。実在の環境・人物・トークンは使わない）。

const TENANT_A = { id: "tenant-a", slug: "env-a", name: "Env A", companyName: "A社", featureFlags: {} };
const TENANT_B = { id: "tenant-b", slug: "env-b", name: "Env B", companyName: "B社", featureFlags: {} };

type FakeManager = {
  id: string;
  token: string;
  name: string;
  email: string;
  department: string;
  isAdmin: boolean;
  role: "admin" | "observer" | "manager";
  participantIds: string[];
  tenantId: string;
};

const ADMIN: FakeManager = {
  id: "m-admin", token: "tok-admin", name: "管理 太郎", email: "", department: "", isAdmin: true, role: "admin", participantIds: [], tenantId: TENANT_A.id,
};
const OBSERVER: FakeManager = {
  id: "m-observer", token: "tok-observer", name: "閲覧 花子", email: "", department: "", isAdmin: false, role: "observer", participantIds: [], tenantId: TENANT_B.id,
};
const MANAGER: FakeManager = {
  id: "m-manager", token: "tok-manager", name: "上司 次郎", email: "", department: "", isAdmin: false, role: "manager", participantIds: [], tenantId: TENANT_B.id,
};
const BY_TOKEN: Record<string, FakeManager> = {
  [ADMIN.token]: ADMIN,
  [OBSERVER.token]: OBSERVER,
  [MANAGER.token]: MANAGER,
};

const mocks = vi.hoisted(() => ({
  createParticipant: vi.fn(),
  createManager: vi.fn(),
  loadAdminDirectory: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  DEFAULT_TENANT_ID: "tenant-default",
  createParticipantInSupabase: mocks.createParticipant,
  createManagerInSupabase: mocks.createManager,
  getAllManagersFromSupabase: vi.fn(async () => []),
  getManagerByTokenFromSupabase: vi.fn(async (token: string) => BY_TOKEN[token] ?? null),
  getTenantBySlug: vi.fn(async (slug: string) => [TENANT_A, TENANT_B].find((t) => t.slug === slug) ?? null),
  getAllTenants: vi.fn(async () => [TENANT_A, TENANT_B].map((t) => ({ ...t, plan: "standard" }))),
  getAllLogsForTenant: vi.fn(async () => new Map()),
  getFeedbackCountsByTenant: vi.fn(async () => new Map()),
}));

vi.mock("@/lib/participant-db", () => ({
  getManagerByToken: vi.fn(async (token: string) => BY_TOKEN[token] ?? null),
  getAllParticipants: vi.fn(async () => [
    { id: "p-1", token: "tok-p1", name: "参加 一郎", email: "", department: "", dojoPhase: "", emailEnabled: true, managerId: "", fbPolicy: "", rowTenantId: TENANT_B.id },
    { id: "p-2", token: "tok-p2", name: "参加 二郎", email: "", department: "", dojoPhase: "", emailEnabled: true, managerId: "", fbPolicy: "", rowTenantId: TENANT_B.id },
  ]),
  getAllManagers: vi.fn(async () => [OBSERVER, MANAGER]),
}));

vi.mock("@/lib/standalone", () => ({ isStandaloneTenant: vi.fn(async () => false) }));
vi.mock("@/lib/admin-directory-store", () => ({ loadAdminDirectory: mocks.loadAdminDirectory }));

import { POST as membersPost } from "./members/route";
import { GET as directoryGet } from "./directory/route";
import { GET as dashboardGet } from "./route";

function postMembers(query: string, body: unknown): Promise<Response> {
  return membersPost(
    new NextRequest(`http://localhost/api/admin/members${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

const PARTICIPANT_BODY = { type: "participant", data: { name: "新規 太郎", email: "new@example.test" } };

beforeEach(() => {
  mocks.createParticipant.mockReset();
  mocks.createManager.mockReset();
  mocks.loadAdminDirectory.mockReset();
  mocks.createParticipant.mockResolvedValue({ id: "new-p", token: "tok-new-p" });
  mocks.createManager.mockResolvedValue({ id: "new-m", token: "tok-new-m" });
  mocks.loadAdminDirectory.mockResolvedValue({ environments: [], users: [], truncated: false });
});

describe("POST /api/admin/members（メンバーの追加）", () => {
  it("トークンがない・知らないトークンは 403", async () => {
    expect((await postMembers("?tenant=env-a", { ...PARTICIPANT_BODY })).status).toBe(403);
    expect((await postMembers("?tenant=env-a", { ...PARTICIPANT_BODY, token: "tok-unknown" })).status).toBe(403);
    expect(mocks.createParticipant).not.toHaveBeenCalled();
  });

  it("閲覧者・マネージャーのトークンでは追加できない（403。何も作らない）", async () => {
    for (const token of [OBSERVER.token, MANAGER.token]) {
      const res = await postMembers("?tenant=env-b", { ...PARTICIPANT_BODY, token });
      expect(res.status).toBe(403);
      const resManager = await postMembers("?tenant=env-b", {
        token,
        type: "manager",
        data: { name: "新規 管理", email: "x@example.test", role: "admin" },
      });
      expect(resManager.status).toBe(403);
    }
    expect(mocks.createParticipant).not.toHaveBeenCalled();
    expect(mocks.createManager).not.toHaveBeenCalled();
  });

  it("管理者でも、追加先の環境の指定がなければ断る（所属の環境には落とさない）", async () => {
    const res = await postMembers("", { ...PARTICIPANT_BODY, token: ADMIN.token });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("追加先の環境を選んでください");
    expect(mocks.createParticipant).not.toHaveBeenCalled();
  });

  it("知らない環境が指定されたら断る（所属の環境には落とさない）", async () => {
    const res = await postMembers("?tenant=no-such-env", { ...PARTICIPANT_BODY, token: ADMIN.token });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("追加先の環境が見つかりません");
    expect(mocks.createParticipant).not.toHaveBeenCalled();
  });

  it("参加者：指定した環境に作り、ログイン用のパスと追加先の環境を返す", async () => {
    const res = await postMembers("?tenant=env-b", { ...PARTICIPANT_BODY, token: ADMIN.token });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.participant).toEqual({ id: "new-p", token: "tok-new-p", name: "新規 太郎", url: "/p/tok-new-p" });
    expect(json.tenant).toEqual({ id: "tenant-b", slug: "env-b", name: "Env B", companyName: "B社" });
    // 管理者の所属（tenant-a）ではなく、指定した環境（tenant-b）に作る
    expect(mocks.createParticipant).toHaveBeenCalledTimes(1);
    expect(mocks.createParticipant.mock.calls[0][1]).toBe("tenant-b");
  });

  it("マネージャー：役割に合ったログイン用のパスを返す（管理者・閲覧者は /a、マネージャーは /m）", async () => {
    const cases: [string, string][] = [
      ["admin", "/a/tok-new-m"],
      ["observer", "/a/tok-new-m"],
      ["manager", "/m/tok-new-m"],
    ];
    for (const [role, url] of cases) {
      const res = await postMembers("?tenant=env-a", {
        token: ADMIN.token,
        type: "manager",
        data: { name: "新規 上司", email: "m@example.test", role },
      });
      const json = await res.json();
      expect(json.manager.url).toBe(url);
      expect(json.tenant.slug).toBe("env-a");
    }
    expect(mocks.createManager.mock.calls.every((call) => call[1] === "tenant-a")).toBe(true);
  });
});

describe("GET /api/admin/directory（環境とユーザーの一覧）", () => {
  const get = (token: string | null) =>
    directoryGet(new NextRequest(`http://localhost/api/admin/directory${token ? `?token=${token}` : ""}`));

  it("管理者にだけ返す。保存させない（no-store）", async () => {
    const res = await get(ADMIN.token);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ environments: [], users: [], truncated: false });
  });

  it("トークンなし・知らないトークン・閲覧者・マネージャーには返さない（一覧を読みにもいかない）", async () => {
    for (const token of [null, "tok-unknown", OBSERVER.token, MANAGER.token]) {
      const res = await get(token);
      expect(res.status).toBe(403);
    }
    expect(mocks.loadAdminDirectory).not.toHaveBeenCalled();
  });

  it("読み取りに失敗したら 500（空の一覧にしない）", async () => {
    mocks.loadAdminDirectory.mockRejectedValue(new Error("boom"));
    const res = await get(ADMIN.token);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("環境とユーザーの一覧を取得できませんでした");
  });
});

describe("GET /api/admin（ダッシュボード）のトークン", () => {
  const get = (token: string) => dashboardGet(new NextRequest(`http://localhost/api/admin?token=${token}`));

  it("管理者には、参加者・マネージャーのトークンを返す", async () => {
    const json = await (await get(ADMIN.token)).json();
    expect(json.viewerIsAdmin).toBe(true);
    expect(json.participants.map((p: { token: string }) => p.token)).toEqual(["tok-p1", "tok-p2"]);
    expect(json.managers.map((m: { token: string }) => m.token)).toEqual(["tok-observer", "tok-manager"]);
  });

  it("閲覧者には、ほかの人のトークンを返さない（本人の行だけは返す）", async () => {
    const res = await get(OBSERVER.token);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.viewerRole).toBe("observer");
    // 画面は、この値で「環境とユーザー」の欄を出すかどうかを決める
    expect(json.viewerIsAdmin).toBe(false);
    expect(json.participants.map((p: { token: string }) => p.token)).toEqual(["", ""]);
    expect(json.managers.map((m: { id: string; token: string }) => [m.id, m.token])).toEqual([
      ["m-observer", "tok-observer"],
      ["m-manager", ""],
    ]);
    // 氏名などの、これまで返していた項目は変えない
    expect(json.participants.map((p: { name: string }) => p.name)).toEqual(["参加 一郎", "参加 二郎"]);
  });

  it("マネージャーのトークンでは、これまでどおり 403", async () => {
    expect((await get(MANAGER.token)).status).toBe(403);
  });
});
