// GET /api/features/double-loop?token=xxx
// Check if today is Monday (or first day of week)
// If yes, return a rotating double-loop prompt question
// No database needed, purely logic-based

import { NextRequest, NextResponse } from "next/server";
import { getParticipantByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabledForToken } from "@/lib/feature-flags";

// Rotating set of double-loop questions
const DOUBLE_LOOP_QUESTIONS = [
  {
    title: "前提破壊",
    question: "今週取り組もうとしていることの「前提」は何ですか？それは本当に正しいですか？",
  },
  {
    title: "目的の問い直し",
    question: "なぜそれをやろうと思いました？その目的は本当に変わっていませんか？",
  },
  {
    title: "制約の検証",
    question: "やれない理由だと思っていることは、本当に制約ですか？それを乗り越える道はありませんか？",
  },
  {
    title: "視点転換",
    question: "ステークホルダーの目線で見たとき、この計画の弱点は何ですか？",
  },
  {
    title: "結果想定",
    question: "最高の結果が得られたとして、その時何が変わっていますか？最悪の結果なら何が失われますか？",
  },
];

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-s.doubleLoopPrompt", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Double-loop prompt feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current day (0=Sunday, 1=Monday, etc.)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const isMonday = dayOfWeek === 1;

    if (!isMonday) {
      return NextResponse.json({
        success: true,
        showPrompt: false,
        message: "Double-loop prompts are shown on Mondays only",
      });
    }

    // Select a rotating question based on week number
    // Use ISO week number for consistency
    const jan4 = new Date(now.getFullYear(), 0, 4);
    const weekStart = new Date(jan4);
    weekStart.setDate(jan4.getDate() - jan4.getDay());
    const weekNum =
      Math.floor((now.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    const questionIndex = (weekNum - 1) % DOUBLE_LOOP_QUESTIONS.length;
    const selectedQuestion = DOUBLE_LOOP_QUESTIONS[questionIndex];

    return NextResponse.json({
      success: true,
      showPrompt: true,
      weekNumber: weekNum,
      title: selectedQuestion.title,
      question: selectedQuestion.question,
      allQuestions: DOUBLE_LOOP_QUESTIONS.map((q) => q.question),
    });
  } catch (error) {
    console.error("Double-loop prompt error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
