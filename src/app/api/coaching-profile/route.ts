// GET /api/coaching-profile?token=...   本人の設計図を返す
// PUT /api/coaching-profile              本人が設計図を保存する（confirm=true で確定）
//
// - 読み書きできるのは本人の分だけ。参加者 ID とテナント ID は、トークンから引いた値だけを使う
//   （リクエスト本文の ID や氏名は受け取らない）。
// - feature.coachingProfile が OFF の環境では、読み取りは enabled:false、保存は 403。
// - 運営が置いた傾向は、本人の選択（使う／使わない）だけを反映する（store 側で文を固定）。

import { NextRequest, NextResponse } from "next/server";
import { getParticipantByToken } from "@/lib/participant-db";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { sanitizeInput } from "@/lib/sanitize";
import { logger } from "@/lib/logger";
import { normalizeProfileFields } from "@/lib/coaching-profile";
import { getCoachingProfile, saveCoachingProfileByParticipant } from "@/lib/coaching-profile-store";

export const dynamic = "force-dynamic";

const FEATURE_KEY = "feature.coachingProfile";

async function resolveParticipant(token: unknown) {
  if (typeof token !== "string" || token === "") return null;
  const participant = await getParticipantByToken(token);
  if (!participant || !participant.id || !participant.tenantId) return null;
  return { id: participant.id, tenantId: participant.tenantId };
}

export async function GET(req: NextRequest) {
  try {
    const me = await resolveParticipant(req.nextUrl.searchParams.get("token"));
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!(await isFeatureEnabled(FEATURE_KEY, me.tenantId))) {
      return NextResponse.json({ enabled: false, profile: null });
    }
    const read = await getCoachingProfile(me.id, me.tenantId);
    if (!read.ok) {
      return NextResponse.json({ error: "Failed to load" }, { status: 500 });
    }
    return NextResponse.json({ enabled: true, profile: read.profile });
  } catch (err) {
    logger.error("coaching-profile GET error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const me = await resolveParticipant(body.token);
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!(await isFeatureEnabled(FEATURE_KEY, me.tenantId))) {
      return NextResponse.json({ error: "Feature not enabled" }, { status: 403 });
    }

    // タグと制御文字を落としてから、欄ごとの上限でそろえる。
    const rawTendencies = Array.isArray(body.tendencies) ? body.tendencies : [];
    const fields = normalizeProfileFields({
      headline: sanitizeInput(body.headline),
      growthTheme: sanitizeInput(body.growthTheme),
      actions: sanitizeInput(body.actions),
      expected: sanitizeInput(body.expected),
      stallPoints: sanitizeInput(body.stallPoints),
      eveningQuestion: sanitizeInput(body.eveningQuestion),
      tendencies: rawTendencies.map((t) => {
        const rec = (typeof t === "object" && t !== null ? t : {}) as Record<string, unknown>;
        return { text: sanitizeInput(rec.text), use: rec.use };
      }),
    });

    const result = await saveCoachingProfileByParticipant(me.id, me.tenantId, fields, {
      confirm: body.confirm === true,
      now: new Date().toISOString(),
    });
    if (!result.ok) {
      if (result.reason === "blocked") {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
    logger.info("coaching-profile saved", {
      tenantId: me.tenantId,
      participantId: me.id,
      status: result.profile.status,
    });
    return NextResponse.json({ ok: true, profile: result.profile });
  } catch (err) {
    logger.error("coaching-profile PUT error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
