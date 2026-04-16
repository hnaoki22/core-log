/**
 * 朝の意図・夕方の振り返り入力欄に表示するプレースホルダー例示。
 *
 * 設計思想：
 *  - 書き方の「処方箋」ではなく、参加者が1日を設計するための「問いの構え」を提示する
 *  - グラウンドルール CORE（Compress / Open up / Reframe / Execute first）を軸に、
 *    各道場ステージの課題図書のエッセンスを織り込む
 *  - 道場ステージ別に候補を持ち、対応が未整備のステージは CORE ユニバーサル例示にフォールバック
 *  - 参加者トークン × 日付から決定論的に1つを選択（同じ日は一貫して同じ例、日替わりで変化）
 *
 * 道場1 課題図書：7つの習慣 / コンサル1年目が学ぶこと / リーダーシップの旅
 * 道場2・道場3 以降：未定のため CORE ユニバーサルを利用
 */

export type PlaceholderType = "morning" | "evening";

export type PhaseKey = 1 | 2 | 3 | 4 | 5 | 6 | 7 | "universal";

export type PlaceholderExample = {
  /** 入力欄にプレースホルダーとして表示されるテキスト */
  text: string;
  /** 出典メモ（開発者用、UIには出さない） */
  source: string;
};

type ExampleSet = {
  phase: PhaseKey;
  type: PlaceholderType;
  examples: PlaceholderExample[];
};

/**
 * 例示データ本体。
 * 追加・編集時は設計思想（抽象度・CORE軸・課題図書との紐付け）を守ること。
 */
const EXAMPLES: ExampleSet[] = [
  // ─────────────────────────────────────────
  // 道場1 覚醒
  // 課題図書：7つの習慣 / コンサル1年目が学ぶこと / リーダーシップの旅
  // ─────────────────────────────────────────
  {
    phase: 1,
    type: "morning",
    examples: [
      {
        text: "例：今日の会議で、自分の意見を返す前にまず相手の主張を完全に理解することを試してみる",
        source: "7つの習慣 第5 × O",
      },
      {
        text: "例：着手する前に「このタスク、本当に自分がやる必要があるか」と3秒立ち止まってみる",
        source: "7つの習慣 第3 × C",
      },
      {
        text: "例：今日の打ち合わせで、結論を最初に一文で言い切ってから説明に入る練習をする",
        source: "コンサル1年目 結論から話す × O",
      },
      {
        text: "例：「いつもこうだから」と感じた瞬間に、その理由を自分に問い直してみる",
        source: "リーダーシップの旅 見えないものを見る × R",
      },
      {
        text: "例：今日自分が本当に影響できることと、できないことを書き出してから仕事を始める",
        source: "7つの習慣 第1 影響の輪 × R",
      },
      {
        text: "例：迷っている資料は完成度60%のまま、今日中に上司か同僚の目に通す",
        source: "コンサル1年目 QND × E",
      },
      {
        text: "例：今日の仕事の「終わり」——何が達成できていれば成功か——を先に描いてから動く",
        source: "7つの習慣 第2 × R",
      },
    ],
  },
  {
    phase: 1,
    type: "evening",
    examples: [
      {
        text: "例：今日、「引っかかった」のに空気を読んで飲み込んだ瞬間はなかっただろうか",
        source: "グラウンドルール O",
      },
      {
        text: "例：今日自分が話した内容のうち、どこまでが「事実」でどこからが「自分の解釈」だっただろうか",
        source: "コンサル1年目 事実と意見を分ける × O",
      },
      {
        text: "例：「忙しい」と言いそうになった場面を思い出して、その忙しさは本当に必要だったか振り返る",
        source: "グラウンドルール C",
      },
      {
        text: "例：今日やった業務のうち、「なぜやっているか3秒で説明できるもの」はいくつあっただろうか",
        source: "グラウンドルール R",
      },
      {
        text: "例：60点で出したこと、100点を目指して手元で止めたことを数えてみる",
        source: "コンサル1年目 QND × E",
      },
      {
        text: "例：相手の話を聞く前に、自分の答えを準備していた瞬間はなかっただろうか",
        source: "7つの習慣 第5 × O",
      },
      {
        text: "例：今日起きた想定外の出来事を、「人のせい」ではなく「自分の選択」として説明できるだろうか",
        source: "7つの習慣 第1 主体性 × R",
      },
    ],
  },

  // ─────────────────────────────────────────
  // CORE ユニバーサル（全道場共通・フォールバック先）
  // グラウンドルール CORE の4文字をそのまま行動指針に落とした最小セット
  // ─────────────────────────────────────────
  {
    phase: "universal",
    type: "morning",
    examples: [
      {
        text: "例：今日「忙しい」と言いそうになる場面を1つ予測し、そのとき「この忙しさは本当に必要か」と立ち止まる",
        source: "Compress",
      },
      {
        text: "例：今日、空気を読んで飲み込みそうになる言葉があったか、夕方に振り返る準備をして始める",
        source: "Open up",
      },
      {
        text: "例：今日手を動かす業務の中から1つ選び、「この仕事の本当の目的は何か」を改めて問い直す",
        source: "Reframe",
      },
      {
        text: "例：「もう少し整ってから出そう」と思った瞬間に、あえて60点のまま場に出す",
        source: "Execute first",
      },
    ],
  },
  {
    phase: "universal",
    type: "evening",
    examples: [
      {
        text: "例：今日「忙しい」と言った自分に対して、本当にその忙しさは必要だったか振り返ってみる",
        source: "Compress",
      },
      {
        text: "例：今日、空気を読んで飲み込んだ言葉はなかっただろうか",
        source: "Open up",
      },
      {
        text: "例：今日やった業務の中に、「なぜやっているか3秒で説明できないもの」はなかっただろうか",
        source: "Reframe",
      },
      {
        text: "例：60点で出したこと、100点を目指して手元で止めたことを数えてみる",
        source: "Execute first",
      },
    ],
  },
];

/**
 * dojoPhase 文字列（例: "道場1 覚醒"）から道場番号（1〜7）を抽出する。
 * 抽出できない場合は 1 を返す（安全なデフォルト）。
 */
function extractPhaseNumber(dojoPhase: string | undefined | null): number {
  if (!dojoPhase) return 1;
  const match = dojoPhase.match(/道場\s*(\d)/);
  if (match) {
    const n = parseInt(match[1], 10);
    if (n >= 1 && n <= 7) return n;
  }
  return 1;
}

/**
 * djb2 ハッシュの簡易版。
 * 暗号強度は不要で、同じ入力から同じインデックスが返れば良い。
 */
function seededIndex(seed: string, length: number): number {
  if (length <= 0) return 0;
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

/**
 * 道場ステージ・朝夕・参加者トークン・日付から、
 * 本日表示するプレースホルダーを1つ決定論的に選んで返す。
 *
 * 特徴：
 *  - 同じ（token, date, type）なら常に同じ例を返す
 *  - 日付が変わると自然に別の例に切り替わる
 *  - 道場ステージ別の例が未整備（現状: 道場2〜7）の場合は CORE ユニバーサルにフォールバック
 */
export function getPlaceholderExample(params: {
  token: string;
  dojoPhase: string | undefined | null;
  date: string; // YYYY-MM-DD 形式（JST業務日）
  type: PlaceholderType;
}): string {
  const phaseNum = extractPhaseNumber(params.dojoPhase);

  const phaseSet = EXAMPLES.find(
    (set) => set.phase === phaseNum && set.type === params.type
  );
  const universalSet = EXAMPLES.find(
    (set) => set.phase === "universal" && set.type === params.type
  );

  const candidates =
    phaseSet && phaseSet.examples.length > 0
      ? phaseSet.examples
      : universalSet?.examples ?? [];

  if (candidates.length === 0) {
    // ここに到達するのは EXAMPLES から universal が失われた場合のみ。
    // 通常は発生しないが、フォームが空プレースホルダーで出荷されるよりは明示的なメッセージを返す。
    return params.type === "morning"
      ? "今日ひとつだけ意識することを書いてみる"
      : "今日やってみてどうだったかを書いてみる";
  }

  const seed = `${params.token}-${params.date}-${params.type}`;
  const idx = seededIndex(seed, candidates.length);
  return candidates[idx].text;
}

// テスト容易化のためエクスポート（UIからは使用しない）
export const __internals = {
  EXAMPLES,
  extractPhaseNumber,
  seededIndex,
};
