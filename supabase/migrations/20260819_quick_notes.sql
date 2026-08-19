-- standalone 「途中メモ」（ホーム右上「＋」の中身。2026-08-18 定例・太田さん FB）
--
-- 朝夕の記入とは別枠で、業務の合間・気づいた時に忘れないうちに一言を書き足す。
-- 由奈さん補足: 午前で業務が終わる早上がりの日は夕方に忘れるので有用。
-- 1日に何件でも。日付は JST の業務日（getTodayJST: 深夜2時が日付境界）で束ねる。
-- 見えるのは本人と装置（AI分析の素材）だけ。上司・管理者・伴走者には出さない。
-- 既存の logs 表には触れない（朝夕の書き込み経路は不変）。
--
-- RLS 判断（production-security-guard 原則3/5/6）: standalone_report_notes / inertia_nudges
-- と同一パターン。RLS 有効 + deny-all（anon/authenticated からは読めない・書けない）。
-- service_role 経由（アプリのサーバー側）でのみ読み書きする。

BEGIN;

CREATE TABLE IF NOT EXISTS quick_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  note_date date NOT NULL,           -- 属する業務日（JST・2時境界）。サーバーが決める
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- FK インデックス（PostgreSQL は FK に自動でインデックスを張らない。20260511 の教訓）
-- 主な読み方: 本人×日付（当日分）／本人×日付範囲（ログ画面・AI分析の窓）
CREATE INDEX IF NOT EXISTS idx_quick_notes_tenant_participant_date
  ON quick_notes (tenant_id, participant_id, note_date DESC, created_at DESC);

ALTER TABLE quick_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_quick_notes ON quick_notes;
CREATE POLICY deny_all_quick_notes ON quick_notes
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMIT;
