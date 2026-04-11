// Feature Flag System for CORE Log
// - Single source of truth: FEATURE_CATALOG (this file)
// - Persistence: Notion page (body as JSON code block) — same pattern as AI_SETTINGS_PAGE_ID
// - Multi-tenant: JSON shape is { [clientId: string]: { [flagKey: string]: boolean } }
// - Fallback: if Notion not configured or read fails, uses defaultEnabled from catalog
// - Cache: 60s in-memory cache to avoid excessive Notion API calls
//
// Usage (server):
//   import { isFeatureEnabled } from "@/lib/feature-flags";
//   if (await isFeatureEnabled("feature.managerFeedback")) { ... }

import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });
const FEATURE_FLAGS_PAGE_ID = process.env.NOTION_FEATURE_FLAGS_PAGE_ID || "";
const DEFAULT_CLIENT = process.env.FEATURE_FLAGS_CLIENT || "default";

// ===== Catalog =====
// Every feature (existing or new) is declared here. Adding a flag = one entry.

export type FlagCategory =
  | "core"          // Core input (always on — shown as read-only)
  | "existing"      // Existing features (mission, streak, feedback, etc)
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
    label: "夕方の振り返り入力",
    description: "毎夕、1日の気づきや学びを自由記述する欄。",
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
    label: "離職・燃え尽き予兆スコア",
    description: "エネルギー × 記入率 × 反芻スコアの複合指標。マネージャーにのみアラート。",
    category: "tier-a",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
    dependencies: ["tier-s.ruminationDetection"],
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
  {
    key: "tier-d.heroAssessment",
    label: "HERO自己評価(月次)",
    description: "Hope / Efficacy / Resilience / Optimism の4軸評価。時系列グラフで可視化。",
    category: "tier-d",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },
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
  {
    key: "tier-f.beforeAfter",
    label: "Before/Afterアセスメント",
    description: "導入時と3ヶ月後で同じ自己評価を実施。変化量を表示。",
    category: "tier-f",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },
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
    description: "Phase 1 + マネージャーFB + 週次ダブルループ問い + HERO評価。",
    getFlags: () => {
      const flags: Record<string, boolean> = {};
      for (const f of FEATURE_CATALOG) {
        flags[f.key] = f.phase1Enabled;
      }
      flags["feature.managerFeedback"] = true;
      flags["tier-s.doubleLoopPrompt"] = true;
      flags["tier-s.structuredInput"] = true;
      flags["tier-d.heroAssessment"] = true;
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
      flags["tier-d.heroAssessment"] = true;
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

// ===== Storage (Notion page body as JSON code block) =====

type FlagStore = Record<string, Record<string, boolean>>; // { clientId: { flagKey: bool } }

let cache: { data: FlagStore; at: number } | null = null;
// Short TTL to minimize stale reads across serverless instances.
// Each Vercel function instance has its own in-memory cache; after an admin
// saves via POST (which invalidates *that* instance's cache), OTHER instances
// still serve stale data until their TTL expires. 5 seconds is a reasonable
// trade-off between freshness and Notion API rate limits.
const CACHE_TTL_MS = 5 * 1000;

function defaultFlagsFor(): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const f of FEATURE_CATALOG) {
    flags[f.key] = f.defaultEnabled;
  }
  return flags;
}

async function readStoreFromNotion(): Promise<FlagStore> {
  if (!FEATURE_FLAGS_PAGE_ID) return {};
  try {
    const blocks = await notion.blocks.children.list({
      block_id: FEATURE_FLAGS_PAGE_ID,
      page_size: 50,
    });
    for (const block of blocks.results) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = block as any;
      if (b.type === "code" && b.code?.language === "json") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const text = b.code.rich_text?.map((t: any) => t.plain_text).join("") || "";
        if (text.trim()) {
          try {
            return JSON.parse(text) as FlagStore;
          } catch {
            return {};
          }
        }
      }
    }
    return {};
  } catch (err) {
    console.error("Error reading feature flags from Notion:", err);
    return {};
  }
}

async function writeStoreToNotion(store: FlagStore): Promise<boolean> {
  if (!FEATURE_FLAGS_PAGE_ID) return false;
  try {
    // Delete existing code blocks, then append fresh one
    const blocks = await notion.blocks.children.list({
      block_id: FEATURE_FLAGS_PAGE_ID,
      page_size: 50,
    });
    for (const block of blocks.results) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = block as any;
      if (b.type === "code" && b.code?.language === "json") {
        await notion.blocks.delete({ block_id: b.id });
      }
    }
    await notion.blocks.children.append({
      block_id: FEATURE_FLAGS_PAGE_ID,
      children: [
        {
          object: "block",
          type: "code",
          code: {
            language: "json",
            rich_text: [
              {
                type: "text",
                text: { content: JSON.stringify(store, null, 2) },
              },
            ],
          },
        },
      ],
    });
    return true;
  } catch (err) {
    console.error("Error writing feature flags to Notion:", err);
    return false;
  }
}

async function getStore(): Promise<FlagStore> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const data = await readStoreFromNotion();
  cache = { data, at: Date.now() };
  return data;
}

export function invalidateFlagCache() {
  cache = null;
}

// ===== Public API =====

export async function getFlagsForClient(
  clientId: string = DEFAULT_CLIENT
): Promise<Record<string, boolean>> {
  const store = await getStore();
  const defaults = defaultFlagsFor();
  return { ...defaults, ...(store[clientId] || {}) };
}

export async function isFeatureEnabled(
  key: string,
  clientId: string = DEFAULT_CLIENT
): Promise<boolean> {
  const flags = await getFlagsForClient(clientId);
  return flags[key] === true;
}

export async function setFlagsForClient(
  clientId: string,
  flags: Record<string, boolean>
): Promise<boolean> {
  const store = await readStoreFromNotion();
  store[clientId] = flags;
  const ok = await writeStoreToNotion(store);
  if (ok) invalidateFlagCache();
  return ok;
}

export function getCurrentClientId(): string {
  return DEFAULT_CLIENT;
}
