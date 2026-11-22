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
│   │   │   │   ├── directory/route.ts         # 管理画面「環境とユーザー」の一覧（管理者＝is_admin だけに返す。§3 参照）
│   │   │   │   └── coach-replies/route.ts     # 運営の「AIコーチの確認」（その環境・その日の記入と返信。管理者と閲覧者が読む。届ける・取り下げるは管理者だけ。§5 参照）
│   │   │   ├── coach-reply/route.ts           # 本人の「AIコーチの返信」（一覧／まだ無ければ作る／受け取る・受け取らない。§5 参照）
│   │   │   ├── features/
│   │   │   │   ├── daily-questions/route.ts   # メゾ層 API（曜日ローテ）
│   │   │   │   └── voice-input/route.ts       # Whisper proxy（OpenAI）
│   │   │   ├── auth/otp/, cron/, entry/, feedback/, logs/, mission/, ...
│   │   ├── a/[token]/          # 管理者 UI（coach/ = 「AIコーチの確認」のページ）
│   │   ├── p/[token]/          # 参加者 UI（入力・履歴・mission）
│   │   ├── m/[token]/          # マネージャー UI
│   │   └── verify/[token]/     # OTP 検証画面
│   ├── components/features/
│   │   ├── DailyQuestionsBlock.tsx   # 問いごとの textarea（朝/夕で再利用）。答えは親（InputClient）が持つ。マイクは tier-e.voiceInput が ON のテナントのみ
│   │   ├── VoiceInput.tsx            # Whisper 録音/送信
│   │   ├── MoodCandlestick.tsx       # 気分ローソク足（日足・21日・ホーム）
│   │   ├── MoodTrendLong.tsx         # 気分の長期ビュー（週足＋日々の線・約3ヶ月・ログ画面）
│   │   ├── ReportHistoryList.tsx     # 過去のAI分析の開閉リスト（レポート画面／ログ画面で共用）
│   │   ├── QuickNoteSheet.tsx        # 途中メモのシート＋「＋ メモ」ボタン（ホーム・standalone のみ）
│   │   ├── MissionContextCard.tsx    # 入力画面の問いの上に、本人の進行中のミッションを出すカード（feature.missionOnInput。表示だけ・API は呼ばない）
│   │   ├── MissionPurposeView.tsx    # ミッション画面の「背景・目的」の表示。仮説つきで保存された文は、仮説と残りを分けて出す（表示だけ）
│   │   ├── CoachingProfileCard.tsx   # 入力画面の問いの上に、本人の設計図の「毎朝の一文」を出す枠（feature.coachingProfile。確認済みのときだけ本人の文を出す。表示だけ・API は呼ばない）
│   │   ├── BlueprintEntryLink.tsx    # 設計図のページへの入口（ホームに置く。feature.coachingProfile。表示だけ）
│   │   ├── BlueprintIssueCard.tsx    # 設計図のページの先頭に出す、いまのイシュー（ミッション）と仮説（進行中のうち、いちばん新しい 1 件。表示だけ・API は呼ばない）
│   │   ├── BlueprintReviewNotice.tsx # 新しいイシューを設定した直後に、「イシュー」のページに出す、設計図の見直しの案内（表示だけ）
│   │   ├── CoachReply.tsx            # AIコーチの返信を本人の画面に出す部品（1 件のカード／完了の画面に置く枠／「FB」のタブの一覧。feature.coachReply）
│   │   └── CoachOptInCard.tsx        # 設計図のページに置く、AIコーチの説明と「受け取る・受け取らない」（押したときに保存する）
│   ├── components/admin/
│   │   ├── AdminDirectory.tsx        # 管理画面「環境とユーザー」の欄（環境の一覧／環境ごとのユーザーと「画面を開く」「URLをコピー」。管理者にだけ出す。表示だけ・API は呼ばない）
│   │   ├── EnvironmentBanner.tsx     # 管理画面のヘッダーの「表示中の環境」の帯（本番は赤・テスト用は緑。表示だけ）
│   │   └── CoachBoard.tsx            # 「AIコーチの確認」の一覧（1 人・1 日のカード。届ける・取り下げるのボタンは管理者にだけ出す。通信はしない）
│   ├── lib/
│   │   ├── feature-flags.ts          # FEATURE_CATALOG（§5 で詳述）
│   │   ├── daily-questions.ts        # メゾ層 store（JST / 7曜日 / legacy flat 後方互換）
│   │   ├── daily-question-answers.ts # 問いへの答えを「Q1: 問い / A1: 答え」の 1 本の文字列にまとめる／問いと答えの組に戻す／答えだけを取り出す（純関数・テスト付き）
│   │   ├── entry-terms.ts            # 朝・夕の記入の呼び名と促しの文言（入力画面・ホーム・ログ・記入の API）。「朝・夕の問い」を出している環境かどうかの決まりもここ（純関数・テスト付き。§6 参照）
│   │   ├── entry-question-env.ts     # 「朝・夕の問い」を出している従来型の環境かを、スイッチと問いの登録から読む／リマインドメールに載せるその回の問いを返す（サーバー側だけ）
│   │   ├── reminder-mail-question.ts # 問いを載せたリマインドメールの件名と本文（純関数・テスト付き。送るかどうかは api/cron/remind が決める）
│   │   ├── mood-series.ts            # 気分の週足・日々の中点の集計（純関数・テスト付き）
│   │   ├── standalone-report.ts      # 21日AIレポート（生成・最新取得・過去一覧 listStandaloneReports）
│   │   ├── quick-notes.ts            # 途中メモ（quick_notes 表の保存/取得/削除・本人と装置だけ）
│   │   ├── feedback-draft.ts         # 管理画面「AI下書き」のモデル選択・リクエスト組立て・応答の読み取り（純関数・テスト付き）
│   │   ├── mission-context.ts        # 入力画面に出すミッションの絞り込み（進行中・最大3件）、呼び名（ミッション／イシュー）の文言表、仮説つきの「背景・目的」のまとめ方と読み方、設計図のページの先頭に出す「いまの 1 件」の選び方（純関数・テスト付き）
│   │   ├── use-leave-guard.ts        # 保存していない変更があるときに、ページを離れる前に確かめる（設計図のページ。どのクリックを離れる操作と見るかは純関数・テスト付き）
│   │   ├── coaching-profile.ts       # 設計図の決まり：欄の上限、確定の条件、メールと夕方の「あなたの問い」に使ってよいか、履歴、画面とメールの言葉（純関数・テスト付き。§5 参照）
│   │   ├── coaching-profile-store.ts # 設計図の読み書き（coaching_profiles 表。本人の分だけ。読めなかったことと、まだ無いことを分けて返す。サーバー側だけ）
│   │   ├── coach-reply.ts            # AIコーチの返信の決まり：環境の設定の読み方、返してよいか、本人の画面に返す形、確認ページを読める人・操作・状態、画面の言葉（純関数・テスト付き。画面の部品はこのファイルだけを読み込む。§5 参照）
│   │   ├── coach-reply-prompt.ts     # AI への指示文、AI に渡す文の組み立て、強い不調などの語、AI の出力の読み方（純関数・テスト付き。サーバー側だけが読み込む＝ブラウザに送るコードに入れない）
│   │   ├── coach-reply-service.ts    # 返信を、要るときに 1 回だけ作る流れ（読み書きと AI の呼び出しは引数で受け取る。テスト付き）
│   │   ├── coach-reply-llm.ts        # AIコーチの AI の呼び出し（モデルの選び方、アプリ全体の停止、失敗の種類。記入の文をログに残さない。テスト付き）
│   │   ├── coach-reply-store.ts      # AIコーチの返信の読み書き（coach_replies 表、環境の設定、その環境で動いているか、本人の受け取りの設定、確認ページの読み取り。サーバー側だけ）
│   │   ├── admin-directory.ts        # 「環境とユーザー」の決まり：環境の用途の呼び名、ユーザーの種別、ログイン用のパス、一覧の並べ方、トークンをだれに返すか（純関数・テスト付き）
│   │   ├── admin-directory-store.ts  # 「環境とユーザー」の読み取り（tenants / participants / managers。logs は読まない。サーバー側だけ）
│   │   ├── supabase.ts               # DB 操作の中心（PostgREST 0 行成功ガード入り）
│   │   ├── tenant-from-token.ts      # token → tenant_id 解決
│   │   ├── feature-flags.ts, email.ts, otp.ts, session.ts, logger.ts, ...
│   └── middleware.ts                 # セキュリティヘッダ / レート制限 / OTP セッション検証
├── supabase/migrations/              # 全 DDL（runtime DDL 禁止）
├── .claude/skills/core-log-review/   # repo-local skill（§1 参照）
├── test-utils/, vitest.config.ts     # Vitest テスト基盤（Node 環境・DOM なし。.tsx の部品は react-dom/server での描画テストまで。入力操作のテストは不可）
├── next.config.mjs, tailwind.config.ts, tsconfig.json
└── vercel.json
```

技術スタック：
- Next.js 14.2 (App Router) + React 18 + TypeScript strict + TailwindCSS
- Supabase (PostgreSQL + PostgREST) — project `vnfmbkftbnjruwsdlvtv`、リージョン ap-southeast-2
- Anthropic Claude API（反芻検知・コンサル分析・将来のミクロ層）/ OpenAI API（Whisper）
  - モデル指定は 2 系統（2026-11-21）。共通ヘルパー `src/lib/llm.ts` は `ANTHROPIC_MODEL`（既定 `claude-sonnet-4-6`）。`temperature` を送り `content[0]` を読むため、5.x 系モデルへは未移行（指定すると全機能が壊れる）。管理画面の「AI下書き」は `src/lib/feedback-draft.ts` が `ANTHROPIC_MODEL_FEEDBACK`（既定 `claude-sonnet-5-5`）で別管理し、5.x 系の応答（先頭が thinking ブロック、`max_tokens` を thinking と共有）に対応済み。
  - 「AI下書き」の指示文（`ai_settings.system_prompt`）は、管理画面で閲覧中のテナント（`?tenant=<slug>`）のものを使う。slug 未指定のときは管理者の home テナント。
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

**管理画面の「環境とユーザー」（2026-11-21 追加）**: 画面では、テナントを「環境」と呼ぶ。管理画面（`/a/[token]`）の上部に、管理者（`is_admin`）にだけ出る欄を置いた。だれがどの環境にいるか、1 人ずつのログイン用 URL が分かるようにするため（それまでは、全環境を表示すると所属が画面で分からず、URL はページのいちばん下のリンクでしか分からなかった）。
- **環境の一覧**：用途・人数・入力画面の型（従来型／商品モード）・確認コード（OTP）の有無。押すと、ページ全体がその環境に切り替わる（ヘッダーの選択欄と同じ `selectedTenantSlug`）。
- **ユーザーの一覧**：環境ごとに区切り、1 人ずつ「画面を開く」「URLをコピー」。URL の文字列は、ふだんは画面に出さない（画面の共有やスクリーンショットに残さないため。コピーできなかったときだけ、その人の分を欄に出す）。全環境を表示しているあいだは、本番の環境だけ閉じておく。
- **ヘッダーの帯**（`EnvironmentBanner`）：いま表示している環境と用途。本番は赤、テスト用は緑。
- **用途の呼び名**は `resolveEnvironmentPurpose()`（`src/lib/admin-directory.ts`）が決める：①保護対象の本番テナント（`DAIKO_TENANT_ID`）は、設定に関係なく「本番」 ②`tenants.config.purpose`（`production` / `test` / `internal` / `trial` / `demo`。それ以外の文字列は、そのまま呼び名になる。16 文字まで） ③なければ `plan`（`demo` → デモ、`experimental` → 試用）。どれでもなければ、用途は出さない。
- 読み取りは `GET /api/admin/directory`（`loadAdminDirectory()`）。tenants / participants / managers だけを読む。**logs は読まない**（「最後の記入日」を出していないのは、§8 項目 10 の観の期の除外と両立する形で正しく出せないため）。
- **追加・CSV インポートは、追加先の環境を 1 つ選んでから**。全環境を表示しているあいだは、4 つのボタンを止める。`POST /api/admin/members` は `?tenant=<slug>` が必須（§8 項目 12）。
- 管理画面の一覧（参加者一覧・マネージャー一覧）は、全環境を表示しているときだけ、環境ごとの見出しで区切る（`sectionByEnvironment()`）。

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

`src/lib/feature-flags.ts` の `FEATURE_CATALOG` は **2026-11-22 時点で 58 件 / 12 カテゴリ**（下の表はコードを数え直した値。2026-06-10 に mode カテゴリ + `standalone_mode` を追加。§9 決定で `tier-f.beforeAfter` と `tier-d.heroAssessment` を削除——打合せ文字起こしの「色軸評価」は「4軸評価」の誤変換で、正対象は HERO自己評価と本藤さん確認済み）。

**mode カテゴリ（2026-06-10 追加）**: `standalone_mode` = 商品版の動作モード。ON のテナントは①朝夕3画面入力（体調→意図/結果→気分、`evening_energy` 分離保存）②気分ローソク足③分析機能の段階開示（21日+記入10日）④マネージャー/管理者のログ本文閲覧を API レベルで遮断＋投稿通知メール停止⑤未記入フォローアップ。大幸薬品では `applyTenantFlagGuards` が強制 OFF（tier-0 と同じ防御）。サーバー判定は `src/lib/standalone.ts`（`isStandaloneTenant` / `standaloneGuard` / `computeUnlockState` / `computeSkipFollowup`）、21日レポートは `src/lib/standalone-report.ts` + `standalone_reports` テーブル、スキップ記録は `skip_reasons` テーブル（migration: `20260610_standalone_mode_schema.sql`）。途中メモ（ホーム右上「＋」の中身。2026-08-18 定例・太田さん FB）は `src/lib/quick-notes.ts` + `quick_notes` テーブル（migration: `20260819_quick_notes.sql`）+ `/api/standalone/quick-note`。本人と装置だけが読み、AI分析の素材にも入る（管理者・上司向けの読み取り経路を作らないこと）。

| カテゴリ | 件数 | 代表 |
|---|---:|---|
| `mode` 動作モード | 2 | **standalone_mode**（商品版。大幸は非表示&強制OFF）, logform_v2（standalone の上に重ねる入力フォーム刷新版） |
| `core` | 3 | morningInput / eveningInput / logHistory |
| `existing` | 15 | energyTracking, mission, streak, badges, animations, reminderMail, managerFeedback, csvExport, otpAuth, managerAnalytics, **dailyQuestions**, **missionOnInput**, **missionLabelIssue**, **coachingProfile**, **coachReply** |
| `tier-0` 観の期(KAN のキー) | 10 | kanNoKi / weeklyMirror / bodyPrompt / silenceObservation / peerComparison(.tenant/.crossTenant/.industry/.global) / transitionSignal（reflection-lab 限定・大幸薬品は非表示&強制OFF） |
| `tier-s` Differentiators | 4 | ruminationDetection, doubleLoopPrompt, weeklyConceptualization, structuredInput |
| `tier-a` Manager Safety Net | 5 | oneOnOneBriefing, burnoutScore, consultantSpotlight, psychSafetyMonitor, managerSelfReflection |
| `tier-b` Cultural Engine | 4 | aar, knowledgeLibrary, cultureScore, peerReflection |
| `tier-c` Competency Trap Escape | 3 | unlearnChallenge, identityTracking, outsightTask |
| `tier-d` PsyCap | 2 | efficacyBooster, hopeDesign（heroAssessment＝4軸自己評価は 2026-06-10 §9 決定で削除） |
| `tier-e` UX | 5 | microRitualOptimizer, ruminationTimer, calendarBlock, voiceInput, selfInsightNote |
| `tier-f` ROI/Evidence | 2 | growthRoi, clientReport（beforeAfter は 2026-06-10 §9 決定で削除） |
| `tier-g` Business Model | 3 | multiTenant, pitchGenerator, consultIntervention |

**ミッションを入力画面に出す 2 つのフラグ（2026-11-21 追加。どちらも既定 OFF・`feature.mission` に依存）**:
- `feature.missionOnInput` = 本人の進行中のミッションを、従来型の入力画面（`InputClient`）の問いの上に出す。読み取りはサーバー（`/p/[token]/input` の `page.tsx`）が `getMissionsByParticipantId`（参加者 ID で引く。氏名では引かない）で行い、`selectActiveMissions`（進行中・新しい順・最大 3 件）を通して `MissionContextCard` に渡す。`initialMissions` は **`null` = 出さない（スイッチ OFF／読めなかった）、`[]` = 未設定（ミッション画面への案内を出す）**。失敗を `[]` にしないこと（設定済みの人に「設定すると表示されます」と出る）。standalone のテナントは `StandaloneInputClient` に分岐するので出ない。
- `feature.missionLabelIssue` = 参加者画面での呼び名を「ミッション」から「イシュー（解くべき問い）」に切り替える。文言は `src/lib/mission-context.ts` の `missionTerms()` に集約（下のタブ・`/p/[token]/mission` の見出しと設定フォーム・入力画面のカード）。**OFF のときの文言は、元から画面にあった文言と一字一句同じ**（テストで固定）。通知メール（`mission_created` / `mission_comment`）と、マネージャー・管理者の画面は切り替えていない。「フル」プリセットには含めない（呼び名の切り替えは機能の追加ではないため）。ON のテナントでは、文言のほかに次の 2 点が変わる。
  - **設定フォームに「仮説」の欄（必須）が加わる**。保存先は増やしていない。仮説と「目指す状態・行動」を `composeIssuePurpose()` で見出しつきの 1 本（`【仮説】…` / `【目指す状態と、これからの行動】…`）にまとめ、既存の `missions.purpose` に保存する（`daily-question-answers.ts` と同じ考え方）。読む側は `parseIssuePurpose()` で分ける：入力画面のカードは仮説を折りたたまずに出し、ミッション画面は `MissionPurposeView` で 2 つの枠に分ける。先頭が見出しで始まらない文（従来の登録、マネージャー画面で書いた文）は分けずにそのまま出す。**マネージャー・管理者の画面には、見出しつきの文がそのまま見える**（そこで編集すると見出しも編集対象になる）。必須の判定は画面側だけ（API は従来どおり）。
  - **「完了にする」が「このイシューを閉じる」になり、理由の記入が必須になる**（`closeNoteRequired`）。DB の値は従来どおり status=`完了`・`final_review` に理由。仮説は確かめると変わるので、書き直すのではなく「理由を書いて閉じ、新しく設定する」運用（前の問い・仮説と、変えた理由が残る）。
- 参加者画面にはミッションの名前・内容を書き直す欄が無い（閉じて作り直すか、マネージャー画面の「ミッション管理」→「編集」）。上の運用のため、書き直す欄は意図して足していない。AI下書きにミッションは渡していない。

**設計図（`feature.coachingProfile`。2026-11-22 追加。既定 OFF）**: 設計図 = 本人が自分で確認した、毎朝の一文・成長課題・これからの行動・期待する結果・止まりそうな場面・夕方に自分へ聞く問い。保存先は `coaching_profiles` 表（migration `20261122_coaching_profiles_and_coach_replies.sql`。1 人 1 行。RLS deny_all + service_role）。決まりは `src/lib/coaching-profile.ts`、読み書きは `src/lib/coaching-profile-store.ts`、本人の API は `/api/coaching-profile`、ページは `/p/[token]/blueprint`。
- **状態は `draft`（確認前）/ `confirmed`（確認済み）。運営が下書きを置き、本人が確かめて確定する。確認前の内容は、メールにも、夕方の「あなたの問い」にも使わない**（`isUsableProfile()`）。本人が確かめていない文を、本人の言葉として毎日見せないため。確定には「毎朝の一文」だけが必須。
- **入力画面**（従来型の `InputClient` だけ）：問いの上に `CoachingProfileCard`。確認済みなら毎朝の一文（成長課題と行動は開いて読む）、確認前・未作成なら設計図のページへの案内。`initialCoachingProfile` は **`null` = 出さない（スイッチ OFF／読めなかった）**。読めなかったことを「まだ無い」と扱わないこと（確定済みの人に「確認してください」と出る）。
- **夕方の「あなたの問い」**：全員共通の夕方の問いの後ろに 1 つ足す（`withPersonalEveningQuestion()`。本人が決めた問い、無ければ毎朝の一文を入れた定型の問い）。入力画面のサーバー側（`page.tsx`）と `/api/features/daily-questions` が同じ関数で足す。答えは従来と同じ「Q3: 問い / A3: 答え」で保存され、欄は増えない。共通の問いが無い日には足さない。
- **リマインドメール**：問いを載せたメール（§6）にだけ、その人の分を足す（`buildReminderPersonal()`）。朝・確認済み＝「あなたの設計図から」（進行中のイシューの 1 件目、仮説、毎朝の一文）／朝・確認前＝確認のお願いと設計図へのリンク／夕方・確認済み＝「あなたの問い」。スイッチが OFF の環境と、その人の分が空のときの HTML は、従来と同じ（`reminder-mail-question.test.ts` で固定）。
- **設計図のページへの入口**（2026-11-22）：入力画面の枠、朝のメール（確認前の人）のほかに、ホーム（`ParticipantHomeClient`）に `BlueprintEntryLink` を置く。入力画面は、その日の記入を終えると完了の表示になり、枠が出ないため（入口が枠とメールだけだと、記入を終えた人が翌日まで設計図を開けない）。出すのは、スイッチが ON で、商品モードでない環境だけ（サーバーが渡す `standalone` で見る）。**「イシュー」のページには、入口を常設しない**（設計図を、イシューのページの中の扱いにしないため。同じ理由で、設計図を開いているあいだ、下のタブは「ホーム」を選んだ表示にする）。「イシュー」のページには、新しく設定した直後だけ、設計図の見直しの案内（`BlueprintReviewNotice`。文は `MissionTerms.createdNotice`）を出す。
- 運営が置いた「傾向」（`tendencies`）は、本人が「使う／使わない」だけを選べる（文は書き換えられない。`mergeTendencyChoices()`）。直したときは、直す前の内容を `history` に残す。
- **設計図とイシューの見せ方**（2026-11-22）：設計図（1 人に 1 つ）とイシューは、別々に保存している。イシューを新しく設定しても、設計図の欄の中身は変わらない。そのうえで、つながりを画面で見せる。
  - 設計図のページの先頭に、いまのイシューと仮説を出す（`BlueprintIssueCard`）。進行中のうち、いちばん新しい 1 件（`pickCurrentIssue()`。朝のメールと AIコーチが使う 1 件と同じになることを、テストで固定）。新しく設定すると、次に開いたときに切り替わる。ほかにも進行中のものがあるときは、件数を 1 行で出す。ここでは直せない（「イシュー」のページへのリンクを出す）。
  - サーバー（`blueprint/page.tsx`）が渡す `issue` は、**`null` = ミッション機能を出していない環境／`view: null` = 読めなかった（枠を出さない）／`view.current: null` = 進行中のものが無い（設定先への案内を出す）**。読めなかったことを「まだ無い」と扱わないこと。
  - 欄は 2 つのまとまりで見せる：「このイシューに向けた行動」（これからの行動、期待する結果と確かめ方）と「自分の行動の変え方」（成長課題、毎朝の一文、止まりそうな場面、夕方に自分へ聞く問い）。見せ方だけの区切りで、保存する欄・メール・AI に渡す文は変えていない。1 つ目の見出しは、呼び名（イシュー／ミッション）に合わせる（`MissionTerms.blueprintActionsHeading`）。
  - 「これからの行動」を書く欄が、イシューの設定フォーム（イシューごと）と設計図（1 人に 1 つ）の両方にあることは、変えていない（§10）。
- **保存していない変更があるあいだは、ページを離れる前に確かめる**（`useLeaveGuard`。設計図のページ）。ページの中のリンク（下のタブを含む）は `confirm`、再読み込み・タブを閉じる操作はブラウザの確認。ブラウザの「戻る」は確かめない。

**AIコーチの返信（`feature.coachReply`。2026-11-22 追加。既定 OFF・`feature.coachingProfile` に依存）**: 夕方の記入のあとに、その日のうちに本人へ返す短い問いかけ。保存先は `coach_replies` 表（設計図と同じ migration。1 人・1 日・1 種類に 1 行。RLS deny_all + service_role）。決まりは `src/lib/coach-reply.ts`、AI に渡す文と出力の読み方は `coach-reply-prompt.ts`、作る流れは `coach-reply-service.ts`、AI の呼び出しは `coach-reply-llm.ts`、読み書きは `coach-reply-store.ts`。本人の API は `/api/coach-reply`、運営の API は `/api/admin/coach-replies`、運営のページは `/a/[token]/coach`。
- **動く条件は 3 つ（`getCoachActivation()`）**：①`feature.coachReply` と `feature.coachingProfile` の両方が ON ②商品モードでない ③環境の設定がある（`ai_settings` の `key='coach_reply_config'`、値は `{"deliveryMode":"auto"|"review","startDate":"YYYY-MM-DD"|null}`）。**スイッチを ON にしただけでは動かない**（設定が無い環境では、記入を読まず、AI も呼ばず、画面にも出さない）。設定の形が少しでも違うとき（届け方の綴り、日付の形）も、設定なしと同じに扱う（`parseCoachConfig()`。近い設定に読み替えて動かさない）。設定を置く画面は、まだ無い（DB に置く）。
- **止める手段は 4 つ**：アプリ全体＝環境変数 `COACH_REPLY_DISABLED=1`（新しい返信を作らず、本人の画面にも出さない。運営の確認ページは読める）／環境ごと＝機能設定でスイッチを OFF／本人ごと＝設計図のページの「受け取らない」（`coaching_profiles.coach_enabled`）／返信ごと＝運営の「取り下げる」。「フル」プリセットには含めない（プリセットを当てただけで、記入を AI に送り始めないように）。
- **返してよいか（`decideCoachEligibility()`）**：設計図が確認済み（`isUsableProfile()`）で、本人が「受け取らない」にしていない人の、今日か前日（JST の営業日）の記入で、夕方の文（`evening_insight`）があるもの。観の期の記入と、開始日より前の記入には返さない。夕方の記入の有無は、文で見る（気分の値や `status` では見ない）。
- **作るとき**：本人が、記入の完了の画面か「FB」のタブを開いたときに、まだ無ければ 1 回だけ作る（`ensureCoachReply()`。定時処理では作らない）。その日の返信がすでにあれば、AI を呼ばない。ほぼ同時の 2 回目は、一意制約で 1 件になる。
- **AI に渡すもの（`buildCoachUserPrompt()`）**：その日の朝と夕方の記入／確認済みの設計図（傾向は、本人が「使う」と選んだものだけ）／進行中のイシューの 1 件目と仮説／前回の届いた返信の、最後の段落。**氏名・メールアドレス・参加者の ID・ほかの日の記入・運営だけが持つ資料（FB方針など）は渡さない。** 送った項目の種類は、返信ごとに `inputs_used` に残す。指示文の既定は `DEFAULT_COACH_SYSTEM_PROMPT`、環境ごとの上書きは `ai_settings` の `key='coach_system_prompt'`（上書きを読めなかったときは、既定の文で黙って作らず、失敗にする）。
- **返信を作らず、運営の確認待ちにする場合**（`status='pending_review'`・`content=''`）：記入に、自分を傷つけることをはっきり書いた言い方がある（`hasCrisisPhrase()`。AI には送らない）／AI が `[[HOLD]]` を返した／AI が応答を断った。本人の画面には「運営の担当者が読んでからお届けします」と出る。**運営がだれも確認ページを見ないと、この表示が残り続ける**（だれが、いつ見るかは未決。§10）。
- **届け方**：`auto` = 作ったらすぐ届ける（`delivered`）。`review` = 運営が確認してから届ける（`pending_review` で保存し、本人には文を返さない）。本人の画面に返すのは、届いた返信の文だけ（`toParticipantView()`）。
- **本人の画面**：記入の完了の画面（夕方の保存の直後と、記入済みの日）に `CoachReplyPanel`、「FB」のタブに `CoachReplyList`（運営のフィードバックの下に、分けて出す）、設計図のページに `CoachOptInCard`（説明と「受け取る・受け取らない」。傾向の欄には「使う」の意味を 1 文足す）。AIコーチの返信を出している環境では、フィードバック機能が OFF でも「FB」のタブを出す。出すかどうかは、画面のスイッチの値に加えて、サーバーの応答（`enabled`）で決まる。**「AIコーチが読んでいます」と出すのは、サーバーが「返してよい人で、返信がまだ無い」と答えたときだけ**（画面は先に `POST /api/coach-reply` を `check: true` で呼ぶ。この呼び出しは作らない・AI を呼ばない。`willGenerate` のときだけ、表示を出して、作る呼び出しをする）。受け取らない設定の人や、設計図が確認前の人の画面に、AI が記入を読んでいるかのような表示を出さないため。確かめ終えるまでは、何も出さない（空の余白も残さない。描画テストで固定）。
- **運営の確認ページ**：読めるのは、記入を読める人と同じ範囲（`coachBoardRole()`。管理者＝`is_admin` は環境を 1 つ指定して読む。閲覧者は自分の環境だけ）。届ける・取り下げるは管理者だけ（`decideCoachAction()`。取り下げた返信は届け直せない。更新は、読んだときの状態のままの行にだけ行う）。商品モードの環境は 403、観の期の記入は読まない、動いていない環境では記入も返信も返さない（このページを、記入を読む別の入口にしない）。管理画面の入口は、表示中の環境で動いているときだけ出る（`GET /api/admin` の `coachReplyEnabled`）。
- **画面の言葉**（`COACH_TERMS` / `COACH_BOARD_TERMS`）と AI への指示文は案（§10）。説明文（`aboutLines`）には、コードで行っていることだけを書く。評価への利用、消し方、保存の期間は、決まるまで書かない（テストで固定）。
- AI への指示文と、強い不調などの語の一覧は、サーバー側だけが読み込む（`coach-reply-prompt.ts`）。画面の部品は `coach-reply.ts` だけを読み込む。ビルドのあと、`.next/static` に指示文が入っていないことを確かめた（2026-11-22）。
- まだ無いもの：翌朝のメールと入力画面に、前回の返信の問いを 1 行出すこと／週のまとめ（`kind='weekly'`。表の値だけ用意）／環境の設定と指示文を置く画面／運営が設計図を読む画面／届いたことの通知（`review` のときは、本人が「FB」のタブを開くまで気づかない）。

保存形式: テナント毎に `ai_settings.value` 行（`tenant_id`, `key='feature_flags'`, `value=JSON`）。flat shape（`{flagKey: bool}`）が現行、legacy nested shape（`{default: {...}}`）は読み取り側で互換維持。

呼び出し API：
- サーバー: `isFeatureEnabled(key, tenantId)` / `isFeatureEnabledForToken(key, token)`
- クライアント: `useFeatures().isOn(key)`（参加者画面で使われる）

**フラグを新設する時のルール**（core-log-engineer 原則 4）:
1. `FEATURE_CATALOG` にエントリを追加（label / description / category / defaultEnabled / implemented）
2. コード内に少なくとも 1 つの `isFeatureEnabled(...)` か `isOn(...)` 呼び出しを置く（grep 可能に）
3. 飾りフラグ（UI に出るがコードに繋がっていない）禁止
4. **新しいカテゴリ（`tier-*` 等）を追加する場合は、同一 PR で `src/app/a/[token]/features/page.tsx` の `FlagCategory` 型 / `CATEGORY_META` / `CATEGORY_ORDER` を 1:1 で更新する。** 未更新だと features ページのグルーピングで `grouped[未知カテゴリ]` が undefined となり `undefined.push` で白画面クラッシュする（2026-06-02 / PR #30 の事故）。グルーピングは `(grouped[cat] ??= []).push(f)` で動的初期化し、未知カテゴリでも落ちない構造を保つこと。

参考：core-log-engineer SKILL.md は「660 行・28 機能・7 ティア」と古い数値を持っている。**現状の真実は 58 機能・12 カテゴリ（2026-11-22）**。スキル本文の数値より、このリポの `src/lib/feature-flags.ts` を信用する。

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
  - `src/components/features/DailyQuestionsBlock.tsx` — 問いごとの textarea。Whisper マイクは `voiceEnabled`（= `tier-e.voiceInput` が ON）のときだけ表示。答えは親（InputClient の `dailyAnswers`）が持つ（step 2 から「戻る」で戻っても入力が残るようにするため）
  - `src/lib/daily-question-answers.ts` — 答えを `Q1: 問い\nA1: 答え` の形で 1 本にまとめ、既存の `morning_intent` / `evening_insight` に保存する。どの問いにも答えが無いときは空文字（未記入のまま「次へ」に進めない）
  - `src/app/p/[token]/input/InputClient.tsx` — 「今日の軸 ── X」ヘッダ（軸が空の曜日は出さない）、`isMorning` で朝/夕切替
  - `src/app/a/[token]/features/daily-questions/page.tsx` + `src/app/api/admin/daily-questions/route.ts` — 管理画面での編集・保存（1 行 1 問）。保存済みの空の軸は空のまま読み込む。入口は管理画面トップ「参加者向け例示」の「毎日の問い」カード（閲覧中のテナントを `?tenant=` で引き継ぐ。`?tenant=` なしで開くと管理者の home テナントが編集対象になるので、ページ上部の「編集中」を確認する）
- 問いの欄が出るのは従来型の入力画面（`InputClient`）だけ。`standalone_mode` が ON のテナントは `StandaloneInputClient` に分岐するため、フラグが ON でも問いの欄は出ない（2026-11-21 コード確認）。`tier-s.structuredInput` と同時に ON にしないこと（画面は問いの欄を出すが、「次へ」の判定と保存は構造化入力の欄を見るため、記入を完了できない）。

**問いを出している環境の、画面とメールの文言（2026-11-22 追加）**: 元の文言（「朝の意図設定」「今日、ひとつだけ意識するとしたら？」、メールの「今日意識すること」「気づいたこと・学んだこと」）は、問いと別のことを聞く。問いを出している環境だけ、次のように切り替える。
- **「問いを出している環境」の決まり**（`isEntryQuestionEnv()`、`src/lib/entry-terms.ts`）：`feature.dailyQuestions` が ON、問いが 1 つ以上登録されている、`standalone_mode` でない、の 3 つがそろった環境。曜日ごとではなく環境ごとに決める。サーバー側は `resolveEntryQuestionEnv()`（`src/lib/entry-question-env.ts`）で読み、参加者画面の各ページ（ホーム・入力・ログ）が初期値として部品に渡す。**読めなかったときは false（元の文言・従来のメール）**。文言の切り替えのためだけの値なので、読めないことで画面や送信を止めない（失敗はログに残す）。
- **呼び名**（`entryTerms()`）：朝の記入を「今日の行動」と呼ぶ（入力画面の見出し・完了の表示、ホームの「今日の状態」の 2 行目、ログの見出しと CSV、締め切り後に記入の API が返す文）。夕方の「本日の振り返り」は変えない。**問いを出していない環境の文言は、元からの文言と一字一句同じ**（`entry-terms.test.ts` と、各部品の描画テストで固定）。文言を足す・変えるときは、部品に直接書かずにこの表に足す。
- **小見出し**（`entrySubheading()`）：その回（朝／夕）に問いを出しているときは出さない。問いを出していない回は、ただ 1 つの促しなので元の文言のまま出す。
- **保存した記入の見せ方**：答えは「Q1: 問い / A1: 答え」の形で保存される。問いを出している環境では、夕方の画面の再掲（「今日の行動（今朝の記入）」）と、1 行に切り詰める一覧（ホームの「最近のログ」、ログの一覧）には答えだけを出す（`answersOnly()`）。ログの行を開いたときは、保存した文のまま、改行を保って出す。CSV は保存した文のまま。
- **リマインドメール**：定時処理（`api/cron/remind`）が環境ごとに `getReminderQuestionsForTenant()` でその回の問いを読み、1 件以上あれば、問いを載せたメール（`reminder-mail-question.ts`）を送る。0 件（問いを出していない環境・商品モード・読めなかった）と、組み立てに失敗したときは、従来のメールを送る（`email-reminder.test.ts` で、従来のメールの件名と文が変わらないことを固定）。問いを載せたメールで送った環境の数は、実行の記録（`cron_runs` の detail の `questionMailTenants`）に残る。
- 変えていないもの：商品モードの画面とメール、マネージャー・管理者の画面と管理画面の CSV 出力（「朝の意図」のまま）、AI下書きに渡す記入の見出し（「朝の意図: …」）、上司への投稿通知の文（「朝の意図：…」）。

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
10. **観の期（`phase_mode='kan-no-ki'`）のログは「本人と装置だけ」。** 上司・伴走者・コンサル（spotlight）・briefing・burnout など管理者向けに logs を読む全経路で kan-no-ki を除外する。共有関数 `getLogsByParticipant` / `getAllLogsForTenant` は**既定で除外**し、本人向けの読み取りのみ `{ includeKanNoKi: true }` を渡す。logs を直クエリする新規の管理者向けコードは `.neq("phase_mode","kan-no-ki")` を必須とする。道場1 移行後も過去の観の期ログは上司へ開かない（2026-06-02 確認・恒久対策）。
11. **standalone テナント（`standalone_mode=true`）のログ本文はテナント丸ごと「本人と装置だけ」。** マネージャー/管理者向けにログ本文・日次気分値を返す新規 API・ページは、必ず `standaloneGuard(tenantId, surface)`（403）または本文ストリッピングを入れる。日報投稿通知メール（本文スニペット付き）も standalone では送らない。UI 非表示だけで済ませることは禁止（2026-06-10 仕様書 §7）。energy は「朝の気分」、夕の気分は `evening_energy`（standalone のみ書き込み）。夕の記入判定に energy を使わない。
12. **ほかの人のトークン（ログイン用 URL）を返すのは、管理者（`is_admin`）にだけ。追加は、追加先の環境を必ず指定する。**（2026-11-21）
    - トークンは、その人の画面を開ける値。`GET /api/admin` は、閲覧者（observer）には参加者・マネージャーのトークンを空文字で返す（本人の行だけは返す。`tokenForViewer()`）。`GET /api/admin/directory` は管理者以外に 403。新しく作る API・画面でも、トークンやログイン用のパスを返す・出すのは管理者にだけにする。
    - 画面の出し分けは、応答の `viewerIsAdmin`（サーバーの `is_admin` と同じ値）で決める。`viewerRole` の文字列だけで「管理者」と判断しない。
    - `POST /api/admin/members` は、管理者以外に 403、`?tenant=<slug>` がなければ 400、知らない slug も 400。**指定がないときに管理者の所属テナントへ黙って追加する動きに戻さないこと**（全環境を表示したまま追加した人が、意図しない環境に入り、どこに入ったのかが画面で分からなかった）。
13. **設計図（`coaching_profiles`）の確認前の内容を、本人の言葉として使わない。**（2026-11-22）
    - メール、夕方の「あなたの問い」、今後の AI の材料に使えるのは、`isUsableProfile()` が true の設計図（確認済みで、毎朝の一文がある）だけ。運営の下書き・運営の見立て（傾向）は、本人が確定・選択するまで使わない。
    - 設計図の読み書きは、トークンから引いた参加者 ID とテナント ID だけで行う（リクエスト本文の ID・氏名で行を選ばない）。
    - AI に本人の材料を渡す機能を足すときは、本人が設計図の画面で見られるものだけを渡す。
14. **AIコーチの返信（`feature.coachReply`）は、記入を外部の AI に送る機能。送る範囲・読める人・止める手段を、広げる方向に変えない。**（2026-11-22）
    - **スイッチだけで動かさない。** 動くのは、スイッチが ON で、環境の設定（`coach_reply_config`）がある環境だけ（`getCoachActivation()`）。設定が無い・形が違う・読めないときに、既定の設定で動かす作りに戻さないこと（スイッチを入れただけで、記入を AI に送り始めてしまう）。
    - **AI に渡すのは `buildCoachUserPrompt()` が組み立てるものだけ。** 足すときは、本人が設計図の画面で見られるものか、その日の記入に限る（§8 項目 13）。氏名・メールアドレス・ID、ほかの日の記入のまとめ、運営だけが持つ資料を足さない。足したら、`coachInputsUsed()` と、説明文（`COACH_TERMS.aboutLines`）も同じ変更で直す。
    - **本人が「受け取らない」にした人、設計図が確認前の人、商品モードの環境、観の期の記入には、AI を呼ばない。** 返してよいかは `decideCoachEligibility()` と `ensureCoachReply()` で決める。別の入口（定時処理、運営の操作）から作るときも、同じ関数を通す。
    - **確認待ち・取り下げ済みの返信の文を、本人に返さない**（`toParticipantView()`）。本人の分は、トークンから引いた参加者 ID とテナント ID で選ぶ。
    - **運営の確認ページを読めるのは、記入を読める人と同じ範囲**（管理者と閲覧者。`coachBoardRole()`）。操作は管理者（`is_admin`）だけ。対象の行の環境（`tenant_id`）を先に引き、その環境で絞って更新する。上司の画面（`/m/[token]`）に、返信を出す経路を作らない。
    - **記入の文・AI に渡した文・返ってきた文を、ログに残さない**（残すのは、参加者 ID、モデル、トークン数、失敗の種類）。
    - **AI への指示文と、強い不調などの語の一覧を、ブラウザに送るコードに入れない**（`coach-reply-prompt.ts` を、画面の部品から読み込まない）。
    - 説明文に、コードで行っていないこと・決まっていないこと（評価に使わない、消せる、保存の期間 など）を書かない。

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
- **全環境を表示したときの集計が、同じ氏名で混ざる恐れ**（2026-11-21 コード確認・未再現）：`getAllLogsForTenant()` は記入を氏名（`participant_name`）でまとめ、`GET /api/admin` は `allLogsMap.get(p.name)` で引く。別の環境に同じ氏名の参加者がいると、全環境の表示では両方の行に同じ記入が入る。環境を 1 つ選んだ表示には影響しない。直すときは共有関数の呼び出し元をすべて確認する
- **CSV インポートの API は、`?tenant=` がないと管理者の所属テナントに入れる**（2026-11-21 コード確認）：`POST /api/admin/import` は `resolveAdminTargetTenant()` の動きのまま。画面側は、全環境を表示しているあいだインポートのボタンを止めている（§3）。API も `POST /api/admin/members` と同じく必須にするかは未決
- **§3 のテナントの表は、実際の値と合っていない箇所がある**（slug、テナントの数）。値は Supabase の `tenants` 表か、管理画面の「環境とユーザー」で確認する
- **AIコーチの返信（`feature.coachReply`）で、決まっていないこと**（2026-11-22）：
  - 画面の言葉（`COACH_TERMS` / `COACH_BOARD_TERMS`）、説明文（`aboutLines`）、AI への指示文（`DEFAULT_COACH_SYSTEM_PROMPT`）は案。説明文に、AI の送り先の会社名を書くか、評価への利用・消し方・保存の期間をどう書くかは未決
  - 運営のだれが、いつ確認ページを見るか。返信を作らなかった記入（確認待ち・文なし）は、運営が見るまで、本人の画面に「運営の担当者が読んでからお届けします」と出たままになる。運営への通知（メールなど）は無い
  - 管理画面の「AI下書き」は、本人が AIコーチを「受け取らない」にしていても、管理者がボタンを押すと、その人の記入を AI に送る（別の機能）。説明文は AIコーチの分だけを書いている
  - 1 人が「作って」と頼める回数の制限（10 分に 6 回）は、サーバーの 1 台ごとに数える目安。AI の応答が使えなかったとき（長すぎる、途中で切れた）は、保存せずに失敗を返すので、本人が開き直すたびに AI を呼び直す
  - 翌朝のメールと入力画面に前回の返信の問いを出すこと、週のまとめ、環境の設定と指示文を置く画面、運営が設計図を読む画面は、まだ無い（§5）
- **設計図とイシューで、行動を書く欄が重なっている**（2026-11-22）：「これからの行動」を書く欄が、イシューの設定フォーム（「目指す状態と、これからの行動」。イシューごと）と、設計図（「これからの行動」「期待する結果と、確かめ方」。1 人に 1 つ）の両方にある。設計図のページでは、いまのイシューを先頭に出し、この 2 つの欄を「このイシューに向けた行動」としてまとめて見せている（§5）。イシューを新しく設定しても、設計図の欄は書き換わらない（設定した直後に、見直しを案内する）。行動と期待する結果を、イシューごとに持つ形に変えるかは未決
- **設計図のページで、ブラウザの「戻る」を使うと、保存していない変更が確認なしで消える**（ページの中のリンクと、再読み込み・タブを閉じる操作は、離れる前に確かめる。§5。2026-11-22）。離れる前の確認は、実際のブラウザでの動きを、テストでは確かめられていない（この環境のテストは DOM なし）

---

## 11. このファイルを更新するタイミング

- 新しい feature flag が `FEATURE_CATALOG` に追加された → §5 の数を更新
- 主要ディレクトリ・主要ファイルが追加 / 改名された → §2 を更新
- 新しいテナントが追加された → §3 を更新
- 用語規律の正典が更新された → §1, §10 を更新
- 「未解決事項」が解決された / 増えた → §10 を更新

このリポで「観察」が変わったら、その PR の中でこのファイルも同じ commit で更新する（後で別途やる、にしない）。
