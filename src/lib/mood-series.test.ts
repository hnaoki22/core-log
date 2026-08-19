import { describe, it, expect } from "vitest";
import { weekStartMonday, dailyMids, weeklyCandles, addDaysJST, diffDaysJST } from "./mood-series";

describe("mood-series（長期ビューの週足・日々の中点。2026-08-18 太田さんFB: 3ヶ月化）", () => {
  it("週の始まりは月曜（JST）", () => {
    // 2026-08-18 は火曜 → 8/17（月）
    expect(weekStartMonday("2026-08-18")).toBe("2026-08-17");
    // 日曜は前の月曜に属する
    expect(weekStartMonday("2026-08-23")).toBe("2026-08-17");
    // 月曜はそのまま
    expect(weekStartMonday("2026-08-17")).toBe("2026-08-17");
  });

  it("日付演算はJST安全（月またぎ）", () => {
    expect(addDaysJST("2026-08-31", 1)).toBe("2026-09-01");
    expect(diffDaysJST("2026-08-01", "2026-08-31")).toBe(30);
  });

  it("日々の中点：朝夕あれば平均、片方のみならその値、両方無ければ除外", () => {
    const r = dailyMids(
      [
        { date: "2026-08-10", energy: "okay", eveningEnergy: "excellent" }, // (2+4)/2=3
        { date: "2026-08-11", energy: "good", eveningEnergy: null },        // 3
        { date: "2026-08-12", energy: null, eveningEnergy: "low" },         // 1
        { date: "2026-08-13", energy: null, eveningEnergy: null },          // 除外
      ],
      91
    );
    expect(r).not.toBeNull();
    expect(r!.end).toBe("2026-08-12");
    expect(r!.points).toEqual([
      { date: "2026-08-10", mid: 3 },
      { date: "2026-08-11", mid: 3 },
      { date: "2026-08-12", mid: 1 },
    ]);
  });

  it("週足：始値＝朝の平均、終値＝夕の平均。記録の無い週も null で並ぶ（欠測を詰めない）", () => {
    const r = weeklyCandles(
      [
        { date: "2026-08-04", energy: "good", eveningEnergy: "excellent" }, // 8/3週: 朝3 夕4
        { date: "2026-08-05", energy: "okay", eveningEnergy: "good" },      // 8/3週: 朝2 夕3 → 平均 朝2.5 夕3.5
        // 8/10週は記録なし
        { date: "2026-08-18", energy: "excellent", eveningEnergy: "okay" }, // 8/17週: 朝4 夕2
      ],
      21
    );
    expect(r).not.toBeNull();
    const weeks = r!.weeks;
    expect(weeks.map((w) => w.weekStart)).toEqual(["2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17"]);
    // 窓は 8/18 を終端に 21 日 → 7/29 開始 → 7/27 週から並ぶ（記録なし）
    expect(weeks[0]).toMatchObject({ open: null, close: null, mornings: 0, evenings: 0 });
    expect(weeks[1]).toMatchObject({ open: 2.5, close: 3.5, mornings: 2, evenings: 2 });
    expect(weeks[2]).toMatchObject({ open: null, close: null });
    expect(weeks[3]).toMatchObject({ open: 4, close: 2, mornings: 1, evenings: 1 });
  });

  it("窓の外の記録は集計に入らない", () => {
    const r = weeklyCandles(
      [
        { date: "2026-05-01", energy: "low", eveningEnergy: "low" }, // 窓外
        { date: "2026-08-18", energy: "good", eveningEnergy: "good" },
      ],
      21
    );
    expect(r!.weeks.every((w) => w.open == null || w.open === 3)).toBe(true);
    expect(r!.weeks.reduce((n, w) => n + w.mornings, 0)).toBe(1);
  });

  it("記録が無ければ null", () => {
    expect(dailyMids([], 91)).toBeNull();
    expect(weeklyCandles([{ date: "2026-08-18", energy: null, eveningEnergy: null }], 91)).toBeNull();
  });
});
