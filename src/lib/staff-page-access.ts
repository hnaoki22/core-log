// 運営・上司のページのうち、参加者 1 人の記入とイシューをサーバー側で読んで描くページ
// （/a/[token]/participant/[氏名]、/m/[token]/[氏名]）を、開いた人が読んでよいかの決まり。
//
// この 2 つのページは、URL の氏名で参加者を引く。読む前に、URL のトークンの持ち主と、
// その参加者の環境を、ここで照らす。決まりは、同じ画面が呼ぶ入口（/api/mission、
// /api/mission/comments）と、管理画面の入口（/api/admin）に合わせる：
//   - 管理者（is_admin）＝どの環境の参加者でも
//   - 上司・閲覧者＝自分の環境の参加者だけ
//   - 管理画面の側のページは、管理画面に入れる人（管理者・閲覧者）だけ
//
// 純関数（データベースを読まない）。ページは、この結果が ok のときだけ、記入・イシューを読む。

export type StaffPageSurface = "admin" | "manager";

/** URL のトークンで引いた人（managers の 1 行）のうち、判定に使う値。 */
export type StaffViewer = {
  isAdmin?: boolean | null;
  role?: string | null;
  tenantId?: string | null;
};

export type StaffPageDecision = { ok: true; tenantId: string } | { ok: false };

/** 管理画面に入れる人か（/api/admin と同じ決まり：管理者・閲覧者）。 */
export function canUseAdminSurface(viewer: StaffViewer | null | undefined): boolean {
  if (!viewer) return false;
  return viewer.isAdmin === true || viewer.role === "admin" || viewer.role === "observer";
}

/**
 * 開いた人が、その参加者の記入・イシューを読んでよいかを決める。
 * ok のときの tenantId は、読むときに使う環境（参加者の側の環境）。
 *
 * - viewer が無い（トークンが、運営・上司のものでない）→ 読ませない。
 * - 氏名で参加者を引けたとき → 管理者はどの環境でも。ほかの人は、自分の環境の参加者だけ。
 * - 氏名で引けなかったとき（いない／同じ氏名が複数の環境にいる）→ 開いた人の環境の中だけを読む。
 */
export function decideStaffParticipantView(args: {
  surface: StaffPageSurface;
  viewer: StaffViewer | null | undefined;
  participantTenantId: string | null | undefined;
}): StaffPageDecision {
  const viewer = args.viewer;
  if (!viewer) return { ok: false };
  if (args.surface === "admin" && !canUseAdminSurface(viewer)) return { ok: false };

  const viewerTenantId = viewer.tenantId ? viewer.tenantId : null;
  const targetTenantId = args.participantTenantId ? args.participantTenantId : null;

  if (targetTenantId) {
    if (viewer.isAdmin === true) return { ok: true, tenantId: targetTenantId };
    if (viewerTenantId !== null && viewerTenantId === targetTenantId) {
      return { ok: true, tenantId: targetTenantId };
    }
    return { ok: false };
  }

  if (viewerTenantId !== null) return { ok: true, tenantId: viewerTenantId };
  return { ok: false };
}

/**
 * 上司の側の、参加者 1 人のページのパス。イシュー（ミッション）のコメントを読む・書く、
 * 設定・編集する操作は、このページにある。管理画面の側のページから、ここへリンクする。
 */
export function managerParticipantPagePath(token: string, participantName: string): string {
  return `/m/${encodeURIComponent(token)}/${encodeURIComponent(participantName)}`;
}
