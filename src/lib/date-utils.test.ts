import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getTodayJST,
  isGracePeriod,
  getCurrentHourJST,
  BUSINESS_DAY_START_HOUR,
  MORNING_CLOSE_HOUR_JST,
} from "./date-utils";

// JST = UTC+9. Build the UTC instant for a given JST wall-clock time.
function jst(dateStr: string, h: number, m = 0): Date {
  return new Date(Date.parse(`${dateStr}T00:00:00+09:00`) + (h * 60 + m) * 60_000);
}

describe("business-day boundary (2026-07-22 戦略会議決定: 朝の締切14:00 / 夜の締切 翌2:00)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("constants reflect the 0722 decision", () => {
    expect(BUSINESS_DAY_START_HOUR).toBe(2);
    expect(MORNING_CLOSE_HOUR_JST).toBe(14);
  });

  it("JST 1:59 is still grace period → business date is the previous day (前日の振り返り扱い)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(jst("2026-07-23", 1, 59));
    expect(isGracePeriod()).toBe(true);
    expect(getTodayJST()).toBe("2026-07-22");
  });

  it("JST 2:00 starts the new business day (夜の締切ちょうど)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(jst("2026-07-23", 2, 0));
    expect(isGracePeriod()).toBe(false);
    expect(getTodayJST()).toBe("2026-07-23");
  });

  it("JST 13:59 is before the morning close (朝の意図をまだ書ける)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(jst("2026-07-23", 13, 59));
    expect(getCurrentHourJST()).toBeLessThan(MORNING_CLOSE_HOUR_JST);
    expect(isGracePeriod()).toBe(false);
  });

  it("JST 14:00 closes the morning window (夕方モードへ切替)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(jst("2026-07-23", 14, 0));
    expect(getCurrentHourJST()).toBeGreaterThanOrEqual(MORNING_CLOSE_HOUR_JST);
  });

  it("JST 23:30 keeps the same business date (当日の振り返り)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(jst("2026-07-23", 23, 30));
    expect(isGracePeriod()).toBe(false);
    expect(getTodayJST()).toBe("2026-07-23");
  });
});
