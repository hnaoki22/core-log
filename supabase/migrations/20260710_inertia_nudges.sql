-- logform v2 F5 惰性検知 発火履歴（朝夕ログ刷新 2026-07-10）
--
-- 3日連続の全項目一致 AND 所要時間の急短縮 を検知したとき、翌朝に静かな問いかけを
-- 1回だけ出す（週1回以下）。その発火事実を記録して頻度制限に使う。
-- 評価は一切保存しない（誰が惰性かのラベリングをしない＝評価非接続の原則）。
--
-- RLS 判断（production-security-guard 原則3/5/6）: skip_reasons / standalone_reports と
-- 同一パターン。RLS 有効 + deny-all（anon/authenticated からは読めない・書けない）。
-- service_role 経由（アプリのサーバー側）でのみ読み書きする。

BEGIN;

CREATE TABLE IF NOT EXISTS inertia_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  shown_date date NOT NULL,          -- 表示した日（翌朝）
  window_end date NOT NULL,          -- 検知の基準となった直近日
  created_at timestamptz DEFAULT now(),
  UNIQUE (participant_id, shown_date) -- 同一日の多重表示を冪等に抑止
);

-- FK インデックス（PostgreSQL は FK に自動でインデックスを張らない。20260511 の教訓）
CREATE INDEX IF NOT EXISTS idx_inertia_nudges_tenant_participant
  ON inertia_nudges (tenant_id, participant_id, shown_date DESC);

ALTER TABLE inertia_nudges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_inertia_nudges ON inertia_nudges;
CREATE POLICY deny_all_inertia_nudges ON inertia_nudges
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMIT;
