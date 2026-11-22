// Server Component for /p/[token]/blueprint（設計図。feature.coachingProfile）
//
// 本人の設計図を、トークンから引いた参加者 ID とテナント ID でサーバー側から読む。
// スイッチが OFF の環境では 404。読めなかったときは、入力欄を出さずにその旨を出す
// （空の欄を出すと、保存したときに設計図を空で上書きしてしまうため）。

import { notFound } from "next/navigation";
import { getParticipantByToken } from "@/lib/participant-db";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getCoachingProfile } from "@/lib/coaching-profile-store";
import { isCoachKillSwitchOn } from "@/lib/coach-reply-llm";
import { getCoachActivation, getCoachOptIn } from "@/lib/coach-reply-store";
import BlueprintClient, { type BlueprintCoachProps } from "./BlueprintClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BlueprintPageServer({
  params,
}: {
  params: { token: string };
}) {
  const token = params.token;
  const participant = await getParticipantByToken(token);
  if (!participant || !participant.id || !participant.tenantId) {
    notFound();
  }
  if (!(await isFeatureEnabled("feature.coachingProfile", participant.tenantId))) {
    notFound();
  }

  const read = await getCoachingProfile(participant.id, participant.tenantId);

  // AIコーチの欄（説明と、受け取る・受け取らない）。AIコーチの返信が動いている環境だけ出す
  // （スイッチが ON、商品モードでない、環境の設定がある。getCoachActivation）。アプリ全体で止めているあいだと、
  // 動いているかを読めなかったときは、出さない（失敗は記録済み）。
  // 本人のいまの設定を読めなかったときは、ボタンを出さずにその旨を出す（違う設定を出さない）。
  let coach: BlueprintCoachProps = null;
  if (!isCoachKillSwitchOn()) {
    const activation = await getCoachActivation(participant.tenantId);
    if (activation.ok && activation.active) {
      const optIn = await getCoachOptIn(participant.id, participant.tenantId);
      coach = optIn.ok ? { optIn: optIn.enabled, loadFailed: false } : { optIn: null, loadFailed: true };
    }
  }

  return (
    <BlueprintClient
      token={token}
      initialProfile={read.ok ? read.profile : null}
      loadFailed={!read.ok}
      coach={coach}
    />
  );
}
