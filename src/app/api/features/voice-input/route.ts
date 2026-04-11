// GET /api/features/voice-input
// Voice input config endpoint — actual transcription handled client-side
// via browser's Web Speech API (SpeechRecognition)

import { NextRequest, NextResponse } from "next/server";
import { getParticipantByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabled } from "@/lib/feature-flags";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    const featureEnabled = await isFeatureEnabled("tier-e.voiceInput");
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Voice input feature is not enabled" },
        { status: 403 }
      );
    }

    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      feature: "音声入力",
      description: "ブラウザのWeb Speech APIを使用して音声をテキストに変換します。",
      method: "client-side",
      language: "ja-JP",
      note: "Chrome/Safari/Edgeで動作します。",
    });
  } catch (error) {
    console.error("Voice input GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // Voice transcription is now handled client-side via Web Speech API
  // This endpoint is kept for backward compatibility
  const body = await req.json().catch(() => ({}));
  const token = (body as Record<string, string>).token || "";

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  return NextResponse.json({
    success: false,
    error: "Voice transcription is handled client-side. Use the browser's SpeechRecognition API.",
    text: "",
  });
}
