# CORE Log — Claude Code プロジェクトガイド

このファイルは Claude Code が `core-log` リポを開いた時に自動で読み込む。ここに書かれたことは、すべての作業の前提として扱われる。

最終更新: 2026-06-02（本藤直樹）

---

## 0. このドキュメントの位置づけ

- **書く対象**：未来の自分（Claude Code）と、必要があれば本藤さん以外の開発者。
- **書かないこと**：頻繁に変わる進捗・タスク状態（それは git log と引き継ぎパッケージに残す）。
- **更新タイミング**：アーキテクチャ・スキル・テナント構成・主要ファイルが変わったら同じ PR で更新する。

---

## 1. 必須スキル（発火条件のクイックリファレンス）

`~/.claude/skills/` に以下 6 スキルを配置済み。**核心は「core-log のコードに触れる前に core-log-engineer と zero-defect-guard を必ず通す」**こと。

| スキル | 主な発火条件（要約） |
|---|---|
| `strategic-sparring-partner` | 全対話に常時。ファクト/解釈/推測の峻別。観察ベースのリスト作成（原則 7）。 |
| `core-log-engineer` | このリポのコードに触れる時 / Supabase / Vercel / 機能フラグ / メール / OTP / API / 認証。 |
| `zero-defect-guard` | コード変更前のプリフライト。Phase 0.5（プラン整合性）→ Phase 1（Write Path Trace）→ Phase 3（状態マトリクス）。 |
| `production-security-guard` | RLS / migration / ポリシー / 認証 / Advisor 警告 / 「セキュリティ」言及時。 |
| `non-ascii-edit-guard` | 日本語を含む .ts/.tsx/.md/.json/.sql 編集時。**Edit > Write**、差分サイズ異常検出、二重エンコード検査。 |
| `human-mature-canonical-vocabulary-guard` | 書籍 v2.x / CORE Log の戦略表現生成時。「育てる」禁止、「調える」中心動詞。「リフレクション」「整える」の扱いは §10 参照。 |

リポ内には別途 `.claude/skills/core-log-review/SKILL.md` が PR #19 でコミット済み。これは **PR レビュー時のチェックリスト**で、`core-log-engineer` の原則を pre-merge 視点で再表現したもの。役割の差：

- `core-log-engineer`（global）= 書く時のガード（原則・既知バグ・チェックリスト）
- `core-log-review`（repo-local）= 直す時/レビュー時のガード（4 つのサイレント失敗罠 + 統合チェックリスト）

両者を矛盾なく両立させること。重複部分は **どちらかに集約**して、もう片方は参照リンクに置き換える方針で運用する（運用しながら整理）。

---

## 2. アーキテクチャ概要（観察ベース、2026-05-18 時点）

```
core-log/
├── src/
│   ├── app/
│   │   ├── api/                # Next.js Route Handlers
│   │   │   ├── admin/          # tenant-scoped CRUD（PR #16 以降は「target の tenant_id」を採用）
│   │   │   ├── features/
│   │   │   │   ├── daily-questions/route.ts   # メゾ層 API（曜日ローテ）
│   │   │   │   └── voice-input/route.ts       # Whisper proxy（OpenAI）
│   │   │   ├── auth/otp/, cron/, entry/, feedback/, logs/, mission/, ...
│   │   ├── a/[token]/          # 管理者 UI
│   │   ├── p/[token]/          # 参加者 UI（入力・履歴・mission）
│   │   ├── m/[token]/          # マネージャー UI
│   │   └── verify/[token]/     # OTP 検証画面
│   ├── components/features/
│   │   ├── DailyQuestionsBlock.tsx   # 3問×textarea+マイク（朝/夕で再利用）
│   │   └── VoiceInput.tsx            # Whisper 録音/送信
│   ├── lib/
│   │   ├── feature-flags.ts          # FEATURE_CATALOG（§5 で詳述）
│   │   ├── daily-questions.ts        # メゾ層 store（JST / 7曜日 / legacy flat 後方互換）
│   │   ├── supabase.ts               # DB 操作の中心（PostgREST 0 行成功ガード入り）
│   │   ├── tenant-from-token.ts      # token → tenant_id 解決
│   │   ├── feature-flags.ts, email.ts, otp.ts, session.ts, logger.ts, ...
│   └── middleware.ts                 # セキュリティヘッダ / レート制限 / OTP セッション検証
├── supabase/migrations/              # 全 DDL（runtime DDL 禁止）
├── .claude/skills/core-log-review/   # repo-local skill（§1 参照）
├── test-utils/, vitest.config.ts     # Vitest テスト基盤
├── next.config.mjs, tailwind.config.ts, tsconfig.json
└── vercel.json
```

技術スタック：
- Next.js 14.2 (App Router) + React 18 + TypeScript strict + TailwindCSS
- Supabase (PostgreSQL + PostgREST) — project `vnfmbkftbnjruwsdlvtv`、リージョン ap-southeast-2
- Anthropic Claude API（反芻検知・コンサル分析・将来のミクロ層）/ OpenAI API（Whisper）
- Resend（メール、100通/日制限）
- デプロイ：Vercel（main への push で auto deploy）
- ノード要件：`>=20.0.0`（`package.json`）

---

## 3. 重要な前提

- 本番ドメイン: `corelog.humanmature.com`
- リポ: `hnaoki22/core-log`（GitHub）
- DB: Supabase project `vnfmbkftbnjruwsdlvtv`
- 主要テナント:

| Tenant slug | UUID | 用途 |
|---|---|---|
| daiko | `81f91c26-214e-4da2-9893-6ac6c8984062` | 大幸薬品（本番運用中・最優先で守る） |
| partner-preview-demo | `00000000-0000-4000-8000-000000000001` | パートナー候補向けデモ |
| human-mature | `b9bfbe99-5859-4133-901b-b2a4637f6a15` | Human Mature 社内検証 |
| reflection-lab | `affbe130-f2f7-4387-82d6-e7419e17400d` | 本藤さん ドッグフーディング |

reflection-lab の参加者は 本藤直樹 / 土居由奈 / 太田至彦 の 3 名（5/18 時点で本藤さん以外は未案内）。

---

## 4. 開発フロー（基本）

```bash
# 1. main 同期 + ブランチ
git pull origin main
git checkout -b feat/xxx     # or fix/, chore/, docs/

# 2. 変更前のプリフライト（zero-defect-guard）
#    - Phase 0.5：作業リストがある場合、まず鮮度検証
#    - Phase 1：扱うフィールドの Write Path をすべて把握
#    - Phase 3：状態マトリクスを書き出す

# 3. 実装

# 4. ローカル検証（全部パスすること）
npm run build          # next build → 型エラー含む
npx tsc --noEmit       # 型のみ単独確認（任意）
npm test               # vitest run
npm run lint           # next lint

# 5. コミット（メッセージは Conventional Commits 風）
git add <ファイル名>   # add -A は使わない（.env 等の事故防止）
git commit -m "feat(daily-questions): per-tenant weekly questions (Meso layer)"

# 6. push + PR
git push -u origin feat/xxx
gh pr create --title "..." --body "$(cat <<'EOF'
## Summary
- ...

## Test plan
- [ ] ...
EOF
)"

# 7. merge 後、Vercel auto deploy を確認し、本番で動作確認
```

PR タイトル例（リポの履歴に合わせる）:
- `feat(daily-questions): per-tenant weekly questions (Meso layer) (#21)`
- `feat(voice-input): switch from Web Speech API to OpenAI Whisper`
- `fix(admin): 例示管理リンクが運用管理セクションに巻き込まれ非表示になる問題 (#18)`

---

## 5. 機能フラグ（FEATURE_CATALOG 実数）

`src/lib/feature-flags.ts` の `FEATURE_CATALOG` は **2026-06-02 時点で 53 件 / 11 カテゴリ**（観の期 tier-0 の 10 件を 081f3d9 で追加）。

| カテゴリ | 件数 | 代表 |
|---|---:|---|
| `core` | 3 | morningInput / eveningInput / logHistory |
| `existing` | 11 | energyTracking, mission, streak, badges, animations, reminderMail, managerFeedback, csvExport, otpAuth, managerAnalytics, **dailyQuestions** |
| `tier-0` 観の期(KAN のキー) | 10 | kanNoKi / weeklyMirror / bodyPrompt / silenceObservation / peerComparison(.tenant/.crossTenant/.industry/.global) / transitionSignal（reflection-lab 限定・大幸薬品は非表示&強制OFF） |
| `tier-s` Differentiators | 4 | ruminationDetection, doubleLoopPrompt, weeklyConceptualization, structuredInput |
| `tier-a` Manager Safety Net | 5 | oneOnOneBriefing, burnoutScore, consultantSpotlight, psychSafetyMonitor, managerSelfReflection |
| `tier-b` Cultural Engine | 4 | aar, knowledgeLibrary, cultureScore, peerReflection |
| `tier-c` Competency Trap Escape | 3 | unlearnChallenge, identityTracking, outsightTask |
| `tier-d` PsyCap | 3 | heroAssessment, efficacyBooster, hopeDesign |
| `tier-e` UX | 4 | microRitualOptimizer, ruminationTimer, calendarBlock, voiceInput |
| `tier-f` ROI/Evidence | 3 | growthRoi, beforeAfter, clientReport |
| `tier-g` Business Model | 3 | multiTenant, pitchGenerator, consultIntervention |

保存形式: テナント毎に `ai_settings.value` 行（`tenant_id`, `key='feature_flags'`, `value=JSON`）。flat shape（`{flagKey: bool}`）が現行、legacy nested shape（`{default: {...}}`）は読み取り側で互換維持。

呼び出し API：
- サーバー: `isFeatureEnabled(key, tenantId)` / `isFeatureEnabledForToken(key, token)`
- クライアント: `useFeatures().isOn(key)`（参加者画面で使われる）

**フラグを新設する時のルール**（core-log-engineer 原則 4）:
1. `FEATURE_CATALOG` にエントリを追加（label / description / category / defaultEnabled / implemented）
2. コード内に少なくとも 1 つの `isFeatureEnabled(...)` か `isOn(...)` 呼び出しを置く（grep 可能に）
3. 飾りフラグ（UI に出るがコードに繋がっていない）禁止
4. **新しいカテゴリ（`tier-*` 等）を追加する場合は、同一 PR で `src/app/a/[token]/features/page.tsx` の `FlagCategory` 型 / `CATEGORY_META` / `CATEGORY_ORDER` を 1:1 で更新する。** 未更新だと features ページのグルーピングで `grouped[未知カテゴリ]` が undefined となり `undefined.push` で白画面クラッシュする（2026-06-02 / PR #30 の事故）。グルーピングは `(grouped[cat] ??= []).push(f)` で動的初期化し、未知カテゴリでも落ちない構造を保つこと。

参考：core-log-engineer SKILL.md は「660 行・28 機能・7 ティア」と古い数値を持っている。**現状の真実は 53 機能・11 カテゴリ**。スキル本文の数値より、このリポの `src/lib/feature-flags.ts` を信用する。

---

## 6. メゾ層（朝・夕の問い 6 問）2026-05-16 実装

四階層の問いアルゴリズム（`書籍_v2/問いのアルゴリズム_v0_2.pdf` 正典）のうち **ii. メゾ層** が稼働中。

- 仕様: 7 曜日 × 朝 3 + 夕 3 = 42 問。曜日ごとに「軸」が切り替わる。
  - 月=意図 / 火=対話 / 水=感情 / 木=学び / 金=体 / 土=関係 / 日=統合
- 保存: `ai_settings` テーブル、`key='daily_questions'`、`value=` 以下の weekly JSON：
  ```json
  {
    "monday":    { "axis": "意図",  "morning": ["...","...","..."], "evening": ["...","...","..."] },
    "tuesday":   { "axis": "対話",  ... },
    ...
    "sunday":    { "axis": "統合", ... }
  }
  ```
  legacy flat shape（`{morning,evening}` のみ）も読み取り互換。
- 当日決定: `getTodayDayKey()` が `Intl.DateTimeFormat("en-US", {timeZone:"Asia/Tokyo", weekday:"long"})` で JST の曜日を返す（`src/lib/daily-questions.ts:134`）。
- フィーチャーフラグ: `feature.dailyQuestions`（reflection-lab のみ ON）。
- 主要ファイル:
  - `src/lib/daily-questions.ts` — store / 60s キャッシュ / parseWeekly
  - `src/app/api/features/daily-questions/route.ts` — GET `?token=` → `{enabled, day, axis, morning[], evening[]}`
  - `src/components/features/DailyQuestionsBlock.tsx` — 3 問の textarea + Whisper マイク
  - `src/app/p/[token]/input/InputClient.tsx:407` — 「今日の軸 ── X」ヘッダ、`isMorning` で朝/夕切替

42 問の文章は Cowork mode 由来の叩き台で、書籍 v2.5 体系・三慧・10 理論との整合は本藤さんが書き直す前提。**Claude Code 側で文言を勝手に書き換えない**（vocabulary-guard 必発火領域）。

---

## 7. Whisper 音声入力（2026-05-16 実装）

- API: `src/app/api/features/voice-input/route.ts`（OpenAI `whisper-1`、`language=ja`、`prompt=` で CORE Log 用語をバイアス）
- UI: `src/components/features/VoiceInput.tsx`
- 環境変数: `OPENAI_API_KEY`（Vercel Production / Preview に登録済み）
- **5/16 セッションで一度キーが目視転記でミスして 401 が出た事例あり。スクショ・チャット履歴にキーが残っている可能性があるため近日中にローテーション推奨**（引き継ぎパッケージ §5）。

---

## 8. ガードレール（絶対に守る）

1. **本番テナント（daiko）の運用に影響する変更は厳禁。** 新機能は feature flag で reflection-lab のみ ON にして検証する。
2. **スキーマ変更は必ず `supabase/migrations/` の migration ファイルとして残す。** アプリコード内の `CREATE TABLE` / `ALTER TABLE` / `CREATE POLICY` / `CREATE FUNCTION` 禁止（production-security-guard 原則 5）。
3. **日本語ファイルは Edit 優先・差分サイズ確認。** 全文 Write した場合は `git diff --stat` の行数チェックと、`grep -P '[æåãç][\x80-\xBF]'` で破損検出（non-ascii-edit-guard）。
4. **PostgREST の 0 行成功を信じない。** UPDATE / DELETE は `.select("id")` + `data.length > 0` チェック必須（core-log-engineer 原則 1）。
5. **サイレントフォールバック禁止。** エラーは `logger.error()` で記録、上位に伝播。`catch (e) { return [] }` 禁止。
6. **`.eq("col", null)` を書かない。** PostgREST が SQL `col = NULL` に翻訳されて 0 行マッチ。null 分岐は `.is("col", null)`（core-log-review Trap 2a）。
7. **クロステナント CRUD は target の tenant_id を引く。** 管理者の home tenant を使うと、別テナントの行が見えるのに編集が silently 失敗する（core-log-review Trap 3 / PR #16）。
8. **「動く」と「安全」を混同しない。** 機能テストが通ってもセキュリティは別レビュー（production-security-guard 原則 1, 7）。
9. **用語規律の二層構造**（vocabulary-guard、2026-05-18 確定）：
   - **書籍層**（`書籍_v2.5/` ～ `書籍_v3.0_素材/`）：「リフレクション」→ 必ず「省察」
   - **製品・対外層**（CORE Log UI / LP / マーケ / 対外プレゼン）：「リフレクション」を採用、「省察」は引用文脈のみ
   - 「育てる」禁止・「調える」中心動詞・「整える」≠「調える」は両層共通
   - 主正典：`書籍_v3.0_素材/book_v2.7_full.md` 補章 A（用語集）+ `書籍_v2.6/00_ボイス指針.md`
   - 詳細：`~/.claude/skills/human-mature-canonical-vocabulary-guard/SKILL.md` の Step 1（正典パス）と Step 2.5（二層構造）

---

## 9. Cowork mode 側の正典資料との対応

`human-mature-canonical-vocabulary-guard` SKILL.md は `/sessions/wizardly-determined-cerf/mnt/新規ビジネス/書籍_v2/` という VM 側のパスを参照している。**この macOS では下記の iCloud パスにアクセスする**：

```
/Users/naokihondo/Library/Mobile Documents/com~apple~CloudDocs/00_Human Mature/新規ビジネス/新規ビジネス/
├── Claude_Code_引き継ぎパッケージ_2026-05-16.md    # 引き継ぎ全体
├── 5月15日_太田さんミーティング/
│   ├── 05_太田さんに渡す_問いのアルゴリズム.pdf    # 正典：四階層アルゴリズム
│   ├── 17_今後のタスクプロセス_v0_2.md           # Phase 1-5 フロー
│   └── 19_問い42問_理論対応表_v0_1.md
├── 書籍_v3.0_素材/                              # 用語規律の主正典（2026-05-18 採用）
│   └── book_v2.7_full.md                       # 統合版（343 KB）— 補章 A が用語集
├── 書籍_v2.6/00_ボイス指針.md                  # ボイス指針の正典（v3.0_素材 に未統合のため継続参照）
└── 書籍_v2.5/, 書籍_v2/                         # 参考（過去版、archival）
```

**戦略表現を生成する前に上記正典を Read する義務**は vocabulary-guard に従う（旧 VM パスは「`書籍_v2/` 配下を Glob で探索する」と書かれている — その glob を上記 iCloud ルートに対して実行する）。

---

## 10. 未解決事項（2026-05-18 時点）

- ~~**用語規律「リフレクション」「整える」の解禁可否**~~ — **2026-05-18 解決**：二層構造を採用（§8 項目 9 参照、commit `refactor(skill+claude-md): apply terminology dual-layer rule (2026-05-18)`）。「整える」「調える」の使い分けは現状ルール維持
- ~~**書籍 v2.0 vs v2.5**~~ — **2026-05-18 解決**：主正典を `書籍_v3.0_素材/book_v2.7_full.md` 補章 A（用語集）+ `書籍_v2.6/00_ボイス指針.md` に確定
- **v6.0_beta「ありたい姿後置」フロー影響範囲調査**（5/22 期日、引き継ぎパッケージ §4）
- **問い 42 問の書き直し**（書籍 v2.5 体系・三慧・10 理論との整合、本藤さん作業）
- **core-log-engineer SKILL.md の数値が古い**（28 機能 / 7 ティア → 実態 43 機能 / 10 カテゴリ）。SKILL.md 改訂は別 PR で実施
- **`.claude/skills/core-log-review` と `~/.claude/skills/core-log-engineer` の重複整理**（§1 参照）
- **OPENAI_API_KEY ローテーション**（§7 参照、5/16 セッションでキーが露出した可能性）

---

## 11. このファイルを更新するタイミング

- 新しい feature flag が `FEATURE_CATALOG` に追加された → §5 の数を更新
- 主要ディレクトリ・主要ファイルが追加 / 改名された → §2 を更新
- 新しいテナントが追加された → §3 を更新
- 用語規律の正典が更新された → §1, §10 を更新
- 「未解決事項」が解決された / 増えた → §10 を更新

このリポで「観察」が変わったら、その PR の中でこのファイルも同じ commit で更新する（後で別途やる、にしない）。
