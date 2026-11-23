import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// email.ts は、読み込まれた時点の RESEND_API_KEY を使う。テスト用の値を、読み込みより前に入れる。
vi.hoisted(() => {
  process.env.RESEND_API_KEY = "test-key";
});

const mocks = vi.hoisted(() => ({
  getParticipantByEmail: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./participant-db", () => ({ getParticipantByEmail: mocks.getParticipantByEmail }));
vi.mock("./logger", () => ({ logger: mocks.logger }));

import { sendStaffNoticeEmail } from "./email";

// テストの宛先は合成データ（実在のアドレスは使わない）。
const ADDRESS = "staff@example.test";
const OPTIONS = {
  to: ADDRESS,
  subject: "【CORE Log】AIコーチ：確認が必要な記入があります（見本の環境・1/6）",
  html: "<p>見本の本文</p>",
  type: "coach_notice",
  managerId: "0f8fad5b-d9cb-469f-a165-70867728950e",
  tenantId: "tenant-a",
};

type Sent = { from: string; to: string[]; subject: string; html: string };
let sent: Sent[] = [];
let respond: () => { ok: boolean; status: number; text: () => Promise<string> };

function loggedMeta(): string {
  return JSON.stringify(
    (["info", "warn", "error"] as const).flatMap((level) => mocks.logger[level].mock.calls.map((c) => c[1]))
  );
}

beforeEach(() => {
  sent = [];
  respond = () => ({ ok: true, status: 200, text: async () => "" });
  for (const fn of Object.values(mocks.logger)) fn.mockReset();
  mocks.getParticipantByEmail.mockReset();
  // 送信先（Resend）への通信は行わず、送ろうとした内容を受け取る。
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      sent.push(JSON.parse(String(init?.body)) as Sent);
      return respond();
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("sendStaffNoticeEmail：運営の担当者あてのお知らせ", () => {
  it("渡された宛先・件名・本文で、1 通送る", async () => {
    expect(await sendStaffNoticeEmail(OPTIONS)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual([ADDRESS]);
    expect(sent[0].subject).toBe(OPTIONS.subject);
    expect(sent[0].html).toBe(OPTIONS.html);
  });

  it("参加者のメールの設定（emailEnabled）は見ない（運営あてのメール）", async () => {
    mocks.getParticipantByEmail.mockResolvedValue({ emailEnabled: false });
    expect(await sendStaffNoticeEmail(OPTIONS)).toBe(true);
    expect(mocks.getParticipantByEmail).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });

  it("件名に改行が入っていても、1 行にして送る", async () => {
    await sendStaffNoticeEmail({ ...OPTIONS, subject: "見本\r\nBcc: other@example.test" });
    expect(sent[0].subject).toBe("見本 Bcc: other@example.test");
  });

  it("送れたとき、記録にアドレスを残さない", async () => {
    await sendStaffNoticeEmail(OPTIONS);
    expect(loggedMeta()).not.toContain(ADDRESS);
  });

  it("送信先が断ったとき（4xx）は、やり直さずに失敗を返す。記録には、種類・運営の人の ID・環境の ID を残し、アドレスは残さない", async () => {
    respond = () => ({ ok: false, status: 422, text: async () => "validation_error" });
    expect(await sendStaffNoticeEmail(OPTIONS)).toBe(false);
    expect(sent).toHaveLength(1);
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    expect(mocks.logger.error.mock.calls[0][1]).toMatchObject({
      type: "coach_notice",
      managerId: OPTIONS.managerId,
      tenantId: "tenant-a",
      status: 422,
    });
    expect(loggedMeta()).not.toContain(ADDRESS);
  });

  it("送信先の不調（5xx）のときは、2 回までやり直す。記録にアドレスを残さない", async () => {
    vi.useFakeTimers();
    respond = () => ({ ok: false, status: 503, text: async () => "unavailable" });
    const pending = sendStaffNoticeEmail(OPTIONS);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toBe(false);
    expect(sent).toHaveLength(3);
    expect(loggedMeta()).not.toContain(ADDRESS);
    expect(loggedMeta()).toContain(OPTIONS.managerId);
  });
});
