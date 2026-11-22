// Server Component for /p/[token]/blueprint（設計図。feature.coachingProfile）
//
// 本人の設計図を、トークンから引いた参加者 ID とテナント ID でサーバー側から読む。
// スイッチが OFF の環境では 404。読めなかったときは、入力欄を出さずにその旨を出す
// （空の欄を出すと、保存したときに設計図を空で上書きしてしまうため）。

import { notFound } from "next/navigation";
import { getParticipantByToken } from "@/lib/participant-db";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getCoachingProfile } from "@/lib/coaching-profile-store";
import BlueprintClient from "./BlueprintClient";

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

  return (
    <BlueprintClient
      token={token}
      initialProfile={read.ok ? read.profile : null}
      loadFailed={!read.ok}
    />
  );
}
