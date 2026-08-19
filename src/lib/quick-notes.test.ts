import { describe, it, expect } from "vitest";
import {
  normalizeQuickNoteText,
  groupQuickNotesByDate,
  MAX_QUICK_NOTE_CHARS,
  type QuickNote,
} from "./quick-notes";

describe("途中メモ（ホーム右上「＋」の中身。2026-08-18 太田さん FB）", () => {
  it("前後の空白を落とし、空なら \"\" を返す（保存しない判定に使う）", () => {
    expect(normalizeQuickNoteText("  会議で言い損ねた一言が残っている  ")).toBe("会議で言い損ねた一言が残っている");
    expect(normalizeQuickNoteText("   ")).toBe("");
    expect(normalizeQuickNoteText("")).toBe("");
    expect(normalizeQuickNoteText(null)).toBe("");
    expect(normalizeQuickNoteText(123)).toBe("");
  });

  it("上限文字数で切る（巨大ペーストの保険）", () => {
    const long = "あ".repeat(MAX_QUICK_NOTE_CHARS + 50);
    expect(normalizeQuickNoteText(long)).toHaveLength(MAX_QUICK_NOTE_CHARS);
  });

  it("改行は保持する（複数行のメモも一言として扱う）", () => {
    expect(normalizeQuickNoteText("上\n下")).toBe("上\n下");
  });

  it("日付ごとに束ね、各日の並びは入力順（書いた順）を保つ", () => {
    const notes: QuickNote[] = [
      { id: "1", noteDate: "2026-08-18", text: "a", createdAt: "2026-08-18T01:00:00Z" },
      { id: "2", noteDate: "2026-08-19", text: "b", createdAt: "2026-08-19T02:00:00Z" },
      { id: "3", noteDate: "2026-08-18", text: "c", createdAt: "2026-08-18T05:00:00Z" },
    ];
    const g = groupQuickNotesByDate(notes);
    expect(Object.keys(g).sort()).toEqual(["2026-08-18", "2026-08-19"]);
    expect(g["2026-08-18"].map((n) => n.id)).toEqual(["1", "3"]);
    expect(g["2026-08-19"].map((n) => n.id)).toEqual(["2"]);
  });

  it("空配列は空オブジェクト", () => {
    expect(groupQuickNotesByDate([])).toEqual({});
  });
});
