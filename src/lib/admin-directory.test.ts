import { describe, it, expect } from "vitest";
import {
  DIRECTORY_OTP_NOTE,
  PURPOSE_LABEL_MAX,
  USER_KIND_LABEL,
  buildLoginPath,
  canOpenUserScreen,
  countUsersByEnvironment,
  environmentLabel,
  formatEnvironmentCounts,
  formatJstMonthDay,
  groupDirectoryUsers,
  isAddedOn,
  managerKind,
  resolveEnvironmentPurpose,
  sectionByEnvironment,
  sortEnvironments,
  toJstDateString,
  tokenForViewer,
  type DirectoryEnvironment,
  type DirectoryUser,
} from "./admin-directory";

// テストのデータは合成（実在の環境・人物・トークンは使わない）。

function env(partial: Partial<DirectoryEnvironment> & { id: string; slug: string }): DirectoryEnvironment {
  return {
    name: partial.slug,
    companyName: "",
    purpose: null,
    inputMode: "standard",
    otpEnabled: false,
    ...partial,
  };
}

function user(partial: Partial<DirectoryUser> & { id: string; environmentId: string }): DirectoryUser {
  return {
    kind: "participant",
    name: `user-${partial.id}`,
    department: "",
    createdAt: null,
    loginPath: `/p/token-${partial.id}`,
    ...partial,
  };
}

const PROD = env({ id: "e-prod", slug: "prod", name: "Prod", purpose: { label: "本番", tone: "production" } });
const TEST = env({ id: "e-test", slug: "test", name: "Test", purpose: { label: "テスト用", tone: "test" } });
const LAB = env({ id: "e-lab", slug: "lab", name: "Lab" });

describe("resolveEnvironmentPurpose", () => {
  it("保護対象の本番は、設定に関係なく「本番」", () => {
    expect(resolveEnvironmentPurpose({ isProtectedProduction: true, configPurpose: "test", plan: "demo" })).toEqual({
      label: "本番",
      tone: "production",
    });
  });

  it("既知のキーは、決まった呼び名と色分けになる", () => {
    expect(resolveEnvironmentPurpose({ isProtectedProduction: false, configPurpose: "test" })).toEqual({
      label: "テスト用",
      tone: "test",
    });
    expect(resolveEnvironmentPurpose({ isProtectedProduction: false, configPurpose: "internal" })).toEqual({
      label: "社内検証",
      tone: "neutral",
    });
    expect(resolveEnvironmentPurpose({ isProtectedProduction: false, configPurpose: "production" })?.tone).toBe(
      "production"
    );
  });

  it("既知のキーでない文字列は、そのまま呼び名にする（前後の空白は取る）", () => {
    expect(resolveEnvironmentPurpose({ isProtectedProduction: false, configPurpose: "  商品版の試用 " })).toEqual({
      label: "商品版の試用",
      tone: "neutral",
    });
  });

  it("長い文字列は上限で切る", () => {
    const long = "あ".repeat(PURPOSE_LABEL_MAX + 5);
    const got = resolveEnvironmentPurpose({ isProtectedProduction: false, configPurpose: long });
    expect(Array.from(got?.label ?? "").length).toBe(PURPOSE_LABEL_MAX);
  });

  it("Object の組み込みの名前（constructor など）を既知のキーと取り違えない", () => {
    expect(resolveEnvironmentPurpose({ isProtectedProduction: false, configPurpose: "constructor" })).toEqual({
      label: "constructor",
      tone: "neutral",
    });
  });

  it("設定がなければ plan から推す。どれでもなければ null", () => {
    expect(resolveEnvironmentPurpose({ isProtectedProduction: false, plan: "demo" })?.label).toBe("デモ");
    expect(resolveEnvironmentPurpose({ isProtectedProduction: false, plan: "experimental" })?.label).toBe("試用");
    expect(resolveEnvironmentPurpose({ isProtectedProduction: false, plan: "standard" })).toBeNull();
    expect(resolveEnvironmentPurpose({ isProtectedProduction: false, configPurpose: "", plan: undefined })).toBeNull();
    expect(resolveEnvironmentPurpose({ isProtectedProduction: false, configPurpose: 123, plan: null })).toBeNull();
  });
});

describe("environmentLabel", () => {
  it("環境の名前を先に、会社名を補足にする", () => {
    expect(environmentLabel({ name: "Sample Demo", companyName: "株式会社サンプル" })).toBe(
      "Sample Demo（株式会社サンプル）"
    );
  });
  it("会社名が空か、名前と同じなら、名前だけ", () => {
    expect(environmentLabel({ name: "Sample", companyName: "" })).toBe("Sample");
    expect(environmentLabel({ name: "Sample", companyName: null })).toBe("Sample");
    expect(environmentLabel({ name: "Sample", companyName: "Sample" })).toBe("Sample");
  });
});

describe("managerKind / buildLoginPath", () => {
  it("is_admin か role=admin なら管理者。observer は閲覧者。ほかはマネージャー", () => {
    expect(managerKind("admin", true)).toBe("admin");
    expect(managerKind("manager", true)).toBe("admin");
    expect(managerKind("admin", false)).toBe("admin");
    expect(managerKind("observer", false)).toBe("observer");
    expect(managerKind("manager", false)).toBe("manager");
    expect(managerKind(null, null)).toBe("manager");
    expect(managerKind(undefined, undefined)).toBe("manager");
  });

  it("参加者は /p、マネージャーは /m、管理者と閲覧者は /a", () => {
    expect(buildLoginPath("participant", "abc")).toBe("/p/abc");
    expect(buildLoginPath("manager", "abc")).toBe("/m/abc");
    expect(buildLoginPath("admin", "abc")).toBe("/a/abc");
    expect(buildLoginPath("observer", "abc")).toBe("/a/abc");
  });

  it("パスに使えない文字は符号化する", () => {
    expect(buildLoginPath("participant", "a/b c")).toBe("/p/a%2Fb%20c");
  });

  it("種別の呼び名", () => {
    expect(USER_KIND_LABEL).toEqual({
      participant: "参加者",
      manager: "マネージャー",
      admin: "管理者",
      observer: "閲覧者",
    });
  });
});

describe("canOpenUserScreen（「画面を開く」を出してよい環境か）", () => {
  it("確認コードが ON の環境では、出さない", () => {
    expect(canOpenUserScreen(env({ id: "e1", slug: "one", otpEnabled: true }))).toBe(false);
  });

  it("確認コードが OFF の環境では、出す", () => {
    expect(canOpenUserScreen(env({ id: "e1", slug: "one", otpEnabled: false }))).toBe(true);
  });

  it("ON と分かっているときだけ、出さない（値が無いときは、これまでどおり出す）", () => {
    expect(canOpenUserScreen({})).toBe(true);
    expect(canOpenUserScreen({ otpEnabled: null })).toBe(true);
  });

  it("説明には、出していない理由（コードは本人のアドレスに届く）と、読む場所を書く", () => {
    expect(DIRECTORY_OTP_NOTE).toContain("確認コード");
    expect(DIRECTORY_OTP_NOTE).toContain("本人のメールアドレス");
    expect(DIRECTORY_OTP_NOTE).toContain("参加者一覧");
  });
});

describe("tokenForViewer", () => {
  it("管理者には返す", () => {
    expect(tokenForViewer("secret", { isAdmin: true })).toBe("secret");
  });
  it("管理者でなければ返さない", () => {
    expect(tokenForViewer("secret", { isAdmin: false })).toBe("");
    expect(tokenForViewer("secret", { isAdmin: false, isSelf: false })).toBe("");
  });
  it("管理者でなくても、本人の行だけは返す", () => {
    expect(tokenForViewer("secret", { isAdmin: false, isSelf: true })).toBe("secret");
  });
});

describe("countUsersByEnvironment / formatEnvironmentCounts", () => {
  const users = [
    user({ id: "1", environmentId: "e-test" }),
    user({ id: "2", environmentId: "e-test" }),
    user({ id: "3", environmentId: "e-test", kind: "manager" }),
    user({ id: "4", environmentId: "e-test", kind: "admin" }),
    user({ id: "5", environmentId: "e-prod", kind: "observer" }),
  ];

  it("環境ごとに、種別ごとの人数を数える", () => {
    const counts = countUsersByEnvironment(users);
    expect(counts.get("e-test")).toEqual({ participants: 2, managers: 1, admins: 1, observers: 0 });
    expect(counts.get("e-prod")).toEqual({ participants: 0, managers: 0, admins: 0, observers: 1 });
    expect(counts.get("e-lab")).toBeUndefined();
  });

  it("参加者は 0 でも出し、ほかは 0 なら出さない", () => {
    expect(formatEnvironmentCounts({ participants: 8, managers: 1, admins: 1, observers: 0 })).toBe(
      "参加者 8・管理者 1・マネージャー 1"
    );
    expect(formatEnvironmentCounts({ participants: 0, managers: 0, admins: 0, observers: 2 })).toBe(
      "参加者 0・閲覧者 2"
    );
    expect(formatEnvironmentCounts({ participants: 3, managers: 0, admins: 0, observers: 0 })).toBe("参加者 3");
  });
});

describe("sortEnvironments", () => {
  it("本番 → テスト用 → そのほか。同じ色分けの中は渡された順", () => {
    const other = env({ id: "e-x", slug: "x" });
    expect(sortEnvironments([LAB, TEST, other, PROD]).map((e) => e.slug)).toEqual(["prod", "test", "lab", "x"]);
  });
  it("渡した配列は変えない", () => {
    const input = [LAB, PROD];
    sortEnvironments(input);
    expect(input.map((e) => e.slug)).toEqual(["lab", "prod"]);
  });
});

describe("groupDirectoryUsers", () => {
  const environments = [LAB, TEST, PROD];
  const users = [
    user({ id: "p2", environmentId: "e-test", name: "佐藤 花子", department: "営業部" }),
    user({ id: "p1", environmentId: "e-test", name: "阿部 一郎", department: "製造部" }),
    user({ id: "m1", environmentId: "e-test", name: "井上 次郎", kind: "manager" }),
    user({ id: "a1", environmentId: "e-test", name: "上田 三郎", kind: "admin" }),
    user({ id: "p3", environmentId: "e-prod", name: "佐藤 太郎" }),
    user({ id: "x1", environmentId: "e-gone", name: "所属が消えた人" }),
  ];

  it("環境の順に並べ、人がいない環境も出す。環境が分からない人は出さない", () => {
    const groups = groupDirectoryUsers(environments, users);
    expect(groups.map((g) => g.environment.slug)).toEqual(["prod", "test", "lab"]);
    expect(groups[2].users).toEqual([]);
    expect(groups.flatMap((g) => g.users).some((u) => u.id === "x1")).toBe(false);
  });

  it("環境の中は、参加者 → マネージャー → 管理者 → 閲覧者。同じ種別は氏名の順", () => {
    const test = groupDirectoryUsers(environments, users).find((g) => g.environment.slug === "test");
    expect(test?.users.map((u) => u.kind)).toEqual(["participant", "participant", "manager", "admin"]);
    expect(test?.users.slice(0, 2).map((u) => u.id).sort()).toEqual(["p1", "p2"]);
  });

  it("環境を 1 つ選ぶと、その環境だけ", () => {
    const groups = groupDirectoryUsers(environments, users, { environmentSlug: "test" });
    expect(groups.map((g) => g.environment.slug)).toEqual(["test"]);
    expect(groups[0].users).toHaveLength(4);
  });

  it("氏名で探すと、当てはまる人だけ。1 人も当てはまらない環境は出さない", () => {
    const groups = groupDirectoryUsers(environments, users, { query: "佐藤" });
    expect(groups.map((g) => g.environment.slug)).toEqual(["prod", "test"]);
    expect(groups.flatMap((g) => g.users).map((u) => u.id).sort()).toEqual(["p2", "p3"]);
  });

  it("部署でも探せる。空白（全角を含む）と全角・半角の違いは無視する", () => {
    expect(groupDirectoryUsers(environments, users, { query: "営業" }).flatMap((g) => g.users).map((u) => u.id)).toEqual([
      "p2",
    ]);
    expect(groupDirectoryUsers(environments, users, { query: "佐藤　花子" }).flatMap((g) => g.users).map((u) => u.id)).toEqual([
      "p2",
    ]);
    expect(groupDirectoryUsers(environments, users, { query: "佐藤花子" }).flatMap((g) => g.users).map((u) => u.id)).toEqual([
      "p2",
    ]);
  });

  it("人数（counts）は、探す前の全員の人数のまま", () => {
    const test = groupDirectoryUsers(environments, users, { query: "佐藤" }).find((g) => g.environment.slug === "test");
    expect(test?.counts).toEqual({ participants: 2, managers: 1, admins: 1, observers: 0 });
    expect(test?.users).toHaveLength(1);
  });

  it("当てはまる人がいなければ、空の配列", () => {
    expect(groupDirectoryUsers(environments, users, { query: "該当なし" })).toEqual([]);
  });
});

describe("日付（日本時間）", () => {
  it("ISO 形式の日時を、日本時間の日付にする（UTC の夕方は、日本では翌日）", () => {
    expect(toJstDateString("2026-01-10T15:30:00Z")).toBe("2026-01-11");
    expect(toJstDateString("2026-01-10T14:59:59Z")).toBe("2026-01-10");
    expect(formatJstMonthDay("2026-01-10T15:30:00Z")).toBe("1/11");
    expect(formatJstMonthDay("2026-11-05T00:00:00+09:00")).toBe("11/5");
  });

  it("読めない値は null", () => {
    expect(toJstDateString(null)).toBeNull();
    expect(toJstDateString(undefined)).toBeNull();
    expect(toJstDateString("")).toBeNull();
    expect(toJstDateString("not a date")).toBeNull();
    expect(formatJstMonthDay("not a date")).toBeNull();
  });

  it("追加した日が今日かどうか", () => {
    expect(isAddedOn("2026-01-10T15:30:00Z", "2026-01-11")).toBe(true);
    expect(isAddedOn("2026-01-10T15:30:00Z", "2026-01-10")).toBe(false);
    expect(isAddedOn(null, "2026-01-11")).toBe(false);
  });
});

describe("sectionByEnvironment", () => {
  const environments = [LAB, TEST, PROD];
  const envOf: Record<string, string> = { r1: "e-lab", r2: "e-prod", r3: "e-lab", r4: "e-test", r5: "e-gone" };
  const rows = ["r1", "r2", "r3", "r4", "r5", "r6"].map((id) => ({ id }));

  it("環境の順に並べ、各環境の最初の行にだけ見出しを付ける。同じ環境の中は元の順", () => {
    const got = sectionByEnvironment(rows, environments, (id) => envOf[id]);
    expect(got.map((g) => g.row.id)).toEqual(["r2", "r4", "r1", "r3", "r5", "r6"]);
    expect(got.map((g) => g.header?.slug ?? null)).toEqual(["prod", "test", "lab", null, null, null]);
  });

  it("環境が分からない行は最後にまとめ、最初の 1 行にだけ印を付ける", () => {
    const got = sectionByEnvironment(rows, environments, (id) => envOf[id]);
    expect(got.map((g) => g.unknownHeader)).toEqual([false, false, false, false, true, false]);
  });

  it("行がなければ空", () => {
    expect(sectionByEnvironment([], environments, () => undefined)).toEqual([]);
  });

  it("全部の行の環境が分からないときは、先頭にだけ印を付ける", () => {
    const got = sectionByEnvironment([{ id: "a" }, { id: "b" }], environments, () => undefined);
    expect(got.map((g) => g.unknownHeader)).toEqual([true, false]);
    expect(got.every((g) => g.header === null)).toBe(true);
  });
});
