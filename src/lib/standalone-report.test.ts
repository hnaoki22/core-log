import { describe, it, expect } from "vitest";
import { reportWindowStart, REPORT_WINDOW_DAYS } from "./standalone-report";

describe("21日レポートのローリング窓（2026-07-23 太田さんFB: 全期間49日分→直近3週間へ）", () => {
  it("窓は21日", () => {
    expect(REPORT_WINDOW_DAYS).toBe(21);
  });

  it("最新提出日を含めて21日分の開始日を返す", () => {
    // 7/3〜7/23 = 21日
    expect(reportWindowStart("2026-07-23")).toBe("2026-07-03");
  });

  it("月をまたぐ", () => {
    // 6/15〜7/5 = 21日
    expect(reportWindowStart("2026-07-05")).toBe("2026-06-15");
  });

  it("年をまたぐ", () => {
    // 2025-12-21〜2026-01-10 = 21日
    expect(reportWindowStart("2026-01-10")).toBe("2025-12-21");
  });

  it("days 指定で窓幅を変えられる", () => {
    expect(reportWindowStart("2026-07-23", 7)).toBe("2026-07-17");
  });
});
