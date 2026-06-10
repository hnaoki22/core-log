-- standalone商品モード スキーマ変更（商品版最終型仕様書 v1.0 §2 / 2026-06-10）
--
-- 方針: additive only。既存カラムの意味変更・削除はしない。
--   - evening_energy      : 夕の気分4段階。既存 energy は「朝の気分」として継続。
--                           energy の朝夕共用が相関分析の制約だった
--                           (bug_energy_morning_evening_ambiguity) ため分離。
--                           夕の記入判定に energy は使わない。
--   - morning_condition   : 朝の体調・自由記述（空可）
--   - evening_condition   : 夕の体調・自由記述（空可）
--   - skip_reasons        : 未記入フォローアップ（§5）。復帰日のログ完了後に
--                           任意で理由を 1 問だけ拾う。空回答も「事実」として記録。
--   - standalone_reports  : 21日AIレポート v0（§8）。kan_no_ki_observations は
--                           観の期(週次, observation_type)ドメイン専用のため再利用せず、
--                           standalone レポート専用テーブルを新設（プリフライト判断）。
--
-- RLS 判断の記録（production-security-guard 原則3/6）:
--   既存テーブル群と同じ「RLS 有効 + deny_all ポリシー + service_role 経由のみ」
--   パターンに準拠する（20260511_rls_deny_and_fk_indexes.sql と同一方針）。
--   anon/authenticated キー経路からは一切読めない・書けない。

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. logs への追加カラム（standalone 入力フロー §3 用）
-- ---------------------------------------------------------------------------

ALTER TABLE logs ADD COLUMN IF NOT EXISTS evening_energy text;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS morning_condition text;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS evening_condition text;

COMMENT ON COLUMN logs.evening_energy IS '夕の気分4段階(excellent/good/okay/low)。energy は朝の気分として継続(standalone §2)';
COMMENT ON COLUMN logs.morning_condition IS '朝の体調・自由記述。空可(standalone §3)';
COMMENT ON COLUMN logs.evening_condition IS '夕の体調・自由記述。空可(standalone §3)';

-- ---------------------------------------------------------------------------
-- 2. skip_reasons（未記入フォローアップ §5）
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS skip_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  gap_start date NOT NULL,
  gap_end date NOT NULL,
  gap_weekdays int NOT NULL,
  reason text,                 -- 任意回答。NULL/空＝スキップした事実だけ記録
  return_log_id uuid REFERENCES logs(id) ON DELETE SET NULL,  -- 復帰日のログ
  created_at timestamptz DEFAULT now()
);

-- FK インデックス（PostgreSQL は FK に自動でインデックスを張らない。20260511 の教訓）
CREATE INDEX IF NOT EXISTS idx_skip_reasons_tenant_participant
  ON skip_reasons (tenant_id, participant_id);
CREATE INDEX IF NOT EXISTS idx_skip_reasons_return_log
  ON skip_reasons (return_log_id);

ALTER TABLE skip_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_skip_reasons ON skip_reasons;
CREATE POLICY deny_all_skip_reasons ON skip_reasons
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- 3. standalone_reports（21日AIレポート v0 §8）
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS standalone_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  entry_days int NOT NULL DEFAULT 0,
  report jsonb NOT NULL,       -- { correlationLens: string, themeLens: string, skipNote: string|null }
  model text,                  -- 生成に使った LLM モデル名
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_standalone_reports_tenant_participant
  ON standalone_reports (tenant_id, participant_id, created_at DESC);

ALTER TABLE standalone_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_standalone_reports ON standalone_reports;
CREATE POLICY deny_all_standalone_reports ON standalone_reports
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMIT;
