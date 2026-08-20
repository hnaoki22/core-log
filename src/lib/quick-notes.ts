// standalone 「途中メモ」（ホーム右上「＋」の中身）
//
// 2026-08-18 定例・太田さんの実使用レビュー: 「＋」を押しても「記入する」と同じ動きで
// 意味が薄い →「途中で何か入れられるボタン」に。業務の合間・気づいた時に忘れないうちに
// 一言を書き足す入力（朝夕とは別枠）。由奈さん補足: 早上がりの日は夕方に忘れるので有用。
// 本藤さん: もともとその意図で置いた「中がまだ入っていない」→ 実装。
//
// 設計:
// - 1日に何件でも。属する日付はサーバーが getTodayJST()（2時境界の業務日）で決める。
// - 見えるのは本人と装置だけ。上司・管理者・伴走者向けの読み取り経路は作らない
//   （CLAUDE.md §8-11。standalone のログ本文と同じ扱い）。
// - AI分析（21日レポート）の素材にも含める（2026-08-19 本藤さん決定）。
// - 既存の logs 表・朝夕の書き込み経路には一切触れない（additive）。
// - 永続化は quick_notes（RLS deny_all + service_role 経由のみ。migration 20260819）。

import { getClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export type QuickNote = {
  id: string;
  noteDate: string; // YYYY-MM-DD（JST 業務日）
  text: string;
  createdAt: string; // ISO
};

// 1件あたりの上限。「忘れないうちの一言」としては十分で、巨大ペーストのコスト/DoS を抑える。
export const MAX_QUICK_NOTE_CHARS = 1000;
// 1日あたりの上限（連打・誤動作の保険。通常の使い方では届かない）
export const MAX_QUICK_NOTES_PER_DAY = 30;

/** 保存前の正規化（純関数）: 前後の空白を落とし、上限で切る。空なら "" */
export function normalizeQuickNoteText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, MAX_QUICK_NOTE_CHARS);
}

/** 日付ごとに束ねる（純関数。各日の並びは入力順を保つ） */
export function groupQuickNotesByDate(notes: QuickNote[]): Record<string, QuickNote[]> {
  const grouped: Record<string, QuickNote[]> = {};
  for (const n of notes) {
    (grouped[n.noteDate] ??= []).push(n);
  }
  return grouped;
}

type QuickNoteRow = { id: string; note_date: string; text: string; created_at: string };

function mapRow(r: QuickNoteRow): QuickNote {
  return { id: r.id, noteDate: r.note_date, text: r.text, createdAt: r.created_at };
}

const SELECT_COLS = "id, note_date, text, created_at";

/**
 * 1件保存する。影響行を .select() で検証する（PostgREST の 0行成功を信じない）。
 * 失敗時は logger.error して null（呼び出し側が「保存できなかった」と返す）。
 */
export async function saveQuickNote(
  participantId: string,
  tenantId: string,
  noteDate: string,
  text: string
): Promise<QuickNote | null> {
  const normalized = normalizeQuickNoteText(text);
  if (!normalized) return null;

  const { data, error } = await getClient()
    .from("quick_notes")
    .insert({
      tenant_id: tenantId,
      participant_id: participantId,
      note_date: noteDate,
      text: normalized,
    })
    .select(SELECT_COLS)
    .single();

  if (error || !data) {
    logger.error("saveQuickNote failed", { error: error?.message, participantId });
    return null;
  }
  return mapRow(data as QuickNoteRow);
}

/**
 * ある日付の途中メモを古い順（書いた順）に返す。
 * 失敗時は空配列ではなく null（「まだ無い」と「取れなかった」を区別する）。
 */
export async function getQuickNotesForDate(
  participantId: string,
  tenantId: string,
  noteDate: string
): Promise<QuickNote[] | null> {
  const { data, error } = await getClient()
    .from("quick_notes")
    .select(SELECT_COLS)
    .eq("participant_id", participantId)
    .eq("tenant_id", tenantId)
    .eq("note_date", noteDate)
    .order("created_at", { ascending: true })
    .limit(MAX_QUICK_NOTES_PER_DAY);

  if (error) {
    logger.error("getQuickNotesForDate failed", { error: error.message, participantId, noteDate });
    return null;
  }
  return (data ?? []).map((r) => mapRow(r as QuickNoteRow));
}

// 範囲取得の上限（約3ヶ月 × 1日数件を十分に収める）
export const QUICK_NOTES_RANGE_LIMIT = 1000;

/**
 * 日付範囲（両端含む）の途中メモを、日付→書いた順で返す。
 * ログ画面（約3ヶ月）と AI分析の窓（21日）で使う。失敗時は null。
 */
export async function getQuickNotesInRange(
  participantId: string,
  tenantId: string,
  fromDate: string,
  toDate: string
): Promise<QuickNote[] | null> {
  const { data, error } = await getClient()
    .from("quick_notes")
    .select(SELECT_COLS)
    .eq("participant_id", participantId)
    .eq("tenant_id", tenantId)
    .gte("note_date", fromDate)
    .lte("note_date", toDate)
    .order("note_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(QUICK_NOTES_RANGE_LIMIT);

  if (error) {
    logger.error("getQuickNotesInRange failed", { error: error.message, participantId, fromDate, toDate });
    return null;
  }
  return (data ?? []).map((r) => mapRow(r as QuickNoteRow));
}

/**
 * 本人のメモを1件削除する（本人・同テナントの行だけが対象）。
 * .select("id") で実際に消えた行数を確認する（0行なら false）。
 */
export async function deleteQuickNote(
  participantId: string,
  tenantId: string,
  id: string
): Promise<boolean> {
  const { data, error } = await getClient()
    .from("quick_notes")
    .delete()
    .eq("id", id)
    .eq("participant_id", participantId)
    .eq("tenant_id", tenantId)
    .select("id");

  if (error) {
    logger.error("deleteQuickNote failed", { error: error.message, participantId, id });
    return false;
  }
  if (!data || data.length === 0) {
    logger.warn("deleteQuickNote matched 0 rows", { participantId, id });
    return false;
  }
  return true;
}
