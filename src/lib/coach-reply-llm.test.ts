import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ログは、何を残したかを確かめるために置き換える（記入の文を残していないことを見る）。
const logged = vi.hoisted(() => ({ entries: [] as Array<{ level: string; message: string; meta: unknown }> }));
vi.mock("./logger", () => ({
  logger: {
    info: (message: string, meta?: unknown) => logged.entries.push({ level: "info", message, meta }),
    warn: (message: string, meta?: unknown) => logged.entries.push({ level: "warn", message, meta }),
    error: (message: string, meta?: unknown) => logged.entries.push({ level: "error", message, meta }),
  },
}));

import {
  buildCoachRequestBody,
  callCoachModel,
  isCoachKillSwitchOn,
  resolveCoachModel,
} from "./coach-reply-llm";
import { DEFAULT_FEEDBACK_MODEL, FEEDBACK_MAX_TOKENS } from "./feedback-draft";

// 外部の AI は呼ばない（fetch を置き換える）。テストの文は合成データ。
const SYSTEM = "指示文（見本）";
const USER = "記入の文（見本）：最初に聞いたら「在庫の数字が合わない」と言われた";
const ARGS = { systemPrompt: SYSTEM, userPrompt: USER, participantId: "p-synthetic" };

describe("resolveCoachModel", () => {
  it("AIコーチ用の指定を先に見る。無ければ「AI下書き」と同じモデル、それも無ければ既定", () => {
    expect(resolveCoachModel({ ANTHROPIC_MODEL_COACH: " model-coach ", ANTHROPIC_MODEL_FEEDBACK: "model-fb" })).toBe(
      "model-coach"
    );
    expect(resolveCoachModel({ ANTHROPIC_MODEL_FEEDBACK: "model-fb" })).toBe("model-fb");
    expect(resolveCoachModel({ ANTHROPIC_MODEL_COACH: "  " })).toBe(DEFAULT_FEEDBACK_MODEL);
    expect(resolveCoachModel({})).toBe(DEFAULT_FEEDBACK_MODEL);
  });

  it("共通の指定（ANTHROPIC_MODEL）は見ない（そちらは、古い呼び出し方のためのもの）", () => {
    expect(resolveCoachModel({ ANTHROPIC_MODEL: "model-old" })).toBe(DEFAULT_FEEDBACK_MODEL);
  });
});

describe("isCoachKillSwitchOn", () => {
  it("COACH_REPLY_DISABLED=1 のときだけ、止める", () => {
    expect(isCoachKillSwitchOn({ COACH_REPLY_DISABLED: "1" })).toBe(true);
    expect(isCoachKillSwitchOn({ COACH_REPLY_DISABLED: " 1 " })).toBe(true);
    expect(isCoachKillSwitchOn({ COACH_REPLY_DISABLED: "0" })).toBe(false);
    expect(isCoachKillSwitchOn({ COACH_REPLY_DISABLED: "true" })).toBe(false);
    expect(isCoachKillSwitchOn({})).toBe(false);
  });
});

describe("buildCoachRequestBody", () => {
  it("指示文と記入を、決まった形で送る（サンプリングの値を送らない。最後は user の発言）", () => {
    const body = buildCoachRequestBody({ systemPrompt: SYSTEM, userPrompt: USER, env: {} });
    expect(body).toEqual({
      model: DEFAULT_FEEDBACK_MODEL,
      max_tokens: FEEDBACK_MAX_TOKENS,
      system: SYSTEM,
      messages: [{ role: "user", content: USER }],
    });
    expect(Object.keys(body)).not.toContain("temperature");
  });

  it("モデルは、AIコーチ用の指定を使う（「AI下書き」の指定より先）", () => {
    const body = buildCoachRequestBody({
      systemPrompt: SYSTEM,
      userPrompt: USER,
      env: { ANTHROPIC_MODEL_COACH: "model-coach", ANTHROPIC_MODEL_FEEDBACK: "model-fb" },
    });
    expect(body.model).toBe("model-coach");
  });
});

describe("callCoachModel", () => {
  const realFetch = globalThis.fetch;
  const realKey = process.env.ANTHROPIC_API_KEY;
  let fetchMock: ReturnType<typeof vi.fn>;

  function respond(status: number, body: unknown): Response {
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  beforeEach(() => {
    logged.entries = [];
    process.env.ANTHROPIC_API_KEY = "key-synthetic";
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = realKey;
  });

  it("鍵が無いときは、AI を呼ばずに失敗を返す", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await callCoachModel(ARGS);
    expect(result).toEqual({ ok: false, reason: "no_api_key", model: expect.any(String) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("返ってきた文を返す。考えている途中の出力（thinking）は読み飛ばす", async () => {
    fetchMock.mockResolvedValue(
      respond(200, {
        stop_reason: "end_turn",
        content: [
          { type: "thinking", thinking: "（考えている途中）" },
          { type: "text", text: "「在庫の数字が合わない」と言われたのですね。" },
        ],
        usage: { input_tokens: 900, output_tokens: 300 },
      })
    );
    const result = await callCoachModel(ARGS);
    expect(result).toEqual({
      ok: true,
      text: "「在庫の数字が合わない」と言われたのですね。",
      model: expect.any(String),
    });

    // 送り先と、送る形
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(sent.system).toBe(SYSTEM);
    expect(sent.messages).toEqual([{ role: "user", content: USER }]);
    expect(sent).not.toHaveProperty("temperature");
  });

  it("AI が失敗を返したときは、失敗を返す", async () => {
    fetchMock.mockResolvedValue(respond(529, { error: { type: "overloaded_error" } }));
    expect(await callCoachModel(ARGS)).toEqual({ ok: false, reason: "api_error", model: expect.any(String) });
  });

  it("応答が JSON でないときは、失敗を返す（例外を外に出さない）", async () => {
    fetchMock.mockResolvedValue(respond(200, "<html>bad gateway</html>"));
    expect(await callCoachModel(ARGS)).toEqual({ ok: false, reason: "api_error", model: expect.any(String) });
  });

  it("文が 1 つも無い応答は、失敗を返す", async () => {
    fetchMock.mockResolvedValue(
      respond(200, { stop_reason: "max_tokens", content: [{ type: "thinking", thinking: "…" }] })
    );
    expect(await callCoachModel(ARGS)).toEqual({ ok: false, reason: "no_text", model: expect.any(String) });
  });

  it("上限に当たって途中で切れた文は、返信として使わない", async () => {
    fetchMock.mockResolvedValue(
      respond(200, { stop_reason: "max_tokens", content: [{ type: "text", text: "「在庫の数字が" }] })
    );
    expect(await callCoachModel(ARGS)).toEqual({ ok: false, reason: "truncated", model: expect.any(String) });
  });

  it("時間切れと、通信の失敗を分けて返す", async () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    fetchMock.mockRejectedValueOnce(timeout);
    expect(await callCoachModel(ARGS)).toEqual({ ok: false, reason: "timeout", model: expect.any(String) });

    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await callCoachModel(ARGS)).toEqual({ ok: false, reason: "network", model: expect.any(String) });
  });

  it("ログに、記入の文・指示文・返ってきた文・鍵を残さない（うまくいったときも、失敗のときも）", async () => {
    fetchMock.mockResolvedValueOnce(
      respond(200, { stop_reason: "end_turn", content: [{ type: "text", text: "返ってきた文（見本）" }] })
    );
    await callCoachModel(ARGS);
    fetchMock.mockResolvedValueOnce(respond(200, { stop_reason: "refusal", content: [] }));
    await callCoachModel(ARGS);
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await callCoachModel(ARGS);

    expect(logged.entries.length).toBeGreaterThanOrEqual(3);
    const all = JSON.stringify(logged.entries);
    expect(all).not.toContain("在庫の数字");
    expect(all).not.toContain(SYSTEM);
    expect(all).not.toContain("返ってきた文");
    expect(all).not.toContain("key-synthetic");
    // 残すのは、だれの分か（ID）と、使ったモデル
    expect(all).toContain("p-synthetic");
  });
});

describe("callCoachModel：AI が応答を断ったとき", () => {
  const realFetch = globalThis.fetch;
  const realKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = realKey;
  });

  it("ほかの失敗と分けて返す（呼び出し側が、運営の確認待ちにできるように）", async () => {
    process.env.ANTHROPIC_API_KEY = "key-synthetic";
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ stop_reason: "refusal", content: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    ) as unknown as typeof fetch;
    expect(await callCoachModel(ARGS)).toEqual({ ok: false, reason: "refusal", model: expect.any(String) });
  });
});
