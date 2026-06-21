// standalone §8 拡張: AI分析(21日レポート)に対する本人の「自分の気づき」メモ。
// 太田さん要望①(2026-06-18)。standalone テナント限定・本人のみ。
//
// 永続化は standalone_report_notes（RLS deny_all + service_role 経由のみ）。
// getClient() は service-role クライアントで RLS をバイパスする（standalone_reports と同じ）。

import { getClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export type StandaloneReportNote = {
  id: string;
  note: string;
  reportId: string | null;
  createdAt: string;
};

// 1件あたりの上限。日々の気づきとしては十分で、巨大ペーストのコスト/DoSを抑える。
export const MAX_NOTE_CHARS = 2000;

/** 本人の過去の気づきを新しい順に取得。 */
export async function getStandaloneReportNotes(
  participantId: string,
  tenantId: string,
  limit = 30
): Promise<StandaloneReportNote[]> {
  const { data, error } = await getClient()
    .from("standalone_report_notes")
    .select("id, note, report_id, created_at")
    .eq("participant_id", participantId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logger.error("getStandaloneReportNotes failed", { error: error.message, participantId });
    throw new Error(`standalone note fetch failed: ${error.message}`);
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    note: r.note as string,
    reportId: (r.report_id as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

/**
 * 気づきを1件保存する。
 * 影響行を .select() で検証する（zero-defect-guard 原則1: PostgREST の 0行成功を信じない）。
 */
export async function saveStandaloneReportNote(
  participantId: string,
  tenantId: string,
  reportId: string | null,
  note: string
): Promise<StandaloneReportNote | null> {
  const trimmed = note.trim().slice(0, MAX_NOTE_CHARS);
  if (!trimmed) return null;

  const { data, error } = await getClient()
    .from("standalone_report_notes")
    .insert({
      tenant_id: tenantId,
      participant_id: participantId,
      report_id: reportId,
      note: trimmed,
      created_at: new Date().toISOString(),
    })
    .select("id, note, report_id, created_at")
    .single();

  if (error || !data) {
    logger.error("saveStandaloneReportNote failed", { error: error?.message, participantId });
    return null;
  }

  return {
    id: data.id as string,
    note: data.note as string,
    reportId: (data.report_id as string | null) ?? null,
    createdAt: data.created_at as string,
  };
}
