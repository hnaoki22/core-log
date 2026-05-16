// GET /api/features/daily-questions?token=<participant_token>
//
// Returns today's daily questions (Meso layer: weekly axis rotation).
// Gated by feature.dailyQuestions flag. Returns enabled:false (with empty
// arrays) if disabled or unset, so the frontend can fall back gracefully.

import { NextRequest, NextResponse } from "next/server";
import { resolveTenantFromToken } from "@/lib/tenant-from-token";
import { isFeatureEnabledForToken } from "@/lib/feature-flags";
import { getTodayQuestionsForTenant, getTodayDayKey } from "@/lib/daily-questions";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const featureEnabled = await isFeatureEnabledForToken("feature.dailyQuestions", token);
  if (!featureEnabled) {
    return NextResponse.json({
      enabled: false,
      day: getTodayDayKey(),
      axis: "",
      morning: [],
      evening: [],
    });
  }

  const tenantId = await resolveTenantFromToken(token);
  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const day = getTodayDayKey();
    const today = await getTodayQuestionsForTenant(tenantId);
    return NextResponse.json({
      enabled: true,
      day,
      axis: today?.axis || "",
      morning: today?.morning || [],
      evening: today?.evening || [],
    });
  } catch (err) {
    logger.error("daily-questions GET error", {
      error: err instanceof Error ? err.message : String(err),
      tenantId,
    });
    return NextResponse.json({ error: "Failed to load daily questions" }, { status: 500 });
  }
}
