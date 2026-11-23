import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  COACH_NOTICE_ADMIN_SCREEN,
  COACH_NOTICE_CONFIG_KEY,
  COACH_NOTICE_MAIL_TERMS,
  COACH_NOTICE_MAX_RECIPIENTS,
  buildCoachNoticeEmail,
  buildCoachNoticeTestEmail,
  canActOnCoachBoard,
  canReceiveCoachNotice,
  coachNoticeKind,
  formatNoticeDate,
  parseCoachNoticeConfig,
} from "./coach-notice";
import { COACH_BOARD_TERMS, COACH_TERMS } from "./coach-reply";

// テストの値は合成データ（実在の人物・実在の環境・実在の記入は使わない）。
const ID_A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ID_B = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const TENANT = "見本の環境";

describe("coachNoticeKind：運営に知らせる対象か", () => {
  it("確認待ちで、返信の文が無いものは「確認が必要」", () => {
    expect(coachNoticeKind({ status: "pending_review", content: "" })).toBe("needs_attention");
    expect(coachNoticeKind({ status: "pending_review", content: "  \n" })).toBe("needs_attention");
  });

  it("確認待ちで、返信の文があるものは「確認待ち」", () => {
    expect(coachNoticeKind({ status: "pending_review", content: "見本の問いです。" })).toBe("pending");
  });

  it("届いた返信・取り下げた返信は、知らせない", () => {
    expect(coachNoticeKind({ status: "delivered", content: "見本の問いです。" })).toBeNull();
    expect(coachNoticeKind({ status: "withdrawn", content: "見本の問いです。" })).toBeNull();
    expect(coachNoticeKind({ status: "withdrawn", content: "" })).toBeNull();
  });
});

describe("parseCoachNoticeConfig：宛先の設定", () => {
  it("設定の置き場所は、ai_settings の coach_notify_config", () => {
    expect(COACH_NOTICE_CONFIG_KEY).toBe("coach_notify_config");
  });

  it("運営の人の ID の並びを読む（JSON の文字列でも、オブジェクトでも）", () => {
    expect(parseCoachNoticeConfig({ managerIds: [ID_A] })).toEqual({ managerIds: [ID_A], dropped: 0 });
    expect(parseCoachNoticeConfig(JSON.stringify({ managerIds: [ID_A, ID_B] }))).toEqual({
      managerIds: [ID_A, ID_B],
      dropped: 0,
    });
  });

  it("前後の空白を除き、小文字にそろえ、重なりを除く", () => {
    expect(parseCoachNoticeConfig({ managerIds: [` ${ID_A.toUpperCase()} `, ID_A, ID_B] })).toEqual({
      managerIds: [ID_A, ID_B],
      dropped: 0,
    });
  });

  it("ID の形でない値は使わず、残りの ID には送る（使わなかった件数を残す）", () => {
    expect(parseCoachNoticeConfig({ managerIds: ["staff@example.test", ID_A, 42, null, "見本"] })).toEqual({
      managerIds: [ID_A],
      dropped: 4,
    });
  });

  it("メールアドレスを書いても、宛先にはならない（アドレスは設定に置かない）", () => {
    expect(parseCoachNoticeConfig({ managerIds: ["staff@example.test"] })).toBeNull();
    expect(parseCoachNoticeConfig({ emails: ["staff@example.test"] })).toBeNull();
  });

  it(`上限（${COACH_NOTICE_MAX_RECIPIENTS} 人）を超えた分は使わない`, () => {
    const many = Array.from({ length: COACH_NOTICE_MAX_RECIPIENTS + 2 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`);
    const parsed = parseCoachNoticeConfig({ managerIds: many });
    expect(parsed?.managerIds).toEqual(many.slice(0, COACH_NOTICE_MAX_RECIPIENTS));
    expect(parsed?.dropped).toBe(2);
  });

  it("設定が無い・形が正しくないときは null（送らない）", () => {
    for (const raw of [
      null,
      undefined,
      "",
      "   ",
      "{",
      "[]",
      42,
      [],
      {},
      { managerIds: ID_A },
      { managerIds: {} },
      { managerIds: [] },
      { managerIds: ["", "x"] },
      JSON.stringify([ID_A]),
    ]) {
      expect(parseCoachNoticeConfig(raw)).toBeNull();
    }
  });

  it("知らない欄があっても、宛先の読み方は変わらない", () => {
    expect(parseCoachNoticeConfig({ managerIds: [ID_A], link: true, note: "見本" })).toEqual({
      managerIds: [ID_A],
      dropped: 0,
    });
  });
});

describe("canReceiveCoachNotice：宛先にしてよい人（確認ページを読める人と同じ範囲）", () => {
  it("管理者（is_admin）は、どの環境のお知らせも受け取れる", () => {
    expect(canReceiveCoachNotice({ isAdmin: true, role: "admin", tenantId: "t-home" }, "t-other")).toBe(true);
    expect(canReceiveCoachNotice({ isAdmin: true, role: "manager", tenantId: null }, "t-other")).toBe(true);
  });

  it("閲覧者は、自分の環境のお知らせだけ", () => {
    expect(canReceiveCoachNotice({ isAdmin: false, role: "observer", tenantId: "t-1" }, "t-1")).toBe(true);
    expect(canReceiveCoachNotice({ isAdmin: false, role: "observer", tenantId: "t-1" }, "t-2")).toBe(false);
    // role が admin でも、is_admin でなければ、閲覧者と同じ扱い（coachBoardRole と同じ）。
    expect(canReceiveCoachNotice({ isAdmin: false, role: "admin", tenantId: "t-1" }, "t-1")).toBe(true);
    expect(canReceiveCoachNotice({ isAdmin: null, role: "admin", tenantId: "t-1" }, "t-2")).toBe(false);
  });

  it("上司の画面の人、いない人、環境が分からないときは、受け取れない", () => {
    expect(canReceiveCoachNotice({ isAdmin: false, role: "manager", tenantId: "t-1" }, "t-1")).toBe(false);
    expect(canReceiveCoachNotice({ isAdmin: null, role: null, tenantId: "t-1" }, "t-1")).toBe(false);
    expect(canReceiveCoachNotice(null, "t-1")).toBe(false);
    expect(canReceiveCoachNotice(undefined, "t-1")).toBe(false);
    expect(canReceiveCoachNotice({ isAdmin: false, role: "observer", tenantId: "" }, "")).toBe(false);
    expect(canReceiveCoachNotice({ isAdmin: false, role: "observer", tenantId: null }, "t-1")).toBe(false);
  });

  it("操作（届ける・取り下げる・確認済みにする）ができるのは、管理者だけ", () => {
    expect(canActOnCoachBoard({ isAdmin: true, role: "admin" })).toBe(true);
    expect(canActOnCoachBoard({ isAdmin: false, role: "observer" })).toBe(false);
    expect(canActOnCoachBoard({ isAdmin: false, role: "admin" })).toBe(false);
    expect(canActOnCoachBoard(null)).toBe(false);
  });
});

describe("formatNoticeDate：記入の日（曜日つき）", () => {
  it("曜日を、暦から計算して付ける", () => {
    expect(formatNoticeDate("2026-01-06")).toBe("1/6（火）");
    expect(formatNoticeDate("2026-12-31")).toBe("12/31（木）");
    expect(formatNoticeDate("2027-01-01")).toBe("1/1（金）");
    expect(formatNoticeDate("2024-02-29")).toBe("2/29（木）");
  });

  it("日付として読めない値・暦に無い日付は、そのまま返す", () => {
    expect(formatNoticeDate("")).toBe("");
    expect(formatNoticeDate("きのう")).toBe("きのう");
    expect(formatNoticeDate("2026-02-31")).toBe("2026-02-31");
    expect(formatNoticeDate("2026-13-01")).toBe("2026-13-01");
  });
});

const BASE = {
  tenantName: TENANT,
  replyDate: "2026-01-06",
  counts: { pending: 2, needsAttention: 1 },
  canAct: true,
} as const;

describe("buildCoachNoticeEmail：確認が必要（返信を作らなかった記入）", () => {
  const mail = buildCoachNoticeEmail({ ...BASE, kind: "needs_attention" });

  it("件名に、種類・環境の名前・記入の日が入る", () => {
    expect(mail.subject).toBe("【CORE Log】AIコーチ：確認が必要な記入があります（見本の環境・1/6）");
  });

  it("本文に、環境・記入の日（曜日つき）・状態・理由・していただくこと・件数が入る", () => {
    expect(mail.html).toContain("運営の担当者の方へ");
    expect(mail.html).toContain("AIコーチが返信を作らなかった記入が、1件あります。記入を読んでください。");
    expect(mail.html).toContain(TENANT);
    expect(mail.html).toContain("1/6（火）");
    expect(mail.html).toContain(COACH_BOARD_TERMS.stateLabels.needs_attention);
    expect(mail.html).toContain(
      `記入に、強い不調などを書いた言い方があったか、AIが返信を作らないと判断しました。本人の画面には「${COACH_TERMS.pending}」と出ています。`
    );
    expect(mail.html).toContain("していただくこと");
    // 入口の場所を書く（環境を選ぶ場所／「環境とユーザー」の欄の下の、4 つの数字のすぐ下）。
    expect(mail.html).toContain(
      "管理画面を開き、いちばん上の選択欄（開いたときは「全環境」）で「見本の環境」を選びます。"
    );
    expect(mail.html).toContain(
      "「環境とユーザー」の欄の下にある4つの数字（参加者・平均完了率・今日の記入・FB配信数）のすぐ下の「AIコーチの確認」を押し、1/6 の記入を読みます。開いたときの日付は今日です。違う日のときは、「← 前の日」で合わせます。"
    );
    expect(mail.html).toContain("必要な連絡をしたあとで「確認済みにする」を押します。本人の画面の表示が消えます。");
    expect(mail.html).toContain("この環境で、いま確認を待っているもの：2件（うち、返信を作っていないもの 1件）");
    // 手順の番号は、文の中に書く（番号つきの並びの見た目に頼らない）。
    expect(mail.html).toContain(">1. 管理画面を開き、");
    expect(mail.html).toContain(">2. 「環境とユーザー」の欄の下にある4つの数字");
    expect(mail.html).toContain(">3. 必要な連絡をしたあとで");
    expect(mail.html).not.toContain("<ol");
    expect(mail.html).not.toContain("<li");
  });

  it("氏名と記入の文を載せていない、と書く。宛先に設定された人へのメールだ、と書く", () => {
    expect(mail.html).toContain("このメールには、参加者の氏名と、記入・返信の文を載せていません。");
    expect(mail.html).toContain(
      "このメールは、CORE Log の「AIコーチの確認」のお知らせの宛先に設定されている方へ送っています。"
    );
  });

  it("リンク（管理画面を開ける URL）を載せない", () => {
    expect(mail.html).not.toContain("href");
    expect(mail.html).not.toContain("http");
    expect(mail.html).not.toContain("/a/");
  });

  it("段落の余白と、見出しの太さは、メールの中に書く（読むアプリの既定の見た目に頼らない）", () => {
    for (const html of [mail.html, buildCoachNoticeTestEmail({ tenantName: TENANT }).html]) {
      expect(html.match(/<p(?![^>]*margin:)[^>]*>/g)).toBeNull();
      expect(html).toMatch(/<h1 style="[^"]*font-weight: bold;/);
    }
  });

  it("画面の言葉（確認ページの名前・ボタンの名前・本人の画面の文）は、画面の表と同じものを使う", () => {
    // 手順で「押す」と書くのは、管理画面の入口のカードの名前。
    expect(mail.html).toContain(`「${COACH_BOARD_TERMS.entryCardTitle}」を押し、`);
    expect(mail.html).toContain(`「${COACH_BOARD_TERMS.acknowledge}」`);
    expect(mail.html).toContain(`「${COACH_TERMS.pending}」`);
  });
});

describe("buildCoachNoticeEmail：確認待ち（運営が確認してから届ける環境）", () => {
  const mail = buildCoachNoticeEmail({ ...BASE, kind: "pending" });

  it("件名と本文が、確認待ちの文になる", () => {
    expect(mail.subject).toBe("【CORE Log】AIコーチ：確認待ちの返信があります（見本の環境・1/6）");
    expect(mail.html).toContain("AIコーチの返信が1件、運営の確認を待っています。");
    expect(mail.html).toContain(COACH_BOARD_TERMS.stateLabels.pending);
    expect(mail.html).toContain(
      `この環境は、運営が確認してから返信を届ける設定です。届けるまで、本人の画面には「${COACH_TERMS.pending}」と出ています。`
    );
    expect(mail.html).toContain("のすぐ下の「AIコーチの確認」を押し、1/6 の返信を読みます。");
    expect(mail.html).toContain("「この返信を届ける」か「取り下げる」を選びます。");
    expect(mail.html).not.toContain("強い不調");
    expect(mail.html).not.toContain("確認済みにする");
  });
});

describe("buildCoachNoticeEmail：宛先が閲覧者のとき（操作はできない）", () => {
  it("押せないボタンを、押すようには書かない", () => {
    const hold = buildCoachNoticeEmail({ ...BASE, kind: "needs_attention", canAct: false });
    expect(hold.html).toContain("管理画面を開きます。");
    expect(hold.html).not.toContain("を選びます。");
    expect(hold.html).toContain("「確認済みにする」の操作は、管理者が行います。");
    expect(hold.html).not.toContain("を押します");
    // 入口の場所は、閲覧者の画面の並びで書く（閲覧者の画面には、環境の選択欄と「環境とユーザー」の欄が出ない）。
    expect(hold.html).toContain(
      "上の4つの数字（参加者・平均完了率・今日の記入・FB配信数）のすぐ下にある「AIコーチの確認」を押し、1/6 の記入を読みます。開いたときの日付は今日です。違う日のときは、「← 前の日」で合わせます。"
    );
    expect(hold.html).not.toContain("環境とユーザー");
    expect(hold.html).not.toContain("全環境");

    const pending = buildCoachNoticeEmail({ ...BASE, kind: "pending", canAct: false });
    expect(pending.html).toContain("届ける・取り下げるは、管理者が行います。");
    expect(pending.html).not.toContain("を選びます。");
  });
});

// 手順は、管理画面の呼び名と並びを、名前で指している。管理画面の側を変えて、メールの文だけが
// 古くなることを防ぐ（管理画面のコードを文字として読み、呼び名と並びを確かめる）。
describe("COACH_NOTICE_ADMIN_SCREEN：手順が指す呼び名と並びが、管理画面のコードと合っている", () => {
  const page = fs.readFileSync(path.resolve(__dirname, "../app/a/[token]/page.tsx"), "utf-8");
  const directory = fs.readFileSync(path.resolve(__dirname, "../components/admin/AdminDirectory.tsx"), "utf-8");
  const STATS_START = "{/* Summary Stats */}";
  const ENTRY_START = "{data.coachReplyEnabled === true && (";

  it("環境の選択欄は、開いたときに「全環境」を表示している", () => {
    expect(page).toMatch(
      new RegExp(`<option value="" [^>]*>${COACH_NOTICE_ADMIN_SCREEN.tenantSelectAll}</option>`)
    );
    expect(page).toContain('const [selectedTenantSlug, setSelectedTenantSlug] = useState<string>("");');
  });

  it("「環境とユーザー」は、管理者にだけ出る欄の見出し", () => {
    expect(directory).toContain(`>${COACH_NOTICE_ADMIN_SCREEN.directoryHeading}</h2>`);
    expect(page).toMatch(/\{data\.viewerIsAdmin === true && directory && \(\s*<AdminDirectory/);
  });

  it("4つの数字の呼び名が、この順で並んでいる", () => {
    let from = page.indexOf(STATS_START);
    expect(from).toBeGreaterThan(-1);
    for (const label of COACH_NOTICE_ADMIN_SCREEN.statLabels) {
      const at = page.indexOf(`>${label}</div>`, from);
      expect(at, label).toBeGreaterThan(from);
      from = at;
    }
  });

  it("並びは、「環境とユーザー」の欄 → 4つの数字 → 入口のカード。あいだに、ほかの欄を挟まない", () => {
    // 部品のタグ（<AdminDirectory のあとに空白）。型の名前（AdminDirectoryData）には当てない。
    const directoryAt = page.search(/<AdminDirectory\s/);
    const statsAt = page.indexOf(STATS_START);
    const lastLabel = COACH_NOTICE_ADMIN_SCREEN.statLabels[COACH_NOTICE_ADMIN_SCREEN.statLabels.length - 1];
    const lastStatAt = page.indexOf(`>${lastLabel}</div>`, statsAt);
    const entryAt = page.indexOf(ENTRY_START);
    expect(directoryAt).toBeGreaterThan(-1);
    expect(statsAt).toBeGreaterThan(directoryAt);
    expect(lastStatAt).toBeGreaterThan(statsAt);
    expect(entryAt).toBeGreaterThan(lastStatAt);
    // 「環境とユーザー」の欄と 4つの数字のあいだ、4つの数字と入口のあいだに、見出しつきの欄が無い。
    const directoryEnd = page.indexOf("/>", directoryAt);
    expect(page.slice(directoryEnd, statsAt)).not.toMatch(/<h2|<h3|<section|className="card/);
    expect(page.slice(lastStatAt, entryAt)).not.toMatch(/<h2|<h3|<section|className="card/);
  });

  it("入口のカードの名前は、手順に書く名前と同じ", () => {
    const entryAt = page.indexOf(ENTRY_START);
    expect(page.slice(entryAt, entryAt + 900)).toContain("{COACH_BOARD_TERMS.entryCardTitle}");
    expect(COACH_BOARD_TERMS.entryCardTitle).toBe("AIコーチの確認");
  });
});

describe("buildCoachNoticeEmail：値が欠けているとき・変わった値のとき", () => {
  it("件数を読めなかったときは、件数の行を出さない", () => {
    const mail = buildCoachNoticeEmail({ ...BASE, kind: "needs_attention", counts: null });
    expect(mail.html).not.toContain("いま確認を待っているもの");
  });

  it("環境の名前を読めなかったときは、件名に入れず、本文に「読めませんでした」と出す", () => {
    const mail = buildCoachNoticeEmail({ ...BASE, kind: "needs_attention", tenantName: "" });
    expect(mail.subject).toBe("【CORE Log】AIコーチ：確認が必要な記入があります（1/6）");
    expect(mail.html).toContain(COACH_NOTICE_MAIL_TERMS.tenantUnknown);
    expect(mail.html).toContain(
      "管理画面を開き、いちばん上の選択欄（開いたときは「全環境」）で、この環境を選びます。"
    );
  });

  it("環境の名前に入った記号は、本文では無害にし、件名からは改行を除く", () => {
    const mail = buildCoachNoticeEmail({
      ...BASE,
      kind: "needs_attention",
      tenantName: "見本<script>alert(1)</script>\r\nBcc: other@example.test",
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.subject.length).toBeLessThanOrEqual(80);
  });

  it("長い環境の名前は、件名では切る", () => {
    const mail = buildCoachNoticeEmail({ ...BASE, kind: "pending", tenantName: "あ".repeat(200) });
    expect(mail.subject.length).toBeLessThanOrEqual(80);
    expect(mail.subject).toContain("確認待ちの返信があります");
  });
});

describe("buildCoachNoticeTestEmail：試し送り", () => {
  const mail = buildCoachNoticeTestEmail({ tenantName: TENANT });

  it("試し送りだと分かる件名と本文になる（確認が必要な記入が出た、とは書かない）", () => {
    expect(mail.subject).toBe("【CORE Log】AIコーチ：お知らせメールの試し送りです（見本の環境）");
    expect(mail.html).toContain(
      "これは、お知らせメールが届くことを確かめるための試し送りです。確認が必要な記入が出たわけではありません。"
    );
    expect(mail.html).toContain(TENANT);
    expect(mail.html).toContain(
      `この環境で、AIコーチの返信が「${COACH_BOARD_TERMS.stateLabels.pending}」または「${COACH_BOARD_TERMS.stateLabels.needs_attention}」になったときに、このアドレスへメールを送ります。`
    );
    expect(mail.html).toContain(
      "メールに載せるのは、環境の名前、記入の日、状態、確認を待っている件数です。参加者の氏名と、記入・返信の文は載せません。"
    );
    expect(mail.html).not.toContain("していただくこと");
    expect(mail.html).not.toContain("href");
    expect(mail.html).not.toContain("http");
  });
});
