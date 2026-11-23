import { describe, it, expect, vi, beforeEach } from "vitest";

// 「前回の AIコーチの問い」のための読み取り（環境の全員分）が、行を正しく絞っているかを確かめる。
// データベースは、行と絞り込み（eq・gte・lt）、並べ替え、件数の上限をまねる作り物に差し替える
// （合成データ。実在の環境・人物・返信は使わない）。

type Row = Record<string, unknown>;
type Filter = [col: string, op: "eq" | "gte" | "lt", value: unknown];

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  /** 次の 1 回の問い合わせを失敗させる（エラーの文）。 */
  failNext: null as string | null,
  /** 直前の問い合わせの、表・絞り込み・件数の上限。 */
  last: null as { table: string; filters: Array<[string, string, unknown]>; limit: number | null } | null,
}));

function makeBuilder(table: string) {
  const state = {
    filters: [] as Filter[],
    orderBy: null as { col: string; ascending: boolean } | null,
    limit: null as number | null,
  };
  const run = () => {
    db.last = { table, filters: state.filters, limit: state.limit };
    if (db.failNext) {
      const message = db.failNext;
      db.failNext = null;
      return { data: null, error: { message } };
    }
    const rows = db.tables[table] ?? [];
    const match = (r: Row) =>
      state.filters.every(([c, op, v]) => {
        if (op === "eq") return r[c] === v;
        if (op === "gte") return String(r[c]) >= String(v);
        return String(r[c]) < String(v);
      });
    let out = rows.filter(match);
    if (state.orderBy) {
      const { col, ascending } = state.orderBy;
      out = [...out].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (ascending ? 1 : -1));
    }
    if (state.limit !== null) out = out.slice(0, state.limit);
    return { data: out, error: null };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: () => builder,
    eq: (col: string, value: unknown) => {
      state.filters.push([col, "eq", value]);
      return builder;
    },
    gte: (col: string, value: unknown) => {
      state.filters.push([col, "gte", value]);
      return builder;
    },
    lt: (col: string, value: unknown) => {
      state.filters.push([col, "lt", value]);
      return builder;
    },
    order: (col: string, opts: { ascending: boolean }) => {
      state.orderBy = { col, ascending: opts.ascending };
      return builder;
    },
    limit: (n: number) => {
      state.limit = n;
      return builder;
    },
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  getClient: () => ({ from: (table: string) => makeBuilder(table) }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { logger } from "@/lib/logger";
import { getCoachOptedOutIds, getLatestDeliveredRepliesForTenant } from "./coach-reply-store";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const SINCE = "2025-12-31";
const TODAY = "2026-01-07";

let seq = 0;
function reply(over: Row): Row {
  seq += 1;
  return {
    id: `reply-${seq}`,
    tenant_id: TENANT_A,
    participant_id: "p1",
    reply_date: "2026-01-06",
    kind: "daily",
    status: "delivered",
    content: "一段落目。\n\nあした、何を確かめますか。",
    created_at: "2026-01-06T09:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  seq = 0;
  db.tables = {};
  db.failNext = null;
  db.last = null;
  vi.mocked(logger.error).mockClear();
  vi.mocked(logger.warn).mockClear();
});

describe("getLatestDeliveredRepliesForTenant（朝のメール：環境の全員分の、前回の返信）", () => {
  it("その環境の、届いた毎日の返信だけを、参加者ごとに、いちばん新しい 1 件", async () => {
    db.tables.coach_replies = [
      // p1：届いた返信が 2 件 → 新しいほう
      reply({ participant_id: "p1", reply_date: "2026-01-05", content: "古いほう。\n\n古い問い。" }),
      reply({ participant_id: "p1", reply_date: "2026-01-06", content: "新しいほう。\n\n新しい問い。" }),
      // p2：届いた返信が 1 件
      reply({ participant_id: "p2", reply_date: "2026-01-04" }),
      // p3：いちばん新しいのは確認待ち → その前の、届いた返信
      reply({ participant_id: "p3", reply_date: "2026-01-06", status: "pending_review", content: "" }),
      reply({ participant_id: "p3", reply_date: "2026-01-03" }),
      // p4：取り下げ済みだけ → 入らない
      reply({ participant_id: "p4", status: "withdrawn" }),
      // p5：週のまとめだけ → 入らない
      reply({ participant_id: "p5", kind: "weekly" }),
      // p6：今日の記入への返信だけ（「前回」ではない）→ 入らない
      reply({ participant_id: "p6", reply_date: TODAY }),
      // p7：期間より前の返信だけ → 入らない
      reply({ participant_id: "p7", reply_date: "2025-12-30" }),
      // 別の環境の、同じ参加者 ID の行 → 混ざらない
      reply({ tenant_id: TENANT_B, participant_id: "p1", reply_date: "2026-01-06", content: "別の環境。\n\n別の環境の問い。" }),
      reply({ tenant_id: TENANT_B, participant_id: "p8", reply_date: "2026-01-06" }),
    ];

    const latest = await getLatestDeliveredRepliesForTenant(TENANT_A, SINCE, TODAY);
    expect(latest).not.toBeNull();
    expect(Array.from(latest!.keys()).sort()).toEqual(["p1", "p2", "p3"]);
    expect(latest!.get("p1")).toMatchObject({
      replyDate: "2026-01-06",
      kind: "daily",
      status: "delivered",
      content: "新しいほう。\n\n新しい問い。",
    });
    expect(latest!.get("p2")?.replyDate).toBe("2026-01-04");
    expect(latest!.get("p3")).toMatchObject({ replyDate: "2026-01-03", status: "delivered" });
  });

  it("期間の端：sinceDate の日は入る。beforeDate の日は入らない", async () => {
    db.tables.coach_replies = [
      reply({ participant_id: "p1", reply_date: SINCE }),
      reply({ participant_id: "p2", reply_date: TODAY }),
    ];
    const latest = await getLatestDeliveredRepliesForTenant(TENANT_A, SINCE, TODAY);
    expect(Array.from(latest!.keys())).toEqual(["p1"]);
  });

  it("絞り込みに、環境・種類・状態・期間をすべて使う", async () => {
    db.tables.coach_replies = [];
    await getLatestDeliveredRepliesForTenant(TENANT_A, SINCE, TODAY);
    expect(db.last?.table).toBe("coach_replies");
    expect(db.last?.filters).toEqual(
      expect.arrayContaining([
        ["tenant_id", "eq", TENANT_A],
        ["kind", "eq", "daily"],
        ["status", "eq", "delivered"],
        ["reply_date", "gte", SINCE],
        ["reply_date", "lt", TODAY],
      ])
    );
    expect(db.last?.filters).toHaveLength(5);
  });

  it("参加者 ID の無い行は、数えない", async () => {
    db.tables.coach_replies = [reply({ participant_id: null }), reply({ participant_id: "" }), reply({ participant_id: "p2" })];
    const latest = await getLatestDeliveredRepliesForTenant(TENANT_A, SINCE, TODAY);
    expect(Array.from(latest!.keys())).toEqual(["p2"]);
  });

  it("届いた返信が 1 件も無いときは、空の Map（null ではない）", async () => {
    db.tables.coach_replies = [reply({ status: "pending_review" })];
    const latest = await getLatestDeliveredRepliesForTenant(TENANT_A, SINCE, TODAY);
    expect(latest).not.toBeNull();
    expect(latest!.size).toBe(0);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("読めなかったときは null を返し、記録する（空の Map にしない）", async () => {
    db.tables.coach_replies = [reply({})];
    db.failNext = "connection refused";
    const latest = await getLatestDeliveredRepliesForTenant(TENANT_A, SINCE, TODAY);
    expect(latest).toBeNull();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("読む行の上限に届いたときは、警告を記録する（届いていないときは、記録しない）", async () => {
    // 上限より 1 行少ない → 警告なし
    db.tables.coach_replies = Array.from({ length: 999 }, (_, i) => reply({ participant_id: `p${i}` }));
    await getLatestDeliveredRepliesForTenant(TENANT_A, SINCE, TODAY);
    expect(db.last?.limit).toBe(1000);
    expect(logger.warn).not.toHaveBeenCalled();

    // 上限ちょうど（欠けているかもしれない）→ 警告
    db.tables.coach_replies = Array.from({ length: 1200 }, (_, i) => reply({ participant_id: `p${i}` }));
    const latest = await getLatestDeliveredRepliesForTenant(TENANT_A, SINCE, TODAY);
    expect(latest!.size).toBe(1000);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    // 記録に、返信の文を入れない
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls[0])).not.toContain("あした、何を確かめますか");
  });
});

describe("getCoachOptedOutIds（朝のメール：その環境で「受け取らない」にしている人）", () => {
  it("その環境で、受け取らないにしている人の ID だけを返す", async () => {
    db.tables.coaching_profiles = [
      { tenant_id: TENANT_A, participant_id: "p1", coach_enabled: true },
      { tenant_id: TENANT_A, participant_id: "p2", coach_enabled: false },
      { tenant_id: TENANT_A, participant_id: "p3", coach_enabled: false },
      // 別の環境で受け取らないにしている人 → 混ざらない
      { tenant_id: TENANT_B, participant_id: "p4", coach_enabled: false },
    ];
    const ids = await getCoachOptedOutIds(TENANT_A);
    expect(ids).not.toBeNull();
    expect(Array.from(ids!).sort()).toEqual(["p2", "p3"]);
    expect(db.last?.table).toBe("coaching_profiles");
    expect(db.last?.filters).toEqual(
      expect.arrayContaining([
        ["tenant_id", "eq", TENANT_A],
        ["coach_enabled", "eq", false],
      ])
    );
  });

  it("受け取らない人がいないときは、空の集合（null ではない）", async () => {
    db.tables.coaching_profiles = [{ tenant_id: TENANT_A, participant_id: "p1", coach_enabled: true }];
    const ids = await getCoachOptedOutIds(TENANT_A);
    expect(ids).not.toBeNull();
    expect(ids!.size).toBe(0);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("参加者 ID の無い行は、入れない", async () => {
    db.tables.coaching_profiles = [
      { tenant_id: TENANT_A, participant_id: null, coach_enabled: false },
      { tenant_id: TENANT_A, participant_id: "p2", coach_enabled: false },
    ];
    const ids = await getCoachOptedOutIds(TENANT_A);
    expect(Array.from(ids!)).toEqual(["p2"]);
  });

  it("読めなかったときは null を返し、記録する（「だれも切っていない」と扱わない）", async () => {
    db.tables.coaching_profiles = [{ tenant_id: TENANT_A, participant_id: "p2", coach_enabled: false }];
    db.failNext = "timeout";
    const ids = await getCoachOptedOutIds(TENANT_A);
    expect(ids).toBeNull();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
