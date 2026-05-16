// GET /api/features/daily-questions?token=<participant_token>
//
// Returns the tenant's 6 daily questions (3 morning + 3 evening).
// Gated by feature.dailyQuestions flag. Returns empty arrays if disabled
// or unset, so the frontend can gracefully fall back to the legacy view.

import { NextRequest, NextResponse } from "next/server";
import { resolveTenantFromToken } from "@/lib/tenant-from-token";
import { isFeatureEnabledForToken } from "@/lib/feature-flags";
import { getQuestionsForTenant } from "@/lib/daily-questions";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const featureEnabled = await isFeatureEnabledForToken(
    "feature.dailyQuestions",
    token
  );
  if (!featureEnabled) {
    return NextResponse.json({
      enabled: false,
      morning: [],
      evening: [],
    });
  }

  const tenantId = await resolveTenantFromToken(token);
  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const questions = await getQuestionsForTenant(tenantId);
    return NextResponse.json({
      enabled: true,
      morning: questions.morning,
      evening: questions.evening,
    });
  } catch (err) {
    logger.error("daily-questions GET error", {
      error: err instanceof Error ? err.message : String(err),
      tenantId,
    });
    return NextResponse.json(
      { error: "Failed to load daily questions" },
      { status: 500 }
    );
  }
}
