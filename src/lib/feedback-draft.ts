// Feedback-draft LLM helpers — pure functions, unit-tested (feedback-draft.test.ts).
//
// Why this file exists:
//   /api/feedback/draft used to hard-code a model snapshot that has since been
//   retired, and it read `content[0].text`. Current Claude models think before
//   they answer (adaptive thinking), which changes three things:
//     1. A response can START with `thinking` blocks, so the draft must be
//        collected from the blocks whose type is "text", wherever they sit.
//     2. `max_tokens` is shared between thinking and text, so the old 1024
//        limit can be used up before any text is produced.
//     3. Sampling parameters (temperature / top_p / top_k) are rejected — this
//        request never sent them, and must keep not sending them.
//   Keeping the model choice and the parsing here lets the route stay thin and
//   lets the model be switched from the environment without a code change.
//
// Environment variables (both optional, see .env.example):
//   ANTHROPIC_MODEL_FEEDBACK   Model ID for feedback drafts.
//                              Default: DEFAULT_FEEDBACK_MODEL.
//   ANTHROPIC_FEEDBACK_EFFORT  low | medium | high | xhigh | max.
//                              Sent as output_config.effort ONLY when set, so
//                              models without an effort setting are unaffected.
//
// Deliberately separate from ANTHROPIC_MODEL (src/lib/llm.ts): that shared
// helper still sends `temperature` and reads `content[0]`, so pointing it at a
// current model would break every feature that uses it. Migrating the shared
// helper is a separate change.

export const DEFAULT_FEEDBACK_MODEL = "claude-sonnet-5-5";

/** Shared by thinking + text. Only tokens actually produced are billed. */
export const FEEDBACK_MAX_TOKENS = 8000;

const EFFORT_VALUES = ["low", "medium", "high", "xhigh", "max"] as const;
export type FeedbackEffort = (typeof EFFORT_VALUES)[number];

type EnvLike = Record<string, string | undefined>;

export function resolveFeedbackModel(env: EnvLike = process.env): string {
  const value = (env.ANTHROPIC_MODEL_FEEDBACK || "").trim();
  return value || DEFAULT_FEEDBACK_MODEL;
}

/**
 * Returns the configured effort, or null when unset OR not one of the known
 * values. Callers that care about a typo can compare against the raw env value
 * (see `isFeedbackEffortMisconfigured`).
 */
export function resolveFeedbackEffort(env: EnvLike = process.env): FeedbackEffort | null {
  const value = (env.ANTHROPIC_FEEDBACK_EFFORT || "").trim().toLowerCase();
  return (EFFORT_VALUES as readonly string[]).includes(value) ? (value as FeedbackEffort) : null;
}

/** True when ANTHROPIC_FEEDBACK_EFFORT is set to something we do not recognise. */
export function isFeedbackEffortMisconfigured(env: EnvLike = process.env): boolean {
  const raw = (env.ANTHROPIC_FEEDBACK_EFFORT || "").trim();
  return raw !== "" && resolveFeedbackEffort(env) === null;
}

export type FeedbackDraftRequestBody = {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: "user"; content: string }>;
  output_config?: { effort: FeedbackEffort };
};

/**
 * Builds the Messages API request body.
 * Invariants (covered by tests): no sampling parameters, no prefill (the last
 * message is always the user message), effort only when explicitly configured.
 */
export function buildFeedbackDraftRequestBody(args: {
  systemPrompt: string;
  userPrompt: string;
  env?: EnvLike;
}): FeedbackDraftRequestBody {
  const env = args.env ?? process.env;
  const body: FeedbackDraftRequestBody = {
    model: resolveFeedbackModel(env),
    max_tokens: FEEDBACK_MAX_TOKENS,
    system: args.systemPrompt,
    messages: [{ role: "user", content: args.userPrompt }],
  };
  const effort = resolveFeedbackEffort(env);
  if (effort) body.output_config = { effort };
  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Concatenates every block whose type is "text", ignoring thinking / tool /
 * unknown blocks and their position. Returns "" when there is no text.
 */
export function extractTextFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("").trim();
}

export type FeedbackDraftOutcome =
  | { ok: true; draft: string; truncated: boolean; stopReason: string | null }
  | { ok: false; reason: "max_tokens" | "refusal" | "empty"; stopReason: string | null };

/**
 * Turns a Messages API response into a draft or a specific failure reason.
 *  - text present                → ok (truncated=true if the limit cut it short)
 *  - no text, stop=max_tokens    → thinking used the whole budget
 *  - no text, stop=refusal       → the model declined
 *  - no text otherwise           → empty
 */
export function interpretFeedbackDraftResponse(result: unknown): FeedbackDraftOutcome {
  const record = isRecord(result) ? result : {};
  const stopReason = typeof record.stop_reason === "string" ? record.stop_reason : null;
  const draft = extractTextFromContent(record.content);
  if (draft) {
    return { ok: true, draft, truncated: stopReason === "max_tokens", stopReason };
  }
  if (stopReason === "max_tokens") return { ok: false, reason: "max_tokens", stopReason };
  if (stopReason === "refusal") return { ok: false, reason: "refusal", stopReason };
  return { ok: false, reason: "empty", stopReason };
}

/** Token counts from the response, for cost tracking in logs. */
export function readUsage(result: unknown): { inputTokens: number | null; outputTokens: number | null } {
  const usage = isRecord(result) && isRecord(result.usage) ? result.usage : {};
  return {
    inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : null,
    outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : null,
  };
}
