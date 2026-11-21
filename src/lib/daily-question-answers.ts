// 「朝・夕の問い」（feature.dailyQuestions）の答えを、既存の保存欄
// （logs.morning_intent / logs.evening_insight ＝ 1 本の文字列）にまとめるための純関数。
//
// 画面（components/features/DailyQuestionsBlock.tsx）と分けてあるのは、
// このリポのテストが Node 環境（DOM なし）で動くため。まとめ方の規則はここでテストする。
//
// まとめた形（人にも AI にも読める形のまま保存する）:
//   Q1: 問い
//   A1: 答え
//
//   Q2: 問い
//   A2: 答え

/**
 * 問いの数に合わせて、答えの配列をそろえる。
 * 足りない分は空文字で埋め、問いの数を超える分は捨てる。文字列以外は空文字にする。
 */
export function normalizeAnswers(
  questions: readonly string[],
  answers: readonly unknown[] | null | undefined
): string[] {
  return questions.map((_, i) => {
    const a = answers?.[i];
    return typeof a === "string" ? a : "";
  });
}

/** 1 つでも答えが書かれているか。空白や改行だけの欄は「未記入」として扱う。 */
export function hasAnyAnswer(answers: readonly unknown[] | null | undefined): boolean {
  if (!answers) return false;
  return answers.some((a) => typeof a === "string" && a.trim().length > 0);
}

/**
 * 問いと答えを 1 本の文字列にまとめる。
 *
 * どの問いにも答えが無いときは空文字を返す。問いの文だけの文字列を返すと、
 * 入力画面の「未記入なら次へ進めない」判定（!!morning / !!evening）をすり抜け、
 * いったん入力して消しただけで、答えの無い記入を保存できてしまうため。
 *
 * 一部の問いだけに答えた場合は、答えていない問いも「A2: 」の形で残す
 * （どの問いに答えなかったかが、あとから読んで分かるようにする）。
 */
export function combineQuestionAnswers(
  questions: readonly string[],
  answers: readonly unknown[] | null | undefined
): string {
  const slots = normalizeAnswers(questions, answers);
  if (!hasAnyAnswer(slots)) return "";
  return questions
    .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${slots[i].trim()}`)
    .join("\n\n");
}
