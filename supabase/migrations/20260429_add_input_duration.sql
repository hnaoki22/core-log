-- 記入時間（focus → submit までの所要時間）を記録するカラムを追加
--
-- 目的: 太田氏 FB（2026-04 メール）への対応。
--   ユーザーが「書き始めてから提出するまで」に何秒かけたかを記録し、
--   組織の省察パターン（拙速 vs 熟考、リマインダ後の時間ラグ等）を可視化する素材とする。
--
-- 値の範囲:
--   - 通常: 30〜600 秒（30 秒〜10 分）が想定中央値
--   - 上限: 1800 秒（30 分）でクリップ。それ以上はページ放置と判断
--   - 下限: 5 秒未満も記録するが、UI で「短すぎる」警告は出さない（信頼ベース）
--   - NULL 許容: 既存ログ・focus イベントが取れなかったケース（後方互換）
--
-- スキーマ変更の安全性:
--   - ADD COLUMN は NULL 許容なので既存行に影響なし
--   - 既存 RLS ポリシー（logs テーブル）が新カラムも自動的にカバー
--   - クライアント側で送らなければ NULL のまま記録される
--   - 既存の API は何も変更しなくても動き続ける（後方互換）

ALTER TABLE logs
  ADD COLUMN IF NOT EXISTS morning_duration_sec INTEGER,
  ADD COLUMN IF NOT EXISTS evening_duration_sec INTEGER;

COMMENT ON COLUMN logs.morning_duration_sec IS
  '朝の意図記入に要した秒数（textarea focus から submit まで）。NULL = 計測不可・未対応クライアント。';

COMMENT ON COLUMN logs.evening_duration_sec IS
  '夕の振り返り記入に要した秒数（textarea focus から submit まで）。NULL = 計測不可・未対応クライアント。';

-- 値域チェック制約: 0 以上 1800 秒以下のみ受け入れる（NULL は許可）
-- 異常値（負の値、巨大な値）が入ることを DB レベルで防ぐ
ALTER TABLE logs
  ADD CONSTRAINT logs_morning_duration_sec_range
    CHECK (morning_duration_sec IS NULL OR (morning_duration_sec >= 0 AND morning_duration_sec <= 1800));

ALTER TABLE logs
  ADD CONSTRAINT logs_evening_duration_sec_range
    CHECK (evening_duration_sec IS NULL OR (evening_duration_sec >= 0 AND evening_duration_sec <= 1800));
