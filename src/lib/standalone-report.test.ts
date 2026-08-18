import { describe, it, expect } from "vitest";
import {
  reportWindowStart,
  REPORT_WINDOW_DAYS,
  REPORT_HISTORY_LIMIT,
  mapStandaloneReportRow,
} from "./standalone-report";

describe("過去レポート一覧（2026-07-23 太田さんFB「3週間の塊の推移」→ 並べて見る最小形）", () => {
  it("一覧の上限は 30 件", () => {
    expect(REPORT_HISTORY_LIMIT).toBe(30);
  });

  it("standalone_reports の1行を StoredStandaloneReport に変換する（snake→camel）", () => {
    const row = {
      id: "r1",
      report: { correlationLens: "a", themeLens: "b", skipNote: null, nextQuestion: "q" },
      period_start: "2026-07-03",
      period_end: "2026-07-23",
      entry_days: 15,
      created_at: "2026-07-24T00:00:00.000Z",
    };
    expect(mapStandaloneReportRow(row)).toEqual({
      id: "r1",
      report: { correlationLens: "a", themeLens: "b", skipNote: null, nextQuestion: "q" },
      periodStart: "2026-07-03",
      periodEnd: "2026-07-23",
      entryDays: 15,
      createdAt: "2026-07-24T00:00:00.000Z",
    });
  });

  it("プロンプト v1 以前の行（nextQuestion なし）もそのまま通す（後方互換）", () => {
    const row = {
      id: "r0",
      report: { correlationLens: "a", themeLens: "b", skipNote: "s" },
      period_start: "2026-06-01",
      period_end: "2026-06-21",
      entry_days: 10,
      created_at: "2026-06-22T00:00:00.000Z",
    };
    const mapped = mapStandaloneReportRow(row);
    expect(mapped.report.nextQuestion).toBeUndefined();
    expect(mapped.report.skipNote).toBe("s");
  });
});

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
