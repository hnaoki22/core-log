// POST /api/features/voice-input
// Accept multipart form with audio file + token
// Uses OpenAI Whisper API for transcription
// Returns { text: "transcribed text" }

import { NextRequest, NextResponse } from "next/server";
import { getParticipantByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/lib/feature-flags";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import os from "os";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FileStreamType = any;

export async function POST(req: NextRequest) {
  let tempFilePath: string | null = null;

  try {
    const formData = await req.formData();
    const token = formData.get("token") as string;
    const audioFile = formData.get("audio") as File;

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    if (!audioFile) {
      return NextResponse.json(
        { error: "Audio file is required" },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-e.voiceInput");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Voice input feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate audio file size (max 25MB for Whisper API)
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Audio file too large. Maximum size is 25MB." },
        { status: 400 }
      );
    }

    // Convert file to buffer and save temporarily
    const buffer = await audioFile.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    // Create temp file
    const tmpDir = os.tmpdir();
    tempFilePath = path.join(tmpDir, `audio-${Date.now()}.webm`);
    fs.writeFileSync(tempFilePath, uint8Array);

    // Create file stream for OpenAI API
    const fileStream = fs.createReadStream(tempFilePath);

    // Call Whisper API for transcription
    const transcription = await openai.audio.transcriptions.create({
      file: fileStream as FileStreamType,
      model: "whisper-1",
      language: "ja", // Default to Japanese
    });

    const transcribedText = transcription.text || "";

    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    return NextResponse.json({
      success: true,
      text: transcribedText,
      confidence: "high",
    });
  } catch (error) {
    // Clean up temp file on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    console.error("Voice input transcription error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: `Transcription failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabled("tier-e.voiceInput");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Voice input feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      feature: "音声入力",
      description: "Whisper APIを使用して音声をテキストに変換します。",
      supportedFormats: [
        "mp3",
        "mp4",
        "mpeg",
        "mpga",
        "m4a",
        "wav",
        "webm",
      ],
      maxFileSize: "25MB",
      language: "日本語（ ja ）",
    });
  } catch (error) {
    console.error("Voice input GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
