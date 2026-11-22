// 「直す前の文」の読み書き（mission_edits 表。サーバー側だけ）。
//
// - 決まり（直してよいか、何を残すか、履歴の見せ方）は mission-edit.ts（純関数）。
// - 永続化は mission_edits（RLS deny_all + service_role 経由のみ。migration 20261122_mission_edits.sql）。
// - 読めなかったことと、無いことを分けて返す（読めなかったときに「履歴なし」と扱わない）。
// - 本人の読み取りは、イシューの ID に加えて、テナント ID と参加者 ID でも絞る
//   （トークンから引いた値だけを使う。ほかの人のイシューの ID を送っても、行は返らない）。
// - ログには、ID と失敗の内容だけを残す（イシューの文は残さない）。

import { getClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import {
  toMissionSnapshot,
  type MissionEditActor,
  type MissionEditRecord,
  type MissionTextSnapshot,
} from "@/lib/mission-edit";

/** 直す対象のイシューの、いまの値と持ち主。 */
export type MissionEditTarget = {
  id: string;
  tenantId: string;
  participantId: string;
  status: string | null;
  title: string;
  purpose: string | null;
  deadline: string | null;
};

/** ok:false = 読めなかった。ok:true で row:null = その環境に、その ID のイシューは無い。 */
export type MissionEditTargetRead = { ok: true; row: MissionEditTarget | null } | { ok: false };

export async function getMissionEditTarget(
  missionId: string,
  tenantId: string
): Promise<MissionEditTargetRead> {
  const { data, error } = await getClient()
    .from("missions")
    .select("id, tenant_id, participant_id, status, title, purpose, deadline")
    .eq("id", missionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    logger.error("getMissionEditTarget failed", { error: error.message, missionId, tenantId });
    return { ok: false };
  }
  if (!data) return { ok: true, row: null };
  const r = data as {
    id: string;
    tenant_id: string;
    participant_id: string;
    status: string | null;
    title: string | null;
    purpose: string | null;
    deadline: string | null;
  };
  return {
    ok: true,
    row: {
      id: r.id,
      tenantId: r.tenant_id,
      participantId: r.participant_id,
      status: r.status,
      title: r.title ?? "",
      purpose: r.purpose,
      deadline: r.deadline,
    },
  };
}

export type MissionEditInsert = { ok: true; id: string } | { ok: false };

/** 直す前の文を 1 行残す。行が入ったことを .select() で確かめる。 */
export async function insertMissionEdit(input: {
  tenantId: string;
  missionId: string;
  participantId: string;
  editedBy: MissionEditActor;
  before: MissionTextSnapshot;
}): Promise<MissionEditInsert> {
  const { data, error } = await getClient()
    .from("mission_edits")
    .insert({
      tenant_id: input.tenantId,
      mission_id: input.missionId,
      participant_id: input.participantId,
      edited_by: input.editedBy,
      title_before: input.before.title,
      purpose_before: input.before.purpose,
      deadline_before: input.before.deadline,
    })
    .select("id");
  if (error) {
    logger.error("insertMissionEdit failed", {
      error: error.message,
      missionId: input.missionId,
      tenantId: input.tenantId,
    });
    return { ok: false };
  }
  if (!data || data.length === 0) {
    logger.warn("insertMissionEdit returned no row", { missionId: input.missionId, tenantId: input.tenantId });
    return { ok: false };
  }
  return { ok: true, id: (data[0] as { id: string }).id };
}

/**
 * 残した 1 行を取り消す（履歴を残したあと、イシューの更新に失敗したときだけ使う）。
 * 取り消せなかったときは false（呼び出し側は、ログに残して失敗を返す）。
 */
export async function deleteMissionEdit(editId: string, tenantId: string): Promise<boolean> {
  const { data, error } = await getClient()
    .from("mission_edits")
    .delete()
    .eq("id", editId)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) {
    logger.error("deleteMissionEdit failed", { error: error.message, editId, tenantId });
    return false;
  }
  if (!data || data.length === 0) {
    logger.warn("deleteMissionEdit matched 0 rows", { editId, tenantId });
    return false;
  }
  return true;
}

/** ok:false = 読めなかった。 */
export type MissionEditList = { ok: true; edits: MissionEditRecord[] } | { ok: false };

/** 本人のイシュー 1 件の履歴を、新しい順に。持ち主（テナントと参加者）でも絞る。 */
export async function listMissionEdits(input: {
  missionId: string;
  tenantId: string;
  participantId: string;
  limit: number;
}): Promise<MissionEditList> {
  const { data, error } = await getClient()
    .from("mission_edits")
    .select("id, edited_by, title_before, purpose_before, deadline_before, created_at")
    .eq("mission_id", input.missionId)
    .eq("tenant_id", input.tenantId)
    .eq("participant_id", input.participantId)
    .order("created_at", { ascending: false })
    .limit(input.limit);
  if (error) {
    logger.error("listMissionEdits failed", {
      error: error.message,
      missionId: input.missionId,
      tenantId: input.tenantId,
    });
    return { ok: false };
  }
  const rows = (data || []) as Array<{
    id: string;
    edited_by: string | null;
    title_before: string | null;
    purpose_before: string | null;
    deadline_before: string | null;
    created_at: string | null;
  }>;
  return {
    ok: true,
    edits: rows.map((r) => ({
      id: r.id,
      editedAt: r.created_at ?? "",
      editedBy: r.edited_by === "manager" ? "manager" : "participant",
      before: toMissionSnapshot({ title: r.title_before, purpose: r.purpose_before, deadline: r.deadline_before }),
    })),
  };
}
