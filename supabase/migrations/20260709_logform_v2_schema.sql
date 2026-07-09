-- logform v2 スキーマ変更（朝夕ログ刷新 / 2026-07-09）
--
-- 方針: additive only（nullable カラム追加のみ）。既存カラムの意味変更・削除・
--       型変更・backfill はしない。logform_v2 フラグ OFF のテナント（大幸ほか）は
--       これらのカラムを一切書き込まず、旧挙動が 1 ピクセルも変わらない。
--
--   - morning_condition_gauges / evening_condition_gauges (jsonb)
--       F1/F3 体調3ゲージ。既存の morning_condition / evening_condition（自由記述）は
--       温存し、logform_v2 ON 時は自由記述を非表示にしてゲージへ移行する。
--       形: {"sleep":{"raw":1-4,"normalized":0-100},
--            "fatigue":{"raw":1-4,"normalized":0-100},
--            "clarity":{"raw":1-4,"normalized":0-100}}
--       raw は端点間の位置(1=左端ラベル..4=右端ラベル)、normalized=(raw-1)/3*100。
--       段階数変更・移動平均分析に耐えるため列爆発を避け JSONB で保持（指示書§4）。
--   - morning_action (text)  F2 Q2「そのために、今日どんな場面で、何をしますか」
--   - evening_state  (text)  F3 Q2「いまの自分の状態を一言でいうと？」
--       F2/F3 の Q1 は既存 morning_intent / evening_insight を継続使用し、
--       stats.hasMorning/hasEvening と AI 分析の後方互換を壊さない。
--   - carried_over (jsonb)   F4 引き継いだ項目名の配列。例 ["morningIntent","sleep"]
--   - logform_version (smallint)  v2 で記入された行 = 2。新旧フォーマット判別に使う
--       （F2 受入基準「AI分析が新旧を区別して読める」／§4 初期数日のベースライン除外）。
--
-- RLS: logs テーブル既存の RLS をそのまま継承（本 migration は列追加のみで
--      ポリシー・RLS 設定には一切触れない。production-security-guard 原則3/5）。
-- CHECK 制約は付けない（JSONB 構造・text・nullable smallint。再適用の冪等性を優先し、
--      値検証はアプリ層 sanitize で行う）。

BEGIN;

ALTER TABLE logs ADD COLUMN IF NOT EXISTS morning_condition_gauges jsonb;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS evening_condition_gauges jsonb;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS morning_action text;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS evening_state text;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS carried_over jsonb;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS logform_version smallint;

COMMENT ON COLUMN logs.morning_condition_gauges IS 'F1 朝の体調3ゲージ {sleep/fatigue/clarity:{raw:1-4,normalized:0-100}} (logform v2)';
COMMENT ON COLUMN logs.evening_condition_gauges IS 'F3 夕の体調3ゲージ {sleep/fatigue/clarity:{raw:1-4,normalized:0-100}} (logform v2)';
COMMENT ON COLUMN logs.morning_action IS 'F2 Q2 今日どんな場面で何をするか (logform v2)';
COMMENT ON COLUMN logs.evening_state IS 'F3 Q2 いまの自分の状態を一言 (logform v2)';
COMMENT ON COLUMN logs.carried_over IS 'F4 前日から引き継いだ項目名の配列 (logform v2)';
COMMENT ON COLUMN logs.logform_version IS '記入フォーム版数。v2記入行=2。NULL/未設定=旧フォーマット (logform v2)';

COMMIT;
