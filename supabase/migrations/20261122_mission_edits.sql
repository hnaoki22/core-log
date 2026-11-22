-- 「直す前の文」（mission_edits）
--
-- 設定したイシュー（missions の title / purpose / deadline）を直したときに、直す前の文を 1 回の
-- 修正につき 1 行で残す。イシューの呼び名の環境（feature.missionLabelIssue）でだけ書き込む
-- （アプリ側の決まり。src/lib/mission-edit.ts、src/app/api/mission/route.ts）。
--
-- 残す理由: 本人が誤字を直せるようにする一方で、仮説を書き換えたときに、前の仮説が
-- 消えないようにするため（仮説が変わったときは、理由を書いて閉じ、新しく設定する運用。
-- 「直す」は、誤字の修正と仮説の書き換えを見分けられない）。
--
-- 追加だけ。既存の表（missions / mission_comments / participants ほか）には触れない。
-- missions に列を足さないのは、既存の表の読み書きを変えないため。
--
-- RLS 判断（production-security-guard 原則3/5/6）: coaching_profiles / coach_replies /
-- quick_notes と同一パターン。RLS 有効 + deny-all（anon/authenticated からは読めない・書けない）。
-- service_role 経由（アプリのサーバー側）でのみ読み書きする。

BEGIN;

CREATE TABLE IF NOT EXISTS mission_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,  -- イシューの持ち主
  edited_by text NOT NULL,                      -- だれが直したか（本人 / 運営・上司の画面）
  title_before text NOT NULL,                   -- 直す前の、問い（ミッション名）
  purpose_before text,                          -- 直す前の、仮説と「目指す状態・行動」（見出しつきの 1 本）
  deadline_before date,                         -- 直す前の、期限
  created_at timestamptz NOT NULL DEFAULT now(),  -- 直した日時
  CONSTRAINT mission_edits_edited_by_check CHECK (edited_by IN ('participant', 'manager'))
);

-- 主な読み方: 1 件のイシューの履歴を、新しい順に（本人の画面）
CREATE INDEX IF NOT EXISTS idx_mission_edits_mission_created
  ON mission_edits (mission_id, created_at DESC);
-- FK インデックス（PostgreSQL は FK に自動でインデックスを張らない。20260511 の教訓）
CREATE INDEX IF NOT EXISTS idx_mission_edits_participant
  ON mission_edits (participant_id);

ALTER TABLE mission_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_mission_edits ON mission_edits;
CREATE POLICY deny_all_mission_edits ON mission_edits
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMIT;
