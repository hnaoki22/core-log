import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

// 設計図のページのサーバー側（/p/[token]/blueprint の page.tsx）が、「前回の AIコーチの問い」を
// メールと記入画面に出している環境のときだけ、説明に 1 行足すための値（previousQuestion）を、
// 画面（BlueprintClient）に渡すことを確かめる。
// データベースの読み取り・スイッチは、すべて差し替える（合成データ。実在の環境・人物は使わない）。

const h = vi.hoisted(() => ({
  flags: {} as Record<string, boolean>,
  killSwitch: false,
  activation: { ok: true, active: true } as { ok: true; active: boolean } | { ok: false },
  optIn: { ok: true, enabled: true } as { ok: true; enabled: boolean | null } | { ok: false },
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/participant-db", () => ({
  getParticipantByToken: vi.fn(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    tenantId: "00000000-0000-4000-8000-0000000000aa",
    name: "合成 一郎",
  })),
}));
vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: vi.fn(async (key: string) => h.flags[key] === true),
}));
vi.mock("@/lib/coaching-profile-store", () => ({
  getCoachingProfile: vi.fn(async () => ({ ok: true, profile: null })),
}));
vi.mock("@/lib/coach-reply-llm", () => ({ isCoachKillSwitchOn: () => h.killSwitch }));
vi.mock("@/lib/coach-reply-store", () => ({
  getCoachActivation: vi.fn(async () => h.activation),
  getCoachOptIn: vi.fn(async () => h.optIn),
}));
vi.mock("@/lib/supabase", () => ({ getMissionsByParticipantId: vi.fn(async () => []) }));
// 画面の部品は、このテストでは描かない（渡す値だけを確かめる）。
vi.mock("./BlueprintClient", () => ({ default: function BlueprintClientStub() { return null; } }));

import BlueprintPageServer from "./page";

async function coachProp(): Promise<unknown> {
  const page = (await BlueprintPageServer({ params: { token: "tok_synthetic" } })) as ReactElement<{ coach: unknown }>;
  return page.props.coach;
}

beforeEach(() => {
  h.flags = { "feature.coachingProfile": true, "feature.coachReply": true, "feature.coachPreviousQuestion": true };
  h.killSwitch = false;
  h.activation = { ok: true, active: true };
  h.optIn = { ok: true, enabled: true };
});

describe("/p/[token]/blueprint（サーバー側）：前回の AIコーチの問いの、説明の 1 行", () => {
  it("前回の問いを出している環境（スイッチ ON・AIコーチの返信が動いている）では、previousQuestion を渡す", async () => {
    expect(await coachProp()).toEqual({ optIn: true, loadFailed: false, previousQuestion: true });
  });

  it("スイッチが OFF の環境では、キーごと渡さない（これまでと同じ値）", async () => {
    h.flags["feature.coachPreviousQuestion"] = false;
    const coach = (await coachProp()) as Record<string, unknown>;
    expect(coach).toEqual({ optIn: true, loadFailed: false });
    expect("previousQuestion" in coach).toBe(false);
  });

  it("AIコーチの返信が動いていない環境・アプリ全体で止めているあいだは、AIコーチの欄ごと出さない", async () => {
    h.activation = { ok: true, active: false };
    expect(await coachProp()).toBeNull();

    h.activation = { ok: false };
    expect(await coachProp()).toBeNull();

    h.activation = { ok: true, active: true };
    h.killSwitch = true;
    expect(await coachProp()).toBeNull();
  });

  it("本人の設定を読めなかったときも、説明の 1 行は出す（ボタンは出さない）", async () => {
    h.optIn = { ok: false };
    expect(await coachProp()).toEqual({ optIn: null, loadFailed: true, previousQuestion: true });
  });

  it("設計図の行がまだ無い人にも、説明の 1 行は出す（確定の前に読めるように）", async () => {
    h.optIn = { ok: true, enabled: null };
    expect(await coachProp()).toEqual({ optIn: null, loadFailed: false, previousQuestion: true });
  });
});
