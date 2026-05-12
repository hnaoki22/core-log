/**
 * 朝の意図・本日の振り返り入力欄に表示するプレースホルダー例示。
 *
 * 設計思想：
 *  - 書き方の「処方箋」ではなく、参加者が1日を設計するための「問いの構え」を提示する
 *  - グラウンドルール CORE（Compress / Open up / Reframe / Execute first）を軸にした汎用例示
 *  - テナント固有の例示（課題図書に紐づくもの等）は ai_settings テーブルにカスタム例示として保存
 *  - 参加者トークン × 日付から決定論的に1つを選択（同じ日は一貫して同じ例、日替わりで変化）
 *  - カスタム例示が存在すればそちらを優先、なければこのハードコードにフォールバック
 *
 * 注意: 2026-05-12 にテナント固有の道場1・道場2例示（大幸薬品の課題図書に基づくもの）を
 *        DBに移行し、ハードコードは CORE ユニバーサル（全テナント共通）のみに縮小した。
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
 * デフォルト例示データ本体（CORE ユニバーサルのみ）。
 *
 * テナント固有の道場別例示（課題図書に紐づくもの）は DB の ai_settings に保存する。
 * ここにはどのテナントでも使える汎用的な CORE グラウンドルール例示のみを置く。
 * 全道場で共通のフォールバック先として機能する。
 */
const EXAMPLES: ExampleSet[] = [
  // ─────────────────────────────────────────
  // CORE ユニバーサル（全道場共通・全テナント共通のフォールバック）
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
 * テナント別カスタム例示セット。
 * API から取得した例示データをこの型で渡すと、ハードコード例示より優先される。
 */
export type CustomExampleSet = {
  phase: PhaseKey;
  type: PlaceholderType;
  examples: PlaceholderExample[];
};

/**
 * 道場ステージ・朝夕・参加者トークン・日付から、
 * 本日表示するプレースホルダーを1つ決定論的に選んで返す。
 *
 * 特徴：
 *  - 同じ（token, date, type）なら常に同じ例を返す
 *  - 日付が変わると自然に別の例に切り替わる
 *  - 道場ステージ別の例が未整備（現状: 道場3〜7）の場合は CORE ユニバーサルにフォールバック
 *  - customExamples が渡された場合、ハードコード例示より優先して使用する
 */
export function getPlaceholderExample(params: {
  token: string;
  dojoPhase: string | undefined | null;
  date: string; // YYYY-MM-DD 形式（JST業務日）
  type: PlaceholderType;
  /** テナント別カスタム例示（API経由で取得）。存在すればハードコードより優先 */
  customExamples?: CustomExampleSet[] | null;
}): string {
  const phaseNum = extractPhaseNumber(params.dojoPhase);

  // カスタム例示が存在する場合、そちらを優先
  const source = params.customExamples && params.customExamples.length > 0
    ? params.customExamples
    : EXAMPLES;

  const phaseSet = source.find(
    (set) => set.phase === phaseNum && set.type === params.type
  );
  const universalSet = source.find(
    (set) => set.phase === "universal" && set.type === params.type
  );

  const candidates =
    phaseSet && phaseSet.examples.length > 0
      ? phaseSet.examples
      : universalSet?.examples ?? [];

  // カスタム例示から候補が見つからない場合、ハードコードにフォールバック
  if (candidates.length === 0 && params.customExamples && params.customExamples.length > 0) {
    // カスタムにもユニバーサルにも該当なし → ハードコードで再試行
    return getPlaceholderExample({
      ...params,
      customExamples: null,
    });
  }

  if (candidates.length === 0) {
    return params.type === "morning"
      ? "今日ひとつだけ意識することを書いてみる"
      : "今日やってみてどうだったかを書いてみる";
  }

  const seed = `${params.token}-${params.date}-${params.type}`;
  const idx = seededIndex(seed, candidates.length);
  return candidates[idx].text;
}

/**
 * ハードコードされたデフォルト例示を返す。
 * admin UI でのプレビュー表示に使用。
 */
export function getDefaultExamples(): ExampleSet[] {
  return EXAMPLES;
}

// テスト容易化のためエクスポート（UIからは使用しない）
export const __internals = {
  EXAMPLES,
  extractPhaseNumber,
  seededIndex,
};
