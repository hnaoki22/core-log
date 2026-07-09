// Feature Flag System for CORE Log
// - Single source of truth: FEATURE_CATALOG (this file)
// - Persistence: Supabase ai_settings table (key='feature_flags', value=JSON)
// - Multi-tenant: JSON shape is { [clientId: string]: { [flagKey: string]: boolean } }
// - Fallback: if Supabase not configured or read fails, uses defaultEnabled from catalog
// - Cache: 5s in-memory cache to avoid excessive DB calls
//
// Usage (server):
//   import { isFeatureEnabled } from "@/lib/feature-flags";
//   if (await isFeatureEnabled("feature.managerFeedback")) { ... }

import { getClient } from "@/lib/supabase";
import { DAIKO_TENANT_ID } from "@/lib/tenants";

// ===== Catalog =====
// Every feature (existing or new) is declared here. Adding a flag = one entry.

export type FlagCategory =
  | "core"          // Core input (always on — shown as read-only)
  | "existing"      // Existing features (mission, streak, feedback, etc)
  | "mode"          // テナント全体の動作モード（standalone商品モード等）
  | "tier-0"        // Tier 0: 観の期(KAN のキー)— 介入前の自己観想フェーズ
  | "tier-s"        // Tier S: Differentiators
  | "tier-a"        // Tier A: Manager Safety Net
  | "tier-b"        // Tier B: Cultural Engine
  | "tier-c"        // Tier C: Competency Trap Escape
  | "tier-d"        // Tier D: PsyCap
  | "tier-e"        // Tier E: UX
  | "tier-f"        // Tier F: ROI/Evidence
  | "tier-g";       // Tier G: Business Model

export type FeatureFlag = {
  key: string;                    // e.g. "feature.managerFeedback"
  label: string;                  // Japanese display name
  description: string;            // 1-2 sentence explanation
  category: FlagCategory;
  defaultEnabled: boolean;        // Fallback when Notion unavailable
  phase1Enabled: boolean;         // Whether ON in Daiko Phase 1 preset
  dependencies?: string[];        // Other flag keys that must be on
  implemented: boolean;           // false = not yet built (shows as "準備中")
  recommendedPhase?: 1 | 2 | 3;   // Recommended Daiko introduction phase
};

export const FEATURE_CATALOG: FeatureFlag[] = [
  // ===== Core (always on) =====
  {
    key: "core.morningInput",
    label: "朝の意図入力",
    description: "毎朝、今日の意図を自由記述するフリー入力欄。CORE Logの中核機能。",
    category: "core",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
  },
  {
    key: "core.eveningInput",
    label: "本日の振り返り入力",
    description: "毎日、1日の気づきや学びを自由記述する欄。",
    category: "core",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
  },
  {
    key: "core.logHistory",
    label: "過去ログ閲覧",
    description: "自分の過去の記入履歴をカレンダー/リスト形式で閲覧。",
    category: "core",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
  },

  // ===== Existing features =====
  {
    key: "feature.energyTracking",
    label: "エネルギー記録",
    description: "4段階の絵文字で当日のエネルギー状態を記録。時系列グラフで可視化。",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
    recommendedPhase: 1,
  },
  {
    key: "feature.mission",
    label: "Mission機能",
    description: "中長期の目標・ミッションを設定し、日々のログと紐付ける。",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
    recommendedPhase: 1,
  },
  {
    key: "feature.streak",
    label: "連続記入ストリーク",
    description: "連続記入日数を表示し、習慣化を促す心理的フック。3日/7日でアイコン変化。",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
    recommendedPhase: 1,
  },
  {
    key: "feature.badges",
    label: "バッジ・実績",
    description: "Mission達成や記入回数到達で獲得できる実績マーク。",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
    recommendedPhase: 1,
  },
  {
    key: "feature.animations",
    label: "演出アニメーション",
    description: "記入完了時のフェードイン・チェックマーク等のUIエフェクト。",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
    recommendedPhase: 1,
  },
  {
    key: "feature.reminderMail",
    label: "リマインドメール",
    description: "朝8:00と夕17:00に、未記入者へ自動リマインドメール送信。",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
    recommendedPhase: 1,
  },
  {
    key: "feature.managerFeedback",
    label: "マネージャーフィードバック",
    description: "上司が部下のログにコメントを返す機能。未読バッジ付き。OFF時は閲覧のみ。",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: false, // Daiko Phase 1: 上司は読むだけ
    implemented: true,
    recommendedPhase: 2,
  },
  {
    key: "feature.csvExport",
    label: "CSVエクスポート",
    description: "管理者画面からログデータをCSV出力。分析・レポート作成用。",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
  },
  {
    key: "feature.otpAuth",
    label: "OTPメール認証",
    description: "トークンURLアクセス時にメールOTPで本人確認を追加。セキュリティ強化。",
    category: "existing",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
  },
  {
    key: "feature.managerAnalytics",
    label: "マネージャー分析画面",
    description: "上司画面の部下別の記入率・エネルギートレンド分析。",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
  },
  {
    key: "feature.dailyQuestions",
    label: "朝・夕の問い 6 問表示",
    description: "テナント毎にカスタマイズした朝3問・夕3問を入力画面に表示。各問いに音声入力ボタン付き。reflection-lab で先行検証中。",
    category: "existing",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
  },

  // ===== Tier S: Differentiators =====
  {
    key: "tier-s.ruminationDetection",
    label: "反芻(Rumination)検知",
    description: "LLMで夕方ログを解析し、ネガティブな反芻パターンを検知。建設的リフレーミングを促す。",
    category: "tier-s",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },
  {
    key: "tier-s.doubleLoopPrompt",
    label: "ダブルループ問い(週次)",
    description: "週1回、朝の入力前に「なぜそれをやるのか?」を強制表示。前提破壊を促す。",
    category: "tier-s",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },
  {
    key: "tier-s.weeklyConceptualization",
    label: "週次持論化(Q3)",
    description: "金曜夕方、5日分のログをLLM要約→持論仮説3案提示→本人が選ぶ。",
    category: "tier-s",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },
  {
    key: "tier-s.structuredInput",
    label: "事実/観察/教訓 3分割入力",
    description: "夕方入力を3フィールドに分割。プリズム構造で反芻を防ぐ。",
    category: "tier-s",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },

  // ===== Tier A: Manager Safety Net =====
  {
    key: "tier-a.oneOnOneBriefing",
    label: "1on1ブリーフィング自動生成",
    description: "1on1直前に、部下の1週間のトレンド・反芻兆候・質問テンプレを自動生成。",
    category: "tier-a",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
    dependencies: ["feature.managerFeedback"],
  },
  {
    key: "tier-a.burnoutScore",
    label: "変化のサイン",
    description: "エネルギー・記入リズム・反芻傾向の変化を組み合わせ、コンディションの気になる変化にマネージャーが気づくための手がかり。",
    category: "tier-a",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
    dependencies: ["tier-s.ruminationDetection"],
  },
  {
    key: "tier-a.consultantSpotlight",
    label: "コンサル・スポットライト",
    description: "全参加者のログをAI分析し「今週注目すべき参加者」を最大5名抽出。省察深度(L1-L4)、テーマ持続性、介入提案を提示。",
    category: "tier-a",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },
  {
    key: "tier-a.psychSafetyMonitor",
    label: "心理的安全性モニター",
    description: "マネージャーのFB文面を解析。「犯人探し」「非難」シグナルを検出し経営層へ集計。",
    category: "tier-a",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
    dependencies: ["feature.managerFeedback"],
  },
  {
    key: "tier-a.managerSelfReflection",
    label: "マネージャー自身の内省",
    description: "マネージャーも週次で「部下の内省をどう支援できたか」を記入。",
    category: "tier-a",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },

  // ===== Tier B: Cultural Engine =====
  {
    key: "tier-b.aar",
    label: "AAR(After Action Review)",
    description: "プロジェクト単位で期待→実際→ギャップ→教訓を構造化。組織知見へ昇華。",
    category: "tier-b",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },
  {
    key: "tier-b.knowledgeLibrary",
    label: "組織ナレッジライブラリ",
    description: "個人の持論を匿名化して組織全体に公開。タグ検索可能。",
    category: "tier-b",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
    dependencies: ["tier-s.weeklyConceptualization"],
  },
  {
    key: "tier-b.cultureScore",
    label: "学習文化スコアダッシュボード",
    description: "組織全体のリフレクション質量を可視化。経営層向け月次レポート。",
    category: "tier-b",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },
  {
    key: "tier-b.peerReflection",
    label: "ピア・リフレクション",
    description: "同期同士で1つの問いを投げ合う。Outsight(外部視点)の実装。",
    category: "tier-b",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },

  // ===== Tier C: Competency Trap Escape =====
  {
    key: "tier-c.unlearnChallenge",
    label: "アンラーン・チャレンジ(月次)",
    description: "月1回「自分の強みが通用しなかった瞬間」を記入。Disorienting Dilemma誘発。",
    category: "tier-c",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },
  {
    key: "tier-c.identityTracking",
    label: "アイデンティティ再構築トラッキング",
    description: "四半期ごと「3ヶ月前と今の自分の違い」を記入。言語化によるリフレーミング。",
    category: "tier-c",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },
  {
    key: "tier-c.outsightTask",
    label: "Outsight獲得タスク",
    description: "「普段話さない人と1人会う」等のタスクを週次アサイン。",
    category: "tier-c",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },

  // ===== Tier D: PsyCap =====
  // tier-d.heroAssessment（HERO自己評価＝Hope/Efficacy/Resilience/Optimism の
  // 4軸を月次で自己入力）は 2026-06-10 本藤さん決定で削除（仕様書 §9。打合せの
  // 「色軸評価」は「4軸評価」の誤変換と確認）。全テナント使用0行を確認の上、
  // UI/ルート/フラグ/プリセット参照を撤去。hero_assessments テーブルは残置。
  {
    key: "tier-d.efficacyBooster",
    label: "自己効力感ブースター",
    description: "過去の「困難を乗り越えた」ログを月末にリマインド表示。燃え尽き予防。",
    category: "tier-d",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },
  {
    key: "tier-d.hopeDesign",
    label: "Hope設計ワーク(四半期)",
    description: "目標への複数経路を構造化して記入するワーク。",
    category: "tier-d",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },

  // ===== Tier E: UX =====
  {
    key: "tier-e.microRitualOptimizer",
    label: "マイクロリチュアル最適化",
    description: "記入所要時間を計測し、長すぎる人に短縮版を提示。",
    category: "tier-e",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },
  {
    key: "tier-e.ruminationTimer",
    label: "反芻防止タイマー",
    description: "同じフィールドに3分以上停滞したら「深呼吸」マイクロインタラクション。",
    category: "tier-e",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },
  {
    key: "tier-e.calendarBlock",
    label: "カレンダーThinking Time自動ブロック",
    description: "Googleカレンダーに毎日15分のリフレクション枠を自動登録。",
    category: "tier-e",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },
  {
    key: "tier-e.voiceInput",
    label: "音声入力対応",
    description: "Whisper APIで音声→テキスト変換。書くのが苦手な人向け。",
    category: "tier-e",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },

  // ===== Tier F: ROI/Evidence =====
  {
    key: "tier-f.growthRoi",
    label: "成長ROIダッシュボード",
    description: "内省時間→持論獲得→行動変容を数値で可視化。Wipro +22.8%への自己接続。",
    category: "tier-f",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },
  // tier-f.beforeAfter（Before/Afterアセスメント＝評価項目を自分で設定して
  // 自分で入力する自己評価機能）は 2026-06-10 本藤さん決定で削除（仕様書 §9）。
  // 全テナントで使用実態ゼロ（before_after_assessments 0行）を確認の上、
  // UI/ルート/フラグのみ撤去。テーブルとデータは残置。
  {
    key: "tier-f.clientReport",
    label: "組織導入効果レポート自動生成",
    description: "クライアント経営層向け月次レポートをExcel/PDFで自動出力。",
    category: "tier-f",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },

  // ===== Tier G: Business Model =====
  {
    key: "tier-g.multiTenant",
    label: "マルチテナント管理",
    description: "複数クライアントを1つのCORE Logで並行運用。",
    category: "tier-g",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },
  {
    key: "tier-g.pitchGenerator",
    label: "導入ピッチ資料自動生成",
    description: "クライアント初回提案用スライドを自動生成(理論+実装+エビデンス)。",
    category: "tier-g",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },
  {
    key: "tier-g.consultIntervention",
    label: "コンサル介入記録",
    description: "コンサル側の1on1参加・研修実施をログに紐づけ、効果測定。",
    category: "tier-g",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },

  // ===== Tier 0: 観の期(KAN のキー)=====
  // 介入前の自己観想フェーズ。装置は観た事を映し返すのみ。reflection-lab で MVP 試験運用。
  {
    key: "tier-0.kanNoKi",
    label: "観の期(KAN のキー)",
    description: "介入前の自己観想フェーズ。装置は観た事を映し返すのみ。新規参加者専用、既存参加者には遡及適用しない。",
    category: "tier-0",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
  },
  {
    key: "tier-0.kanNoKi.weeklyMirror",
    label: "観の期 週次の映し返し",
    description: "週次サマリーで観た事をファクトとして返す。記録のリズム・言葉の輪郭・感情の引き金・静かな抵抗。",
    category: "tier-0",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    dependencies: ["tier-0.kanNoKi"],
  },
  {
    key: "tier-0.kanNoKi.bodyPrompt",
    label: "観の期 身体への問いかけ",
    description: "強い感情語を検出した日にソフトに「その時、身体にはどんな感覚がありましたか」と添える。",
    category: "tier-0",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    dependencies: ["tier-0.kanNoKi"],
  },
  {
    key: "tier-0.kanNoKi.silenceObservation",
    label: "観の期 静かな抵抗の観想",
    description: "書かない日・書く時間帯のずれ・文章の長短を観の対象として可視化する。",
    category: "tier-0",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    dependencies: ["tier-0.kanNoKi"],
  },
  {
    key: "tier-0.kanNoKi.peerComparison",
    label: "観の期 集合像との対比",
    description: "テナント参加者の集合像と、本人の地形図を並べて映す。観の期 AI MVP の核心機能。",
    category: "tier-0",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    dependencies: ["tier-0.kanNoKi"],
  },
  {
    key: "tier-0.kanNoKi.peerComparison.tenant",
    label: "観の期 集合像 同テナント",
    description: "同じテナントの参加者全員を集合像のスコープとする。",
    category: "tier-0",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    dependencies: ["tier-0.kanNoKi.peerComparison"],
  },
  {
    key: "tier-0.kanNoKi.peerComparison.crossTenant",
    label: "観の期 集合像 横断",
    description: "複数テナント横断の集合像を返す。",
    category: "tier-0",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    dependencies: ["tier-0.kanNoKi.peerComparison"],
  },
  {
    key: "tier-0.kanNoKi.peerComparison.industry",
    label: "観の期 集合像 業界別",
    description: "tenants.industry を共有するテナント横断の集合像を返す。",
    category: "tier-0",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    dependencies: ["tier-0.kanNoKi.peerComparison"],
  },
  {
    key: "tier-0.kanNoKi.peerComparison.global",
    label: "観の期 集合像 全体",
    description: "CORE Log 全体の集合像を返す。",
    category: "tier-0",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    dependencies: ["tier-0.kanNoKi.peerComparison"],
  },
  {
    key: "tier-0.kanNoKi.transitionSignal",
    label: "観の期 段階的シグナル",
    description: "初期の輪郭/言葉の癖の観想可能/より深い観想可能 の3段階通知。本人の道場1 移行判断を補助する。",
    category: "tier-0",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    dependencies: ["tier-0.kanNoKi"],
  },

  // ===== Mode: standalone商品モード =====
  // 商品版最終型仕様書 v1.0 §1。テナント単位の動作モード。
  // ON のテナント:「最初の3週間（観の期）は誰も見れない」をコードで保証。
  //   - 朝夕の新3画面入力フロー（体調→意図/結果→気分、evening_energy 分離保存）
  //   - 気分ローソク足・分析機能の段階開示（21日経過+記入10日でアンロック）
  //   - マネージャー/管理者のログ本文閲覧を API レベルで遮断・通知メール停止
  // 道場1系テナント（大幸等）は OFF のまま。applyTenantFlagGuards で大幸は強制 OFF。
  {
    key: "standalone_mode",
    label: "standalone商品モード",
    description: "商品版の動作モード。最初の3週間は誰も見ないことをコードで保証する（入力3画面・気分ローソク足・段階開示・ログ本文閲覧の遮断・投稿通知メール停止）。テナント単位でON/OFF。",
    category: "mode",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
  },
  // logform v2（朝夕ログ刷新 2026-07-09）: standalone商品モードの入力フォーム刷新版。
  // standalone_mode の上に重ねるレイヤー。ON のテナント（reflection-lab / デモ）でのみ
  // v2 フォーム（体調3ゲージ・アウトカム型意図・行動/意識の振り返り・前日ログ開示）を出す。
  // category="mode" のため大幸は applyTenantFlagGuards で強制 OFF ＋ 管理UIで非表示。
  {
    key: "logform_v2",
    label: "ログ入力フォーム v2",
    description: "standalone商品モードの入力フォーム刷新版。体調を3項目の選択式ゲージ（睡眠の質・体の疲労感・頭のさえ）に、朝の意図をアウトカム型2問に、夕方を行動・意識の2問にする。前日ログはボタンで開示。standalone_mode ON のテナントでのみ有効。テナント単位でON/OFF。",
    category: "mode",
    defaultEnabled: false,
    phase1Enabled: false,
    dependencies: ["standalone_mode"],
    implemented: true,
  },
  // ===== Tier E 追加: 自分の気づきメモ（standalone AI分析）2026-06-21 / 太田さん要望① =====
  {
    key: "tier-e.selfInsightNote",
    label: "自分の気づきメモ",
    description: "AI分析（21日レポート）を読んで、本人が自分の気づきを書き残し、過去の気づきが蓄積される欄。standaloneモードのAI分析画面に表示。",
    category: "tier-e",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
  },
];

// ===== Presets =====
export type Preset = {
  id: string;
  label: string;
  description: string;
  getFlags: () => Record<string, boolean>;
};

export const PRESETS: Preset[] = [
  {
    id: "minimal",
    label: "ミニマル",
    description: "フリー入力のみ。最もシンプルな習慣化重視の構成。",
    getFlags: () => {
      const flags: Record<string, boolean> = {};
      for (const f of FEATURE_CATALOG) {
        flags[f.key] = f.category === "core";
      }
      // Add essentials
      flags["feature.reminderMail"] = true;
      return flags;
    },
  },
  {
    id: "daiko-phase1",
    label: "大幸薬品 Phase 1",
    description: "フリー入力 + 既存機能(FB以外)。上司は読むだけの期間。",
    getFlags: () => {
      const flags: Record<string, boolean> = {};
      for (const f of FEATURE_CATALOG) {
        flags[f.key] = f.phase1Enabled;
      }
      return flags;
    },
  },
  {
    id: "daiko-phase2",
    label: "大幸薬品 Phase 2",
    description: "Phase 1 + マネージャーFB + 週次ダブルループ問い。",
    getFlags: () => {
      const flags: Record<string, boolean> = {};
      for (const f of FEATURE_CATALOG) {
        flags[f.key] = f.phase1Enabled;
      }
      flags["feature.managerFeedback"] = true;
      flags["tier-s.doubleLoopPrompt"] = true;
      flags["tier-s.structuredInput"] = true;
      flags["tier-a.managerSelfReflection"] = true;
      return flags;
    },
  },
  {
    id: "daiko-phase3",
    label: "大幸薬品 Phase 3",
    description: "Phase 2 + 反芻検知 + 持論化 + 1on1ブリーフィング + AAR。",
    getFlags: () => {
      const flags: Record<string, boolean> = {};
      for (const f of FEATURE_CATALOG) {
        flags[f.key] = f.phase1Enabled;
      }
      flags["feature.managerFeedback"] = true;
      flags["tier-s.doubleLoopPrompt"] = true;
      flags["tier-s.structuredInput"] = true;
      flags["tier-s.ruminationDetection"] = true;
      flags["tier-s.weeklyConceptualization"] = true;
      flags["tier-a.oneOnOneBriefing"] = true;
      flags["tier-a.burnoutScore"] = true;
      flags["tier-a.managerSelfReflection"] = true;
      flags["tier-b.aar"] = true;
      flags["tier-b.knowledgeLibrary"] = true;
      flags["tier-f.growthRoi"] = true;
      return flags;
    },
  },
  {
    id: "full",
    label: "フル(全機能ON)",
    description: "実装済みの全機能をON。デモ・検証用。",
    getFlags: () => {
      const flags: Record<string, boolean> = {};
      for (const f of FEATURE_CATALOG) {
        flags[f.key] = f.implemented;
      }
      return flags;
    },
  },
];

// ===== Storage (Supabase ai_settings table) =====
//
// Per-tenant feature flags. Each tenant has its own row in ai_settings:
//   tenant_id=<tid>, key='feature_flags', value=<flat JSON of flag→bool>
//
// Backwards compatibility: the read path also recognizes the legacy nested
// shape ({ "default": {flag→bool} }) for the single-row Phase 0 era. After
// the migration runs, only the flat shape will exist; this fallback can be
// removed once all rows are confirmed flat.

type FlagMap = Record<string, boolean>;

// Per-tenant cache so multiple tenants don't invalidate each other.
const cacheByTenant = new Map<string, { data: FlagMap; at: number }>();
// 60s TTL — flags rarely change, and middleware runs on every request so a
// short TTL was creating an effective ~50-150ms Supabase round-trip on the
// hot path for every cache miss. Admin edits still flush the cache directly
// via invalidateFlagCache() on write, so users see updates within milliseconds
// of an admin toggle.
const CACHE_TTL_MS = 60 * 1000;

function defaultFlagsFor(): FlagMap {
  const flags: FlagMap = {};
  for (const f of FEATURE_CATALOG) {
    flags[f.key] = f.defaultEnabled;
  }
  return flags;
}

async function readFlagsFromSupabase(tenantId: string): Promise<FlagMap> {
  try {
    const client = getClient();
    const { data, error } = await client
      .from("ai_settings")
      .select("value")
      .eq("tenant_id", tenantId)
      .eq("key", "feature_flags")
      .maybeSingle();
    if (error || !data?.value) return {};
    try {
      const parsed = JSON.parse(data.value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        // Legacy nested shape: { "default": { flag→bool } }
        const obj = parsed as Record<string, unknown>;
        if (
          obj.default &&
          typeof obj.default === "object" &&
          !Array.isArray(obj.default)
        ) {
          return obj.default as FlagMap;
        }
        // Flat shape: { flag→bool }
        return parsed as FlagMap;
      }
      return {};
    } catch {
      return {};
    }
  } catch (err) {
    console.error("Error reading feature flags from Supabase:", err);
    return {};
  }
}

async function writeFlagsToSupabase(
  tenantId: string,
  flags: FlagMap
): Promise<boolean> {
  try {
    const client = getClient();
    const { error } = await client
      .from("ai_settings")
      .upsert(
        {
          tenant_id: tenantId,
          key: "feature_flags",
          value: JSON.stringify(flags),
        },
        { onConflict: "tenant_id,key" }
      );
    return !error;
  } catch (err) {
    console.error("Error writing feature flags to Supabase:", err);
    return false;
  }
}

async function getFlagsCached(tenantId: string): Promise<FlagMap> {
  const cached = cacheByTenant.get(tenantId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  const data = await readFlagsFromSupabase(tenantId);
  cacheByTenant.set(tenantId, { data, at: Date.now() });
  return data;
}

export function invalidateFlagCache(tenantId?: string) {
  if (tenantId) cacheByTenant.delete(tenantId);
  else cacheByTenant.clear();
}

// ===== Public API =====

/**
 * Get the effective flag map for a tenant (defaults merged with stored overrides).
 * Always pass the actual tenant the request is for. Falling back to
 * DEFAULT_TENANT_ID is reserved for genuinely global checks (e.g., site-wide
 * OTP auth) and should be commented as such at the call site.
 */
export async function getFlagsForTenant(tenantId: string): Promise<FlagMap> {
  const stored = await getFlagsCached(tenantId);
  const defaults = defaultFlagsFor();
  // 読み取り時にもテナント不変条件を適用（書き込み側ガードのすり抜けや
  // 過去に保存された値が残っていても、大幸で tier-0 / standalone_mode が
  // 実行時に ON と評価されることはない）。
  return applyTenantFlagGuards(tenantId, { ...defaults, ...stored });
}

export async function isFeatureEnabled(
  key: string,
  tenantId: string
): Promise<boolean> {
  const flags = await getFlagsForTenant(tenantId);
  return flags[key] === true;
}

/**
 * Convenience: resolve a participant or admin token to its tenant, then check
 * the flag. Use this in API routes where the caller already has a token.
 * Returns false if the token cannot be resolved (defense-in-depth: an
 * unrecognized token never gets a feature it shouldn't).
 */
export async function isFeatureEnabledForToken(
  key: string,
  token: string | null | undefined
): Promise<boolean> {
  if (!token) return false;
  const { resolveTenantFromToken } = await import("./tenant-from-token");
  const tenantId = await resolveTenantFromToken(token);
  if (!tenantId) return false;
  return isFeatureEnabled(key, tenantId);
}

export async function setFlagsForTenant(
  tenantId: string,
  flags: FlagMap
): Promise<boolean> {
  const ok = await writeFlagsToSupabase(tenantId, flags);
  if (ok) invalidateFlagCache(tenantId);
  return ok;
}

// (No backwards-compat shims — all callers updated to per-tenant API.)

// ===== Per-tenant flag policy guards =====

/**
 * Enforce per-tenant feature-flag invariants that must hold no matter how the
 * flag map was produced (manual admin toggles, a preset like "full", or a
 * crafted/legacy POST body).
 *
 * 観の期(tier-0) is reflection-lab only for now. The daiko production tenant must
 * never *persist* it ON: hiding the toggle in the admin UI is not sufficient,
 * because the "full" preset (implemented=true → ON) and any direct POST could
 * otherwise enable it. This is the server-side half of that guard, paired with
 * the client hiding the category (production-security-guard 原則1/7: never trust
 * a client-side gate to protect a server-side invariant).
 *
 * Returns a new map; the input is never mutated.
 */
export function applyTenantFlagGuards(
  tenantId: string,
  flags: FlagMap
): FlagMap {
  const guarded: FlagMap = { ...flags };
  if (tenantId === DAIKO_TENANT_ID) {
    for (const f of FEATURE_CATALOG) {
      // 観の期(tier-0)と standalone商品モードは大幸では常に OFF。
      // standalone_mode が大幸で ON になると、入力フロー差し替え・
      // 管理者のログ閲覧遮断・通知メール停止が発動してしまう（仕様書 §1）。
      if (f.category === "tier-0" || f.category === "mode") guarded[f.key] = false;
    }
  }
  return guarded;
}
