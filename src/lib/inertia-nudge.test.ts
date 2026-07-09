import { describe, it, expect } from "vitest";
import {
  computeInertiaNudge,
  textSimilarity,
  normalizedText,
  median,
  INERTIA_MESSAGE,
} from "./inertia-nudge";
import type { NotionLogEntry } from "./supabase";

// 検知に使うフィールドだけ意味を持たせ、他は妥当な既定で埋める
function mkLog(p: Partial<NotionLogEntry> & { date: string }): NotionLogEntry {
  return {
    id: `id-${p.date}`,
    datetime: `${p.date}T09:00:00Z`,
    dayOfWeek: "月",
    dayNum: 1,
    participantName: "テスト",
    morningIntent: "落ち着いて人の話を聴く",
    eveningInsight: null,
    energy: "good",
    eveningEnergy: null,
    morningCondition: null,
    eveningCondition: null,
    morningConditionGauges: { sleep: { raw: 2, normalized: 33 }, fatigue: { raw: 3, normalized: 67 }, clarity: { raw: 1, normalized: 0 } },
    eveningConditionGauges: null,
    morningAction: "午後の1on1で最後まで聴く",
    eveningState: null,
    carriedOver: null,
    logformVersion: 2,
    status: "morning_only",
    hasFeedback: false,
    hmFeedback: null,
    managerComment: null,
    managerCommentTime: null,
    managerReaction: null,
    morningTime: null,
    eveningTime: null,
    morningDurationSec: 20,
    eveningDurationSec: null,
    dojoPhase: "守",
    weekNum: 1,
    ...p,
  };
}

const TODAY = "2026-07-10";
// 直近3日（連続）+ ベースライン5日。既定は「全項目一致・所要時間が短い」状態。
function baselineDays(durationSec = 125): NotionLogEntry[] {
  return ["2026-07-06", "2026-07-05", "2026-07-04", "2026-07-03", "2026-07-02"].map((d) =>
    mkLog({ date: d, morningIntent: `色々あった日 ${d}`, morningAction: `やったこと ${d}`, morningDurationSec: durationSec })
  );
}
function recentIdentical(durationSec = 20): NotionLogEntry[] {
  return ["2026-07-09", "2026-07-08", "2026-07-07"].map((d) => mkLog({ date: d, morningDurationSec: durationSec }));
}

describe("textSimilarity / normalizedText", () => {
  it("正規化は空白・記号を落とす", () => {
    expect(normalizedText("落ち着いて、 聴く。")).toBe("落ち着いて聴く");
  });
  it("同一文は1、両方空は1、片方空は0", () => {
    expect(textSimilarity("あいうえお", "あいうえお")).toBe(1);
    expect(textSimilarity("", "")).toBe(1);
    expect(textSimilarity("あ", "")).toBe(0);
  });
  it("ほぼ同文は高く、無関係は低い", () => {
    expect(textSimilarity("落ち着いて人の話を聴く", "落ち着いて人の話を聴く。")).toBeGreaterThanOrEqual(0.85);
    expect(textSimilarity("落ち着いて人の話を聴く", "全く違う内容の予定を立てる")).toBeLessThan(0.85);
  });
  it("median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("computeInertiaNudge", () => {
  it("(a)全項目一致 かつ (b)所要時間急短縮 なら発火", () => {
    const logs = [...recentIdentical(20), ...baselineDays(125)];
    const r = computeInertiaNudge(logs, TODAY, false);
    expect(r.show).toBe(true);
    expect(r.message).toBe(INERTIA_MESSAGE);
  });

  it("週1制限にかかっていれば発火しない", () => {
    const logs = [...recentIdentical(20), ...baselineDays(125)];
    expect(computeInertiaNudge(logs, TODAY, true).show).toBe(false);
  });

  it("数値（ゲージ・気分）一致だけでテキストが違えば発火しない", () => {
    const recent = ["2026-07-09", "2026-07-08", "2026-07-07"].map((d, i) =>
      mkLog({ date: d, morningIntent: `別々の意図 その${i}`, morningDurationSec: 20 })
    );
    const logs = [...recent, ...baselineDays(125)];
    expect(computeInertiaNudge(logs, TODAY, false).show).toBe(false);
  });

  it("ゲージが違えば発火しない", () => {
    const recent = recentIdentical(20);
    recent[0] = mkLog({ date: "2026-07-09", morningConditionGauges: { sleep: { raw: 4, normalized: 100 } }, morningDurationSec: 20 });
    const logs = [...recent, ...baselineDays(125)];
    expect(computeInertiaNudge(logs, TODAY, false).show).toBe(false);
  });

  it("所要時間が平常（急短縮でない）なら発火しない", () => {
    const logs = [...recentIdentical(120), ...baselineDays(125)];
    expect(computeInertiaNudge(logs, TODAY, false).show).toBe(false);
  });

  it("ベースラインが5件未満なら発火しない（初期数日の反応性除外）", () => {
    const shortBaseline = ["2026-07-06", "2026-07-05", "2026-07-04"].map((d) =>
      mkLog({ date: d, morningIntent: `x ${d}`, morningDurationSec: 125 })
    );
    const logs = [...recentIdentical(20), ...shortBaseline];
    expect(computeInertiaNudge(logs, TODAY, false).show).toBe(false);
  });

  it("直近3日が暦日連続でなければ発火しない", () => {
    const recent = ["2026-07-09", "2026-07-07", "2026-07-06"].map((d) => mkLog({ date: d, morningDurationSec: 20 }));
    const logs = [...recent, ...baselineDays(125)];
    expect(computeInertiaNudge(logs, TODAY, false).show).toBe(false);
  });

  it("直近3日のいずれかで所要時間が未計測なら発火しない", () => {
    const recent = recentIdentical(20);
    recent[1] = mkLog({ date: "2026-07-08", morningDurationSec: null });
    const logs = [...recent, ...baselineDays(125)];
    expect(computeInertiaNudge(logs, TODAY, false).show).toBe(false);
  });
});
