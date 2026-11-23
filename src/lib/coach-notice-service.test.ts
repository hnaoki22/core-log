import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getCoachNoticeStatus,
  noticeLogLevel,
  sendCoachNotice,
  sendCoachNoticeTest,
  withTimeout,
  type CoachNoticeDeps,
} from "./coach-notice-service";
import type { CoachNoticeRecipientRow } from "./coach-notice";
import { COACH_NOTICE_MAIL_TERMS } from "./coach-notice";

// テストの値は合成データ（実在の人物・実在の環境・実在のアドレスは使わない）。
const TENANT = "tenant-a";
const ID_ADMIN = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ID_VIEWER = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const ID_OTHER = "3d6f4e2a-1b5c-4d7e-8f90-a1b2c3d4e5f6";

const admin: CoachNoticeRecipientRow = {
  id: ID_ADMIN,
  email: "admin@example.test",
  isAdmin: true,
  role: "admin",
  tenantId: "tenant-home",
};
const viewer: CoachNoticeRecipientRow = {
  id: ID_VIEWER,
  email: "viewer@example.test",
  isAdmin: false,
  role: "observer",
  tenantId: TENANT,
};

function makeDeps(over: Partial<CoachNoticeDeps> = {}, rows: Record<string, CoachNoticeRecipientRow | null> = { [ID_ADMIN]: admin }) {
  const deps: CoachNoticeDeps = {
    getConfig: vi.fn(async () => ({
      ok: true as const,
      config: { managerIds: Object.keys(rows), dropped: 0 },
      invalid: false,
    })),
    getRecipient: vi.fn(async (id: string) => ({ ok: true as const, recipient: rows[id] ?? null })),
    getTenantName: vi.fn(async () => "見本の環境"),
    countPending: vi.fn(async () => ({ ok: true as const, pending: 2, needsAttention: 1 })),
    send: vi.fn(async () => true),
    ...over,
  };
  return deps;
}

const ARGS = { tenantId: TENANT, replyDate: "2026-01-06", kind: "needs_attention" as const };

describe("sendCoachNotice：送る場合", () => {
  it("設定された管理者に、1 通送る。記録に使う値は、運営の人の ID と環境の ID", async () => {
    const deps = makeDeps();
    const result = await sendCoachNotice(deps, ARGS);
    expect(result).toEqual({ status: "sent", sent: 1, failed: 0, skipped: 0 });
    expect(deps.send).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(deps.send).mock.calls[0][0];
    expect(sent.to).toBe("admin@example.test");
    expect(sent.type).toBe("coach_notice");
    expect(sent.managerId).toBe(ID_ADMIN);
    expect(sent.tenantId).toBe(TENANT);
    expect(sent.subject).toBe("【CORE Log】AIコーチ：確認が必要な記入があります（見本の環境・1/6）");
    expect(sent.html).toContain("1/6（火）");
    expect(sent.html).toContain("この環境で、いま確認を待っているもの：2件（うち、返信を作っていないもの 1件）");
    expect(sent.html).toContain("を押します");
  });

  it("結果には、アドレスも氏名も入らない（そのまま記録してよい形）", async () => {
    const result = await sendCoachNotice(makeDeps(), ARGS);
    expect(JSON.stringify(result)).not.toContain("@");
    expect(Object.keys(result).sort()).toEqual(["failed", "sent", "skipped", "status"]);
  });

  it("確認待ち（運営が確認してから届ける環境）は、確認待ちの文で送る", async () => {
    const deps = makeDeps();
    await sendCoachNotice(deps, { ...ARGS, kind: "pending" });
    const sent = vi.mocked(deps.send).mock.calls[0][0];
    expect(sent.subject).toBe("【CORE Log】AIコーチ：確認待ちの返信があります（見本の環境・1/6）");
  });

  it("その環境の閲覧者にも送れる。閲覧者あての文には、押せない操作を書かない", async () => {
    const deps = makeDeps({}, { [ID_ADMIN]: admin, [ID_VIEWER]: viewer });
    const result = await sendCoachNotice(deps, ARGS);
    expect(result).toEqual({ status: "sent", sent: 2, failed: 0, skipped: 0 });
    const calls = vi.mocked(deps.send).mock.calls.map((c) => c[0]);
    const toViewer = calls.find((c) => c.managerId === ID_VIEWER);
    expect(toViewer?.to).toBe("viewer@example.test");
    expect(toViewer?.html).toContain("の操作は、管理者が行います。");
    expect(toViewer?.html).not.toContain("を押します");
  });

  it("同じアドレスの行が 2 つ設定されていても、1 通にまとめる（送れない人には数えない）", async () => {
    const twin: CoachNoticeRecipientRow = { ...admin, id: ID_OTHER, email: " Admin@Example.test " };
    const deps = makeDeps({}, { [ID_ADMIN]: admin, [ID_OTHER]: twin });
    const result = await sendCoachNotice(deps, ARGS);
    expect(result).toEqual({ status: "sent", sent: 1, failed: 0, skipped: 0 });
    expect(deps.send).toHaveBeenCalledTimes(1);
  });
});

describe("sendCoachNotice：宛先にしない人", () => {
  it("いない人、アドレスの無い人、上司の画面の人、ほかの環境の閲覧者には送らない", async () => {
    const rows: Record<string, CoachNoticeRecipientRow | null> = {
      [ID_ADMIN]: admin,
      "11111111-1111-4111-8111-111111111111": null,
      "22222222-2222-4222-8222-222222222222": { ...admin, id: "22222222-2222-4222-8222-222222222222", email: "  " },
      "33333333-3333-4333-8333-333333333333": {
        id: "33333333-3333-4333-8333-333333333333",
        email: "boss@example.test",
        isAdmin: false,
        role: "manager",
        tenantId: TENANT,
      },
      "44444444-4444-4444-8444-444444444444": { ...viewer, id: "44444444-4444-4444-8444-444444444444", email: "far@example.test", tenantId: "tenant-b" },
    };
    const deps = makeDeps({}, rows);
    const result = await sendCoachNotice(deps, ARGS);
    expect(result).toEqual({ status: "sent", sent: 1, failed: 0, skipped: 4 });
    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.send).mock.calls[0][0].to).toBe("admin@example.test");
  });

  it("設定に ID の形でない値が混ざっていた分も、送れない人の数に入る", async () => {
    const deps = makeDeps({
      getConfig: vi.fn(async () => ({ ok: true as const, config: { managerIds: [ID_ADMIN], dropped: 2 }, invalid: false })),
    });
    expect(await sendCoachNotice(deps, ARGS)).toEqual({ status: "sent", sent: 1, failed: 0, skipped: 2 });
  });

  it("1 人も宛先にならないときは、送らない。件数も環境の名前も読みにいかない", async () => {
    const deps = makeDeps({}, { [ID_VIEWER]: { ...viewer, tenantId: "tenant-b" } });
    expect(await sendCoachNotice(deps, ARGS)).toEqual({ status: "no_recipient" });
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.countPending).not.toHaveBeenCalled();
    expect(deps.getTenantName).not.toHaveBeenCalled();
  });
});

describe("sendCoachNotice：設定が無い・読めないとき", () => {
  it("設定が無い環境では、送らない（だれの行も読まない）", async () => {
    const deps = makeDeps({ getConfig: vi.fn(async () => ({ ok: true as const, config: null, invalid: false })) });
    expect(await sendCoachNotice(deps, ARGS)).toEqual({ status: "not_configured" });
    expect(deps.getRecipient).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("設定の形が正しくない環境では、送らない", async () => {
    const deps = makeDeps({ getConfig: vi.fn(async () => ({ ok: true as const, config: null, invalid: true })) });
    expect(await sendCoachNotice(deps, ARGS)).toEqual({ status: "invalid_config" });
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("設定を読めなかったときは、「無い」とは言わない", async () => {
    const deps = makeDeps({ getConfig: vi.fn(async () => ({ ok: false as const })) });
    expect(await sendCoachNotice(deps, ARGS)).toEqual({ status: "unknown" });
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("宛先の人を 1 人も読めなかったときは、「送れる人がいない」とは言わない", async () => {
    const failed = makeDeps({ getRecipient: vi.fn(async () => ({ ok: false as const })) });
    expect(await sendCoachNotice(failed, ARGS)).toEqual({ status: "unknown" });
    const thrown = makeDeps({
      getRecipient: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    expect(await sendCoachNotice(thrown, ARGS)).toEqual({ status: "unknown" });
  });

  it("2 人のうち 1 人を読めなかったときは、読めた人に送る", async () => {
    const deps = makeDeps(
      {
        getRecipient: vi.fn(async (id: string) =>
          id === ID_ADMIN ? { ok: true as const, recipient: admin } : { ok: false as const }
        ),
      },
      { [ID_ADMIN]: admin, [ID_VIEWER]: viewer }
    );
    expect(await sendCoachNotice(deps, ARGS)).toEqual({ status: "sent", sent: 1, failed: 0, skipped: 1 });
  });

  it("途中で例外が出ても、外に出さない", async () => {
    const deps = makeDeps({
      getConfig: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    await expect(sendCoachNotice(deps, ARGS)).resolves.toEqual({ status: "error", detail: "Error: boom" });
  });
});

describe("sendCoachNotice：送れなかったとき・一部が読めなかったとき", () => {
  it("送信が失敗を返したとき・例外を出したときは、送れなかったと返す（外に例外を出さない）", async () => {
    const refused = makeDeps({ send: vi.fn(async () => false) });
    expect(await sendCoachNotice(refused, ARGS)).toEqual({ status: "send_failed", failed: 1, skipped: 0 });
    const thrown = makeDeps({
      send: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    await expect(sendCoachNotice(thrown, ARGS)).resolves.toEqual({ status: "send_failed", failed: 1, skipped: 0 });
  });

  it("2 人のうち 1 人に送れなかったときは、送れた数と、送れなかった数を返す", async () => {
    const send = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const deps = makeDeps({ send }, { [ID_ADMIN]: admin, [ID_VIEWER]: viewer });
    expect(await sendCoachNotice(deps, ARGS)).toEqual({ status: "sent", sent: 1, failed: 1, skipped: 0 });
  });

  it("件数を読めなかったとき・いま保存した 1 件と合わない値のときは、件数の行を出さずに送る", async () => {
    for (const countPending of [
      vi.fn(async () => ({ ok: false as const })),
      vi.fn(async () => ({ ok: true as const, pending: 0, needsAttention: 0 })),
      vi.fn(async () => ({ ok: true as const, pending: 1, needsAttention: 2 })),
      vi.fn(async () => ({ ok: true as const, pending: 3, needsAttention: 0 })), // 確認が必要を保存したのに、0 件
      vi.fn(async () => ({ ok: true as const, pending: 1.5, needsAttention: 1 })),
      vi.fn(async () => {
        throw new Error("boom");
      }),
    ]) {
      const deps = makeDeps({ countPending });
      expect(await sendCoachNotice(deps, ARGS)).toMatchObject({ status: "sent", sent: 1 });
      expect(vi.mocked(deps.send).mock.calls[0][0].html).not.toContain("いま確認を待っているもの");
    }
  });

  it("確認待ち（文あり）の知らせでは、「返信を作っていないもの 0件」でも件数を出す", async () => {
    const deps = makeDeps({ countPending: vi.fn(async () => ({ ok: true as const, pending: 3, needsAttention: 0 })) });
    await sendCoachNotice(deps, { ...ARGS, kind: "pending" });
    expect(vi.mocked(deps.send).mock.calls[0][0].html).toContain(
      "この環境で、いま確認を待っているもの：3件（うち、返信を作っていないもの 0件）"
    );
  });

  it("環境の名前を読めなかったときも、送る（メールに「読めませんでした」と出す）", async () => {
    for (const getTenantName of [
      vi.fn(async () => null),
      vi.fn(async () => {
        throw new Error("boom");
      }),
    ]) {
      const deps = makeDeps({ getTenantName });
      expect(await sendCoachNotice(deps, ARGS)).toMatchObject({ status: "sent", sent: 1 });
      const sent = vi.mocked(deps.send).mock.calls[0][0];
      expect(sent.html).toContain(COACH_NOTICE_MAIL_TERMS.tenantUnknown);
      expect(sent.subject).toBe("【CORE Log】AIコーチ：確認が必要な記入があります（1/6）");
    }
  });
});

describe("sendCoachNoticeTest：試し送り", () => {
  it("設定された宛先に、試し送りの文で送る（件数は読まない）", async () => {
    const deps = makeDeps();
    expect(await sendCoachNoticeTest(deps, { tenantId: TENANT })).toEqual({ status: "sent", sent: 1, failed: 0, skipped: 0 });
    const sent = vi.mocked(deps.send).mock.calls[0][0];
    expect(sent.type).toBe("coach_notice_test");
    expect(sent.to).toBe("admin@example.test");
    expect(sent.subject).toBe("【CORE Log】AIコーチ：お知らせメールの試し送りです（見本の環境）");
    expect(sent.html).toContain("確認が必要な記入が出たわけではありません。");
    expect(deps.countPending).not.toHaveBeenCalled();
  });

  it("設定が無いとき・送れる人がいないときは、送らずに、その旨を返す", async () => {
    const none = makeDeps({ getConfig: vi.fn(async () => ({ ok: true as const, config: null, invalid: false })) });
    expect(await sendCoachNoticeTest(none, { tenantId: TENANT })).toEqual({ status: "not_configured" });
    const nobody = makeDeps({}, { [ID_VIEWER]: { ...viewer, tenantId: "tenant-b" } });
    expect(await sendCoachNoticeTest(nobody, { tenantId: TENANT })).toEqual({ status: "no_recipient" });
    expect(none.send).not.toHaveBeenCalled();
    expect(nobody.send).not.toHaveBeenCalled();
  });

  it("途中で例外が出ても、外に出さない", async () => {
    const deps = makeDeps({
      getConfig: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    await expect(sendCoachNoticeTest(deps, { tenantId: TENANT })).resolves.toEqual({ status: "error", detail: "Error: boom" });
  });
});

describe("getCoachNoticeStatus：確認ページに出す、宛先の設定の状態", () => {
  it("送れる人数と、送れない人数だけを返す（アドレス・氏名・ID は返さない）", async () => {
    const deps = makeDeps({}, { [ID_ADMIN]: admin, [ID_VIEWER]: { ...viewer, tenantId: "tenant-b" } });
    const status = await getCoachNoticeStatus(deps, TENANT);
    expect(status).toEqual({ state: "ready", recipients: 1, skipped: 1 });
    expect(JSON.stringify(status)).not.toContain("@");
    expect(JSON.stringify(status)).not.toContain(ID_ADMIN);
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("設定が無い・形が正しくない・送れる人がいない・読めない、を分けて返す", async () => {
    const none = makeDeps({ getConfig: vi.fn(async () => ({ ok: true as const, config: null, invalid: false })) });
    expect(await getCoachNoticeStatus(none, TENANT)).toEqual({ state: "not_configured" });
    const invalid = makeDeps({ getConfig: vi.fn(async () => ({ ok: true as const, config: null, invalid: true })) });
    expect(await getCoachNoticeStatus(invalid, TENANT)).toEqual({ state: "invalid_config" });
    const nobody = makeDeps({}, { [ID_VIEWER]: { ...viewer, email: null } });
    expect(await getCoachNoticeStatus(nobody, TENANT)).toEqual({ state: "no_recipient" });
    const unread = makeDeps({ getConfig: vi.fn(async () => ({ ok: false as const })) });
    expect(await getCoachNoticeStatus(unread, TENANT)).toEqual({ state: "unknown" });
    const thrown = makeDeps({
      getConfig: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    expect(await getCoachNoticeStatus(thrown, TENANT)).toEqual({ state: "unknown" });
  });
});

describe("noticeLogLevel：結果を、どの重さで記録するか", () => {
  it("全員に送れた＝info。設定に送れない人が混ざる・宛先が決まらない＝warn。読めない・送れない・一部に送れない＝error", () => {
    expect(noticeLogLevel({ status: "sent", sent: 1, failed: 0, skipped: 0 })).toBe("info");
    expect(noticeLogLevel({ status: "sent", sent: 1, failed: 0, skipped: 2 })).toBe("warn");
    expect(noticeLogLevel({ status: "sent", sent: 1, failed: 1, skipped: 0 })).toBe("error");
    expect(noticeLogLevel({ status: "sent", sent: 1, failed: 1, skipped: 2 })).toBe("error");
    expect(noticeLogLevel({ status: "not_configured" })).toBe("warn");
    expect(noticeLogLevel({ status: "invalid_config" })).toBe("warn");
    expect(noticeLogLevel({ status: "no_recipient" })).toBe("warn");
    expect(noticeLogLevel({ status: "send_failed", failed: 1, skipped: 0 })).toBe("error");
    expect(noticeLogLevel({ status: "unknown" })).toBe("error");
    expect(noticeLogLevel({ status: "error", detail: "Error: boom" })).toBe("error");
    expect(noticeLogLevel({ status: "timeout" })).toBe("error");
  });
});

describe("withTimeout：時間を区切って待つ", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("時間内に終われば、結果を返す", async () => {
    expect(await withTimeout(Promise.resolve("done"), 1000)).toEqual({ timedOut: false, value: "done" });
  });

  it("時間内に終わらなければ、待つのをやめる", async () => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => {});
    const raced = withTimeout(never, 8000);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await raced).toEqual({ timedOut: true });
  });

  it("元の処理の失敗は、そのまま伝える", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000)).rejects.toThrow("boom");
  });
});
