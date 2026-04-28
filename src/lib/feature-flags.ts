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

import { getClient, DEFAULT_TENANT_ID } from "@/lib/supabase";

const DEFAULT_CLIENT = process.env.FEATURE_FLAGS_CLIENT || "default";

// ===== Catalog =====
// Every feature (existing or new) is declared here. Adding a flag = one entry.

export type FlagCategory =
  | "core"          // Core input (always on â shown as read-only)
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
  implemented: boolean;           // false = not yet built (shows as "æºåä¸­")
  recommendedPhase?: 1 | 2 | 3;   // Recommended Daiko introduction phase
};

export const FEATURE_CATALOG: FeatureFlag[] = [
  // ===== Core (always on) =====
  {
    key: "core.morningInput",
    label: "æã®æå³å¥å",
    description: "æ¯æãä»æ¥ã®æå³ãèªç±è¨è¿°ããããªã¼å¥åæ¬ãCORE Logã®ä¸­æ ¸æ©è½ã",
    category: "core",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
  },
  {
    key: "core.eveningInput",
    label: "æ¬æ¥ã®æ¯ãè¿ãå¥å",
    description: "æ¯æ¥ã1æ¥ã®æ°ã¥ããå­¦ã³ãèªç±è¨è¿°ããæ¬ã",
    category: "core",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
  },
  {
    key: "core.logHistory",
    label: "éå»ã­ã°é²è¦§",
    description: "èªåã®éå»ã®è¨å¥å±¥æ­´ãã«ã¬ã³ãã¼/ãªã¹ãå½¢å¼ã§é²è¦§ã",
    category: "core",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
  },

  // ===== Existing features =====
  {
    key: "feature.energyTracking",
    label: "ã¨ãã«ã®ã¼è¨é²",
    description: "4æ®µéã®çµµæå­ã§å½æ¥ã®ã¨ãã«ã®ã¼ç¶æãè¨é²ãæç³»åã°ã©ãã§å¯è¦åã",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
    recommendedPhase: 1,
  },
  {
    key: "feature.mission",
    label: "Missionæ©è½",
    description: "ä¸­é·æã®ç®æ¨ã»ããã·ã§ã³ãè¨­å®ããæ¥ãã®ã­ã°ã¨ç´ä»ããã",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
    recommendedPhase: 1,
  },
  {
    key: "feature.streak",
    label: "é£ç¶è¨å¥ã¹ããªã¼ã¯",
    description: "é£ç¶è¨å¥æ¥æ°ãè¡¨ç¤ºããç¿æ£åãä¿ãå¿ççããã¯ã3æ¥/7æ¥ã§ã¢ã¤ã³ã³å¤åã",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
    recommendedPhase: 1,
  },
  {
    key: "feature.badges",
    label: "ããã¸ã»å®ç¸¾",
    description: "Missionéæãè¨å¥åæ°å°éã§ç²å¾ã§ããå®ç¸¾ãã¼ã¯ã",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
    recommendedPhase: 1,
  },
  {
    key: "feature.animations",
    label: "æ¼åºã¢ãã¡ã¼ã·ã§ã³",
    description: "è¨å¥å®äºæã®ãã§ã¼ãã¤ã³ã»ãã§ãã¯ãã¼ã¯ç­ã®UIã¨ãã§ã¯ãã",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
    recommendedPhase: 1,
  },
  {
    key: "feature.reminderMail",
    label: "ãªãã¤ã³ãã¡ã¼ã«",
    description: "æ8:00ã¨å¤17:00ã«ãæªè¨å¥èã¸èªåãªãã¤ã³ãã¡ã¼ã«éä¿¡ã",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
    recommendedPhase: 1,
  },
  {
    key: "feature.managerFeedback",
    label: "ããã¼ã¸ã£ã¼ãã£ã¼ãããã¯",
    description: "ä¸å¸ãé¨ä¸ã®ã­ã°ã«ã³ã¡ã³ããè¿ãæ©è½ãæªèª­ããã¸ä»ããOFFæã¯é²è¦§ã®ã¿ã",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: false, // Daiko Phase 1: ä¸å¸ã¯èª­ãã ã
    implemented: true,
    recommendedPhase: 2,
  },
  {
    key: "feature.csvExport",
    label: "CSVã¨ã¯ã¹ãã¼ã",
    description: "ç®¡çèç»é¢ããã­ã°ãã¼ã¿ãCSVåºåãåæã»ã¬ãã¼ãä½æç¨ã",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
  },
  {
    key: "feature.otpAuth",
    label: "OTPã¡ã¼ã«èªè¨¼",
    description: "ãã¼ã¯ã³URLã¢ã¯ã»ã¹æã«ã¡ã¼ã«OTPã§æ¬äººç¢ºèªãè¿½å ãã»ã­ã¥ãªãã£å¼·åã",
    category: "existing",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
  },
  {
    key: "feature.managerAnalytics",
    label: "ããã¼ã¸ã£ã¼åæç»é¢",
    description: "ä¸å¸ç»é¢ã®é¨ä¸å¥ã®è¨å¥çã»ã¨ãã«ã®ã¼ãã¬ã³ãåæã",
    category: "existing",
    defaultEnabled: true,
    phase1Enabled: true,
    implemented: true,
  },

  // ===== Tier S: Differentiators =====
  {
    key: "tier-s.ruminationDetection",
    label: "åè»(Rumination)æ¤ç¥",
    description: "LLMã§å¤æ¹ã­ã°ãè§£æãããã¬ãã£ããªåè»ãã¿ã¼ã³ãæ¤ç¥ãå»ºè¨­çãªãã¬ã¼ãã³ã°ãä¿ãã",
    category: "tier-s",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },
  {
    key: "tier-s.doubleLoopPrompt",
    label: "ããã«ã«ã¼ãåã(é±æ¬¡)",
    description: "é±1åãæã®å¥ååã«ããªããããããã®ã?ããå¼·å¶è¡¨ç¤ºãåæç ´å£ãä¿ãã",
    category: "tier-s",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },
  {
    key: "tier-s.weeklyConceptualization",
    label: "é±æ¬¡æè«å(Q3)",
    description: "éæå¤æ¹ã5æ¥åã®ã­ã°ãLLMè¦ç´âæè«ä»®èª¬3æ¡æç¤ºâæ¬äººãé¸ã¶ã",
    category: "tier-s",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },
  {
    key: "tier-s.structuredInput",
    label: "äºå®/è¦³å¯/æè¨ 3åå²å¥å",
    description: "å¤æ¹å¥åã3ãã£ã¼ã«ãã«åå²ãããªãºã æ§é ã§åè»ãé²ãã",
    category: "tier-s",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },

  // ===== Tier A: Manager Safety Net =====
  {
    key: "tier-a.oneOnOneBriefing",
    label: "1on1ããªã¼ãã£ã³ã°èªåçæ",
    description: "1on1ç´åã«ãé¨ä¸ã®1é±éã®ãã¬ã³ãã»åè»ååã»è³ªåãã³ãã¬ãèªåçæã",
    category: "tier-a",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
    dependencies: ["feature.managerFeedback"],
  },
  {
    key: "tier-a.burnoutScore",
    label: "é¢è·ã»çãå°½ãäºåã¹ã³ã¢",
    description: "ã¨ãã«ã®ã¼ Ã è¨å¥ç Ã åè»ã¹ã³ã¢ã®è¤åææ¨ãããã¼ã¸ã£ã¼ã«ã®ã¿ã¢ã©ã¼ãã",
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
    label: "å¿ççå®å¨æ§ã¢ãã¿ã¼",
    description: "ããã¼ã¸ã£ã¼ã®FBæé¢ãè§£æããç¯äººæ¢ãããéé£ãã·ã°ãã«ãæ¤åºãçµå¶å±¤ã¸éè¨ã",
    category: "tier-a",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
    dependencies: ["feature.managerFeedback"],
  },
  {
    key: "tier-a.managerSelfReflection",
    label: "ããã¼ã¸ã£ã¼èªèº«ã®åç",
    description: "ããã¼ã¸ã£ã¼ãé±æ¬¡ã§ãé¨ä¸ã®åçãã©ãæ¯æ´ã§ãããããè¨å¥ã",
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
    description: "ãã­ã¸ã§ã¯ãåä½ã§æå¾âå®éâã®ã£ããâæè¨ãæ§é åãçµç¹ç¥è¦ã¸æè¯ã",
    category: "tier-b",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },
  {
    key: "tier-b.knowledgeLibrary",
    label: "çµç¹ãã¬ãã¸ã©ã¤ãã©ãª",
    description: "åäººã®æè«ãå¿ååãã¦çµç¹å¨ä½ã«å¬éãã¿ã°æ¤ç´¢å¯è½ã",
    category: "tier-b",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
    dependencies: ["tier-s.weeklyConceptualization"],
  },
  {
    key: "tier-b.cultureScore",
    label: "å­¦ç¿æåã¹ã³ã¢ããã·ã¥ãã¼ã",
    description: "çµç¹å¨ä½ã®ãªãã¬ã¯ã·ã§ã³è³ªéãå¯è¦åãçµå¶å±¤åãææ¬¡ã¬ãã¼ãã",
    category: "tier-b",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },
  {
    key: "tier-b.peerReflection",
    label: "ãã¢ã»ãªãã¬ã¯ã·ã§ã³",
    description: "åæåå£«ã§1ã¤ã®åããæãåããOutsight(å¤é¨è¦ç¹)ã®å®è£ã",
    category: "tier-b",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },

  // ===== Tier C: Competency Trap Escape =====
  {
    key: "tier-c.unlearnChallenge",
    label: "ã¢ã³ã©ã¼ã³ã»ãã£ã¬ã³ã¸(ææ¬¡)",
    description: "æ1åãèªåã®å¼·ã¿ãéç¨ããªãã£ãç¬éããè¨å¥ãDisorienting Dilemmaèªçºã",
    category: "tier-c",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },
  {
    key: "tier-c.identityTracking",
    label: "ã¢ã¤ãã³ãã£ãã£åæ§ç¯ãã©ãã­ã³ã°",
    description: "ååæãã¨ã3ã¶æåã¨ä»ã®èªåã®éãããè¨å¥ãè¨èªåã«ãããªãã¬ã¼ãã³ã°ã",
    category: "tier-c",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },
  {
    key: "tier-c.outsightTask",
    label: "Outsightç²å¾ã¿ã¹ã¯",
    description: "ãæ®æ®µè©±ããªãäººã¨1äººä¼ããç­ã®ã¿ã¹ã¯ãé±æ¬¡ã¢ãµã¤ã³ã",
    category: "tier-c",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },

  // ===== Tier D: PsyCap =====
  {
    key: "tier-d.heroAssessment",
    label: "HEROèªå·±è©ä¾¡(ææ¬¡)",
    description: "Hope / Efficacy / Resilience / Optimism ã®4è»¸è©ä¾¡ãæç³»åã°ã©ãã§å¯è¦åã",
    category: "tier-d",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },
  {
    key: "tier-d.efficacyBooster",
    label: "èªå·±å¹åæãã¼ã¹ã¿ã¼",
    description: "éå»ã®ãå°é£ãä¹ãè¶ãããã­ã°ãææ«ã«ãªãã¤ã³ãè¡¨ç¤ºãçãå°½ãäºé²ã",
    category: "tier-d",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },
  {
    key: "tier-d.hopeDesign",
    label: "Hopeè¨­è¨ã¯ã¼ã¯(ååæ)",
    description: "ç®æ¨ã¸ã®è¤æ°çµè·¯ãæ§é åãã¦è¨å¥ããã¯ã¼ã¯ã",
    category: "tier-d",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },

  // ===== Tier E: UX =====
  {
    key: "tier-e.microRitualOptimizer",
    label: "ãã¤ã¯ã­ãªãã¥ã¢ã«æé©å",
    description: "è¨å¥æè¦æéãè¨æ¸¬ããé·ãããäººã«ç­ç¸®çãæç¤ºã",
    category: "tier-e",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },
  {
    key: "tier-e.ruminationTimer",
    label: "åè»é²æ­¢ã¿ã¤ãã¼",
    description: "åããã£ã¼ã«ãã«3åä»¥ä¸åæ»ããããæ·±å¼å¸ããã¤ã¯ã­ã¤ã³ã¿ã©ã¯ã·ã§ã³ã",
    category: "tier-e",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },
  {
    key: "tier-e.calendarBlock",
    label: "ã«ã¬ã³ãã¼Thinking Timeèªåãã­ãã¯",
    description: "Googleã«ã¬ã³ãã¼ã«æ¯æ¥15åã®ãªãã¬ã¯ã·ã§ã³æ ãèªåç»é²ã",
    category: "tier-e",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },
  {
    key: "tier-e.voiceInput",
    label: "é³å£°å¥åå¯¾å¿",
    description: "Whisper APIã§é³å£°âãã­ã¹ãå¤æãæ¸ãã®ãè¦æãªäººåãã",
    category: "tier-e",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },

  // ===== Tier F: ROI/Evidence =====
  {
    key: "tier-f.growthRoi",
    label: "æé·ROIããã·ã¥ãã¼ã",
    description: "åçæéâæè«ç²å¾âè¡åå¤å®¹ãæ°å¤ã§å¯è¦åãWipro +22.8%ã¸ã®èªå·±æ¥ç¶ã",
    category: "tier-f",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },
  {
    key: "tier-f.beforeAfter",
    label: "Before/Afterã¢ã»ã¹ã¡ã³ã",
    description: "å°å¥æã¨3ã¶æå¾ã§åãèªå·±è©ä¾¡ãå®æ½ãå¤åéãè¡¨ç¤ºã",
    category: "tier-f",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 2,
  },
  {
    key: "tier-f.clientReport",
    label: "çµç¹å°å¥å¹æã¬ãã¼ãèªåçæ",
    description: "ã¯ã©ã¤ã¢ã³ãçµå¶å±¤åãææ¬¡ã¬ãã¼ããExcel/PDFã§èªååºåã",
    category: "tier-f",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },

  // ===== Tier G: Business Model =====
  {
    key: "tier-g.multiTenant",
    label: "ãã«ãããã³ãç®¡ç",
    description: "è¤æ°ã¯ã©ã¤ã¢ã³ãã1ã¤ã®CORE Logã§ä¸¦è¡éç¨ã",
    category: "tier-g",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },
  {
    key: "tier-g.pitchGenerator",
    label: "å°å¥ãããè³æèªåçæ",
    description: "ã¯ã©ã¤ã¢ã³ãååææ¡ç¨ã¹ã©ã¤ããèªåçæ(çè«+å®è£+ã¨ããã³ã¹)ã",
    category: "tier-g",
    defaultEnabled: false,
    phase1Enabled: false,
    implemented: true,
    recommendedPhase: 3,
  },
  {
    key: "tier-g.consultIntervention",
    label: "ã³ã³ãµã«ä»å¥è¨é²",
    description: "ã³ã³ãµã«å´ã®1on1åå ã»ç ä¿®å®æ½ãã­ã°ã«ç´ã¥ããå¹ææ¸¬å®ã",
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
    label: "ãããã«",
    description: "ããªã¼å¥åã®ã¿ãæãã·ã³ãã«ãªç¿æ£åéè¦ã®æ§æã",
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
    label: "å¤§å¹¸è¬å Phase 1",
    description: "ããªã¼å¥å + æ¢å­æ©è½(FBä»¥å¤)ãä¸å¸ã¯èª­ãã ãã®æéã",
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
    label: "å¤§å¹¸è¬å Phase 2",
    description: "Phase 1 + ããã¼ã¸ã£ã¼FB + é±æ¬¡ããã«ã«ã¼ãåã + HEROè©ä¾¡ã",
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
    label: "å¤§å¹¸è¬å Phase 3",
    description: "Phase 2 + åè»æ¤ç¥ + æè«å + 1on1ããªã¼ãã£ã³ã° + AARã",
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
    label: "ãã«(å¨æ©è½ON)",
    description: "å®è£æ¸ã¿ã®å¨æ©è½ãONããã¢ã»æ¤è¨¼ç¨ã",
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

type FlagStore = Record<string, Record<string, boolean>>; // { clientId: { flagKey: bool } }

let cache: { data: FlagStore; at: number } | null = null;
const CACHE_TTL_MS = 5 * 1000;

function defaultFlagsFor(): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const f of FEATURE_CATALOG) {
    flags[f.key] = f.defaultEnabled;
  }
  return flags;
}

async function readStoreFromSupabase(): Promise<FlagStore> {
  try {
    const client = getClient();
    const { data, error } = await client
      .from("ai_settings")
      .select("value")
      .eq("tenant_id", DEFAULT_TENANT_ID)
      .eq("key", "feature_flags")
      .maybeSingle();
    if (error || !data?.value) return {};
    try {
      return JSON.parse(data.value) as FlagStore;
    } catch {
      return {};
    }
  } catch (err) {
    console.error("Error reading feature flags from Supabase:", err);
    return {};
  }
}

async function writeStoreToSupabase(store: FlagStore): Promise<boolean> {
  try {
    const client = getClient();
    const { error } = await client
      .from("ai_settings")
      .upsert({
        tenant_id: DEFAULT_TENANT_ID,
        key: "feature_flags",
        value: JSON.stringify(store),
      }, { onConflict: "tenant_id,key" });
    return !error;
  } catch (err) {
    console.error("Error writing feature flags to Supabase:", err);
    return false;
  }
}

async function getStore(): Promise<FlagStore> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const data = await readStoreFromSupabase();
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
  const store = await readStoreFromSupabase();
  store[clientId] = flags;
  const ok = await writeStoreToSupabase(store);
  if (ok) invalidateFlagCache();
  return ok;
}

export function getCurrentClientId(): string {
  return DEFAULT_CLIENT;
}
