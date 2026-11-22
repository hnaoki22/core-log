import { describe, it, expect } from "vitest";
import {
  COACHING_TERMS,
  HEADLINE_MAX,
  TENDENCY_MAX_ITEMS,
  buildReminderPersonal,
  confirmBlocker,
  isUsableProfile,
  mergeTendencyChoices,
  normalizeOneLine,
  normalizeProfileFields,
  normalizeProfileText,
  normalizeTendencies,
  personalEveningQuestion,
  sameFields,
  snapshotForHistory,
  toCardData,
  withPersonalEveningQuestion,
  type CoachingProfile,
} from "./coaching-profile";

// テストの文は合成データ（実在の環境・人物の記述は使わない）。
function profile(over: Partial<CoachingProfile> = {}): CoachingProfile {
  return {
    headline: "朝の打合せで、最初に相手の困りごとを一つ聞く",
    growthTheme: "相手の話を聞く前に、自分の案を話してしまう。",
    actions: "毎週火曜の打合せで、最初の5分は質問だけにする。",
    expected: "相手から、こちらの知らなかった事実が一つ出る。",
    stallPoints: "時間が押しているとき。",
    eveningQuestion: "",
    tendencies: [],
    status: "confirmed",
    confirmedAt: "2026-01-05T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
    ...over,
  };
}

describe("normalize", () => {
  it("前後の空白と制御文字を落とし、上限で切る", () => {
    expect(normalizeProfileText("  あ\u0000い\n う  ", 10)).toBe("あい\n う");
    expect(normalizeProfileText("あいうえお", 3)).toBe("あいう");
    expect(normalizeProfileText(123, 10)).toBe("");
  });

  it("1 行の文は、改行を空白にまとめる", () => {
    expect(normalizeOneLine("朝の\n\n打合せ", 20)).toBe("朝の 打合せ");
    expect(normalizeOneLine("あ".repeat(HEADLINE_MAX + 5), HEADLINE_MAX)).toHaveLength(HEADLINE_MAX);
  });

  it("傾向は、文のあるものだけを上限まで取り、use は true/false/null にそろえる", () => {
    const many = Array.from({ length: TENDENCY_MAX_ITEMS + 3 }, (_, i) => ({ text: `傾向${i}`, use: "yes" }));
    const out = normalizeTendencies([{ text: " ", use: true }, { text: "抽象的な言葉で終わる", use: true }, 5, ...many]);
    expect(out[0]).toEqual({ text: "抽象的な言葉で終わる", use: true });
    expect(out[1]).toEqual({ text: "傾向0", use: null });
    expect(out).toHaveLength(TENDENCY_MAX_ITEMS);
    expect(normalizeTendencies("x")).toEqual([]);
  });

  it("欄をそろえて取り出し、知らない欄は捨てる", () => {
    const f = normalizeProfileFields({ headline: " 一文 ", actions: "行動", status: "confirmed", extra: 1 });
    expect(f).toEqual({
      headline: "一文",
      growthTheme: "",
      actions: "行動",
      expected: "",
      stallPoints: "",
      eveningQuestion: "",
      tendencies: [],
    });
    expect(normalizeProfileFields(null).headline).toBe("");
  });
});

describe("mergeTendencyChoices", () => {
  const stored = [
    { text: "抽象的な言葉で終わる", use: null },
    { text: "一次情報を取りに行かない", use: true },
  ];

  it("本人の送信からは選択だけを取り、文は保存済みのものを使う", () => {
    const merged = mergeTendencyChoices(stored, [
      { text: "抽象的な言葉で終わる", use: false },
      { text: "書き換えた文", use: false },
      { text: "足した項目", use: true },
    ]);
    expect(merged).toEqual([
      { text: "抽象的な言葉で終わる", use: false },
      { text: "一次情報を取りに行かない", use: true },
    ]);
  });

  it("送信が短いときは、残りを保存済みのまま返す", () => {
    expect(mergeTendencyChoices(stored, [])).toEqual(stored);
  });
});

describe("確定と、使ってよい設計図", () => {
  it("毎朝の一文が空だと確定できない", () => {
    expect(confirmBlocker(normalizeProfileFields({ headline: "" }))).toBe(COACHING_TERMS.headlineRequired);
    expect(confirmBlocker(normalizeProfileFields({ headline: "一文" }))).toBeNull();
  });

  it("確認済みで、毎朝の一文があるものだけを使う", () => {
    expect(isUsableProfile(profile())).toBe(true);
    expect(isUsableProfile(profile({ status: "draft" }))).toBe(false);
    expect(isUsableProfile(profile({ headline: "" }))).toBe(false);
    expect(isUsableProfile(null)).toBe(false);
  });
});

describe("夕方の「あなたの問い」", () => {
  it("本人が決めた問いがあれば、それを使う", () => {
    expect(personalEveningQuestion(profile({ eveningQuestion: "今日、最初に質問しましたか。" }))).toBe(
      "今日、最初に質問しましたか。"
    );
  });

  it("無ければ、毎朝の一文を入れた問いになる", () => {
    const q = personalEveningQuestion(profile());
    expect(q).toContain("「朝の打合せで、最初に相手の困りごとを一つ聞く」");
    expect(q).toContain("いつ、誰に、何をしましたか。");
  });

  it("確認前の設計図からは作らない", () => {
    expect(personalEveningQuestion(profile({ status: "draft" }))).toBeNull();
  });

  it("全員共通の問いの後ろに 1 つ足す。共通の問いが無い日・確認前の人には足さない", () => {
    const common = ["今日は何をしましたか。", "次に何を変えますか。"];
    const added = withPersonalEveningQuestion(common, profile());
    expect(added.questions).toHaveLength(3);
    expect(added.questions.slice(0, 2)).toEqual(common);
    expect(added.personalCount).toBe(1);

    expect(withPersonalEveningQuestion([], profile())).toEqual({ questions: [], personalCount: 0 });
    expect(withPersonalEveningQuestion(common, profile({ status: "draft" }))).toEqual({
      questions: common,
      personalCount: 0,
    });
    expect(withPersonalEveningQuestion(common, null)).toEqual({ questions: common, personalCount: 0 });
  });
});

describe("入力画面の枠に渡す値", () => {
  it("確認済みのときだけ、本人の文を渡す", () => {
    expect(toCardData(null).state).toBe("none");
    const draft = toCardData(profile({ status: "draft" }));
    expect(draft).toEqual({ state: "draft", headline: "", growthTheme: "", actions: "" });
    const ok = toCardData(profile());
    expect(ok.state).toBe("confirmed");
    expect(ok.headline).toBe("朝の打合せで、最初に相手の困りごとを一つ聞く");
  });
});

describe("リマインドメールの、その人の分", () => {
  const URL = "https://example.test/p/tok_synthetic/blueprint";
  const issue = { label: "イシュー", title: "なぜ打合せが長引くのか", hypothesisLabel: "仮説", hypothesis: "論点を先に出していないため" };

  it("朝・確認済み：イシュー、仮説、毎朝の一文を載せる", () => {
    const p = buildReminderPersonal({ type: "morning", profile: profile(), issue, profileUrl: URL });
    expect(p.lines).toEqual([
      { label: "イシュー", value: "なぜ打合せが長引くのか" },
      { label: "仮説", value: "論点を先に出していないため" },
      { label: "毎朝の一文", value: "朝の打合せで、最初に相手の困りごとを一つ聞く" },
    ]);
    expect(p.confirmPrompt).toBe(false);
    expect(p.personalQuestion).toBeNull();
  });

  it("朝・確認済みでイシューが無いとき：毎朝の一文だけ", () => {
    const p = buildReminderPersonal({ type: "morning", profile: profile(), issue: null, profileUrl: URL });
    expect(p.lines).toEqual([{ label: "毎朝の一文", value: "朝の打合せで、最初に相手の困りごとを一つ聞く" }]);
  });

  it("朝・確認前や未作成：本人の文は載せず、確認のお願いだけ", () => {
    for (const prof of [profile({ status: "draft" }), null]) {
      const p = buildReminderPersonal({ type: "morning", profile: prof, issue, profileUrl: URL });
      expect(p.lines).toEqual([]);
      expect(p.confirmPrompt).toBe(true);
      expect(p.profileUrl).toBe(URL);
    }
  });

  it("夕方：確認済みの人にだけ「あなたの問い」。確認のお願いは載せない", () => {
    const ok = buildReminderPersonal({ type: "evening", profile: profile(), issue, profileUrl: URL });
    expect(ok.personalQuestion).toContain("いつ、誰に、何をしましたか。");
    expect(ok.lines).toEqual([]);
    const draft = buildReminderPersonal({
      type: "evening_no_morning",
      profile: profile({ status: "draft" }),
      issue,
      profileUrl: URL,
    });
    expect(draft).toEqual({ lines: [], personalQuestion: null, confirmPrompt: false, profileUrl: URL });
  });
});

describe("履歴", () => {
  it("直す前の内容を、日付つきで写す", () => {
    const p = profile({ tendencies: [{ text: "抽象的な言葉で終わる", use: true }] });
    const snap = snapshotForHistory(p, "2026-01-06T00:00:00.000Z");
    expect(snap.at).toBe("2026-01-06T00:00:00.000Z");
    expect(snap.headline).toBe(p.headline);
    expect(snap.tendencies).toEqual(p.tendencies);
    expect(snap.tendencies).not.toBe(p.tendencies);
  });

  it("中身が同じなら同じと判定する", () => {
    expect(sameFields(profile(), profile())).toBe(true);
    expect(sameFields(profile(), profile({ actions: "別の行動" }))).toBe(false);
    expect(sameFields(profile({ tendencies: [{ text: "a", use: null }] }), profile({ tendencies: [{ text: "a", use: true }] }))).toBe(false);
  });
});
