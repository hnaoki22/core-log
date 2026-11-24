// 「前回の AIコーチの問い」の、実際の読み取りをつないだもの（サーバー側だけ）。
//
// 流れは coach-previous-question.ts、問いの取り出し方は coach-reply.ts。ここは、つなぐだけ。
// 使うのは、入力画面のページ（/p/[token]/input の page.tsx）と、朝のリマインド（/api/cron/remind）。

import { isFeatureEnabled } from "@/lib/feature-flags";
import { isCoachKillSwitchOn } from "@/lib/coach-reply-llm";
import {
  getCoachActivation,
  getCoachOptIn,
  getCoachOptedOutIds,
  getLatestDeliveredRepliesForTenant,
  getPreviousDeliveredReply,
} from "@/lib/coach-reply-store";
import type {
  PreviousQuestionParticipantDeps,
  PreviousQuestionTenantDeps,
} from "@/lib/coach-previous-question";

const common = {
  killSwitch: () => isCoachKillSwitchOn(),
  isFlagOn: (tenantId: string) => isFeatureEnabled("feature.coachPreviousQuestion", tenantId),
  getActivation: getCoachActivation,
};

export const previousQuestionParticipantDeps: PreviousQuestionParticipantDeps = {
  ...common,
  getOptIn: getCoachOptIn,
  getPreviousReply: getPreviousDeliveredReply,
};

export const previousQuestionTenantDeps: PreviousQuestionTenantDeps = {
  ...common,
  getOptedOutIds: getCoachOptedOutIds,
  getLatestReplies: getLatestDeliveredRepliesForTenant,
};
