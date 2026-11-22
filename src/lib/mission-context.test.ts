import { describe, it, expect } from "vitest";
import {
  ISSUE_HYPOTHESIS_HEADING,
  ISSUE_PLAN_HEADING,
  MAX_MISSIONS_ON_INPUT,
  composeIssuePurpose,
  formatMissionDeadline,
  formatOtherActiveCount,
  isActiveMissionStatus,
  isLongPurpose,
  missionTerms,
  parseIssuePurpose,
  pickCurrentIssue,
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

  it("keeps the closing flow and the form as they were when the flag is off", () => {
    // 閉じる操作まわりの文言も、元の画面に書かれていたものと一字一句同じ。
    const t = missionTerms(false);
    expect(t.closeButton).toBe("完了にする");
    expect(t.closeNotePlaceholder).toBe("振り返りコメント（任意）");
    expect(t.closeConfirm).toBe("完了にする");
    expect(t.closeNoteRequired).toBe(false);
    expect(t.closedNoteLabel).toBe("最終振り返り");
    expect(t.closedStatusLabel).toBe("完了");
    expect(t.closedSectionTitle).toBe("完了");
    // 仮説の欄は出さない（従来のフォームのまま）。
    expect(t.hypothesisLabel).toBeNull();
    expect(t.hypothesisPlaceholder).toBeNull();
  });

  it("switches every participant-facing label to イシュー when the flag is on", () => {
    const t = missionTerms(true);
    expect(t.tab).toBe("イシュー");
    expect(t.pageTitle).toBe("イシュー（解くべき問い）");
    expect(t.titleLabel).toBe("イシュー（解くべき問い） *");
    expect(t.inputCardHeading).toBe("設定したイシュー（解くべき問い）");
    const texts = Object.values(t).filter((v): v is string => typeof v === "string");
    expect(texts.length).toBeGreaterThan(10);
    for (const value of texts) {
      expect(value).not.toContain("ミッション");
      // 呼び名の説明は「解くべき問い」にそろえる（「解くべき問題」を残さない）。
      expect(value).not.toContain("解くべき問題");
    }
  });

  it("adds a required hypothesis field when the flag is on", () => {
    const t = missionTerms(true);
    expect(t.hypothesisLabel).toBe("仮説（いまの時点の答え） *");
    expect(t.hypothesisPlaceholder).toBe(
      "その問いに、今の自分はどう答えるか。こうなっているはず、という答えを一文で"
    );
    // 入力欄の案内は書き方だけ。答えの見本（「例:」）は置かない。
    expect(t.titlePlaceholder).not.toContain("例");
    expect(t.hypothesisPlaceholder).not.toContain("例");
    expect(t.purposePlaceholder).not.toContain("例");
  });

  it("closes an issue with a reason instead of marking it complete when the flag is on", () => {
    const t = missionTerms(true);
    expect(t.closeButton).toBe("このイシューを閉じる");
    expect(t.closeNotePlaceholder).toBe("閉じる理由（解決した、見直した など）");
    expect(t.closeConfirm).toBe("閉じる");
    expect(t.closeNoteRequired).toBe(true);
    expect(t.closedNoteLabel).toBe("閉じた理由");
    expect(t.closedStatusLabel).toBe("終了");
    expect(t.closedSectionTitle).toBe("閉じたイシュー");
    for (const value of [t.closeButton, t.closeNotePlaceholder, t.closeConfirm, t.closedNoteLabel, t.closedStatusLabel, t.closedSectionTitle]) {
      expect(value).not.toContain("完了");
    }
  });

  it("offers no way to edit a set mission when the flag is off", () => {
    // 本人が直す操作（「直す」のボタン、フォーム、直した履歴）は、従来の画面には出さない。
    expect(missionTerms(false).edit).toBeNull();
  });

  it("lets the participant fix the wording of an issue when the flag is on", () => {
    const t = missionTerms(true);
    const edit = t.edit;
    expect(edit).not.toBeNull();
    if (!edit) return;
    expect(edit.button).toBe("直す");
    expect(edit.formHeading).toBe("イシューを直す");
    // 説明には、直す前の文が残ることと、仮説が変わったときの直し方（閉じて新しく設定）を書く。
    expect(edit.note).toContain("直した履歴");
    expect(edit.note).toContain(t.closeButton);
    expect(edit.note).toContain("新しく設定");
    // 件数と日時を入れる場所がある。
    expect(edit.historyToggle).toContain("{n}");
    expect(edit.historyEntryByParticipant).toContain("{t}");
    expect(edit.historyEntryByManager).toContain("{t}");
    expect(edit.historyEntryByManager).not.toBe(edit.historyEntryByParticipant);
    const texts = Object.values(edit);
    expect(texts.length).toBeGreaterThan(10);
    for (const value of texts) {
      expect(typeof value).toBe("string");
      expect(value).not.toBe("");
      expect(value).not.toContain("ミッション");
      expect(value).not.toContain("解くべき問題");
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

// 仮説つきの「背景・目的」。テストの文言は合成データ（実在の記入は使わない）。
describe("composeIssuePurpose", () => {
  it("puts the hypothesis and the plan under their headings, separated by a blank line", () => {
    expect(composeIssuePurpose("合成の仮説", "合成の計画")).toBe(
      "【仮説】\n合成の仮説\n\n【目指す状態と、これからの行動】\n合成の計画"
    );
  });

  it("trims each part and keeps line breaks inside a part", () => {
    expect(composeIssuePurpose("  仮説の文  \n", "\n1行目\n2行目\n")).toBe(
      "【仮説】\n仮説の文\n\n【目指す状態と、これからの行動】\n1行目\n2行目"
    );
  });

  it("omits the heading of an empty part", () => {
    expect(composeIssuePurpose("仮説だけ", "")).toBe("【仮説】\n仮説だけ");
    expect(composeIssuePurpose("仮説だけ", "   ")).toBe("【仮説】\n仮説だけ");
    expect(composeIssuePurpose("", "計画だけ")).toBe("【目指す状態と、これからの行動】\n計画だけ");
  });

  it("returns an empty string when both parts are empty or missing", () => {
    expect(composeIssuePurpose("", "")).toBe("");
    expect(composeIssuePurpose(null, undefined)).toBe("");
  });
});

describe("parseIssuePurpose", () => {
  it("splits what composeIssuePurpose wrote back into the two parts", () => {
    const saved = composeIssuePurpose("合成の仮説", "1行目\n2行目");
    expect(parseIssuePurpose(saved)).toEqual({
      structured: true,
      hypothesis: "合成の仮説",
      plan: "1行目\n2行目",
    });
  });

  it("reads a hypothesis-only text and a plan-only text", () => {
    expect(parseIssuePurpose("【仮説】\n仮説だけ")).toEqual({ structured: true, hypothesis: "仮説だけ", plan: null });
    expect(parseIssuePurpose("【目指す状態と、これからの行動】\n計画だけ")).toEqual({
      structured: true,
      hypothesis: null,
      plan: "計画だけ",
    });
  });

  it("leaves a text without the headings as it is (missions set before this form, or by a manager)", () => {
    expect(parseIssuePurpose("従来の背景・目的\n2行目")).toEqual({
      structured: false,
      hypothesis: null,
      plan: "従来の背景・目的\n2行目",
    });
  });

  it("does not split when the heading is not at the very start", () => {
    // 文の途中に「【仮説】」と書いてあっても、見出しとしては扱わない。
    const text = "はじめに書いた文。\n【仮説】\nこれは本文の一部";
    expect(parseIssuePurpose(text)).toEqual({ structured: false, hypothesis: null, plan: text });
  });

  it("returns nulls for null, undefined, empty or whitespace-only input", () => {
    const empty = { structured: false, hypothesis: null, plan: null };
    expect(parseIssuePurpose(null)).toEqual(empty);
    expect(parseIssuePurpose(undefined)).toEqual(empty);
    expect(parseIssuePurpose("")).toEqual(empty);
    expect(parseIssuePurpose("  \n ")).toEqual(empty);
  });

  it("accepts Windows line breaks and surrounding blank lines", () => {
    const saved = "\r\n【仮説】\r\n仮説の文\r\n\r\n【目指す状態と、これからの行動】\r\n計画の文\r\n";
    expect(parseIssuePurpose(saved)).toEqual({ structured: true, hypothesis: "仮説の文", plan: "計画の文" });
  });

  it("treats a heading with nothing under it as empty", () => {
    expect(parseIssuePurpose("【仮説】")).toEqual({ structured: true, hypothesis: null, plan: null });
    expect(parseIssuePurpose("【仮説】\n\n【目指す状態と、これからの行動】\n計画の文")).toEqual({
      structured: true,
      hypothesis: null,
      plan: "計画の文",
    });
  });

  it("keeps a hypothesis that itself begins with the heading text", () => {
    const saved = composeIssuePurpose("【仮説】と書き始めた文", "計画の文");
    expect(parseIssuePurpose(saved)).toEqual({
      structured: true,
      hypothesis: "【仮説】と書き始めた文",
      plan: "計画の文",
    });
  });

  it("uses the headings exported for the form", () => {
    expect(ISSUE_HYPOTHESIS_HEADING).toBe("【仮説】");
    expect(ISSUE_PLAN_HEADING).toBe("【目指す状態と、これからの行動】");
  });
});

// 設計図のページの先頭に出す「いまの 1 件」。テストの文言は合成データ（実在の記入は使わない）。
describe("pickCurrentIssue", () => {
  const structured = composeIssuePurpose("仮説の文", "計画の文");

  it("returns no current issue for null / undefined / empty input, or when nothing is active", () => {
    for (const input of [null, undefined, []]) {
      expect(pickCurrentIssue(input)).toEqual({ current: null, otherActiveCount: 0 });
    }
    expect(pickCurrentIssue([{ id: "1", title: "閉じた問い", status: "完了" }])).toEqual({
      current: null,
      otherActiveCount: 0,
    });
  });

  it("picks the first active one in the order given (the caller passes newest first)", () => {
    const out = pickCurrentIssue([
      { id: "new-closed", title: "閉じた新しい問い", status: "完了", purpose: structured },
      { id: "new-active", title: "新しい問い", status: "進行中", purpose: structured },
      { id: "old-active", title: "前の問い", status: "進行中", purpose: null },
    ]);
    expect(out.current).toEqual({ id: "new-active", title: "新しい問い", hypothesis: "仮説の文" });
    expect(out.otherActiveCount).toBe(1);
  });

  it("is the same one that the reminder mail and the AI coach use (selectActiveMissions(…, 1) + parseIssuePurpose)", () => {
    const missions = [
      { id: "a", title: "", status: "進行中", purpose: structured },
      { id: "b", title: "問いB", status: "未着手", purpose: structured },
      { id: "c", title: "問いC", status: null, purpose: structured },
      { id: "d", title: "問いD", status: "in_progress", purpose: "見出しのない文" },
    ];
    const first = selectActiveMissions(missions, 1)[0];
    const parts = parseIssuePurpose(first.purpose);
    const out = pickCurrentIssue(missions);
    expect(out.current?.id).toBe(first.id);
    expect(out.current?.title).toBe(first.title);
    expect(out.current?.hypothesis).toBe(parts.structured ? parts.hypothesis : null);
    expect(out.otherActiveCount).toBe(1);
  });

  it("leaves the hypothesis null for a text without the headings, or with no purpose", () => {
    expect(pickCurrentIssue([{ id: "1", title: "問い", status: "進行中", purpose: "従来の背景・目的" }]).current).toEqual({
      id: "1",
      title: "問い",
      hypothesis: null,
    });
    expect(pickCurrentIssue([{ id: "1", title: "問い", status: "進行中" }]).current?.hypothesis).toBeNull();
  });

  it("counts every other active one, not only the three shown on the input screen", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: String(i), title: `問い${i}`, status: "進行中" }));
    expect(pickCurrentIssue(many).otherActiveCount).toBe(5);
    expect(MAX_MISSIONS_ON_INPUT).toBeLessThan(6);
  });
});

describe("formatOtherActiveCount", () => {
  it("puts the count into the wording for both labels", () => {
    expect(formatOtherActiveCount(missionTerms(true).blueprintOthers, 2)).toBe("ほかに進行中のイシューが2件あります。");
    expect(formatOtherActiveCount(missionTerms(false).blueprintOthers, 1)).toBe(
      "ほかに進行中のミッションが1件あります。"
    );
  });
});

describe("missionTerms：設計図のページと、設定した直後の案内", () => {
  it("names the group of actions after the issue when the label flag is on", () => {
    const t = missionTerms(true);
    expect(t.blueprintHeading).toBe("いまのイシュー（解くべき問い）");
    expect(t.blueprintActionsHeading).toBe("このイシューに向けた行動");
    expect(t.blueprintLink).toBe("イシューを見直す");
    expect(t.createdNotice).toContain("設計図");
    expect(t.createdNotice).toContain(t.blueprintActionsHeading);
  });

  it("uses the mission wording when the label flag is off", () => {
    const t = missionTerms(false);
    expect(t.blueprintHeading).toBe("進行中のミッション");
    expect(t.blueprintActionsHeading).toBe("このミッションに向けた行動");
    expect(t.blueprintLink).toBe("ミッションを見直す");
    expect(t.createdNotice).toContain(t.blueprintActionsHeading);
    for (const value of [t.blueprintHeading, t.blueprintOthers, t.blueprintLink, t.blueprintActionsHeading, t.createdNotice]) {
      expect(value).not.toContain("イシュー");
    }
  });
});
