// 「朝・夕の問い」を出している従来型の環境かどうかを、サーバー側で読む。
//
// 判定の決まりは entry-terms.ts の isEntryQuestionEnv（純関数・テスト付き）にある。
// ここは、環境のスイッチと問いの登録を読んで、その関数に渡すだけ。
//
// 読めなかったときは「問いを出していない環境」として扱う（false／空の配列）。
// 文言とメールの切り替えのためだけの値なので、読めないことで画面や送信を止めない。
// その場合は、元からの文言・従来のリマインドメールになる。失敗はログに残す。

import { getFlagsForTenant } from "@/lib/feature-flags";
import { getWeeklyForTenant, getTodayQuestionsForTenant } from "@/lib/daily-questions";
import { isEntryQuestionEnv, pickSlotQuestions } from "@/lib/entry-terms";
import { logger } from "@/lib/logger";

/** この環境が「朝・夕の問い」を出している従来型の環境か。 */
export async function resolveEntryQuestionEnv(tenantId: string): Promise<boolean> {
  try {
    const flags = await getFlagsForTenant(tenantId);
    // スイッチが OFF の環境・商品モードの環境では、問いの登録を読みに行かない。
    if (flags["feature.dailyQuestions"] !== true || flags["standalone_mode"] === true) return false;
    const weekly = await getWeeklyForTenant(tenantId);
    return isEntryQuestionEnv(flags, weekly);
  } catch (err) {
    logger.error("entry-question-env: could not resolve; using the default wording", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * リマインドメールに載せる、その回（朝／夕）の問い。
 * 問いを出している従来型の環境で、その回の問いがあるときだけ、1 件以上を返す。
 * それ以外（スイッチが OFF、商品モード、その回の問いが無い、読めなかった）は空の配列を返し、
 * 呼び出し側は従来のリマインドメールを送る。
 */
export async function getReminderQuestionsForTenant(
  tenantId: string,
  slot: "morning" | "evening"
): Promise<string[]> {
  try {
    if (!(await resolveEntryQuestionEnv(tenantId))) return [];
    const today = await getTodayQuestionsForTenant(tenantId);
    return pickSlotQuestions(today, slot);
  } catch (err) {
    logger.error("entry-question-env: could not read the questions; sending the default reminder", {
      tenantId,
      slot,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
