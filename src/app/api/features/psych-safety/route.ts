// GET /api/features/psych-safety?token=xxx
// Admin-only endpoint to analyze psychological safety across organization
// Fetches recent manager feedback and comments, analyzes for safety signals

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getManagerByToken } from "@/lib/participant-db";
import { isFeatureEnabledForToken } from "@/lib/feature-flags";
import { analyzePsychSafety } from "@/lib/llm";
import { resolveManagerTenantStrict } from "@/lib/tenant-context";



interface FeedbackEntry {
  author_name: string;
  content: string;
  created_at: string;
}

interface LogCommentEntry {
  manager_comment: string;
  manager_comment_time: string;
}

interface FeedbackText {
  author: string;
  content: string;
  date: string;
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-a.psychSafetyMonitor", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Psychological safety feature is not enabled" },
        { status: 403 }
      );
    }

    // Admin-only check
    const manager = await getManagerByToken(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }
    const tenantResult = resolveManagerTenantStrict(manager);
    if (!tenantResult.ok) {
      return NextResponse.json(tenantResult.errorBody, { status: tenantResult.status });
    }
    const tenantId = tenantResult.tenantId;

    const client = getClient();
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch all managers for this tenant
    const { data: managers } = await client
      .from("managers")
      .select("*")
      .eq("tenant_id", tenantId);

    if (!managers || managers.length === 0) {
      return NextResponse.json({
        success: true,
        analyses: [],
        message: "No managers found",
      });
    }

    const analyses = [];

    // Analyze feedback from each manager
    for (const manager of managers) {
      // Fetch recent feedback/comments from this manager
      const { data: feedback } = await client
        .from("feedback")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("author_name", manager.name)
        .gte("created_at", thirtyDaysAgo.toISOString());

      // Also fetch manager comments from logs
      const { data: logComments } = await client
        .from("logs")
        .select("manager_comment, manager_comment_time")
        .eq("tenant_id", tenantId)
        .not("manager_comment", "is", null)
        .gte("manager_comment_time", thirtyDaysAgo.toISOString());

      // Combine all feedback texts
      const feedbackTexts: FeedbackText[] = [
        ...(feedback || []).map((f: FeedbackEntry) => ({
          author: f.author_name,
          content: f.content,
          date: f.created_at?.substring(0, 10) || new Date().toISOString().substring(0, 10),
        })),
        ...(logComments || []).map((lc: LogCommentEntry) => ({
          author: manager.name,
          content: lc.manager_comment,
          date: lc.manager_comment_time?.substring(0, 10) || new Date().toISOString().substring(0, 10),
        })),
      ];

      // Skip if no feedback
      if (feedbackTexts.length === 0) {
        continue;
      }

      // Analyze psychological safety
      const analysis = await analyzePsychSafety(feedbackTexts);

      // Store analysis in database
      const { data: analysisData, error: storeError } = await client
        .from("psych_safety_analyses")
        .insert({
          tenant_id: tenantId,
          manager_id: manager.id,
          score: analysis.score,
          negative_signals: analysis.signals,
          positive_signals: analysis.positives,
          summary: analysis.summary,
          feedback_count: feedbackTexts.length,
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (!storeError && analysisData) {
        analyses.push({
          analysisId: analysisData.id,
          managerId: manager.id,
          managerName: manager.name,
          score: analysis.score,
          negativeSignals: analysis.signals,
          positiveSignals: analysis.positives,
          summary: analysis.summary,
          feedbackCount: feedbackTexts.length,
        });
      }
    }

    return NextResponse.json({
      success: true,
      analyses,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Psychological safety analysis error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
