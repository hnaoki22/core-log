import { describe, it, expect } from "vitest";
import {
  gaugeDefsFor,
  sanitizeConditionGauges,
  MORNING_GAUGE_KEYS,
  EVENING_GAUGE_KEYS,
} from "./condition-gauges";

// 太田さん7/15 §2: 夕ゲージを2→3項目化（「今日の充実度」を先頭に追加）。
// 朝=睡眠/疲労/冴え、夕=充実度/疲労/冴え。
describe("condition gauges 朝夕構成", () => {
  it("朝は 睡眠/疲労/冴え の3項目・その順", () => {
    const defs = gaugeDefsFor(true);
    expect(defs.map((d) => d.key)).toEqual(["sleep", "fatigue", "clarity"]);
    expect(MORNING_GAUGE_KEYS).toEqual(["sleep", "fatigue", "clarity"]);
  });

  it("夕は 充実度/疲労/冴え の3項目・充実度が先頭（睡眠は出さない）", () => {
    const defs = gaugeDefsFor(false);
    expect(defs.map((d) => d.key)).toEqual(["fulfillment", "fatigue", "clarity"]);
    expect(defs[0].label).toBe("今日の充実度");
    expect(defs.some((d) => d.key === "sleep")).toBe(false);
    expect(EVENING_GAUGE_KEYS).toEqual(["fulfillment", "fatigue", "clarity"]);
  });

  it("sanitize は fulfillment を含む有効キーを {raw,normalized} に正規化し、範囲外・未知キーを捨てる", () => {
    const out = sanitizeConditionGauges({ fulfillment: 1, fatigue: 4, clarity: 9, bogus: 2 });
    expect(out).not.toBeNull();
    expect(out!.fulfillment).toEqual({ raw: 1, normalized: 0 });
    expect(out!.fatigue).toEqual({ raw: 4, normalized: 100 });
    expect(out!.clarity).toBeUndefined(); // 9 は 1..4 の範囲外
  });
});
