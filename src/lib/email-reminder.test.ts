import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// email.ts は、読み込まれた時点の RESEND_API_KEY を使う。テスト用の値を、読み込みより前に入れる。
vi.hoisted(() => {
  process.env.RESEND_API_KEY = "test-key";
});

// 宛先の参加者を DB から引く処理は置き換える（このテストは、どの文面を送るかだけを見る）。
vi.mock("./participant-db", () => ({
  getParticipantByEmail: async () => null,
}));

// 問いを載せたメールの組み立ては本物を使う。1 件だけ、失敗させて従来のメールに戻ることを確かめる。
vi.mock("./reminder-mail-question", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./reminder-mail-question")>();
  return { ...actual, buildQuestionReminderEmail: vi.fn(actual.buildQuestionReminderEmail) };
});

import { sendReminderEmail, type ReminderType } from "./email";
import { buildQuestionReminderEmail } from "./reminder-mail-question";

// テストの宛先・問いは合成データ（実在の人物・実在の環境の問いは使わない）。
const Q_MORNING = ["今日は、どの場面で、何をしますか。"];
const Q_EVENING = ["今日は何をして、何が起きましたか。", "次に何を変えますか。"];

type Sent = { subject: string; html: string; to: string[] };
let sent: Sent[] = [];

beforeEach(() => {
  sent = [];
  // 送信先（Resend）への通信は行わず、送ろうとした内容を受け取る。
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      sent.push(JSON.parse(String(init?.body)) as Sent);
      return { ok: true, status: 200, text: async () => "" };
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function send(type: ReminderType, questions?: string[]): Promise<Sent> {
  const ok = await sendReminderEmail({
    to: "sample@example.test",
    participantName: "見本",
    token: "tok_synthetic",
    type,
    ...(questions === undefined ? {} : { questions }),
  });
  expect(ok).toBe(true);
  expect(sent).toHaveLength(1);
  return sent[0];
}

describe("sendReminderEmail：問いを渡さないとき（問いを出していない環境）は、従来のメールのまま", () => {
  // ここに書いた件名と文は、元からのリマインドメールと一字一句同じ。
  // ここを変えるときは、「問いを出していない環境に届くメールが変わる」ことを意味する。
  it("朝", async () => {
    const mail = await send("morning");
    expect(mail.subject).toBe("【CORE Log】おはようございます！今日の意図を記入しましょう");
    expect(mail.html).toContain("見本さん、おはようございます。");
    expect(mail.html).toContain("<strong>今日意識すること</strong>を3分で記入しましょう。");
    expect(mail.html).toContain("今日の意図を記入する →");
    expect(mail.html).toContain("小さな気づきの積み重ねが、大きな成長につながります。");
    expect(mail.html).toContain("/p/tok_synthetic/input");
  });

  it("夕方", async () => {
    const mail = await send("evening");
    expect(mail.subject).toBe("【CORE Log】お疲れさまでした！今日の気づきを振り返りましょう");
    expect(mail.html).toContain("見本さん、お疲れさまでした。");
    expect(mail.html).toContain("<strong>気づいたこと・学んだこと</strong>を3分で記録しましょう。");
    expect(mail.html).toContain("今日の気づきを記入する →");
    expect(mail.html).toContain("「何を感じたか」を言葉にすることで、成長が加速します。");
  });

  it("夕方（朝が未記入）", async () => {
    const mail = await send("evening_no_morning");
    expect(mail.subject).toBe("【CORE Log】今日の振り返りを記録しましょう");
    expect(mail.html).toContain("※ 朝の意図設定は14:00で締め切られました。");
    expect(mail.html).toContain("今日の振り返りを記入する →");
  });

  it("問いが空の配列・空白だけのときも、従来のメール", async () => {
    expect((await send("morning", [])).subject).toBe(
      "【CORE Log】おはようございます！今日の意図を記入しましょう"
    );
    sent = [];
    expect((await send("evening", ["  ", ""])).subject).toBe(
      "【CORE Log】お疲れさまでした！今日の気づきを振り返りましょう"
    );
  });
});

describe("sendReminderEmail：問いを渡したとき（問いを出している環境）は、問いを載せたメール", () => {
  it("朝：件名は「今日の行動の記入」。本文にその日の問いを載せ、従来の促しの文は載せない", async () => {
    const mail = await send("morning", Q_MORNING);
    expect(mail.subject).toBe("【CORE Log】今日の行動の記入をお願いします");
    expect(mail.html).toContain("今日の問いです。");
    expect(mail.html).toContain("今日は、どの場面で、何をしますか。");
    expect(mail.html).toContain("/p/tok_synthetic/input");
    expect(mail.html).not.toMatch(/意図|意識|気づ|成長/);
    expect(mail.to).toEqual(["sample@example.test"]);
  });

  it("夕方：件名は「本日の振り返りの記入」。問いを番号つきで載せる", async () => {
    const mail = await send("evening", Q_EVENING);
    expect(mail.subject).toBe("【CORE Log】本日の振り返りの記入をお願いします");
    expect(mail.html).toContain("1. 今日は何をして、何が起きましたか。");
    expect(mail.html).toContain("2. 次に何を変えますか。");
    expect(mail.html).not.toMatch(/意図|意識|気づ|学んだ|感じたか|成長/);
  });

  it("夕方（朝が未記入）：締め切りの注記を「朝の記入」の呼び名で載せる", async () => {
    const mail = await send("evening_no_morning", Q_EVENING);
    expect(mail.subject).toBe("【CORE Log】本日の振り返りの記入をお願いします");
    expect(mail.html).toContain("朝の記入は14:00で締め切りました。本日の振り返りは記入できます。");
    expect(mail.html).not.toContain("意図");
  });

  it("問いを載せたメールの組み立てに失敗したときは、従来のメールで送る（送信は止めない）", async () => {
    vi.mocked(buildQuestionReminderEmail).mockImplementationOnce(() => {
      throw new Error("synthetic failure");
    });
    const mail = await send("morning", Q_MORNING);
    expect(mail.subject).toBe("【CORE Log】おはようございます！今日の意図を記入しましょう");
  });
});
