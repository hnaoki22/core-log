import { describe, it, expect } from "vitest";
import {
  DEFAULT_FEEDBACK_MODEL,
  FEEDBACK_MAX_TOKENS,
  buildFeedbackDraftRequestBody,
  extractTextFromContent,
  interpretFeedbackDraftResponse,
  isFeedbackEffortMisconfigured,
  readUsage,
  resolveFeedbackEffort,
  resolveFeedbackModel,
} from "./feedback-draft";

describe("resolveFeedbackModel", () => {
  it("falls back to the default when the env var is unset", () => {
    expect(resolveFeedbackModel({})).toBe(DEFAULT_FEEDBACK_MODEL);
  });

  it("falls back to the default when the env var is blank", () => {
    expect(resolveFeedbackModel({ ANTHROPIC_MODEL_FEEDBACK: "   " })).toBe(DEFAULT_FEEDBACK_MODEL);
  });

  it("uses the env var (trimmed) when set", () => {
    expect(resolveFeedbackModel({ ANTHROPIC_MODEL_FEEDBACK: " claude-opus-5-5 " })).toBe("claude-opus-5-5");
  });

  it("does not read the shared ANTHROPIC_MODEL (that helper is not migrated)", () => {
    expect(resolveFeedbackModel({ ANTHROPIC_MODEL: "claude-sonnet-4-6" })).toBe(DEFAULT_FEEDBACK_MODEL);
  });

  it("never defaults to the retired snapshot the route used to pin", () => {
    expect(DEFAULT_FEEDBACK_MODEL).not.toBe("claude-sonnet-4-20250514");
  });
});

describe("resolveFeedbackEffort", () => {
  it("is null when unset", () => {
    expect(resolveFeedbackEffort({})).toBeNull();
    expect(isFeedbackEffortMisconfigured({})).toBe(false);
  });

  it("accepts known values case-insensitively", () => {
    expect(resolveFeedbackEffort({ ANTHROPIC_FEEDBACK_EFFORT: "Medium" })).toBe("medium");
    expect(resolveFeedbackEffort({ ANTHROPIC_FEEDBACK_EFFORT: " xhigh " })).toBe("xhigh");
  });

  it("is null for an unknown value, and flags it as misconfigured", () => {
    const env = { ANTHROPIC_FEEDBACK_EFFORT: "turbo" };
    expect(resolveFeedbackEffort(env)).toBeNull();
    expect(isFeedbackEffortMisconfigured(env)).toBe(true);
  });
});

describe("buildFeedbackDraftRequestBody", () => {
  const base = { systemPrompt: "SYS", userPrompt: "USER" };

  it("builds a minimal body with the default model and the shared token budget", () => {
    const body = buildFeedbackDraftRequestBody({ ...base, env: {} });
    expect(body).toEqual({
      model: DEFAULT_FEEDBACK_MODEL,
      max_tokens: FEEDBACK_MAX_TOKENS,
      system: "SYS",
      messages: [{ role: "user", content: "USER" }],
    });
  });

  it("leaves room for thinking (well above the old 1024 limit)", () => {
    expect(FEEDBACK_MAX_TOKENS).toBeGreaterThanOrEqual(4096);
  });

  it("never sends sampling parameters or a thinking override", () => {
    const body = buildFeedbackDraftRequestBody({
      ...base,
      env: { ANTHROPIC_MODEL_FEEDBACK: "claude-fable-5-2", ANTHROPIC_FEEDBACK_EFFORT: "high" },
    }) as Record<string, unknown>;
    for (const key of ["temperature", "top_p", "top_k", "thinking", "budget_tokens"]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it("ends with the user message (no assistant prefill)", () => {
    const body = buildFeedbackDraftRequestBody({ ...base, env: {} });
    expect(body.messages).toHaveLength(1);
    expect(body.messages[body.messages.length - 1].role).toBe("user");
  });

  it("adds output_config.effort only when configured", () => {
    expect(buildFeedbackDraftRequestBody({ ...base, env: {} })).not.toHaveProperty("output_config");
    expect(
      buildFeedbackDraftRequestBody({ ...base, env: { ANTHROPIC_FEEDBACK_EFFORT: "medium" } }).output_config
    ).toEqual({ effort: "medium" });
  });

  it("omits output_config when the effort value is not recognised", () => {
    expect(
      buildFeedbackDraftRequestBody({ ...base, env: { ANTHROPIC_FEEDBACK_EFFORT: "turbo" } })
    ).not.toHaveProperty("output_config");
  });
});

describe("extractTextFromContent", () => {
  it("reads a text-only response (older models)", () => {
    expect(extractTextFromContent([{ type: "text", text: "draft" }])).toBe("draft");
  });

  it("skips leading thinking blocks (the content[0].text regression)", () => {
    const content = [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: "draft" },
    ];
    expect(extractTextFromContent(content)).toBe("draft");
  });

  it("joins multiple text blocks in order and trims the result", () => {
    const content = [
      { type: "text", text: "  first " },
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: "second\n" },
    ];
    expect(extractTextFromContent(content)).toBe("first second");
  });

  it("returns an empty string when there is no text block", () => {
    expect(extractTextFromContent([{ type: "thinking", thinking: "", signature: "sig" }])).toBe("");
    expect(extractTextFromContent([])).toBe("");
  });

  it("tolerates malformed input", () => {
    expect(extractTextFromContent(undefined)).toBe("");
    expect(extractTextFromContent("draft")).toBe("");
    expect(extractTextFromContent([null, 1, { type: "text" }, { type: "text", text: 5 }])).toBe("");
  });
});

describe("interpretFeedbackDraftResponse", () => {
  it("returns the draft on a normal completion", () => {
    expect(
      interpretFeedbackDraftResponse({ stop_reason: "end_turn", content: [{ type: "text", text: "draft" }] })
    ).toEqual({ ok: true, draft: "draft", truncated: false, stopReason: "end_turn" });
  });

  it("returns the draft but marks it truncated when the limit cut the text short", () => {
    expect(
      interpretFeedbackDraftResponse({ stop_reason: "max_tokens", content: [{ type: "text", text: "dra" }] })
    ).toEqual({ ok: true, draft: "dra", truncated: true, stopReason: "max_tokens" });
  });

  it("reports max_tokens when thinking used the whole budget and no text came back", () => {
    expect(
      interpretFeedbackDraftResponse({
        stop_reason: "max_tokens",
        content: [{ type: "thinking", thinking: "", signature: "sig" }],
      })
    ).toEqual({ ok: false, reason: "max_tokens", stopReason: "max_tokens" });
  });

  it("reports a refusal", () => {
    expect(interpretFeedbackDraftResponse({ stop_reason: "refusal", content: [] })).toEqual({
      ok: false,
      reason: "refusal",
      stopReason: "refusal",
    });
  });

  it("reports empty for anything else without text", () => {
    expect(interpretFeedbackDraftResponse({ stop_reason: "end_turn", content: [] })).toEqual({
      ok: false,
      reason: "empty",
      stopReason: "end_turn",
    });
    expect(interpretFeedbackDraftResponse(null)).toEqual({ ok: false, reason: "empty", stopReason: null });
  });
});

describe("readUsage", () => {
  it("reads token counts when present", () => {
    expect(readUsage({ usage: { input_tokens: 1200, output_tokens: 3400 } })).toEqual({
      inputTokens: 1200,
      outputTokens: 3400,
    });
  });

  it("returns nulls when usage is missing or malformed", () => {
    expect(readUsage({})).toEqual({ inputTokens: null, outputTokens: null });
    expect(readUsage({ usage: { input_tokens: "1" } })).toEqual({ inputTokens: null, outputTokens: null });
    expect(readUsage(null)).toEqual({ inputTokens: null, outputTokens: null });
  });
});
