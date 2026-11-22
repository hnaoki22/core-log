// GET /api/features/daily-questions?token=<participant_token>
//
// Returns today's daily questions (Meso layer: weekly axis rotation).
// Gated by feature.dailyQuestions flag. Returns enabled:false (with empty
// arrays) if disabled or unset, so the frontend can fall back gracefully.

import { NextRequest, NextResponse } from "next/server";
import { resolveTenantFromToken } from "@/lib/tenant-from-token";
import { isFeatureEnabled, isFeatureEnabledForToken } from "@/lib/feature-flags";
import { getTodayQuestionsForTenant, getTodayDayKey } from "@/lib/daily-questions";
import { getParticipantByToken } from "@/lib/participant-db";
import { withPersonalEveningQuestion } from "@/lib/coaching-profile";
import { getCoachingProfile } from "@/lib/coaching-profile-store";
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

    // 設計図（feature.coachingProfile）が確認済みの人には、夕方の問いの後ろに
    // 「あなたの問い」を 1 つ足す。入力画面のサーバー側（page.tsx）と同じ関数で足すので、
    // 最初の描画と、この API で読み直したあとで、問いの並びは変わらない。
    // 読めなかったときは足さない（失敗は getCoachingProfile が記録済み）。
    let evening = { questions: today?.evening || [], personalCount: 0 };
    if (await isFeatureEnabled("feature.coachingProfile", tenantId)) {
      const participant = await getParticipantByToken(token);
      if (participant?.id && participant.tenantId === tenantId) {
        const read = await getCoachingProfile(participant.id, tenantId);
        if (read.ok) {
          evening = withPersonalEveningQuestion(today?.evening || [], read.profile);
        }
      }
    }

    return NextResponse.json({
      enabled: true,
      day,
      axis: today?.axis || "",
      morning: today?.morning || [],
      evening: evening.questions,
      eveningPersonalCount: evening.personalCount,
    });
  } catch (err) {
    logger.error("daily-questions GET error", {
      error: err instanceof Error ? err.message : String(err),
      tenantId,
    });
    return NextResponse.json({ error: "Failed to load daily questions" }, { status: 500 });
  }
}
