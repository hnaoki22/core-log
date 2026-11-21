/**
 * 管理画面の「環境とユーザー」の一覧のための純関数（テスト付き）。
 *
 * 背景：全環境を表示しているとき、だれがどの環境（テナント）にいるのかが画面で
 * 分からず、ログイン用の URL も、画面のいちばん下のリンクでしか分からなかった。
 * ここでは、環境の用途の呼び名、ユーザーの種別、ログイン用のパス、一覧の並べ方を決める。
 * データベースには触れない（読み取りは admin-directory-store.ts）。
 */

/** 環境の用途の色分け。production＝本番（取り違えると困る）、test＝テスト用 */
export type EnvironmentTone = "production" | "test" | "neutral";

export type EnvironmentPurpose = { label: string; tone: EnvironmentTone };

export type DirectoryUserKind = "participant" | "manager" | "admin" | "observer";

export type DirectoryEnvironment = {
  id: string;
  slug: string;
  name: string;
  companyName: string;
  purpose: EnvironmentPurpose | null;
  /** 入力画面の型。standalone＝商品モード（別の入力画面に分岐する） */
  inputMode: "standard" | "standalone";
  /** 確認コード（OTP）での確認が ON か */
  otpEnabled: boolean;
};

export type DirectoryUser = {
  id: string;
  kind: DirectoryUserKind;
  name: string;
  department: string;
  environmentId: string;
  /** 追加した日時（ISO 形式）。分からないときは null */
  createdAt: string | null;
  /** ログイン用のパス（/p/…・/m/…・/a/…）。管理者にだけ返す値 */
  loginPath: string;
};

export type EnvironmentCounts = {
  participants: number;
  managers: number;
  admins: number;
  observers: number;
};

export type DirectoryGroup = {
  environment: DirectoryEnvironment;
  /** その環境の全ユーザーの人数（検索で絞る前） */
  counts: EnvironmentCounts;
  /** 表示するユーザー（検索で絞ったあと。種別→氏名の順） */
  users: DirectoryUser[];
};

const KNOWN_PURPOSES: Record<string, EnvironmentPurpose> = {
  production: { label: "本番", tone: "production" },
  test: { label: "テスト用", tone: "test" },
  internal: { label: "社内検証", tone: "neutral" },
  trial: { label: "試用", tone: "neutral" },
  demo: { label: "デモ", tone: "neutral" },
};

/** 自由記述の用途をそのまま出すときの上限（バッジが崩れない長さ） */
export const PURPOSE_LABEL_MAX = 16;

/**
 * 環境の用途の呼び名を決める。
 *  1. 保護対象の本番テナントは、設定に関係なく「本番」（「テスト用」と表示されると取り違える）。
 *  2. tenants.config.purpose が既知のキー（production / test / internal / trial / demo）なら、その呼び名。
 *     それ以外の文字列は、その文字列をそのまま呼び名にする（例：「商品版の試用」）。
 *  3. 設定がなければ、plan から推す（demo → デモ、experimental → 試用）。どれでもなければ null。
 */
export function resolveEnvironmentPurpose(input: {
  isProtectedProduction: boolean;
  configPurpose?: unknown;
  plan?: unknown;
}): EnvironmentPurpose | null {
  if (input.isProtectedProduction) return KNOWN_PURPOSES.production;
  const raw = typeof input.configPurpose === "string" ? input.configPurpose.trim() : "";
  if (raw !== "") {
    if (Object.prototype.hasOwnProperty.call(KNOWN_PURPOSES, raw)) return KNOWN_PURPOSES[raw];
    return { label: Array.from(raw).slice(0, PURPOSE_LABEL_MAX).join(""), tone: "neutral" };
  }
  if (input.plan === "demo") return KNOWN_PURPOSES.demo;
  if (input.plan === "experimental") return KNOWN_PURPOSES.trial;
  return null;
}

/**
 * 環境の表示名。会社名だけだと、同じ会社の別の環境が同じ表示になるので、
 * 環境の名前を先に出し、会社名は補足にする。
 */
export function environmentLabel(env: { name: string; companyName?: string | null }): string {
  return env.companyName && env.companyName !== env.name ? `${env.name}（${env.companyName}）` : env.name;
}

/** managers 表の 1 行の種別。管理者の判定は is_admin を優先する（画面のバッジと同じ） */
export function managerKind(
  role: string | null | undefined,
  isAdmin: boolean | null | undefined
): Exclude<DirectoryUserKind, "participant"> {
  if (isAdmin === true || role === "admin") return "admin";
  if (role === "observer") return "observer";
  return "manager";
}

/**
 * ログイン用のパス。確認コードのあとの着地先（/verify の振り分け）と同じ決まり：
 * 参加者は /p、マネージャーは /m、管理者と閲覧者は /a。
 */
export function buildLoginPath(kind: DirectoryUserKind, token: string): string {
  const t = encodeURIComponent(token);
  if (kind === "participant") return `/p/${t}`;
  if (kind === "manager") return `/m/${t}`;
  return `/a/${t}`;
}

export const USER_KIND_LABEL: Record<DirectoryUserKind, string> = {
  participant: "参加者",
  manager: "マネージャー",
  admin: "管理者",
  observer: "閲覧者",
};

const KIND_ORDER: Record<DirectoryUserKind, number> = { participant: 0, manager: 1, admin: 2, observer: 3 };
const TONE_ORDER: Record<EnvironmentTone, number> = { production: 0, test: 1, neutral: 2 };

/**
 * ダッシュボードの応答に入れるトークン。管理者にだけ返す。
 * 閲覧者には返さない（ほかの人の画面を開ける値なので）。ただし、閲覧者本人の行は
 * 本人がすでに持っている値なので返す（画面が「自分の行」を見つけるのに使っている）。
 */
export function tokenForViewer(token: string, viewer: { isAdmin: boolean; isSelf?: boolean }): string {
  return viewer.isAdmin || viewer.isSelf === true ? token : "";
}

export function emptyCounts(): EnvironmentCounts {
  return { participants: 0, managers: 0, admins: 0, observers: 0 };
}

export function countUsersByEnvironment(users: readonly DirectoryUser[]): Map<string, EnvironmentCounts> {
  const map = new Map<string, EnvironmentCounts>();
  for (const u of users) {
    const c = map.get(u.environmentId) ?? emptyCounts();
    if (u.kind === "participant") c.participants += 1;
    else if (u.kind === "manager") c.managers += 1;
    else if (u.kind === "admin") c.admins += 1;
    else c.observers += 1;
    map.set(u.environmentId, c);
  }
  return map;
}

/** 「参加者 8・管理者 1・マネージャー 1」の形。参加者は 0 でも出し、ほかは 0 なら出さない */
export function formatEnvironmentCounts(c: EnvironmentCounts): string {
  const parts = [`参加者 ${c.participants}`];
  if (c.admins > 0) parts.push(`管理者 ${c.admins}`);
  if (c.managers > 0) parts.push(`マネージャー ${c.managers}`);
  if (c.observers > 0) parts.push(`閲覧者 ${c.observers}`);
  return parts.join("・");
}

/** 検索用に、全角・半角と大文字・小文字をそろえ、空白（全角を含む）を取り除く */
function normalizeForSearch(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

/** 本番 → テスト用 → そのほか、の順に並べる（同じ色分けの中は、渡された順のまま） */
export function sortEnvironments(environments: readonly DirectoryEnvironment[]): DirectoryEnvironment[] {
  return environments
    .map((env, index) => ({ env, index }))
    .sort((a, b) => {
      const ta = TONE_ORDER[a.env.purpose?.tone ?? "neutral"];
      const tb = TONE_ORDER[b.env.purpose?.tone ?? "neutral"];
      return ta !== tb ? ta - tb : a.index - b.index;
    })
    .map((x) => x.env);
}

/**
 * 環境ごとにユーザーをまとめる。
 *  - environmentSlug を渡すと、その環境だけにする。
 *  - query（氏名か部署の一部）を渡すと、当てはまる人だけにする。そのときは、1 人も
 *    当てはまらない環境は出さない。query が空のときは、人がいない環境も出す。
 *  - どの環境にも当てはまらないユーザー（環境が消えているなど）は出さない。
 */
export function groupDirectoryUsers(
  environments: readonly DirectoryEnvironment[],
  users: readonly DirectoryUser[],
  options?: { environmentSlug?: string | null; query?: string | null }
): DirectoryGroup[] {
  const slug = options?.environmentSlug ? options.environmentSlug : null;
  const query = normalizeForSearch(options?.query ?? "");
  const counts = countUsersByEnvironment(users);

  const byEnvironment = new Map<string, DirectoryUser[]>();
  for (const u of users) {
    if (query !== "" && !normalizeForSearch(`${u.name} ${u.department}`).includes(query)) continue;
    const list = byEnvironment.get(u.environmentId) ?? [];
    list.push(u);
    byEnvironment.set(u.environmentId, list);
  }

  const groups: DirectoryGroup[] = [];
  for (const environment of sortEnvironments(environments)) {
    if (slug !== null && environment.slug !== slug) continue;
    const list = (byEnvironment.get(environment.id) ?? [])
      .slice()
      .sort((a, b) =>
        KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]
          ? KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
          : a.name.localeCompare(b.name, "ja")
      );
    if (query !== "" && list.length === 0) continue;
    groups.push({ environment, counts: counts.get(environment.id) ?? emptyCounts(), users: list });
  }
  return groups;
}

/** ISO 形式の日時 → 日本時間の "YYYY-MM-DD"。読めない値は null */
export function toJstDateString(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // en-CA は YYYY-MM-DD の形で返る
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** ISO 形式の日時 → 日本時間の "11/21"。読めない値は null */
export function formatJstMonthDay(iso: string | null | undefined): string | null {
  const s = toJstDateString(iso);
  if (s === null) return null;
  const [, month, day] = s.split("-");
  return `${Number(month)}/${Number(day)}`;
}

/** 追加した日が、日本時間の今日（todayJst＝"YYYY-MM-DD"）か */
export function isAddedOn(iso: string | null | undefined, todayJst: string): boolean {
  const s = toJstDateString(iso);
  return s !== null && s === todayJst;
}

/**
 * 一覧（参加者一覧・マネージャー一覧）を環境ごとに区切るための並べ替え。
 * 全環境を表示しているときだけ使う。環境の順（本番 → テスト用 → そのほか）に並べ、
 * 同じ環境の中は元の順のままにする。環境が分からない行は最後にまとめる。
 * 返す各要素の header は、その環境の最初の行にだけ入る（区切りの見出しに使う）。
 */
export function sectionByEnvironment<T extends { id: string }>(
  rows: readonly T[],
  environments: readonly DirectoryEnvironment[],
  environmentIdOf: (id: string) => string | undefined
): { row: T; header: DirectoryEnvironment | null; unknownHeader: boolean }[] {
  const order = new Map<string, number>();
  sortEnvironments(environments).forEach((env, i) => order.set(env.id, i));
  const byId = new Map(environments.map((env) => [env.id, env]));

  const decorated = rows.map((row, index) => {
    const envId = environmentIdOf(row.id);
    const rank = envId !== undefined && order.has(envId) ? (order.get(envId) as number) : Number.MAX_SAFE_INTEGER;
    return { row, index, envId: rank === Number.MAX_SAFE_INTEGER ? undefined : envId, rank };
  });
  decorated.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.index - b.index));

  let previous: string | undefined | null = null;
  return decorated.map((d) => {
    const isFirst = previous === null || d.envId !== previous;
    previous = d.envId;
    return {
      row: d.row,
      header: isFirst && d.envId !== undefined ? (byId.get(d.envId) ?? null) : null,
      unknownHeader: isFirst && d.envId === undefined,
    };
  });
}
