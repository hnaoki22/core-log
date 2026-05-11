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

    // Compute "today in JST" so the Monday check matches the user's local
    // week boundary rather than the server's UTC reference. Previously
    // `now.getDay()` on UTC Vercel could report Sunday during JST Monday.
    const jstDateString = new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10); // YYYY-MM-DD in JST
    const [y, m, d] = jstDateString.split("-").map((n) => parseInt(n, 10));
    const jstDate = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = jstDate.getUTCDay(); // 0=Sunday in JST
    const isMonday = dayOfWeek === 1;

    if (!isMonday) {
      return NextResponse.json({
        success: true,
        showPrompt: false,
        message: "Double-loop prompts are shown on Mondays only",
      });
    }

    // ISO week number anchored to JST (Thursday-of-week rule).
    const target = new Date(jstDate);
    const dayNum = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(
      ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    // Use a modulo guarded against negative values (year-edge weeks).
    const len = DOUBLE_LOOP_QUESTIONS.length;
    const questionIndex = ((weekNum - 1) % len + len) % len;
    const selectedQuestion = DOUBLE_LOOP_QUESTIONS[questionIndex];

    return NextResponse.json({
      success: true,
      showPrompt: true,
      weekNumber: weekNum,
      title: selectedQuestion.title,
      question: selectedQuestion.question,
      // Removed `allQuestions` — previously shipped the full rotation to the
      // client every request, which leaked the surprise of the weekly prompt.
    });
  } catch (error) {
    console.error("Double-loop prompt error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
