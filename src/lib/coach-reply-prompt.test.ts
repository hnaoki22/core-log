import { describe, it, expect } from "vitest";
import {
  COACH_HOLD_MARKER,
  COACH_INPUT_FIELD_MAX,
  COACH_REPLY_MAX_CHARS,
  DEFAULT_COACH_SYSTEM_PROMPT,
  buildCoachUserPrompt,
  coachInputsUsed,
  hasCrisisPhrase,
  interpretCoachOutput,
  lastParagraph,
  statusForNewReply,
} from "./coach-reply-prompt";
import type { CoachDayLog } from "./coach-reply";
import type { CoachingProfile } from "./coaching-profile";

// テストの文は合成データ（実在の記入・実在の人物の記述は使わない）。
const profile: CoachingProfile = {
  headline: "会議の前に、相手に聞く問いを1つ決める",
  growthTheme: "自分の答えを先に言ってしまう",
  actions: "週次の会議で、最初に相手の見方を聞く",
  expected: "相手から、知らなかった事実が出る",
  stallPoints: "時間が足りないとき",
  eveningQuestion: "今日、相手の見方を先に聞けた場面はどこでしたか。",
  tendencies: [
    { text: "抽象的な言葉で終わる", use: true },
    { text: "行動が遅い", use: false },
    { text: "一般論で終わる", use: null },
  ],
  status: "confirmed",
  confirmedAt: "2026-01-05T00:00:00.000Z",
  updatedAt: "2026-01-05T00:00:00.000Z",
};

const log: CoachDayLog = {
  id: "log-1",
  date: "2026-01-06",
  morningIntent: "Q1: 今日は、どの場面で、何をしますか。\nA1: 週次の会議で、最初に見方を聞く",
  eveningInsight: "Q1: 何をして、何が起きましたか。\nA1: 最初に聞いたら「在庫の数字が合わない」と言われた",
  phaseMode: "dojo",
};

describe("hasCrisisPhrase", () => {
  it("自分を傷つけることをはっきり書いた言い方を見つける（空白や改行をはさんでも）", () => {
    expect(hasCrisisPhrase("もう消えたいと思った")).toBe(true);
    expect(hasCrisisPhrase("死に\nたい")).toBe(true);
    expect(hasCrisisPhrase("自 殺という言葉が浮かんだ")).toBe(true);
  });

  it("仕事の文によく出る語では、止めない", () => {
    for (const text of [
      "時間の限界まで粘った",
      "今日はつらい調整が続いた",
      "締め切りの前で眠れない日が続く",
      "在庫が消えた原因を確かめた",
      "必死に資料を直した",
    ]) {
      expect(hasCrisisPhrase(text)).toBe(false);
    }
  });
});

describe("buildCoachUserPrompt", () => {
  const input = {
    log,
    profile,
    issue: { title: "会議で決まったことが実行されないのはなぜか", hypothesis: "決めた理由が伝わっていないから" },
    previousQuestion: "あした、誰に、何を聞きますか。",
  };

  it("その日の記入、確認済みの設計図、イシューと仮説、前回の問いを入れる", () => {
    const prompt = buildCoachUserPrompt(input);
    expect(prompt).toContain("# 今日の記入（2026-01-06）");
    expect(prompt).toContain("最初に聞いたら「在庫の数字が合わない」と言われた");
    expect(prompt).toContain("毎朝の一文：\n会議の前に、相手に聞く問いを1つ決める");
    expect(prompt).toContain("成長課題：\n自分の答えを先に言ってしまう");
    expect(prompt).toContain("イシュー：会議で決まったことが実行されないのはなぜか");
    expect(prompt).toContain("仮説：決めた理由が伝わっていないから");
    expect(prompt).toContain("# 前回の問い\nあした、誰に、何を聞きますか。");
  });

  it("傾向は、本人が「使う」と選んだものだけを入れる", () => {
    const prompt = buildCoachUserPrompt(input);
    expect(prompt).toContain("・抽象的な言葉で終わる");
    expect(prompt).not.toContain("行動が遅い");
    expect(prompt).not.toContain("一般論で終わる");
  });

  it("無いものは、見出しごと入れない", () => {
    const prompt = buildCoachUserPrompt({
      log: { ...log, morningIntent: "" },
      profile: { ...profile, expected: "", stallPoints: "", eveningQuestion: "", tendencies: [] },
      issue: null,
      previousQuestion: null,
    });
    expect(prompt).toContain("## 朝\n（記入なし）");
    expect(prompt).not.toContain("期待する結果と、確かめ方");
    expect(prompt).not.toContain("本人が「使う」と選んだ傾向");
    expect(prompt).not.toContain("# いま取り組んでいるイシュー");
    expect(prompt).not.toContain("# 前回の問い");
  });

  it("長い欄は、上限で切る", () => {
    const long = "あ".repeat(COACH_INPUT_FIELD_MAX + 50);
    const prompt = buildCoachUserPrompt({ ...input, log: { ...log, eveningInsight: long } });
    expect(prompt).toContain("あ".repeat(COACH_INPUT_FIELD_MAX));
    expect(prompt).not.toContain("あ".repeat(COACH_INPUT_FIELD_MAX + 1));
  });

  it("送った項目の種類を返す", () => {
    expect(coachInputsUsed(input)).toEqual([
      "morning_entry",
      "evening_entry",
      "blueprint",
      "tendencies_in_use",
      "issue",
      "hypothesis",
      "previous_question",
    ]);
    expect(
      coachInputsUsed({
        log: { ...log, morningIntent: " " },
        profile: { ...profile, tendencies: [] },
        issue: null,
        previousQuestion: null,
      })
    ).toEqual(["evening_entry", "blueprint"]);
  });
});

describe("interpretCoachOutput", () => {
  it("ふつうの出力は、返信として読む（改行をそろえる）", () => {
    const out = interpretCoachOutput("  一段落目。\r\n\r\n\r\n\r\n二段落目ですか。\n\n三段落目ですか。 ");
    expect(out).toEqual({ kind: "reply", text: "一段落目。\n\n二段落目ですか。\n\n三段落目ですか。" });
  });

  it("返信を作らない合図があれば、確認待ちにする（前後に文があっても）", () => {
    expect(interpretCoachOutput(COACH_HOLD_MARKER)).toEqual({ kind: "hold" });
    expect(interpretCoachOutput(`念のため。\n${COACH_HOLD_MARKER}`)).toEqual({ kind: "hold" });
  });

  it("空の出力と、長すぎる出力は、返信として扱わない", () => {
    expect(interpretCoachOutput(" \n ")).toEqual({ kind: "invalid", reason: "empty" });
    expect(interpretCoachOutput("あ".repeat(COACH_REPLY_MAX_CHARS + 1))).toEqual({ kind: "invalid", reason: "too_long" });
    expect(interpretCoachOutput("あ".repeat(COACH_REPLY_MAX_CHARS)).kind).toBe("reply");
  });
});

describe("lastParagraph", () => {
  it("最後の段落を返す", () => {
    expect(lastParagraph("一段落目。\n\n二段落目ですか。\n\nあした、誰に聞きますか。")).toBe("あした、誰に聞きますか。");
    expect(lastParagraph("一段落だけ。")).toBe("一段落だけ。");
  });

  it("文が無いときは null", () => {
    expect(lastParagraph(" \n\n ")).toBeNull();
  });
});

describe("statusForNewReply", () => {
  const reply = { kind: "reply", text: "問いです。" } as const;

  it("返信は、設定が auto のときだけ、すぐ届ける", () => {
    expect(statusForNewReply(reply, { deliveryMode: "auto", startDate: null })).toBe("delivered");
    expect(statusForNewReply(reply, { deliveryMode: "review", startDate: null })).toBe("pending_review");
  });

  it("返信を作らない場合は、設定が auto でも確認待ち", () => {
    expect(statusForNewReply({ kind: "hold" }, { deliveryMode: "auto", startDate: null })).toBe("pending_review");
  });

  it("使えない出力は、保存しない", () => {
    expect(statusForNewReply({ kind: "invalid", reason: "empty" }, { deliveryMode: "auto", startDate: null })).toBeNull();
  });
});

describe("DEFAULT_COACH_SYSTEM_PROMPT", () => {
  it("返信を作らない合図と、3つの段落の形を指示している", () => {
    expect(DEFAULT_COACH_SYSTEM_PROMPT).toContain(COACH_HOLD_MARKER);
    expect(DEFAULT_COACH_SYSTEM_PROMPT).toContain("3つの段落だけで書く");
    expect(DEFAULT_COACH_SYSTEM_PROMPT).toContain("300〜400字");
  });

  it("評価・助言・記入にない事実・本の引用を、してはいけないこととして書いている", () => {
    for (const line of ["評価しない", "答え、助言、解決策を出さない", "記入にない事実を作らない", "本の文を引かない"]) {
      expect(DEFAULT_COACH_SYSTEM_PROMPT).toContain(line);
    }
  });
});
