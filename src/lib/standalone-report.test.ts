import { describe, it, expect } from "vitest";
import {
  reportWindowStart,
  REPORT_WINDOW_DAYS,
  REPORT_HISTORY_LIMIT,
  REPORT_QUICK_NOTES_PER_DAY,
  mapStandaloneReportRow,
  buildReportDailyLines,
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

describe("日次素材に途中メモを添える（2026-08-18 定例「＋＝途中追加」→ 8/19 AI分析の素材にも含める）", () => {
  const baseLog = {
    id: "l1",
    datetime: "",
    dayOfWeek: "火",
    dayNum: 1,
    participantName: "x",
    morningIntent: "落ち着いて話す",
    eveningInsight: "少し焦った",
    energy: "good" as const,
    eveningEnergy: "okay" as const,
    morningCondition: null,
    eveningCondition: null,
    morningConditionGauges: null,
    eveningConditionGauges: null,
    morningAction: null,
    eveningState: null,
    carriedOver: null,
    logformVersion: null,
    status: "complete" as const,
    hasFeedback: false,
    hmFeedback: null,
    managerComment: null,
    managerCommentTime: null,
    managerReaction: null,
    morningTime: null,
    eveningTime: null,
    morningDurationSec: null,
    eveningDurationSec: null,
    dojoPhase: "守",
    weekNum: 1,
  };

  it("メモが無ければ従来どおりの日次行（後方互換）", () => {
    const lines = buildReportDailyLines([{ ...baseLog, date: "2026-08-18" }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("2026-08-18: 朝の気分=良い / 夕の気分=まあまあ");
    expect(lines[0]).toContain("朝の意図「落ち着いて話す」");
    expect(lines[0]).toContain("夕の振り返り「少し焦った」");
    expect(lines[0]).not.toContain("途中メモ");
  });

  it("その日のメモを JST 時刻つきで書いた順に添える", () => {
    const lines = buildReportDailyLines([{ ...baseLog, date: "2026-08-18" }], {
      "2026-08-18": [
        { id: "n1", noteDate: "2026-08-18", text: "会議で言い損ねた", createdAt: "2026-08-18T01:05:00Z" }, // 10:05 JST
        { id: "n2", noteDate: "2026-08-18", text: "午後、急に楽になった", createdAt: "2026-08-18T06:30:00Z" }, // 15:30 JST
      ],
    });
    expect(lines).toHaveLength(1);
    const i1 = lines[0].indexOf("途中メモ（10:05）「会議で言い損ねた」");
    const i2 = lines[0].indexOf("途中メモ（15:30）「午後、急に楽になった」");
    expect(i1).toBeGreaterThan(-1);
    expect(i2).toBeGreaterThan(i1);
  });

  it("朝夕の記入が無い日のメモも「（朝夕の記入なし）」として日付順に含める", () => {
    const lines = buildReportDailyLines(
      [{ ...baseLog, date: "2026-08-17" }, { ...baseLog, id: "l2", date: "2026-08-19" }],
      { "2026-08-18": [{ id: "n1", noteDate: "2026-08-18", text: "休みだけど気になる", createdAt: "2026-08-18T03:00:00Z" }] }
    );
    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith("2026-08-17:")).toBe(true);
    expect(lines[1]).toContain("2026-08-18: （朝夕の記入なし）");
    expect(lines[1]).toContain("途中メモ（12:00）「休みだけど気になる」");
    expect(lines[2].startsWith("2026-08-19:")).toBe(true);
  });

  it("1日あたりの上限を超えた分は件数だけ伝える（トークン量の保険）", () => {
    const many = Array.from({ length: REPORT_QUICK_NOTES_PER_DAY + 3 }, (_, i) => ({
      id: `n${i}`,
      noteDate: "2026-08-18",
      text: `メモ${i}`,
      createdAt: `2026-08-18T0${Math.min(i, 9)}:00:00Z`,
    }));
    const lines = buildReportDailyLines([{ ...baseLog, date: "2026-08-18" }], { "2026-08-18": many });
    expect(lines[0]).toContain(`メモ${REPORT_QUICK_NOTES_PER_DAY - 1}`);
    expect(lines[0]).not.toContain(`「メモ${REPORT_QUICK_NOTES_PER_DAY}」`);
    expect(lines[0]).toContain("（途中メモ 他3件）");
  });
});
