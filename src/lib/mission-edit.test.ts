import { describe, it, expect } from "vitest";
import {
  MISSION_EDIT_LIST_MAX,
  buildMissionEditViews,
  decideMissionEdit,
  fillTemplate,
  formatDeadlineDate,
  formatJstDateTime,
  isClosedMissionStatus,
  normalizeDeadline,
  sameMissionText,
  stripRequiredMark,
  toMissionSnapshot,
  type MissionEditRecord,
  type MissionTextSnapshot,
} from "./mission-edit";
import { composeIssuePurpose } from "./mission-context";

// 文言はすべて合成データ（実在の記入・人物は使わない）。

describe("normalizeDeadline", () => {
  it("returns null for an empty value", () => {
    expect(normalizeDeadline(null)).toBeNull();
    expect(normalizeDeadline(undefined)).toBeNull();
    expect(normalizeDeadline("")).toBeNull();
    expect(normalizeDeadline("   ")).toBeNull();
  });

  it("keeps a date and drops the time part", () => {
    expect(normalizeDeadline("2026-12-17")).toBe("2026-12-17");
    expect(normalizeDeadline(" 2026-12-17 ")).toBe("2026-12-17");
    expect(normalizeDeadline("2026-12-17T00:00:00+00:00")).toBe("2026-12-17");
    expect(normalizeDeadline("2026-12-17 09:00:00")).toBe("2026-12-17");
  });

  it("returns undefined for a value that is not a date", () => {
    expect(normalizeDeadline("12/17")).toBeUndefined();
    expect(normalizeDeadline("2026-13-01")).toBeUndefined();
    expect(normalizeDeadline("2026-12-32")).toBeUndefined();
    expect(normalizeDeadline("来週")).toBeUndefined();
    expect(normalizeDeadline(20261217)).toBeUndefined();
  });
});

describe("toMissionSnapshot / sameMissionText", () => {
  it("trims, unifies line breaks and turns empty values into null", () => {
    expect(toMissionSnapshot({ title: "  問い  ", purpose: "1行目\r\n2行目\r\n", deadline: "2026-12-17" })).toEqual({
      title: "問い",
      purpose: "1行目\n2行目",
      deadline: "2026-12-17",
    });
    expect(toMissionSnapshot({ title: "問い", purpose: "  ", deadline: "" })).toEqual({
      title: "問い",
      purpose: null,
      deadline: null,
    });
    expect(toMissionSnapshot({ title: null, purpose: undefined, deadline: undefined })).toEqual({
      title: "",
      purpose: null,
      deadline: null,
    });
  });

  it("compares the three fields", () => {
    const a: MissionTextSnapshot = { title: "問い", purpose: "文", deadline: "2026-12-17" };
    expect(sameMissionText(a, { ...a })).toBe(true);
    expect(sameMissionText(a, { ...a, title: "問い2" })).toBe(false);
    expect(sameMissionText(a, { ...a, purpose: null })).toBe(false);
    expect(sameMissionText(a, { ...a, deadline: null })).toBe(false);
  });
});

describe("isClosedMissionStatus", () => {
  it("is true only for a closed mission", () => {
    expect(isClosedMissionStatus("完了")).toBe(true);
    expect(isClosedMissionStatus("completed")).toBe(true);
    expect(isClosedMissionStatus("進行中")).toBe(false);
    expect(isClosedMissionStatus("未着手")).toBe(false);
    expect(isClosedMissionStatus("保留")).toBe(false);
    expect(isClosedMissionStatus(null)).toBe(false);
    expect(isClosedMissionStatus(undefined)).toBe(false);
    expect(isClosedMissionStatus("")).toBe(false);
  });
});

describe("decideMissionEdit", () => {
  const purpose = composeIssuePurpose("こうなっているはず", "来週までに確かめる");
  const current = { title: "だれの、どんな問題を解くのか", purpose, deadline: "2026-12-17" };
  const base = { actor: "participant" as const, ownerMatches: true, status: "進行中", current };

  it("lets the owner fix a typo and keeps the text from before the edit", () => {
    const fixed = composeIssuePurpose("こうなっているはずだ", "来週までに確かめる");
    const d = decideMissionEdit({ ...base, submitted: { title: current.title, purpose: fixed, deadline: "2026-12-17" } });
    expect(d.action).toBe("write");
    if (d.action !== "write") return;
    expect(d.before).toEqual({ title: current.title, purpose, deadline: "2026-12-17" });
    expect(d.after).toEqual({ title: current.title, purpose: fixed, deadline: "2026-12-17" });
    expect(d.update).toEqual({ title: current.title, purpose: fixed, deadline: "2026-12-17" });
  });

  it("refuses a participant who does not own the mission", () => {
    const d = decideMissionEdit({ ...base, ownerMatches: false, submitted: { title: "別の題", purpose } });
    expect(d).toEqual({ action: "reject", status: 403, error: "Forbidden" });
  });

  it("refuses a participant who tries to rewrite a closed mission", () => {
    for (const status of ["完了", "completed"]) {
      const d = decideMissionEdit({ ...base, status, submitted: { title: "別の題", purpose } });
      expect(d).toEqual({ action: "reject", status: 409, error: "Closed mission cannot be edited" });
    }
  });

  it("still lets a manager edit a closed mission, as before", () => {
    const d = decideMissionEdit({
      actor: "manager",
      ownerMatches: true,
      status: "完了",
      current,
      submitted: { title: "別の題", purpose, deadline: "2026-12-17" },
    });
    expect(d.action).toBe("write");
  });

  it("does not check ownership for a manager", () => {
    const d = decideMissionEdit({
      actor: "manager",
      ownerMatches: false,
      status: "進行中",
      current,
      submitted: { title: "別の題" },
    });
    expect(d.action).toBe("write");
  });

  it("requires a title", () => {
    expect(decideMissionEdit({ ...base, submitted: { title: "", purpose } })).toEqual({
      action: "reject",
      status: 400,
      error: "title required",
    });
    expect(decideMissionEdit({ ...base, submitted: { title: "   ", purpose } })).toMatchObject({ status: 400 });
  });

  it("refuses a deadline that is not a date", () => {
    expect(decideMissionEdit({ ...base, submitted: { title: current.title, deadline: "12/17" } })).toEqual({
      action: "reject",
      status: 400,
      error: "Invalid deadline",
    });
  });

  it("writes nothing when the text did not change", () => {
    const d = decideMissionEdit({
      ...base,
      submitted: { title: `  ${current.title} `, purpose: `${purpose}\r\n`, deadline: "2026-12-17" },
    });
    expect(d).toEqual({ action: "noop", current: { title: current.title, purpose, deadline: "2026-12-17" } });
  });

  it("leaves a field alone when it was not sent", () => {
    // 上司の画面が題だけを送ってきたとき、背景・目的と期限は書き換えない。
    const d = decideMissionEdit({ ...base, actor: "manager", submitted: { title: "題だけ直す" } });
    expect(d.action).toBe("write");
    if (d.action !== "write") return;
    expect(d.update).toEqual({ title: "題だけ直す" });
    expect(d.after).toEqual({ title: "題だけ直す", purpose, deadline: "2026-12-17" });
  });

  it("clears the deadline or the purpose when an empty value is sent", () => {
    const d = decideMissionEdit({ ...base, submitted: { title: current.title, purpose: "", deadline: "" } });
    expect(d.action).toBe("write");
    if (d.action !== "write") return;
    expect(d.after).toEqual({ title: current.title, purpose: null, deadline: null });
    // updateMissionFields は、空文字の期限を null にして書く。
    expect(d.update).toEqual({ title: current.title, purpose: "", deadline: "" });
    expect(d.before.deadline).toBe("2026-12-17");
  });

  it("reads the stored values even when they are empty", () => {
    const d = decideMissionEdit({
      ...base,
      current: { title: "題", purpose: null, deadline: null },
      submitted: { title: "題", purpose: "新しい文", deadline: "2026-12-17" },
    });
    expect(d.action).toBe("write");
    if (d.action !== "write") return;
    expect(d.before).toEqual({ title: "題", purpose: null, deadline: null });
  });
});

describe("buildMissionEditViews", () => {
  const p1 = composeIssuePurpose("仮説その1", "計画その1");
  const p2 = composeIssuePurpose("仮説その2", "計画その1");
  const current: MissionTextSnapshot = { title: "題その2", purpose: p2, deadline: "2026-12-24" };
  const records: MissionEditRecord[] = [
    // 新しいほう：題と期限を直した（直す前は「題その1」「12/17」）。
    {
      id: "e2",
      editedAt: "2026-11-23T01:00:00+00:00",
      editedBy: "participant",
      before: { title: "題その1", purpose: p2, deadline: "2026-12-17" },
    },
    // 古いほう：仮説を直した（直す前は「仮説その1」）。
    {
      id: "e1",
      editedAt: "2026-11-22T09:00:00+00:00",
      editedBy: "manager",
      before: { title: "題その1", purpose: p1, deadline: "2026-12-17" },
    },
  ];

  it("shows, for each edit, only the fields that changed, with the text from before", () => {
    expect(buildMissionEditViews(current, records)).toEqual([
      {
        id: "e2",
        editedAt: "2026-11-23T01:00:00+00:00",
        editedBy: "participant",
        changes: [
          { field: "title", before: "題その1" },
          { field: "deadline", before: "2026-12-17" },
        ],
      },
      {
        id: "e1",
        editedAt: "2026-11-22T09:00:00+00:00",
        editedBy: "manager",
        changes: [{ field: "hypothesis", before: "仮説その1" }],
      },
    ]);
  });

  it("puts the newest edit first whatever order the records come in", () => {
    const views = buildMissionEditViews(current, [...records].reverse());
    expect(views.map((v) => v.id)).toEqual(["e2", "e1"]);
    expect(views[1].changes).toEqual([{ field: "hypothesis", before: "仮説その1" }]);
  });

  it("returns an empty list when there is nothing to show", () => {
    expect(buildMissionEditViews(current, [])).toEqual([]);
    expect(buildMissionEditViews(current, null)).toEqual([]);
    expect(buildMissionEditViews(current, undefined)).toEqual([]);
  });

  it("skips a record that has no visible difference", () => {
    // 見出しと本文のあいだの空行の数だけが違う記録（見える違いは無い）。
    const sameButSpacing: MissionEditRecord = {
      id: "e3",
      editedAt: "2026-11-24T00:00:00+00:00",
      editedBy: "participant",
      before: { title: "題その2", purpose: p2.replace("【仮説】\n", "【仮説】\n\n"), deadline: "2026-12-24" },
    };
    const views = buildMissionEditViews(current, [sameButSpacing, ...records]);
    expect(views.map((v) => v.id)).toEqual(["e2", "e1"]);
  });

  it("treats a text without headings as one field, and shows an added or removed field as empty", () => {
    const now: MissionTextSnapshot = { title: "題", purpose: composeIssuePurpose("仮説", "計画"), deadline: null };
    const views = buildMissionEditViews(now, [
      {
        id: "e1",
        editedAt: "2026-11-22T09:00:00+00:00",
        editedBy: "participant",
        // 直す前は、見出しのない文（従来の登録）で、期限があった。
        before: { title: "題", purpose: "従来の背景・目的", deadline: "2026-12-17" },
      },
    ]);
    expect(views).toHaveLength(1);
    expect(views[0].changes).toEqual([
      { field: "hypothesis", before: null },
      { field: "plan", before: "従来の背景・目的" },
      { field: "deadline", before: "2026-12-17" },
    ]);
  });
});

describe("formatJstDateTime", () => {
  it("formats in Japan time whatever the time zone of the device", () => {
    expect(formatJstDateTime("2026-11-22T08:50:00+00:00")).toBe("11/22 17:50");
    expect(formatJstDateTime("2026-11-22T08:05:00Z")).toBe("11/22 17:05");
    // 日本時間では、日付が変わる。
    expect(formatJstDateTime("2026-11-22T15:30:00Z")).toBe("11/23 0:30");
    expect(formatJstDateTime("2026-12-31T16:00:00Z")).toBe("1/1 1:00");
  });

  it("returns null for a value that cannot be read", () => {
    expect(formatJstDateTime("")).toBeNull();
    expect(formatJstDateTime("きのう")).toBeNull();
    expect(formatJstDateTime(null)).toBeNull();
    expect(formatJstDateTime(undefined)).toBeNull();
  });
});

describe("formatDeadlineDate / fillTemplate / stripRequiredMark", () => {
  it("formats a deadline without going through Date", () => {
    expect(formatDeadlineDate("2026-12-17")).toBe("2026/12/17");
    expect(formatDeadlineDate("2026-01-05")).toBe("2026/1/5");
    expect(formatDeadlineDate("")).toBeNull();
    expect(formatDeadlineDate(null)).toBeNull();
    expect(formatDeadlineDate("来週")).toBeNull();
  });

  it("fills the count and the time into a template", () => {
    expect(fillTemplate("直した履歴（{n}件）", "n", 2)).toBe("直した履歴（2件）");
    expect(fillTemplate("{t} に直す前の文", "t", "11/22 17:50")).toBe("11/22 17:50 に直す前の文");
  });

  it("removes the required mark from a field label", () => {
    expect(stripRequiredMark("イシュー（解くべき問い） *")).toBe("イシュー（解くべき問い）");
    expect(stripRequiredMark("目指す状態と、これからの行動")).toBe("目指す状態と、これからの行動");
  });

  it("returns a bounded list size", () => {
    expect(MISSION_EDIT_LIST_MAX).toBeGreaterThan(0);
    expect(MISSION_EDIT_LIST_MAX).toBeLessThanOrEqual(100);
  });
});
