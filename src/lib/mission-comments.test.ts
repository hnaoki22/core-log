import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import { formatCommentTime, missionCommentsUrl } from "./mission-comments";

describe("missionCommentsUrl", () => {
  it("adds the mission id and the token, which the entry point requires", () => {
    expect(missionCommentsUrl("mission-1", "tok-1")).toBe("/api/mission/comments?missionId=mission-1&token=tok-1");
  });

  it("encodes both values", () => {
    expect(missionCommentsUrl("a b&c", "t/o?k=1")).toBe("/api/mission/comments?missionId=a%20b%26c&token=t%2Fo%3Fk%3D1");
  });
});

describe("formatCommentTime", () => {
  it("shows Japan time whatever the time zone of the device", () => {
    // 日本時間の 10:00。端末が日本時間でも、19:00 にはならない。
    expect(formatCommentTime("2026-11-22T01:00:00+00:00")).toBe("11/22 10:00");
    expect(formatCommentTime("2026-11-22T15:05:00Z")).toBe("11/23 0:05");
  });

  it("returns an empty string for a value that cannot be read", () => {
    expect(formatCommentTime("")).toBe("");
    expect(formatCommentTime(null)).toBe("");
    expect(formatCommentTime(undefined)).toBe("");
    expect(formatCommentTime("きのう")).toBe("");
  });
});

// 画面の側の取り違えを防ぐための確認（この環境のテストは DOM なしで、通信の中身までは確かめられない）。
// コメントを読む入口はトークンが必須なので、画面は、必ず missionCommentsUrl で呼び先を作る。
describe("screens that read mission comments", () => {
  const SCREENS = [
    "src/app/p/[token]/mission/page.tsx",
    "src/app/m/[token]/[participantId]/MissionManager.tsx",
  ];

  for (const file of SCREENS) {
    it(`${file} builds the request with the token`, () => {
      const source = fs.readFileSync(path.resolve(__dirname, "../..", file), "utf-8");
      // トークンを付けない呼び方（URL を直接書く形）が残っていない。
      expect(source).not.toMatch(/\/api\/mission\/comments\?missionId=/);
      expect(source).toContain("missionCommentsUrl(");
      // 日時は、共通の関数で出す（端末の時間帯の時刻を読む書き方を、画面に置かない）。
      expect(source).toContain('import { formatCommentTime, missionCommentsUrl } from "@/lib/mission-comments";');
      expect(source).not.toMatch(/const formatCommentTime\s*=/);
    });
  }
});
