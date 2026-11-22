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

export type QuestionAnswer = { question: string; answer: string };

/**
 * combineQuestionAnswers でまとめた文字列を、問いと答えの組に戻す。
 * その形でない文字列（自由記入の文など）は null を返す（呼び出し側は元の文のまま扱う）。
 *
 * 保存のときに前後の空白が取られるので、最後の答えが空だと末尾が「A2:」（空白なし）になる。
 * その形も読めるようにしてある。
 */
export function parseQuestionAnswers(text: string | null | undefined): QuestionAnswer[] | null {
  if (typeof text !== "string") return null;
  const s = text.replace(/\r\n?/g, "\n").trim();
  if (!s.startsWith("Q1: ")) return null;

  const out: QuestionAnswer[] = [];
  let pos = 0;
  for (let n = 1; pos < s.length; n++) {
    const questionHead = `Q${n}: `;
    if (!s.startsWith(questionHead, pos)) return null;
    const answerMarker = `\nA${n}:`;
    const answerAt = s.indexOf(answerMarker, pos + questionHead.length);
    if (answerAt === -1) return null;
    const question = s.slice(pos + questionHead.length, answerAt).trim();

    const answerStart = answerAt + answerMarker.length;
    const nextMarker = `\n\nQ${n + 1}: `;
    const nextAt = s.indexOf(nextMarker, answerStart);
    const answer = (nextAt === -1 ? s.slice(answerStart) : s.slice(answerStart, nextAt)).trim();
    out.push({ question, answer });

    if (nextAt === -1) break;
    pos = nextAt + 2; // 空行（"\n\n"）の次、「Q{n+1}: 」の先頭へ
  }
  return out.length > 0 ? out : null;
}

/**
 * 問いと答えの形でまとめた文字列から、答えだけを取り出す（答えが複数なら空行でつなぐ）。
 * 夕方の画面に朝の記入を再掲するときに使う（問いの文を繰り返さず、書いた内容だけを見せる）。
 * その形でない文字列・答えが 1 つも無い文字列は、元の文のまま返す。
 */
export function answersOnly(text: string | null | undefined): string {
  if (typeof text !== "string") return "";
  const pairs = parseQuestionAnswers(text);
  if (!pairs) return text;
  const answers = pairs.map((p) => p.answer).filter((a) => a !== "");
  return answers.length > 0 ? answers.join("\n\n") : text;
}
