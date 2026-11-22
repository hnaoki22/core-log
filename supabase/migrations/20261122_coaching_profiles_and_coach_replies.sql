-- 「設計図」（coaching_profiles）と「AIコーチの返信」（coach_replies）
--
-- 設計図: 本人が自分で確認した、成長課題・これからの行動・止まりそうな場面・
--   夕方に自分へ聞く問い。入力画面と朝夕のリマインドメールに出す（feature.coachingProfile）。
--   状態は draft（確認前）/ confirmed（確認済み）。確認前の内容は、メールにも、
--   夕方の「あなたの問い」にも使わない（アプリ側の決まり。src/lib/coaching-profile.ts）。
-- AIコーチの返信: 夕方の記入のあとに本人へ返す文。この migration では表だけを用意する
--   （読み書きするコードは次の変更で入れる。それまで行は入らない）。
--
-- どちらも追加だけ。既存の表（logs / participants / missions / feedback ほか）には触れない。
-- feedback 表に入れないのは、feedback.type が CHECK で 'HMフィードバック' / '上司コメント' に
-- 限られていて、人が書いたフィードバックと区別できなくなるため。
--
-- RLS 判断（production-security-guard 原則3/5/6）: quick_notes / standalone_report_notes と
-- 同一パターン。RLS 有効 + deny-all（anon/authenticated からは読めない・書けない）。
-- service_role 経由（アプリのサーバー側）でのみ読み書きする。

BEGIN;

CREATE TABLE IF NOT EXISTS coaching_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  headline text NOT NULL DEFAULT '',            -- 毎朝の一文
  growth_theme text NOT NULL DEFAULT '',        -- 成長課題
  actions text NOT NULL DEFAULT '',             -- これからの行動
  expected text NOT NULL DEFAULT '',            -- 期待する結果と、確かめ方
  stall_points text NOT NULL DEFAULT '',        -- 止まりそうな場面と、ほしい問いかけ
  evening_question text NOT NULL DEFAULT '',    -- 夕方に自分へ聞く問い
  tendencies jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ "text": "...", "use": true|false|null }]
  concept_ids jsonb NOT NULL DEFAULT '[]'::jsonb,  -- 結ぶ考え方の ID（後の変更で使う）
  coach_enabled boolean NOT NULL DEFAULT true,     -- AIコーチの返信を受け取るか（本人が選ぶ）
  status text NOT NULL DEFAULT 'draft',
  confirmed_at timestamptz,
  source text,                                  -- 下書きの出所（運営が置いた下書きの目印）
  history jsonb NOT NULL DEFAULT '[]'::jsonb,   -- 直す前の内容（日付つき。新しい順）
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coaching_profiles_status_check CHECK (status IN ('draft', 'confirmed')),
  CONSTRAINT coaching_profiles_participant_unique UNIQUE (participant_id)
);

-- 主な読み方: 本人（participant_id の UNIQUE が索引を兼ねる）／環境ごとの一覧（定時処理）
CREATE INDEX IF NOT EXISTS idx_coaching_profiles_tenant
  ON coaching_profiles (tenant_id);

ALTER TABLE coaching_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_coaching_profiles ON coaching_profiles;
CREATE POLICY deny_all_coaching_profiles ON coaching_profiles
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE TABLE IF NOT EXISTS coach_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  log_id uuid REFERENCES logs(id) ON DELETE SET NULL,   -- どの日の記入への返信か（週のまとめは null）
  reply_date date NOT NULL,                     -- 属する業務日（JST・2時境界）。サーバーが決める
  kind text NOT NULL DEFAULT 'daily',
  content text NOT NULL,
  status text NOT NULL DEFAULT 'delivered',
  model text,                                   -- 使ったモデルの名前
  inputs_used jsonb NOT NULL DEFAULT '[]'::jsonb,  -- AI に渡した項目の種類（本文は入れない）
  is_read boolean NOT NULL DEFAULT false,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_replies_kind_check CHECK (kind IN ('daily', 'weekly')),
  CONSTRAINT coach_replies_status_check CHECK (status IN ('pending_review', 'delivered', 'withdrawn')),
  -- 同じ人・同じ日・同じ種類の返信は 1 件（二重に作らない）
  CONSTRAINT coach_replies_one_per_day UNIQUE (participant_id, reply_date, kind)
);

-- FK インデックス（PostgreSQL は FK に自動でインデックスを張らない。20260511 の教訓）
CREATE INDEX IF NOT EXISTS idx_coach_replies_tenant_participant_date
  ON coach_replies (tenant_id, participant_id, reply_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_replies_log
  ON coach_replies (log_id);

ALTER TABLE coach_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_coach_replies ON coach_replies;
CREATE POLICY deny_all_coach_replies ON coach_replies
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMIT;
