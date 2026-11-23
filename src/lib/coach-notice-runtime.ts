// 運営へのお知らせメールの、実際の読み取りと送信をつないだもの（サーバー側だけ）。
//
// 流れは coach-notice-service.ts、決まりと文面は coach-notice.ts。ここは、つなぐだけ。
// 使うのは、本人の API（/api/coach-reply。返信を保存した直後）と、運営の API
// （/api/admin/coach-replies。確認ページの欄と「試しに送る」）。

import { getTenantById } from "@/lib/supabase";
import { sendStaffNoticeEmail } from "@/lib/email";
import {
  countPendingCoachReplies,
  getCoachNoticeConfig,
  getCoachNoticeRecipient,
} from "@/lib/coach-reply-store";
import type { CoachNoticeDeps } from "@/lib/coach-notice-service";

export const coachNoticeDeps: CoachNoticeDeps = {
  getConfig: getCoachNoticeConfig,
  getRecipient: getCoachNoticeRecipient,
  getTenantName: async (tenantId) => (await getTenantById(tenantId))?.name ?? null,
  countPending: countPendingCoachReplies,
  send: sendStaffNoticeEmail,
};

/**
 * 返信を保存した直後のお知らせで、待つ時間の上限。
 * 本人の API の上限（60 秒）のうち、AI の応答を待つ時間（上限 50 秒）と、読み書きの時間の残りに収める。
 * 時間内に終わらなかったときは、本人への応答を先に返す（送れたかどうかは分からない、と記録する）。
 */
export const COACH_NOTICE_TIMEOUT_MS = 6_000;

/** 「試しに送る」で待つ時間の上限。 */
export const COACH_NOTICE_TEST_TIMEOUT_MS = 12_000;
