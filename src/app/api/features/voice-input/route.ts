// POST /api/features/voice-input
//
// Whisper-based voice transcription (replaced previous Web Speech API stub).
// Phase 1 task 1.1 follow-up, 2026-05-16. Driven by reflection-lab dogfooding:
// 本藤さん's 3-week journal needs high-accuracy Japanese transcription for
// strategy/省察 vocabulary that browser-native speech APIs handle poorly.
//
// Contract:
//   POST /api/features/voice-input
//     Content-Type: multipart/form-data
//     Body: audio=<File>, token=<participant_token>
//   Response 200: { text: string, duration_sec: number, language: string }
//
// Security:
//   - Token validates as a known participant in the tenant.
//   - tier-e.voiceInput feature flag must be ON for that tenant.
//   - Audio file size cap 20MB (Whisper max 25MB).
//   - Rate limit: 20 requests per 60s per token (stricter than default 60/min;
//     each Whisper call costs ~$0.006 so we cap accidental loops).
//   - Audio bytes are streamed to Whisper and discarded; not persisted server-side.

import { NextRequest, NextResponse } from "next/server";
import { getParticipantByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabledForToken } from "@/lib/feature-flags";
import { rateLimit, getClientIp, buildRateLimitKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// Whisper hard limit is 25MB; pad down for multipart overhead.
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

// Per-token rate limit: 20 calls/60s. Each call is one user-initiated recording,
// so 20/min is plenty for legitimate dogfooding and bounds accidental loops.
const VOICE_RATE_LIMIT_PER_MIN = 20;

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel: allow up to 60s for slow Whisper turnaround

// ---------------------------------------------------------------------------
// GET — config probe (kept for backward compat; some legacy clients may call it)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const featureEnabled = await isFeatureEnabledForToken("tier-e.voiceInput", token);
  if (!featureEnabled) {
    return NextResponse.json(
      { error: "Voice input feature is not enabled" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    success: true,
    feature: "音声入力",
    description: "OpenAI Whisper API による日本語音声の文字起こし",
    method: "server-side-whisper",
    language: "ja",
    max_audio_mb: MAX_AUDIO_BYTES / 1024 / 1024,
    note: "MediaRecorder で録音した音声を multipart/form-data で POST してください",
  });
}

// ---------------------------------------------------------------------------
// POST — transcribe audio via Whisper
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  // ----- 1. Parse multipart form ------------------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    logger.warn("voice-input: invalid multipart body", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Invalid multipart/form-data body" },
      { status: 400 }
    );
  }

  const token = String(form.get("token") || "");
  const audio = form.get("audio");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }
  if (!audio || typeof audio === "string") {
    return NextResponse.json({ error: "audio file required" }, { status: 400 });
  }

  const audioFile = audio as File;

  // ----- 2. Size guard ----------------------------------------------------
  if (audioFile.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      {
        error: `Audio too large: ${audioFile.size} bytes > ${MAX_AUDIO_BYTES} bytes`,
      },
      { status: 413 }
    );
  }
  if (audioFile.size === 0) {
    return NextResponse.json({ error: "Empty audio file" }, { status: 400 });
  }

  // ----- 3. Feature flag check -------------------------------------------
  const featureEnabled = await isFeatureEnabledForToken("tier-e.voiceInput", token);
  if (!featureEnabled) {
    return NextResponse.json(
      { error: "Voice input feature is not enabled" },
      { status: 403 }
    );
  }

  // ----- 4. Participant validation ---------------------------------------
  const participant = await getParticipantByTokenFromSupabase(token);
  if (!participant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ----- 5. Rate limit (per-token + IP composite, stricter than default) -
  const ip = getClientIp(req);
  const key = `voice:${buildRateLimitKey({ url: req.url }, ip)}`;
  const rl = rateLimit(key, VOICE_RATE_LIMIT_PER_MIN, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded — please slow down" },
      { status: 429 }
    );
  }

  // ----- 6. Whisper API key check ----------------------------------------
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    logger.error("voice-input: OPENAI_API_KEY not configured");
    return NextResponse.json(
      { error: "Voice transcription service is not configured" },
      { status: 503 }
    );
  }

  // ----- 7. Forward to Whisper -------------------------------------------
  // Whisper expects multipart/form-data with at minimum `file` and `model`.
  // We pass language=ja to bias the decoder; Japanese strategy/省察 vocabulary
  // benefits from explicit language hinting over auto-detect.
  const whisperForm = new FormData();
  whisperForm.append("file", audioFile, audioFile.name || "audio.webm");
  whisperForm.append("model", "whisper-1");
  whisperForm.append("language", "ja");
  whisperForm.append("response_format", "json");
  // Bias the model toward business/strategy/省察 vocabulary used in CORE Log.
  // The prompt is at most 224 tokens (Whisper limit) and acts as a stylistic
  // and lexical hint — it does NOT inject literal words into the transcript.
  whisperForm.append(
    "prompt",
    "CORE Log の朝・夕のリフレクション。ジャーナル、省察、稽古、調える、人材育成、組織開発、エネルギー、ミッション、ビジョン、戦略、Human Mature、コンサルティング。"
  );

  let whisperResponse: Response;
  try {
    whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: whisperForm,
    });
  } catch (err) {
    logger.error("voice-input: Whisper fetch failed", {
      error: err instanceof Error ? err.message : String(err),
      participantId: participant.id,
    });
    return NextResponse.json(
      { error: "Voice transcription service unreachable" },
      { status: 502 }
    );
  }

  if (!whisperResponse.ok) {
    const detail = await whisperResponse.text().catch(() => "");
    logger.error("voice-input: Whisper returned non-OK", {
      status: whisperResponse.status,
      detail: detail.slice(0, 200),
      participantId: participant.id,
    });
    return NextResponse.json(
      { error: `Voice transcription failed (HTTP ${whisperResponse.status})` },
      { status: 502 }
    );
  }

  let result: { text?: string };
  try {
    result = (await whisperResponse.json()) as { text?: string };
  } catch (err) {
    logger.error("voice-input: failed to parse Whisper JSON", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Voice transcription response malformed" },
      { status: 502 }
    );
  }

  const text = (result.text || "").trim();
  const durationMs = Date.now() - startedAt;
  logger.info("voice-input: success", {
    participantId: participant.id,
    audioBytes: audioFile.size,
    textLength: text.length,
    durationMs,
  });

  return NextResponse.json({
    success: true,
    text,
    duration_ms: durationMs,
    language: "ja",
  });
}
