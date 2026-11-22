// POST /api/mission - Create a new mission (manager action)
// PATCH /api/mission - Update mission status (manager action) / edit title・purpose・deadline
//   （イシューの呼び名の環境では、直す前の文を mission_edits に残してから直す。本人も直せる）
// GET /api/mission?participantName=xxx - Get missions for participant

import { NextRequest, NextResponse } from "next/server";
import {
  createMission,
  updateMissionStatus,
  updateMissionFields,
  getMissionsByParticipant,
  getMissionById,
  getParticipantByNameCrossTenant,
} from "@/lib/supabase";
import { getManagerByToken, getParticipantByToken, getParticipantByName } from "@/lib/participant-db";
import type { ManagerInfo, ParticipantInfo } from "@/lib/participant-db";
import { getTodayJST } from "@/lib/date-utils";
import { sendNotificationEmail } from "@/lib/email";
import { sanitizeInput } from "@/lib/sanitize";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import { decideMissionEdit, type MissionEditActor, type MissionEditSubmission } from "@/lib/mission-edit";
import { deleteMissionEdit, getMissionEditTarget, insertMissionEdit } from "@/lib/mission-edit-store";

// Allowed mission status values. Persisting arbitrary strings caused enum drift
// across UI/DB; whitelist at the API boundary.
const ALLOWED_MISSION_STATUS = new Set([
  "未着手",
  "進行中",
  "完了",
  "保留",
  "中止",
]);

type MissionTarget = {
  id: string;
  name: string;
  email?: string;
  token?: string;
  tenantId: string;
};

// Trap 3（actor's tenant vs target's tenant）: ミッションが属する参加者を解決する。
// actor のテナント固定だと、admin が他テナント参加者の /m ページ（クロステナント
// 表示可）からミッションを作成した時に、admin のホームテナント側へ
// participant_id="" で無エラー作成される silent wrong-tenant write になる
// （2026-07-04 認可監査）。自テナント一致を優先し、admin のみ一意な
// クロステナント一致へフォールバックする（同名複数テナントは null = 404）。
async function resolveMissionTarget(
  manager: ManagerInfo | null,
  participant: ParticipantInfo | null,
  participantName: string
): Promise<MissionTarget | null> {
  if (participant) {
    if (!participant.tenantId) return null;
    return {
      id: participant.id,
      name: participant.name,
      email: participant.email,
      token: participant.token,
      tenantId: participant.tenantId,
    };
  }
  if (!manager) return null;
  if (manager.tenantId) {
    const own = await getParticipantByName(participantName, manager.tenantId);
    if (own?.id && own.tenantId) {
      return {
        id: own.id,
        name: own.name,
        email: own.email,
        token: own.token,
        tenantId: own.tenantId,
      };
    }
  }
  if (manager.isAdmin) {
    const cross = await getParticipantByNameCrossTenant(participantName);
    if (cross) {
      return {
        id: cross.id,
        name: cross.name,
        email: cross.email,
        token: cross.token,
        tenantId: cross.tenantId,
      };
    }
  }
  return null;
}

// 直す前の文を残してから、イシュー（ミッション）の文を直す（feature.missionLabelIssue の環境）。
// - 直してよいか、何を残すかは decideMissionEdit（純関数）が決める。
// - 本人のときは、イシューの持ち主（participant_id）が、トークンから引いた本人と同じことも確かめる
//   （氏名の一致だけで本人と見なさない）。
// - 順序：履歴を 1 行残す → イシューを更新する。更新に失敗したら、残した 1 行を取り消す。
//   履歴を残せなかったときは、更新しない（直す前の文が残らないまま、書き換えない）。
async function editMissionWithHistory(args: {
  missionId: string;
  tenantId: string;
  actor: MissionEditActor;
  /** 本人のとき、トークンから引いた参加者 ID。 */
  participantId: string | null;
  submitted: MissionEditSubmission;
}): Promise<NextResponse> {
  const target = await getMissionEditTarget(args.missionId, args.tenantId);
  if (!target.ok) {
    return NextResponse.json({ error: "Failed to update mission" }, { status: 500 });
  }
  if (!target.row) {
    return NextResponse.json({ error: "Mission not found" }, { status: 404 });
  }

  const decision = decideMissionEdit({
    actor: args.actor,
    ownerMatches:
      args.actor === "participant"
        ? Boolean(args.participantId) && target.row.participantId === args.participantId
        : true,
    status: target.row.status,
    current: target.row,
    submitted: args.submitted,
  });
  if (decision.action === "reject") {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }
  if (decision.action === "noop") {
    return NextResponse.json({ success: true, changed: false, mission: decision.current });
  }

  const saved = await insertMissionEdit({
    tenantId: args.tenantId,
    missionId: args.missionId,
    participantId: target.row.participantId,
    editedBy: args.actor,
    before: decision.before,
  });
  if (!saved.ok) {
    return NextResponse.json({ error: "Failed to update mission" }, { status: 500 });
  }

  const success = await updateMissionFields(args.missionId, decision.update, args.tenantId);
  if (!success) {
    const undone = await deleteMissionEdit(saved.id, args.tenantId);
    if (!undone) {
      logger.error("Mission edit: history row was left behind after a failed update", {
        missionId: args.missionId,
        tenantId: args.tenantId,
        editId: saved.id,
      });
    }
    return NextResponse.json({ error: "Failed to update mission" }, { status: 500 });
  }
  // 保存した値（無害化と、前後の空白の整理を通したあとの値）を返す。画面は、この値に表示を合わせる。
  return NextResponse.json({ success: true, changed: true, mission: decision.after });
}

export async function GET(request: NextRequest) {
  const participantName = request.nextUrl.searchParams.get("participantName");
  const token = request.nextUrl.searchParams.get("token");

  if (!participantName) {
    return NextResponse.json({ error: "participantName required" }, { status: 400 });
  }
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 401 });
  }

  try {
    const manager = await getManagerByToken(token);
    const participant = !manager ? await getParticipantByToken(token) : null;
    if (!manager && !participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Authorization: a participant can only read their own missions. A manager
    // can read missions for anyone in their tenant (a fuller fix would scope to
    // their direct reports, but that breaks today's admin overview).
    if (participant && participant.name !== participantName) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Trap 3: TARGET 参加者のテナントで読む。actor のテナント固定だと、admin が
    // 他テナント参加者を表示中の再取得が常に空リストになる（POST 修正と対）。
    // 対象が見つからない場合は従来どおり actor のテナントで読む（＝空リスト）。
    const target = await resolveMissionTarget(manager, participant, participantName);
    const tenantId = target?.tenantId || manager?.tenantId || participant?.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const missions = await getMissionsByParticipant(participantName, tenantId);
    return NextResponse.json({ missions });
  } catch (error) {
    console.error("Mission GET error:", error);
    return NextResponse.json({ error: "Failed to fetch missions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, participantName, title, purpose, deadline } = body;

    if (!token || !participantName || !title) {
      return NextResponse.json(
        { error: "token, participantName, title required" },
        { status: 400 }
      );
    }

    // Sanitize user input
    const sanitizedTitle = sanitizeInput(title);
    const sanitizedPurpose = sanitizeInput(purpose || "");

    // Verify manager or participant token
    const manager = await getManagerByToken(token);
    const participant = !manager ? await getParticipantByToken(token) : null;
    if (!manager && !participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // If participant creates their own mission, use their name
    const effectiveName = participant ? participant.name : participantName;
    if (!effectiveName) {
      return NextResponse.json({ error: "participantName required" }, { status: 400 });
    }

    // Trap 3: TARGET 参加者のテナントに書く（actor のテナントではなく）。
    // 従来は対象が見つからなくても participant_id="" で actor テナントに
    // 作成されていた（silent wrong-tenant write / orphan mission）。
    const target = await resolveMissionTarget(manager, participant, effectiveName);
    if (!target) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }
    const tenantId = target.tenantId;
    const participantId = target.id;

    const setDate = getTodayJST();
    const createdBy = manager ? "上司設定" : "自己設定";
    const missionId = await createMission(
      effectiveName,
      sanitizedTitle,
      sanitizedPurpose,
      deadline || "",
      setDate,
      createdBy as "上司設定" | "自己設定",
      tenantId,
      participantId
    );

    if (!missionId) {
      return NextResponse.json({ error: "Failed to create mission" }, { status: 500 });
    }

    // Notify about new mission (non-blocking)
    try {
      if (manager) {
        // Manager created → notify participant (target row already resolved above)
        if (target.email && target.token && !target.email.includes("example.com")) {
          await sendNotificationEmail({
            to: target.email,
            recipientName: target.name.split(" ")[0],
            senderName: manager.name,
            token: target.token,
            type: "mission_created",
            detail: sanitizedTitle,
          });
        }
      }
      // Participant created → no notification needed for now
    } catch (notifyError) {
      console.error("Mission notification error (non-critical):", notifyError);
    }

    return NextResponse.json({ success: true, missionId });
  } catch (error) {
    console.error("Mission POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, missionId, status, finalReview, title, purpose, deadline } = body;

    if (!token || !missionId) {
      return NextResponse.json(
        { error: "token, missionId required" },
        { status: 400 }
      );
    }

    // Verify manager or participant token
    const manager = await getManagerByToken(token);
    const participant = !manager ? await getParticipantByToken(token) : null;
    if (!manager && !participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Confirm the caller may touch this mission: tenant-scoped callers must
    // match the mission's tenant (admins may edit cross-tenant — same
    // isAdmin-based rule as the admin CRUD routes), and a participant caller
    // must own the mission. Previously these checks were missing, letting
    // anyone with any valid token rewrite any mission row by guessing its id.
    const mission = await getMissionById(missionId);
    if (!mission) {
      return NextResponse.json({ error: "Mission not found" }, { status: 404 });
    }
    const actorTenantId = manager?.tenantId || participant?.tenantId;
    if (!manager?.isAdmin && mission.tenantId !== actorTenantId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (participant && mission.participantName !== participant.name) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Trap 3: 以降の UPDATE は mission の tenant_id（target）で行う。actor の
    // テナントを使うと、admin のクロステナント編集が 0 行更新で silently 失敗する。
    const tenantId = mission.tenantId;

    // Field edit (title/purpose/deadline)
    if (title !== undefined) {
      const sanitizedTitle = sanitizeInput(title);
      const sanitizedPurpose = purpose !== undefined ? sanitizeInput(purpose) : undefined;

      // イシューの呼び名の環境（feature.missionLabelIssue）では、直す前の文を残してから直す
      // （mission_edits 表。決まりは mission-edit.ts）。本人が文を直せるのは、この環境だけ
      // （「直す」のボタンを出しているのも、この環境だけ）。スイッチを読めなかったときは OFF と
      // 同じ扱いになる：本人の修正は受け付けない（履歴を残せないまま直さない）。上司・運営の
      // 画面からの修正は、下の従来の処理で、履歴を残さずに直す。
      const keepHistory = await isFeatureEnabled("feature.missionLabelIssue", tenantId);
      if (participant && !keepHistory) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (keepHistory) {
        return await editMissionWithHistory({
          missionId,
          tenantId,
          actor: participant ? "participant" : "manager",
          participantId: participant ? participant.id : null,
          submitted: { title: sanitizedTitle, purpose: sanitizedPurpose, deadline },
        });
      }

      // 従来の処理（上司・運営の画面からの修正。イシューの呼び名でない環境）。
      const success = await updateMissionFields(missionId, {
        title: sanitizedTitle,
        purpose: sanitizedPurpose,
        deadline,
      }, tenantId);
      if (!success) {
        return NextResponse.json({ error: "Failed to update mission" }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    // Status change
    if (!status) {
      return NextResponse.json({ error: "status or title required" }, { status: 400 });
    }
    if (!ALLOWED_MISSION_STATUS.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const success = await updateMissionStatus(missionId, status, finalReview, tenantId);

    if (!success) {
      return NextResponse.json({ error: "Failed to update mission" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mission PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
