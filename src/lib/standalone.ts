// standalone商品モードのサーバーサイドヘルパー
// （商品版最終型仕様書 v1.0 §1/§5/§6/§7）
//
// - isStandaloneTenant: テナント単位のモード判定（per-tenant flags 経由）
// - computeUnlockState: 分析機能の段階開示（§6）
//     アンロック条件 = 初回ログ日から21日経過 AND 記入日数10日以上
// - computeSkipFollowup: 未記入フォローアップ（§5）
//     最終ログ日と当日の間に平日（土日祝除く）ベースで1日以上の空きが
//     ある場合、ギャップ幅に応じた問いを 1 問だけ返す

import { isFeatureEnabled } from "@/lib/feature-flags";
import { isBusinessDay } from "@/lib/calendar";
import { NotionLogEntry } from "@/lib/supabase";
import { isLogSubmitted } from "@/lib/stats";

export async function isStandaloneTenant(tenantId: string): Promise<boolean> {
  return isFeatureEnabled("standalone_mode", tenantId);
}

// ===== §6 段階開示 =====

export type UnlockState = {
  unlocked: boolean;
  firstLogDate: string | null;
  daysElapsed: number;   // 初回ログ日からの暦日経過（初日=0）
  entryDays: number;     // 記入日数（朝夕いずれかの記入がある日数）
};

export const UNLOCK_MIN_DAYS = 21;
export const UNLOCK_MIN_ENTRY_DAYS = 10;

/**
 * 分析機能のアンロック判定（§6）。
 * 「記入日数」は仕様書の「status=complete または morning_only の日数」の意図を
 * 既存 stats と同じ isLogSubmitted（朝夕いずれかの記入がある日）で実装する。
 * （evening_only も status=complete で保存されるため、status 文字列の字面より
 *  この判定の方が仕様の意図に忠実。fb_done も記入済みの日として数える）
 */
export function computeUnlockState(logs: NotionLogEntry[], todayJST: string): UnlockState {
  const submitted = logs.filter(isLogSubmitted).filter((l) => !!l.date);
  if (submitted.length === 0) {
    return { unlocked: false, firstLogDate: null, daysElapsed: 0, entryDays: 0 };
  }
  const dates = submitted.map((l) => l.date).sort();
  const firstLogDate = dates[0];
  const entryDays = new Set(dates).size;
  const daysElapsed = diffDaysJST(firstLogDate, todayJST);
  const unlocked = daysElapsed >= UNLOCK_MIN_DAYS && entryDays >= UNLOCK_MIN_ENTRY_DAYS;
  return { unlocked, firstLogDate, daysElapsed, entryDays };
}

// ===== §5 未記入フォローアップ =====

export type SkipFollowupInfo = {
  gapStart: string;     // 空白期間の初日（最終ログ日の翌日）
  gapEnd: string;       // 空白期間の最終日（当日の前日）
  gapWeekdays: number;  // 空白期間内の平日数（土日祝除く）
  question: string;
};

/**
 * 復帰日のフォローアップ判定（§5）。
 * - logs は「今日のエントリ作成前」の状態である必要はない（date < today で絞る）。
 * - 平日1日以上の空きがなければ null。
 * - 問いはギャップ幅で変える。いずれも任意・1問のみ・咎めない。
 */
export function computeSkipFollowup(
  logs: NotionLogEntry[],
  todayJST: string
): SkipFollowupInfo | null {
  const before = logs
    .filter(isLogSubmitted)
    .filter((l) => !!l.date && l.date < todayJST)
    .map((l) => l.date)
    .sort();
  if (before.length === 0) return null; // 初回記入: ギャップという概念がない

  const lastDate = before[before.length - 1];
  const gapStart = addDaysJST(lastDate, 1);
  const gapEnd = addDaysJST(todayJST, -1);
  if (gapStart > gapEnd) return null; // 連日記入

  let gapWeekdays = 0;
  let d = gapStart;
  for (let i = 0; i < 400 && d <= gapEnd; i++) {
    if (isBusinessDay(d)) gapWeekdays++;
    d = addDaysJST(d, 1);
  }
  if (gapWeekdays < 1) return null; // 土日祝のみの空き＝ギャップに数えない

  let question: string;
  if (gapWeekdays <= 2) {
    question = "あいだの日、何がありましたか？（任意）";
  } else if (gapWeekdays <= 5) {
    question = "書かなかった間、どんなことを考えていましたか？";
  } else {
    question = "また書こうと思えたきっかけは何でしたか？";
  }

  return { gapStart, gapEnd, gapWeekdays, question };
}

// ===== JST-safe date helpers（stats.ts と同じ T12:00:00+09:00 方式） =====

export function diffDaysJST(a: string, b: string): number {
  const da = new Date(a + "T12:00:00+09:00").getTime();
  const db = new Date(b + "T12:00:00+09:00").getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

export function addDaysJST(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  d.setUTCDate(d.getUTCDate() + n);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
