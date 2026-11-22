// イシュー（ミッション）のコメントを、画面から読むときの決まり（純関数。テスト: mission-comments.test.ts）。
//
// - コメントを読む入口（GET /api/mission/comments）は、トークンが必須（無ければ 401）。
//   参加者の「イシュー」のページと、上司・運営の画面（MissionManager）は、長いあいだ、トークンを
//   付けずに呼んでいたため、コメントの一覧が画面に出なかった（書いたコメントは保存されていた）。
//   呼び先は、必ずこの関数で作る（画面に URL を直接書かない）。
// - 日時は、日本時間で出す。端末の時間帯に左右されない形にする（9 時間足したうえで、端末の
//   時間帯の時刻を読む書き方は、日本の端末で 9 時間進んで出る）。

import { formatJstDateTime } from "@/lib/mission-edit";

/** コメントの一覧を読む呼び先。イシューの ID とトークンを付ける。 */
export function missionCommentsUrl(missionId: string, token: string): string {
  return `/api/mission/comments?missionId=${encodeURIComponent(missionId)}&token=${encodeURIComponent(token)}`;
}

/** コメントの日時（ISO）→ 日本時間の "11/22 17:50"。読めない値は空文字。 */
export function formatCommentTime(iso: string | null | undefined): string {
  return formatJstDateTime(iso) ?? "";
}
