// GET /api/features/efficacy-boost?token=xxx
// Fetches participant's logs
// Calls findEfficacyMoments() from lib/llm.ts
// Returns past "overcome" moments as encouragement

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/supabase";
import { getParticipantByTokenFromSupabase } from "@/lib/supabase";
import { isFeatureEnabledForToken } from "@/lib/feature-flags";
import { findEfficacyMoments } from "@/lib/llm";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Check feature flag
    const featureEnabled = await isFeatureEnabledForToken("tier-d.efficacyBooster", token);
    if (!featureEnabled) {
      return NextResponse.json(
        { error: "Efficacy booster feature is not enabled" },
        { status: 403 }
      );
    }

    // Verify participant token
    const participant = await getParticipantByTokenFromSupabase(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch recent logs from logs table (Notion integration)
    // This assumes logs are stored in Supabase logs table
    const client = getClient();
    const { data: logsData, error: logsError } = await client
      .from("logs")
      .select("date, morning_intent, evening_insight")
      .eq("tenant_id", participant.tenantId)
      .eq("participant_name", participant.name)
      .order("date", { ascending: false })
      .limit(30);

    if (logsError) {
      console.error("Failed to fetch logs:", logsError);
      return NextResponse.json(
        { error: "Failed to fetch logs" },
        { status: 500 }
      );
    }

    // Transform logs to format expected by findEfficacyMoments
    const transformedLogs = (logsData || []).map(log => ({
      date: log.date,
      morning: log.morning_intent || "",
      evening: log.evening_insight || "",
    }));

    if (transformedLogs.length === 0) {
      return NextResponse.json({
        success: true,
        moments: [],
        message: "No logs found yet. Start logging to discover your efficacy moments!",
      });
    }

    // Analyze logs to find efficacy moments
    const moments = await findEfficacyMoments(transformedLogs);

    return NextResponse.json({
      success: true,
      moments,
      logsAnalyzed: transformedLogs.length,
      message: moments.length > 0
        ? "Here are moments when you overcame challenges and succeeded!"
        : "Keep logging - we'll find your efficacy moments soon!",
    });
  } catch (error) {
    console.error("Efficacy booster error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
