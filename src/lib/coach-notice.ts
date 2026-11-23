// 運営へのお知らせメール（AIコーチの返信が、運営の確認を待つ状態になったとき）の決まりと文面。
//
// AIコーチの返信（feature.coachReply）は、次のときに「確認待ち」（pending_review）で保存される。
//   - 確認が必要：返信を作らなかった記入（強い不調などの語があった／AI が作らないと返した／AI が応答を断った）。
//   - 確認待ち  ：届け方が「運営が確認してから届ける」の環境で、返信を作ったとき。
// どちらも、運営が確認ページ（/a/[token]/coach）を開くまで、本人の画面に
// 「運営の担当者が読んでからお届けします」と出たままになる。運営が気づけるように、保存した直後にメールで知らせる。
//
// 決まり（CLAUDE.md §5・§8 項目 14）
// - 送るのは、確認待ちの返信を、新しく保存したときだけ（coachNoticeKind）。1 人・1 日に、多くて 1 通。
// - 宛先は、環境ごとの設定（ai_settings の key='coach_notify_config'）に、運営の人の ID で書く。
//   例：{"managerIds":["<managers.id>"]}。メールアドレスは設定に書かない（送るときに、サーバーが引く）。
//   設定が無い環境では、送らない（確認ページに、その旨を出す）。
// - 宛先にしてよいのは、その環境の確認ページを読める人だけ（canReceiveCoachNotice。記入を読める人と同じ範囲）。
// - メールには、参加者の氏名と、記入・返信の文を載せない。載せるのは、環境の名前、記入の日、状態、件数。
//   管理画面へのリンク（トークンつきの URL）も載せない。
// - このファイルは DB にも通信にも依存しない（テスト: coach-notice.test.ts）。サーバー側だけが読み込む。
//   確認ページの欄の言葉は、画面の部品が読み込む coach-reply.ts（COACH_BOARD_TERMS）に置く。

import { escapeHtml } from "./sanitize";
import {
  COACH_BOARD_TERMS,
  COACH_TERMS,
  coachBoardRole,
  formatReplyDate,
  type CoachReplyStatus,
} from "./coach-reply";

/** 宛先の設定を置く、ai_settings の key。 */
export const COACH_NOTICE_CONFIG_KEY = "coach_notify_config";

/** 1 つの環境に設定できる宛先の上限（これを超えた分は使わない）。 */
export const COACH_NOTICE_MAX_RECIPIENTS = 5;

// ---------------------------------------------------------------------------
// 知らせる対象か
// ---------------------------------------------------------------------------

/**
 * お知らせの種類。確認ページの状態の呼び名と同じ。
 * - needs_attention = 確認が必要（返信は作っていない）
 * - pending         = 確認待ち（返信の文がある。届けるか、取り下げるかを決める）
 */
export type CoachNoticeKind = "needs_attention" | "pending";

/** 保存した返信が、運営に知らせる対象か。対象なら、その種類。届いた返信・取り下げた返信は null。 */
export function coachNoticeKind(reply: { status: CoachReplyStatus; content: string }): CoachNoticeKind | null {
  if (reply.status !== "pending_review") return null;
  return reply.content.trim() === "" ? "needs_attention" : "pending";
}

// ---------------------------------------------------------------------------
// 宛先の設定
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CoachNoticeConfig = {
  /** 宛先の、運営の人の ID（managers.id）。小文字にそろえ、重なりを除いたもの。1 件以上。 */
  managerIds: string[];
  /** 設定に書かれていたが、使わない件数（ID の形でないもの、上限を超えた分）。 */
  dropped: number;
};

/**
 * ai_settings（key='coach_notify_config'）の値を読む。JSON の文字列でも、オブジェクトでもよい。
 * 例：{"managerIds":["0f8fad5b-d9cb-469f-a165-70867728950e"]}
 *
 * null = 設定が無い、または、形が正しくない（managerIds が配列でない、使える ID が 1 つも無い）。
 * 配列の中に ID の形でない値が混ざっているときは、その値だけを使わず、残りの ID には送る
 * （1 つの書き誤りで、だれにも知らせが届かなくなることを避ける。使わなかった件数は dropped に残す）。
 */
export function parseCoachNoticeConfig(raw: unknown): CoachNoticeConfig | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (text === "") return null;
    try {
      value = JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const list = (value as Record<string, unknown>).managerIds;
  if (!Array.isArray(list)) return null;

  const ids: string[] = [];
  let dropped = 0;
  for (const item of list) {
    const id = typeof item === "string" ? item.trim().toLowerCase() : "";
    if (!UUID_RE.test(id)) {
      dropped += 1;
      continue;
    }
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length === 0) return null;
  if (ids.length > COACH_NOTICE_MAX_RECIPIENTS) {
    dropped += ids.length - COACH_NOTICE_MAX_RECIPIENTS;
    ids.length = COACH_NOTICE_MAX_RECIPIENTS;
  }
  return { managerIds: ids, dropped };
}

/** 宛先の候補（運営の人の行から、要る欄だけ）。 */
export type CoachNoticeRecipientRow = {
  id: string;
  email: string | null;
  isAdmin: boolean | null;
  role: string | null;
  tenantId: string | null;
};

/**
 * その人を、その環境のお知らせの宛先にしてよいか。確認ページを読める人と同じ範囲にする
 * （coachBoardRole。管理者＝is_admin は、どの環境でも。閲覧者は、自分の環境だけ。上司の画面の人は不可）。
 * 設定に ID を書かれただけでは、宛先にならない（その環境の記入を読めない人に、記入があったことを知らせない）。
 */
export function canReceiveCoachNotice(
  manager: Pick<CoachNoticeRecipientRow, "isAdmin" | "role" | "tenantId"> | null | undefined,
  tenantId: string
): boolean {
  const role = coachBoardRole(manager);
  if (role === "admin") return true;
  if (role === "viewer") return tenantId !== "" && manager?.tenantId === tenantId;
  return false;
}

/** その人が、確認ページで操作（届ける・取り下げる・確認済みにする）をできるか。メールの文の出し分けに使う。 */
export function canActOnCoachBoard(manager: Pick<CoachNoticeRecipientRow, "isAdmin" | "role"> | null | undefined): boolean {
  return coachBoardRole(manager) === "admin";
}

// ---------------------------------------------------------------------------
// メールの文面
// ---------------------------------------------------------------------------

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** "2026-01-06" → "1/6（火）"。日付として読めない値は、そのまま返す（曜日は、暦から計算する）。 */
export function formatNoticeDate(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return date;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  // 暦に無い日付（2026-02-31 など）は、Date が別の日に読み替える。読み替えが起きた値は、そのまま返す。
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return date;
  return `${mo}/${d}（${WEEKDAYS[t.getUTCDay()]}）`;
}

/** その環境で、いま運営の確認を待っている返信の件数。 */
export type CoachNoticeCounts = {
  /** 確認待ちの返信の合計（文のあるもの＋無いもの）。 */
  pending: number;
  /** そのうち、返信を作っていないもの（確認が必要）。 */
  needsAttention: number;
};

/** メールの文言。文を足す・変えるときは、ここに足す。 */
export const COACH_NOTICE_MAIL_TERMS = {
  subjectPrefix: "【CORE Log】AIコーチ：",
  subjects: {
    needs_attention: "確認が必要な記入があります",
    pending: "確認待ちの返信があります",
    test: "お知らせメールの試し送りです",
  },
  headerSub: {
    needs_attention: "確認が必要な記入があります",
    pending: "確認待ちの返信があります",
    test: "お知らせメールの試し送り",
  },
  salutation: "運営の担当者の方へ",
  leads: {
    needs_attention: "AIコーチが返信を作らなかった記入が、1件あります。記入を読んでください。",
    pending: "AIコーチの返信が1件、運営の確認を待っています。",
  },
  rowTenant: "環境",
  rowDate: "記入の日",
  rowState: "状態",
  tenantUnknown: "（環境の名前を読めませんでした）",
  reasons: {
    needs_attention: (shownToParticipant: string) =>
      `記入に、強い不調などを書いた言い方があったか、AIが返信を作らないと判断しました。本人の画面には「${shownToParticipant}」と出ています。`,
    pending: (shownToParticipant: string) =>
      `この環境は、運営が確認してから返信を届ける設定です。届けるまで、本人の画面には「${shownToParticipant}」と出ています。`,
  },
  stepsHeading: "していただくこと",
  stepOpenAdmin: (tenantName: string) =>
    tenantName === "" ? "管理画面を開き、この環境を選びます。" : `管理画面を開き、環境「${tenantName}」を選びます。`,
  stepOpenViewer: "管理画面を開きます。",
  stepOpenBoard: (boardTitle: string, date: string, what: "記入" | "返信") =>
    `「${boardTitle}」を開き、${date} の${what}を読みます。開いたときの日付は今日です。違う日のときは、「← 前の日」で合わせます。`,
  stepAcknowledge: (label: string) =>
    `必要な連絡をしたあとで「${label}」を押します。本人の画面の表示が消えます。`,
  stepAcknowledgeViewer: (label: string) => `「${label}」の操作は、管理者が行います。`,
  stepDecide: (deliver: string, withdraw: string) => `「${deliver}」か「${withdraw}」を選びます。`,
  stepDecideViewer: "届ける・取り下げるは、管理者が行います。",
  counts: (c: CoachNoticeCounts) =>
    `この環境で、いま確認を待っているもの：${c.pending}件（うち、返信を作っていないもの ${c.needsAttention}件）`,
  privacyNote: "このメールには、参加者の氏名と、記入・返信の文を載せていません。",
  footer: "このメールは、CORE Log の「AIコーチの確認」のお知らせの宛先に設定されている方へ送っています。",
  testLead:
    "これは、お知らせメールが届くことを確かめるための試し送りです。確認が必要な記入が出たわけではありません。",
  testExplain: (pendingLabel: string, needsAttentionLabel: string) =>
    `この環境で、AIコーチの返信が「${pendingLabel}」または「${needsAttentionLabel}」になったときに、このアドレスへメールを送ります。`,
  testContents:
    "メールに載せるのは、環境の名前、記入の日、状態、確認を待っている件数です。参加者の氏名と、記入・返信の文は載せません。",
} as const;

const T = COACH_NOTICE_MAIL_TERMS;

/** 件名に入れる値から、改行とタブを除き、長さを切る（ヘッダーに別の行を足されないように）。 */
function oneLine(text: string, max: number): string {
  return text.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

const STATE_CHIP: Record<CoachNoticeKind, string> = {
  needs_attention: "background: #FEF3F2; color: #B42318; border: 1px solid #FECDCA;",
  pending: "background: #FFFAEB; color: #B54708; border: 1px solid #FEDF89;",
};

function shell(headerSub: string, body: string): string {
  return `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1A1A2E; font-size: 15px; line-height: 1.7;">
        <div style="background: #1A1A2E; border-radius: 12px; padding: 20px; color: white; text-align: center; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 20px; font-weight: bold; line-height: 1.4;">${escapeHtml(COACH_BOARD_TERMS.title)}</h1>
          <p style="margin: 8px 0 0; opacity: 0.85; font-size: 14px; line-height: 1.5;">${escapeHtml(headerSub)}</p>
        </div>
        <p style="margin: 0 0 12px;">${escapeHtml(T.salutation)}</p>
        ${body}
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0 16px;">
        <p style="margin: 0 0 6px; color: #999; font-size: 11px; line-height: 1.6;">${escapeHtml(T.footer)}</p>
        <p style="margin: 0; color: #999; font-size: 11px; line-height: 1.6;">Project CORE — Powered by Human Mature</p>
      </div>
    `;
}

function factsTable(rows: ReadonlyArray<readonly [string, string]>): string {
  const cells = rows
    .map(
      ([label, valueHtml]) =>
        `<tr><td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px; line-height: 1.6; white-space: nowrap; vertical-align: top;">${escapeHtml(label)}</td><td style="padding: 6px 0; font-size: 14px; line-height: 1.6; font-weight: bold;">${valueHtml}</td></tr>`
    )
    .join("");
  return `<div style="background: #F7F5F2; border-radius: 8px; padding: 8px 16px; margin: 0 0 16px;"><table style="border-collapse: collapse;"><tbody>${cells}</tbody></table></div>`;
}

export type CoachNoticeEmailInput = {
  kind: CoachNoticeKind;
  /** 環境の名前（tenants.name）。読めなかったときは ""。 */
  tenantName: string;
  /** どの日の記入への返信か（YYYY-MM-DD）。 */
  replyDate: string;
  /** その環境で、いま確認を待っている件数。読めなかったときは null（その行を出さない）。 */
  counts: CoachNoticeCounts | null;
  /** 宛先の人が、確認ページで操作をできるか（管理者）。できない人（閲覧者）には、操作の手順を書かない。 */
  canAct: boolean;
};

/**
 * 確認待ち・確認が必要になったときのメール。参加者の氏名と、記入・返信の文は、引数に取らない
 * （載せようとしても、載せられない形にしておく）。
 */
export function buildCoachNoticeEmail(input: CoachNoticeEmailInput): { subject: string; html: string } {
  const { kind, canAct } = input;
  const tenantName = oneLine(input.tenantName, 60);
  const dateShort = formatReplyDate(input.replyDate);
  const dateLong = formatNoticeDate(input.replyDate);

  const where = [oneLine(tenantName, 30), dateShort].filter((x) => x !== "").join("・");
  const subject = oneLine(`${T.subjectPrefix}${T.subjects[kind]}${where ? `（${where}）` : ""}`, 80);

  const stateLabel = COACH_BOARD_TERMS.stateLabels[kind];
  const facts = factsTable([
    [T.rowTenant, escapeHtml(tenantName === "" ? T.tenantUnknown : tenantName)],
    [T.rowDate, escapeHtml(dateLong)],
    [
      T.rowState,
      `<span style="display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 13px; ${STATE_CHIP[kind]}">${escapeHtml(stateLabel)}</span>`,
    ],
  ]);

  const steps: string[] = [
    canAct ? T.stepOpenAdmin(tenantName) : T.stepOpenViewer,
    T.stepOpenBoard(COACH_BOARD_TERMS.title, dateShort, kind === "needs_attention" ? "記入" : "返信"),
  ];
  if (kind === "needs_attention") {
    steps.push(
      canAct ? T.stepAcknowledge(COACH_BOARD_TERMS.acknowledge) : T.stepAcknowledgeViewer(COACH_BOARD_TERMS.acknowledge)
    );
  } else {
    steps.push(canAct ? T.stepDecide(COACH_BOARD_TERMS.deliver, COACH_BOARD_TERMS.withdraw) : T.stepDecideViewer);
  }
  // 番号は、文の中に書く（番号つきの並びの見た目は、メールを読むアプリによって出ないことがある）。
  const stepsHtml = steps
    .map(
      (s, i) =>
        `<p style="margin: 0 0 8px; padding-left: 1.5em; text-indent: -1.5em; font-size: 14px;">${i + 1}. ${escapeHtml(s)}</p>`
    )
    .join("");

  const body = `<p style="margin: 0 0 16px; font-weight: bold;">${escapeHtml(T.leads[kind])}</p>
        ${facts}
        <p style="margin: 0 0 20px; font-size: 14px;">${escapeHtml(T.reasons[kind](COACH_TERMS.pending))}</p>
        <p style="margin: 0 0 8px; font-weight: bold; font-size: 14px;">${escapeHtml(T.stepsHeading)}</p>
        ${stepsHtml}
        ${input.counts ? `<p style="margin: 20px 0 0; font-size: 13px; color: #444;">${escapeHtml(T.counts(input.counts))}</p>` : ""}
        <p style="margin: 12px 0 0; font-size: 12px; color: #666;">${escapeHtml(T.privacyNote)}</p>`;

  return { subject, html: shell(T.headerSub[kind], body) };
}

/** 試し送りのメール（確認ページの「試しに送る」）。届くことを確かめるためのもの。 */
export function buildCoachNoticeTestEmail(input: { tenantName: string }): { subject: string; html: string } {
  const tenantName = oneLine(input.tenantName, 60);
  const where = oneLine(tenantName, 30);
  const subject = oneLine(`${T.subjectPrefix}${T.subjects.test}${where ? `（${where}）` : ""}`, 80);
  const body = `<p style="margin: 0 0 16px; font-weight: bold;">${escapeHtml(T.testLead)}</p>
        ${factsTable([[T.rowTenant, escapeHtml(tenantName === "" ? T.tenantUnknown : tenantName)]])}
        <p style="margin: 0 0 12px; font-size: 14px;">${escapeHtml(
          T.testExplain(COACH_BOARD_TERMS.stateLabels.pending, COACH_BOARD_TERMS.stateLabels.needs_attention)
        )}</p>
        <p style="margin: 0; font-size: 13px; color: #444;">${escapeHtml(T.testContents)}</p>`;
  return { subject, html: shell(T.headerSub.test, body) };
}
