import { describe, it, expect } from "vitest";
import { PLACEHOLDER_POOL, getPlaceholderFromPool, type PlaceholderSlot } from "./logform-placeholder-pool";

const SLOTS: PlaceholderSlot[] = ["morning_q1", "morning_q2", "evening_result", "evening_effort"];

describe("logform placeholder pool", () => {
  it("各スロット16案・重複なし・空文字なし", () => {
    for (const s of SLOTS) {
      const pool = PLACEHOLDER_POOL[s];
      expect(pool.length).toBe(16);
      expect(new Set(pool).size).toBe(16);
      expect(pool.every((x) => x.trim().length > 0)).toBe(true);
    }
  });

  it("禁止語・評価語を含まない（用語規律）", () => {
    const banned = ["育てる", "育成", "育む", "整える", "成長", "リフレクション", "ちゃんと", "すべき", "できた", "成功", "失敗"];
    for (const s of SLOTS) {
      for (const ex of PLACEHOLDER_POOL[s]) {
        for (const b of banned) {
          expect(ex.includes(b)).toBe(false);
        }
      }
    }
  });

  it("(token,date,slot) で決定論的・プール内から選ぶ", () => {
    const a = getPlaceholderFromPool("morning_q1", "tok1", "2026-07-11");
    const b = getPlaceholderFromPool("morning_q1", "tok1", "2026-07-11");
    expect(a).toBe(b);
    expect(PLACEHOLDER_POOL.morning_q1).toContain(a);
  });

  it("未知スロットは空文字を返す（ガード）", () => {
    // @ts-expect-error 型外スロットの防御確認
    expect(getPlaceholderFromPool("nope", "t", "d")).toBe("");
  });
});
