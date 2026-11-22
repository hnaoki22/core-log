import { describe, it, expect, vi, beforeEach } from "vitest";

// 「直す前の文」の読み書きが、行を正しく絞っているかを確かめる。
// データベースは、行と絞り込み（eq）をまねる作り物に差し替える（合成データ。実在の環境・人物は使わない）。

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  /** 次の 1 回の問い合わせを失敗させる（エラーの文）。 */
  failNext: null as string | null,
  seq: 0,
}));

function makeBuilder(table: string) {
  const state = {
    op: "select" as "select" | "insert" | "delete",
    payload: null as Row | null,
    filters: [] as Array<[string, unknown]>,
    orderBy: null as { col: string; ascending: boolean } | null,
    limit: null as number | null,
  };
  const run = (single: boolean) => {
    if (db.failNext) {
      const message = db.failNext;
      db.failNext = null;
      return { data: null, error: { message } };
    }
    const rows = db.tables[table] ?? (db.tables[table] = []);
    const match = (r: Row) => state.filters.every(([c, v]) => r[c] === v);
    if (state.op === "insert") {
      db.seq += 1;
      const row = {
        id: `edit-${db.seq}`,
        created_at: new Date(Date.UTC(2026, 10, 22, 0, db.seq)).toISOString(),
        ...state.payload,
      };
      rows.push(row);
      return { data: [row], error: null };
    }
    if (state.op === "delete") {
      const hit = rows.filter(match);
      db.tables[table] = rows.filter((r) => !match(r));
      return { data: hit, error: null };
    }
    let out = rows.filter(match);
    if (state.orderBy) {
      const { col, ascending } = state.orderBy;
      out = [...out].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (ascending ? 1 : -1));
    }
    if (state.limit !== null) out = out.slice(0, state.limit);
    return single ? { data: out[0] ?? null, error: null } : { data: out, error: null };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: () => builder,
    insert: (payload: Row) => {
      state.op = "insert";
      state.payload = payload;
      return builder;
    },
    delete: () => {
      state.op = "delete";
      return builder;
    },
    eq: (col: string, value: unknown) => {
      state.filters.push([col, value]);
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
    maybeSingle: () => Promise.resolve(run(true)),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(run(false)).then(resolve, reject),
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  getClient: () => ({ from: (table: string) => makeBuilder(table) }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  deleteMissionEdit,
  getMissionEditTarget,
  insertMissionEdit,
  listMissionEdits,
} from "./mission-edit-store";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const ME = "participant-me";
const OTHER = "participant-other";
const MISSION = "mission-1";

function editRow(over: Row): Row {
  return {
    id: "x",
    tenant_id: TENANT_A,
    mission_id: MISSION,
    participant_id: ME,
    edited_by: "participant",
    title_before: "題（直す前）",
    purpose_before: "文（直す前）",
    deadline_before: "2026-12-17",
    created_at: "2026-11-22T00:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  db.tables = {
    missions: [
      {
        id: MISSION,
        tenant_id: TENANT_A,
        participant_id: ME,
        status: "進行中",
        title: "いまの題",
        purpose: "いまの文",
        deadline: "2026-12-17",
      },
    ],
    mission_edits: [],
  };
  db.failNext = null;
  db.seq = 0;
});

describe("getMissionEditTarget", () => {
  it("returns the current values and the owner of the mission", async () => {
    expect(await getMissionEditTarget(MISSION, TENANT_A)).toEqual({
      ok: true,
      row: {
        id: MISSION,
        tenantId: TENANT_A,
        participantId: ME,
        status: "進行中",
        title: "いまの題",
        purpose: "いまの文",
        deadline: "2026-12-17",
      },
    });
  });

  it("does not find a mission of another tenant", async () => {
    expect(await getMissionEditTarget(MISSION, TENANT_B)).toEqual({ ok: true, row: null });
    expect(await getMissionEditTarget("no-such-mission", TENANT_A)).toEqual({ ok: true, row: null });
  });

  it("tells a failed read apart from a missing mission", async () => {
    db.failNext = "boom";
    expect(await getMissionEditTarget(MISSION, TENANT_A)).toEqual({ ok: false });
  });
});

describe("insertMissionEdit", () => {
  const input = {
    tenantId: TENANT_A,
    missionId: MISSION,
    participantId: ME,
    editedBy: "participant" as const,
    before: { title: "題（直す前）", purpose: "文（直す前）", deadline: "2026-12-17" },
  };

  it("keeps the text from before the edit, with the owner and who edited", async () => {
    const res = await insertMissionEdit(input);
    expect(res).toEqual({ ok: true, id: "edit-1" });
    expect(db.tables.mission_edits).toHaveLength(1);
    expect(db.tables.mission_edits[0]).toMatchObject({
      tenant_id: TENANT_A,
      mission_id: MISSION,
      participant_id: ME,
      edited_by: "participant",
      title_before: "題（直す前）",
      purpose_before: "文（直す前）",
      deadline_before: "2026-12-17",
    });
  });

  it("stores empty fields as null", async () => {
    await insertMissionEdit({ ...input, before: { title: "題", purpose: null, deadline: null } });
    expect(db.tables.mission_edits[0]).toMatchObject({ purpose_before: null, deadline_before: null });
  });

  it("reports a failed insert", async () => {
    db.failNext = "boom";
    expect(await insertMissionEdit(input)).toEqual({ ok: false });
    expect(db.tables.mission_edits).toHaveLength(0);
  });
});

describe("listMissionEdits", () => {
  const mine = { missionId: MISSION, tenantId: TENANT_A, participantId: ME, limit: 30 };

  it("returns the edits of the mission, newest first", async () => {
    db.tables.mission_edits = [
      editRow({ id: "old", created_at: "2026-11-22T00:00:00.000Z", title_before: "古い題" }),
      editRow({ id: "new", created_at: "2026-11-23T00:00:00.000Z", title_before: "新しい題", edited_by: "manager" }),
    ];
    const res = await listMissionEdits(mine);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.edits).toEqual([
      {
        id: "new",
        editedAt: "2026-11-23T00:00:00.000Z",
        editedBy: "manager",
        before: { title: "新しい題", purpose: "文（直す前）", deadline: "2026-12-17" },
      },
      {
        id: "old",
        editedAt: "2026-11-22T00:00:00.000Z",
        editedBy: "participant",
        before: { title: "古い題", purpose: "文（直す前）", deadline: "2026-12-17" },
      },
    ]);
  });

  it("does not return rows of another participant, another tenant or another mission", async () => {
    db.tables.mission_edits = [
      editRow({ id: "other-person", participant_id: OTHER }),
      editRow({ id: "other-tenant", tenant_id: TENANT_B }),
      editRow({ id: "other-mission", mission_id: "mission-2" }),
    ];
    expect(await listMissionEdits(mine)).toEqual({ ok: true, edits: [] });
    // ほかの人が、同じイシューの ID を送っても、行は返らない。
    expect(await listMissionEdits({ ...mine, participantId: "participant-stranger" })).toEqual({ ok: true, edits: [] });
  });

  it("returns at most the given number of rows", async () => {
    db.tables.mission_edits = Array.from({ length: 5 }, (_, i) =>
      editRow({ id: `e${i}`, created_at: `2026-11-2${i}T00:00:00.000Z` })
    );
    const res = await listMissionEdits({ ...mine, limit: 2 });
    expect(res.ok && res.edits.map((e) => e.id)).toEqual(["e4", "e3"]);
  });

  it("tells a failed read apart from an empty history", async () => {
    db.failNext = "boom";
    expect(await listMissionEdits(mine)).toEqual({ ok: false });
  });
});

describe("deleteMissionEdit", () => {
  it("removes the row only within its tenant", async () => {
    db.tables.mission_edits = [editRow({ id: "e1" }), editRow({ id: "e2" })];
    expect(await deleteMissionEdit("e1", TENANT_B)).toBe(false);
    expect(db.tables.mission_edits).toHaveLength(2);
    expect(await deleteMissionEdit("e1", TENANT_A)).toBe(true);
    expect(db.tables.mission_edits.map((r) => r.id)).toEqual(["e2"]);
  });

  it("reports a failed or empty delete", async () => {
    db.tables.mission_edits = [editRow({ id: "e1" })];
    expect(await deleteMissionEdit("no-such-edit", TENANT_A)).toBe(false);
    db.failNext = "boom";
    expect(await deleteMissionEdit("e1", TENANT_A)).toBe(false);
    expect(db.tables.mission_edits).toHaveLength(1);
  });
});
