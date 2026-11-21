import { describe, it, expect } from "vitest";
import {
  MAX_MISSIONS_ON_INPUT,
  formatMissionDeadline,
  isActiveMissionStatus,
  isLongPurpose,
  missionTerms,
  selectActiveMissions,
} from "./mission-context";

describe("isActiveMissionStatus", () => {
  it("treats 進行中 and the legacy in_progress as active", () => {
    expect(isActiveMissionStatus("進行中")).toBe(true);
    expect(isActiveMissionStatus("in_progress")).toBe(true);
    expect(isActiveMissionStatus(" 進行中 ")).toBe(true);
  });

  it("treats a missing status as active (same default as rowToMission)", () => {
    expect(isActiveMissionStatus(null)).toBe(true);
    expect(isActiveMissionStatus(undefined)).toBe(true);
    expect(isActiveMissionStatus("")).toBe(true);
  });

  it("treats every other status as not active", () => {
    for (const s of ["未着手", "完了", "保留", "中止", "not_started", "completed", "その他"]) {
      expect(isActiveMissionStatus(s)).toBe(false);
    }
  });
});

describe("selectActiveMissions", () => {
  const base = { purpose: "p", deadline: "2026-12-17" };

  it("returns [] for null / undefined / empty input", () => {
    expect(selectActiveMissions(null)).toEqual([]);
    expect(selectActiveMissions(undefined)).toEqual([]);
    expect(selectActiveMissions([])).toEqual([]);
  });

  it("keeps only active missions, in the order given", () => {
    const out = selectActiveMissions([
      { id: "1", title: "A", status: "完了", ...base },
      { id: "2", title: "B", status: "進行中", ...base },
      { id: "3", title: "C", status: "未着手", ...base },
      { id: "4", title: "D", status: "in_progress", ...base },
    ]);
    expect(out.map((m) => m.id)).toEqual(["2", "4"]);
  });

  it("returns only the fields the input screen shows", () => {
    const out = selectActiveMissions([
      { id: "1", title: "A", status: "進行中", purpose: "目的", deadline: "2026-12-17" },
    ]);
    expect(out).toEqual([{ id: "1", title: "A", purpose: "目的", deadline: "2026-12-17" }]);
  });

  it("normalizes an empty purpose / deadline to null", () => {
    const out = selectActiveMissions([
      { id: "1", title: "A", status: "進行中", purpose: "", deadline: "" },
      { id: "2", title: "B", status: "進行中", purpose: "  ", deadline: null },
      { id: "3", title: "C", status: "進行中" },
    ]);
    expect(out).toEqual([
      { id: "1", title: "A", purpose: null, deadline: null },
      { id: "2", title: "B", purpose: null, deadline: null },
      { id: "3", title: "C", purpose: null, deadline: null },
    ]);
  });

  it("keeps line breaks in the purpose as written", () => {
    const out = selectActiveMissions([
      { id: "1", title: "A", status: "進行中", purpose: "1行目\n2行目", deadline: null },
    ]);
    expect(out[0].purpose).toBe("1行目\n2行目");
  });

  it("drops rows without a title", () => {
    const out = selectActiveMissions([
      { id: "1", title: "", status: "進行中", ...base },
      { id: "2", title: "   ", status: "進行中", ...base },
      { id: "3", title: "C", status: "進行中", ...base },
    ]);
    expect(out.map((m) => m.id)).toEqual(["3"]);
  });

  it("caps the result at MAX_MISSIONS_ON_INPUT by default", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      title: `M${i}`,
      status: "進行中",
      ...base,
    }));
    const out = selectActiveMissions(many);
    expect(out).toHaveLength(MAX_MISSIONS_ON_INPUT);
    expect(out.map((m) => m.id)).toEqual(["0", "1", "2"]);
  });

  it("honors an explicit max, and returns [] for a non-positive max", () => {
    const many = Array.from({ length: 4 }, (_, i) => ({ id: String(i), title: `M${i}`, status: "進行中" }));
    expect(selectActiveMissions(many, 1).map((m) => m.id)).toEqual(["0"]);
    expect(selectActiveMissions(many, 0)).toEqual([]);
    expect(selectActiveMissions(many, -1)).toEqual([]);
  });

  it("counts the cap after filtering (inactive rows do not use up the slots)", () => {
    const out = selectActiveMissions(
      [
        { id: "1", title: "A", status: "完了" },
        { id: "2", title: "B", status: "完了" },
        { id: "3", title: "C", status: "進行中" },
      ],
      1
    );
    expect(out.map((m) => m.id)).toEqual(["3"]);
  });
});

describe("formatMissionDeadline", () => {
  it("formats a date column value as month/day without leading zeros", () => {
    expect(formatMissionDeadline("2026-12-17")).toBe("12/17");
    expect(formatMissionDeadline("2027-01-05")).toBe("1/5");
  });

  it("accepts a timestamp-like value without shifting the date", () => {
    expect(formatMissionDeadline("2026-12-17T00:00:00+00:00")).toBe("12/17");
    expect(formatMissionDeadline("2026-12-17 23:59:59")).toBe("12/17");
  });

  it("returns null for empty, missing or unreadable values", () => {
    expect(formatMissionDeadline("")).toBeNull();
    expect(formatMissionDeadline(null)).toBeNull();
    expect(formatMissionDeadline(undefined)).toBeNull();
    expect(formatMissionDeadline("12/17")).toBeNull();
    expect(formatMissionDeadline("2026-13-01")).toBeNull();
    expect(formatMissionDeadline("2026-12-00")).toBeNull();
    expect(formatMissionDeadline("2026-12-171")).toBeNull();
  });
});

describe("isLongPurpose", () => {
  it("is false for empty or short text", () => {
    expect(isLongPurpose(null)).toBe(false);
    expect(isLongPurpose("")).toBe(false);
    expect(isLongPurpose("   ")).toBe(false);
    expect(isLongPurpose("短い文")).toBe(false);
    expect(isLongPurpose("1行目\n2行目\n3行目")).toBe(false);
  });

  it("is true for more than three lines", () => {
    expect(isLongPurpose("1\n2\n3\n4")).toBe(true);
  });

  it("is true for text longer than the preview", () => {
    expect(isLongPurpose("あ".repeat(60))).toBe(false);
    expect(isLongPurpose("あ".repeat(61))).toBe(true);
  });
});

describe("missionTerms", () => {
  it("keeps the wording that was on the screens before the label flag existed", () => {
    // feature.missionLabelIssue が OFF のテナントの表示を変えないための固定。
    const t = missionTerms(false);
    expect(t.tab).toBe("ミッション");
    expect(t.pageTitle).toBe("ミッション");
    expect(t.pageSubtitle).toBe("上司と共有するミッションと進捗");
    expect(t.createButton).toBe("新しいミッションを設定");
    expect(t.titleLabel).toBe("ミッション名 *");
    expect(t.titlePlaceholder).toBe("例: Q3営業戦略の提案書を自力で完成させる");
    expect(t.purposeLabel).toBe("背景・目的");
    expect(t.purposePlaceholder).toBe("このミッションを設定する背景や、達成に向けた期待を記入");
    expect(t.submit).toBe("ミッションを設定");
    expect(t.emptyTitle).toBe("ミッションはまだありません");
    expect(t.emptyHint).toBe("上のボタンから自分でミッションを設定できます");
  });

  it("switches every participant-facing label to イシュー when the flag is on", () => {
    const t = missionTerms(true);
    expect(t.tab).toBe("イシュー");
    expect(t.pageTitle).toBe("イシュー（解くべき問題）");
    expect(t.inputCardHeading).toBe("設定したイシュー（解くべき問題）");
    for (const value of Object.values(t)) {
      expect(value).not.toContain("ミッション");
    }
  });

  it("keeps the tab label short enough for the bottom navigation", () => {
    expect(missionTerms(false).tab.length).toBeLessThanOrEqual(5);
    expect(missionTerms(true).tab.length).toBeLessThanOrEqual(5);
  });

  it("falls back to the default wording for a non-boolean argument", () => {
    // @ts-expect-error 実行時に undefined が来ても既定の呼び名を返す
    expect(missionTerms(undefined).tab).toBe("ミッション");
  });
});
