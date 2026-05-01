// POST /api/features/hero
// Accepts: { token, answers } where answers is { hope: [1-5 ratings], efficacy: [ratings], resilience: [ratings], optimism: [ratings] }
// Each dimension has 3 questions, rated 1-5
// Calculate dimension scores (avg * 20 to get 0-100) and total
// GET returns past assessments with trend data

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getParticipantByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabledForToken } from "@/lib/feature-flags";

type HeroAnswers = {
  hope: number[];
  efficacy: number[];
  resilience: number[];
  optimism: number[];
};

function validateAnswers(answers: unknown): answers is HeroAnswers {
  if (typeof answers !== "object" || answers === null) return false;
  const a = answers as Record<string, unknown>;

  return (
    Array.isArray(a.hope) && a.hope.length === 3 && a.hope.every(v => typeof v === "number" && v >= 1 && v <= 5) &&
    Array.isArray(a.efficacy) && a.efficacy.length === 3 && a.efficacy.every(v => typeof v === "number" && v >= 1 && v <= 5) &&
    Array.isArray(a.resilience) && a.resilience.length === 3 && a.resilience.every(v => typeof v === "number" && v >= 1 && v <= 5) &&
    Array.isArray(a.optimism) && a.optimism.length === 3 && a.optimism.every(v => typeof v === "number" && v >= 1 && v <= 5)
  );
}

function calculateDimensionScore(ratings: number[]): number {
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  return Math.round(avg * 20); // Scale to 0-100
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, answers } = body;

    if (!token || !answers) {
      return NextResponse.json(
        { error: "Token and answers are required" },
        { status: 400 }
      );
    }

    if (!validateAnswers(answers)) {
      return NextResponse.json(
        { error: "Answers must contain hope, efficacy, resilience, optimism arrays of 3 numbers each (1-5)" },
        { status: 400 }
      );
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-d.heroAssessment", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Hero assessment feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Calculate dimension scores
    const hopeScore = calculateDimensionScore(answers.hope);
    const efficacyScore = calculateDimensionScore(answers.efficacy);
    const resilienceScore = calculateDimensionScore(answers.resilience);
    const optimismScore = calculateDimensionScore(answers.optimism);
    const totalScore = Math.round((hopeScore + efficacyScore + resilienceScore + optimismScore) / 4);

    // Store in hero_assessments table
    const client = getClient();
    const { data, error } = await client
      .from("hero_assessments")
      .insert({
        tenant_id: participant.tenantId,
        participant_id: participant.id,
        hope_score: hopeScore,
        efficacy_score: efficacyScore,
        resilience_score: resilienceScore,
        optimism_score: optimismScore,
        total_score: totalScore,
        raw_answers: answers,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Hero assessment insert error:", error);
      return NextResponse.json(
        { error: "Failed to store assessment" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      assessmentId: data.id,
      scores: {
        hope: hopeScore,
        efficacy: efficacyScore,
        resilience: resilienceScore,
        optimism: optimismScore,
        total: totalScore,
      },
    });
  } catch (error) {
    console.error("Hero assessment error:", error);
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
    const featureEnabled = await isFeatureEnabledForToken("tier-d.heroAssessment", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Hero assessment feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch past assessments for this participant
    const client = getClient();
    const { data, error } = await client
      .from("hero_assessments")
      .select("*")
      .eq("tenant_id", participant.tenantId)
      .eq("participant_id", participant.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Hero assessment fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch assessments" },
        { status: 500 }
      );
    }

    // Calculate trend data (average scores over time)
    const assessments = data || [];
    const trend = {
      hopeAvg: assessments.length > 0 ? Math.round(assessments.reduce((a, b) => a + b.hope_score, 0) / assessments.length) : 0,
      efficacyAvg: assessments.length > 0 ? Math.round(assessments.reduce((a, b) => a + b.efficacy_score, 0) / assessments.length) : 0,
      resilienceAvg: assessments.length > 0 ? Math.round(assessments.reduce((a, b) => a + b.resilience_score, 0) / assessments.length) : 0,
      optimismAvg: assessments.length > 0 ? Math.round(assessments.reduce((a, b) => a + b.optimism_score, 0) / assessments.length) : 0,
      totalAvg: assessments.length > 0 ? Math.round(assessments.reduce((a, b) => a + b.total_score, 0) / assessments.length) : 0,
    };

    return NextResponse.json({
      success: true,
      assessments,
      trend,
      count: assessments.length,
    });
  } catch (error) {
    console.error("Hero assessment GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
