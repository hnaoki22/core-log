// POST /api/features/before-after
// Accepts: { token, assessmentType: "before"|"after", answers: { q1: 1-5, q2: 1-5, ... } }
// 10 questions about self-awareness, learning habits, etc.
// Calculate total_score
// GET returns both before and after with delta

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getParticipantByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabledForToken } from "@/lib/feature-flags";


function validateAnswers(answers: unknown): boolean {
  if (typeof answers !== "object" || answers === null) return false;
  const a = answers as Record<string, unknown>;

  // Check that we have exactly 10 questions (q1-q10)
  for (let i = 1; i <= 10; i++) {
    const key = `q${i}`;
    if (!(key in a)) return false;
    const val = a[key];
    if (typeof val !== "number" || val < 1 || val > 5) return false;
  }
  return true;
}

function calculateScore(answers: Record<string, number>): number {
  let sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += answers[`q${i}`] || 0;
  }
  return sum; // Total of all answers (10-50)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, assessmentType, answers } = body;

    if (!token || !assessmentType || !answers) {
      return NextResponse.json(
        { error: "Token, assessmentType, and answers are required" },
        { status: 400 }
      );
    }

    if (assessmentType !== "before" && assessmentType !== "after") {
      return NextResponse.json(
        { error: "assessmentType must be 'before' or 'after'" },
        { status: 400 }
      );
    }

    if (!validateAnswers(answers)) {
      return NextResponse.json(
        { error: "Answers must contain q1-q10 with values 1-5" },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-f.beforeAfter", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Before-after assessment feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Calculate total score
    const totalScore = calculateScore(answers as Record<string, number>);

    // Store in before_after_assessments table
    const client = getClient();
    const { data, error } = await client
      .from("before_after_assessments")
      .insert({
        tenant_id: participant.tenantId,
        participant_id: participant.id,
        assessment_type: assessmentType,
        answers,
        total_score: totalScore,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Before-after assessment insert error:", error);
      return NextResponse.json(
        { error: "Failed to store assessment" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      assessmentId: data.id,
      assessmentType,
      totalScore,
    });
  } catch (error) {
    console.error("Before-after assessment error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-f.beforeAfter", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Before-after assessment feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch assessments for this participant
    const client = getClient();
    const { data, error } = await client
      .from("before_after_assessments")
      .select("*")
      .eq("tenant_id", participant.tenantId)
      .eq("participant_id", participant.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Before-after assessment fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch assessments" },
        { status: 500 }
      );
    }

    // Separate before and after assessments
    const assessments = data || [];
    const beforeAssessment = assessments.find(a => a.assessment_type === "before");
    const afterAssessment = assessments.find(a => a.assessment_type === "after");

    // Calculate delta if both exist
    let delta = null;
    if (beforeAssessment && afterAssessment) {
      delta = afterAssessment.total_score - beforeAssessment.total_score;
    }

    return NextResponse.json({
      success: true,
      before: beforeAssessment || null,
      after: afterAssessment || null,
      delta,
      improvement: delta ? (delta > 0 ? "positive" : delta < 0 ? "negative" : "no change") : "incomplete",
      assessmentCount: assessments.length,
    });
  } catch (error) {
    console.error("Before-after assessment GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
