-- standalone_report_notes: 本人が AI分析(21日レポート) を読んで残す「自分の気づき」
-- 太田さん要望①（2026-06-18 メール）。standalone §8 の拡張。
--
-- 方針: additive only。既存テーブルの意味変更・削除はしない。
-- RLS 判断（production-security-guard 原則3/6）:
--   既存 standalone_reports と同一方針「RLS 有効 + deny_all ポリシー + service_role 経由のみ」。
--   anon/authenticated キー経路からは一切読めない・書けない。

BEGIN;

CREATE TABLE IF NOT EXISTS standalone_report_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  report_id uuid REFERENCES standalone_reports(id) ON DELETE SET NULL,
  note text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_standalone_report_notes_tenant_participant
  ON standalone_report_notes (tenant_id, participant_id, created_at DESC);

ALTER TABLE standalone_report_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_standalone_report_notes ON standalone_report_notes;
CREATE POLICY deny_all_standalone_report_notes ON standalone_report_notes
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMIT;
