import { describe, it, expect, vi, beforeEach } from "vitest";

// 夕方の記入の更新（updateEveningEntry）が、行の ID だけでなく、持ち主（テナントと参加者）でも
// 絞っていることを確かめる。データベースは、行と絞り込みをまねる作り物に差し替える
// （合成データ。実在の環境・人物・記入は使わない）。

type Row = Record<string, unknown>;
type UpdateCall = { table: string; values: Record<string, unknown>; filters: Array<[string, unknown]> };

const db = vi.hoisted(() => {
  // getClient() は、接続先の設定が無いと例外にする。テスト用の作り物の値を入れておく（本物の値ではない）。
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-not-a-real-key";
  return {
    rows: [] as Row[],
    updates: [] as UpdateCall[],
    failWith: null as null | { message: string },
  };
});

const logged = vi.hoisted(() => ({ entries: [] as unknown[][] }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from(table: string) {
      const call: UpdateCall = { table, values: {}, filters: [] };
      const builder = {
        update(values: Record<string, unknown>) {
          call.values = values;
          return builder;
        },
        eq(column: string, value: unknown) {
          call.filters.push([column, value]);
          return builder;
        },
        // update(...).eq(...).select("id") の最後。絞り込みに合った行だけを書き換えて、その ID を返す。
        select() {
          db.updates.push(call);
          if (db.failWith) return Promise.resolve({ data: null, error: db.failWith });
          const matched = db.rows.filter((row) => call.filters.every(([column, value]) => row[column] === value));
          for (const row of matched) {
            for (const [key, value] of Object.entries(call.values)) {
              if (value !== undefined) row[key] = value;
            }
          }
          return Promise.resolve({ data: matched.map((row) => ({ id: row.id })), error: null });
        },
      };
      return builder;
    },
  }),
}));

vi.mock("@/lib/logger", () => {
  const record = (...args: unknown[]) => {
    logged.entries.push(args);
  };
  return { logger: { info: record, warn: record, error: record, debug: record } };
});

import { updateEveningEntry } from "./supabase";

const ME = { tenantId: "tenant-a", participantId: "p-me" };
const TEXT = "Q1: 今日は何をしましたか\nA1: 合成データの振り返り";

function seed() {
  db.rows.length = 0;
  db.rows.push(
    { id: "row-mine", tenant_id: "tenant-a", participant_id: "p-me", evening_insight: null, status: "morning_only" },
    { id: "row-colleague", tenant_id: "tenant-a", participant_id: "p-colleague", evening_insight: null, status: "morning_only" },
    { id: "row-other-tenant", tenant_id: "tenant-b", participant_id: "p-elsewhere", evening_insight: null, status: "morning_only" }
  );
}

function row(id: string): Row {
  const found = db.rows.find((r) => r.id === id);
  if (!found) throw new Error(`no such row: ${id}`);
  return found;
}

beforeEach(() => {
  seed();
  db.updates.length = 0;
  db.failWith = null;
  logged.entries.length = 0;
});

describe("updateEveningEntry：行の持ち主を確かめてから更新する", () => {
  it("自分の行は、更新できる", async () => {
    const ok = await updateEveningEntry(ME, "row-mine", TEXT, "good");
    expect(ok).toBe(true);
    expect(row("row-mine").evening_insight).toBe(TEXT);
    expect(row("row-mine").status).toBe("complete");
  });

  it("行の ID に加えて、テナントと参加者でも絞っている", async () => {
    await updateEveningEntry(ME, "row-mine", TEXT, "good");
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].table).toBe("logs");
    expect(db.updates[0].filters).toEqual([
      ["id", "row-mine"],
      ["tenant_id", "tenant-a"],
      ["participant_id", "p-me"],
    ]);
  });

  it("同じ環境の、ほかの人の行の ID を送っても、書き換えられない", async () => {
    const ok = await updateEveningEntry(ME, "row-colleague", TEXT, "good");
    expect(ok).toBe(false);
    expect(row("row-colleague").evening_insight).toBeNull();
    expect(row("row-colleague").status).toBe("morning_only");
  });

  it("ほかの環境の行の ID を送っても、書き換えられない", async () => {
    const ok = await updateEveningEntry(ME, "row-other-tenant", TEXT, "good");
    expect(ok).toBe(false);
    expect(row("row-other-tenant").evening_insight).toBeNull();
  });

  it("無い行の ID は、失敗にする（0 行の更新を成功にしない）", async () => {
    expect(await updateEveningEntry(ME, "row-missing", TEXT, "good")).toBe(false);
  });

  it("持ち主が分からないときは、更新を走らせない", async () => {
    const owners = [
      { tenantId: "", participantId: "p-me" },
      { tenantId: "tenant-a", participantId: "" },
      // 実行時に持ち主が渡らなかった場合（型の上では起きないが、起きても更新しないことを確かめる）。
      undefined as unknown as { tenantId: string; participantId: string },
    ];
    for (const owner of owners) {
      expect(await updateEveningEntry(owner, "row-mine", TEXT, "good")).toBe(false);
    }
    expect(db.updates).toHaveLength(0);
    expect(row("row-mine").evening_insight).toBeNull();
  });

  it("データベースがエラーを返したときは、失敗にする", async () => {
    db.failWith = { message: "synthetic failure" };
    expect(await updateEveningEntry(ME, "row-mine", TEXT, "good")).toBe(false);
  });

  it("失敗の記録に、記入の文を残さない", async () => {
    await updateEveningEntry(ME, "row-colleague", TEXT, "good");
    db.failWith = { message: "synthetic failure" };
    await updateEveningEntry(ME, "row-mine", TEXT, "good");
    expect(logged.entries.length).toBeGreaterThan(0);
    expect(JSON.stringify(logged.entries)).not.toContain("合成データの振り返り");
  });

  it("これまでどおり、気分・所要時間・観の期の身体欄を、値があるときだけ書く", async () => {
    await updateEveningEntry(ME, "row-mine", TEXT, "good", 95, "肩が重い");
    const values = db.updates[0].values;
    expect(values.energy).toBe("good");
    expect(values.evening_duration_sec).toBe(95);
    expect(values.body_check).toBe("肩が重い");

    db.updates.length = 0;
    await updateEveningEntry(ME, "row-mine", TEXT, null, null, null);
    const bare = db.updates[0].values;
    expect(bare.energy).toBeUndefined();
    expect("evening_duration_sec" in bare).toBe(false);
    expect("body_check" in bare).toBe(false);
  });

  it("商品モードの夕方の欄（気分・体調）も、これまでどおり書く", async () => {
    await updateEveningEntry(ME, "row-mine", TEXT, null, null, null, {
      eveningEnergy: "okay",
      eveningCondition: "少し疲れ",
    });
    const values = db.updates[0].values;
    expect(values.evening_energy).toBe("okay");
    expect(values.evening_condition).toBe("少し疲れ");
    expect(values.energy).toBeUndefined();
  });
});
