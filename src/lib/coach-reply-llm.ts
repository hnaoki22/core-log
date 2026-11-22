// 「AIコーチの返信」の AI の呼び出し（サーバー側だけ）。
//
// 呼び出し方は、管理画面の「AI下書き」と同じ（src/lib/feedback-draft.ts。
// いまの世代のモデルの応答＝先頭が thinking ブロック、max_tokens を thinking と共有、に対応済み）。
// 共通ヘルパー（src/lib/llm.ts）は使わない（temperature を送り content[0] を読むため、
// いまの世代のモデルでは動かない）。
//
// モデルは ANTHROPIC_MODEL_COACH。無ければ「AI下書き」と同じモデル（ANTHROPIC_MODEL_FEEDBACK → 既定）。
// アプリ全体で止めるときは COACH_REPLY_DISABLED=1。

import {
  DEFAULT_FEEDBACK_MODEL,
  buildFeedbackDraftRequestBody,
  interpretFeedbackDraftResponse,
  readUsage,
  type FeedbackDraftRequestBody,
} from "./feedback-draft";
import { logger } from "./logger";

type EnvLike = Record<string, string | undefined>;

/** route の maxDuration（60 秒）より短くする。 */
export const COACH_UPSTREAM_TIMEOUT_MS = 50_000;

export function resolveCoachModel(env: EnvLike = process.env): string {
  const coach = (env.ANTHROPIC_MODEL_COACH || "").trim();
  if (coach) return coach;
  const feedback = (env.ANTHROPIC_MODEL_FEEDBACK || "").trim();
  return feedback || DEFAULT_FEEDBACK_MODEL;
}

/** アプリ全体で、AIコーチの返信を止める設定（環境変数）。 */
export function isCoachKillSwitchOn(env: EnvLike = process.env): boolean {
  return (env.COACH_REPLY_DISABLED || "").trim() === "1";
}

/** リクエストの本文。形は「AI下書き」と同じ（サンプリングの値を送らない、最後は user の発言）。モデルだけが違う。 */
export function buildCoachRequestBody(args: {
  systemPrompt: string;
  userPrompt: string;
  env?: EnvLike;
}): FeedbackDraftRequestBody {
  const env = args.env ?? process.env;
  return buildFeedbackDraftRequestBody({
    systemPrompt: args.systemPrompt,
    userPrompt: args.userPrompt,
    env: { ...env, ANTHROPIC_MODEL_FEEDBACK: resolveCoachModel(env) },
  });
}

export type CoachLlmResult =
  | { ok: true; text: string; model: string }
  | {
      ok: false;
      /** refusal = AI が応答を断った（呼び出し側は、返信を作らず、運営の確認待ちにする）。 */
      reason: "no_api_key" | "timeout" | "network" | "api_error" | "no_text" | "truncated" | "refusal";
      model: string;
    };

/**
 * AI を 1 回呼ぶ。記入の文はログに残さない（残すのは、参加者 ID・モデル・トークン数・失敗の種類）。
 */
export async function callCoachModel(args: {
  systemPrompt: string;
  userPrompt: string;
  participantId: string;
}): Promise<CoachLlmResult> {
  const requestBody = buildCoachRequestBody({ systemPrompt: args.systemPrompt, userPrompt: args.userPrompt });
  const model = requestBody.model;
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) {
    logger.error("coach reply: ANTHROPIC_API_KEY is not set");
    return { ok: false, reason: "no_api_key", model };
  }

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(COACH_UPSTREAM_TIMEOUT_MS),
    });
  } catch (fetchError) {
    const timedOut =
      fetchError instanceof Error && (fetchError.name === "TimeoutError" || fetchError.name === "AbortError");
    logger.error("coach reply: request did not complete", {
      participantId: args.participantId,
      model,
      timedOut,
      error: String(fetchError),
    });
    return { ok: false, reason: timedOut ? "timeout" : "network", model };
  }

  if (!response.ok) {
    const errText = await response.text();
    logger.error("coach reply: API error", {
      participantId: args.participantId,
      model,
      statusCode: response.status,
      error: errText.slice(0, 500),
    });
    return { ok: false, reason: "api_error", model };
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch (parseError) {
    logger.error("coach reply: response was not JSON", {
      participantId: args.participantId,
      model,
      error: String(parseError),
    });
    return { ok: false, reason: "api_error", model };
  }
  const outcome = interpretFeedbackDraftResponse(result);
  const usage = readUsage(result);
  if (!outcome.ok) {
    logger.error("coach reply: no text returned", {
      participantId: args.participantId,
      model,
      reason: outcome.reason,
      stopReason: outcome.stopReason,
      ...usage,
    });
    return { ok: false, reason: outcome.reason === "refusal" ? "refusal" : "no_text", model };
  }
  if (outcome.truncated) {
    // 上限に当たって、文の途中で切れた返信。途中で切れた文は、本人に届けない。
    logger.error("coach reply: text was cut off at max_tokens", {
      participantId: args.participantId,
      model,
      stopReason: outcome.stopReason,
      ...usage,
    });
    return { ok: false, reason: "truncated", model };
  }
  logger.info("coach reply: generated", {
    participantId: args.participantId,
    model,
    stopReason: outcome.stopReason,
    ...usage,
  });
  return { ok: true, text: outcome.draft, model };
}
