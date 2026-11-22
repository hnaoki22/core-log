// POST /api/mission/edits  { token, missionId }
// 本人のイシュー 1 件の「直した履歴」（直す前の文）を、新しい順に返す。
//
// - 読み取りだが POST にしている。トークンを URL に載せないため（URL は、アクセスの記録に残る）。
// - 返すのは、イシューの呼び名の環境（feature.missionLabelIssue）だけ。ほかの環境には
//   enabled:false を返す（履歴を残していない）。
// - 本人のトークンだけを受け付ける。行は、イシューの ID に加えて、トークンから引いたテナント ID と
//   参加者 ID で絞る（ほかの人のイシューの ID を送っても、空の一覧が返る）。
// - 読めなかったときは 500（「履歴なし」として返さない）。
// - 上司・運営の画面に、履歴を返す経路は、まだ無い。

import { NextRequest, NextResponse } from "next/server";
import { getParticipantByToken } from "@/lib/participant-db";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { MISSION_EDIT_LIST_MAX } from "@/lib/mission-edit";
import { listMissionEdits } from "@/lib/mission-edit-store";
import { logger } from "@/lib/logger";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { token, missionId } = (body && typeof body === "object" ? body : {}) as {
    token?: unknown;
    missionId?: unknown;
  };

  if (typeof missionId !== "string" || !UUID_RE.test(missionId)) {
    return NextResponse.json({ error: "missionId required" }, { status: 400 });
  }
  if (typeof token !== "string" || token === "") {
    return NextResponse.json({ error: "token required" }, { status: 401 });
  }

  try {
    const participant = await getParticipantByToken(token);
    if (!participant || !participant.id || !participant.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const enabled = await isFeatureEnabled("feature.missionLabelIssue", participant.tenantId);
    if (!enabled) {
      return NextResponse.json({ enabled: false, edits: [] });
    }

    const read = await listMissionEdits({
      missionId,
      tenantId: participant.tenantId,
      participantId: participant.id,
      limit: MISSION_EDIT_LIST_MAX,
    });
    if (!read.ok) {
      return NextResponse.json({ error: "Failed to load edits" }, { status: 500 });
    }
    return NextResponse.json({ enabled: true, edits: read.edits });
  } catch (error) {
    logger.error("Mission edits POST error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to load edits" }, { status: 500 });
  }
}
