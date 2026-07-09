// logform v2 F5 惰性検知（朝夕ログ刷新）。
//
// (a) 直近3日「連続」の朝記入が全項目一致（ゲージ raw ＋ 気分 ＋ 自由記述の実質同文）
//     かつ
// (b) 所要時間が本人ベースライン比で急短縮
// の AND のときだけ、翌朝に静かな問いかけを1回だけ出す（頻度制限は呼び出し側）。
//
// 設計原則（指示書 §7）: 評価しない・咎めない・上司に通知しない。単なる数値一致だけ
// では発火させない（テキストの実質同文も必須）。純粋関数として実装し vitest で検証する。

import type { NotionLogEntry } from "./supabase";
import type { GaugeKey } from "./condition-gauges";

export const INERTIA_MESSAGE =
  "この3日、同じリズムが続いていますね。実際に安定している感覚ですか、それとも入力が習慣になってきた感じですか？";

// しきい値（本藤さん承認済み・後からチューニングできるよう定数化）
export const INERTIA_CONFIG = {
  consecutiveDays: 3, // 直近何日「連続」を見るか
  textJaccardThreshold: 0.85, // 文字bigram Jaccard がこれ以上で「実質同文」
  baselineWindow: 14, // ベースライン算出に使う直近件数（評価対象3日を除く）
  baselineMinSamples: 5, // これ未満はベースライン不成立＝(b)不成立（初期数日除外・§4）
  durationDropRatio: 0.5, // 直近3日中央値 ≤ ベースライン中央値 × これ で急短縮
};

const GAUGE_KEYS: GaugeKey[] = ["sleep", "fatigue", "clarity"];

// 日本語向けの軽い正規化（空白・記号を落とす）
export function normalizedText(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/\s+/g, "")
    .replace(/[、。，．,.!！?？「」『』（）()・…\-—~〜:：;；]/g, "")
    .toLowerCase();
}

// 文字bigram の Jaccard 類似度（0..1）。両方空は 1、片方空は 0。
export function textSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizedText(a);
  const nb = normalizedText(b);
  if (na === "" && nb === "") return 1;
  if (na === "" || nb === "") return 0;
  if (na === nb) return 1;
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    if (s.length === 1) {
      set.add(s);
      return set;
    }
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const A = bigrams(na);
  const B = bigrams(nb);
  let inter = 0;
  A.forEach((g) => {
    if (B.has(g)) inter++;
  });
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// 朝ゲージの raw を項目ごとに比較（存在する項目のみ）。比較できた項目が全て一致で true。
// ゲージがどちらかに無い日は「一致」扱いにしない（材料不足＝非発火に倒す）。
function gaugesEqual(a: NotionLogEntry, b: NotionLogEntry): boolean {
  const ga = a.morningConditionGauges;
  const gb = b.morningConditionGauges;
  if (!ga || !gb) return false;
  let compared = 0;
  for (const k of GAUGE_KEYS) {
    const va = ga[k]?.raw;
    const vb = gb[k]?.raw;
    if (va == null || vb == null) continue;
    if (va !== vb) return false;
    compared++;
  }
  return compared > 0;
}

// earlier が later の暦日で前日か
function isPrevCalendarDay(earlier: string, later: string): boolean {
  const e = Date.parse(`${earlier}T00:00:00Z`);
  const l = Date.parse(`${later}T00:00:00Z`);
  if (Number.isNaN(e) || Number.isNaN(l)) return false;
  return l - e === 86400000;
}

export type InertiaResult = { show: boolean; message: string | null };

// logs: 全履歴（順不同で可）。today: 当日(YYYY-MM-DD)。
// alreadyNudgedWithin7d: 呼び出し側が inertia_nudges を引いて渡す（週1制限）。
export function computeInertiaNudge(
  logs: NotionLogEntry[],
  today: string,
  alreadyNudgedWithin7d: boolean
): InertiaResult {
  const NO: InertiaResult = { show: false, message: null };
  if (alreadyNudgedWithin7d) return NO;

  const N = INERTIA_CONFIG.consecutiveDays;

  // 当日より前の、朝を記入した日を date 降順で
  const mornings = logs
    .filter((l) => l.date < today && !!l.morningIntent)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  if (mornings.length < N) return NO;

  const recent = mornings.slice(0, N);

  // 直近 N 日が「暦日連続」か
  for (let i = 0; i < N - 1; i++) {
    if (!isPrevCalendarDay(recent[i + 1].date, recent[i].date)) return NO;
  }

  // (a) 全項目一致（隣接ペアで比較）
  for (let i = 0; i < N - 1; i++) {
    const x = recent[i];
    const y = recent[i + 1];
    if (!gaugesEqual(x, y)) return NO;
    // 気分は存在必須かつ一致
    if (x.energy == null || y.energy == null || x.energy !== y.energy) return NO;
    if (textSimilarity(x.morningIntent, y.morningIntent) < INERTIA_CONFIG.textJaccardThreshold) return NO;
    if (textSimilarity(x.morningAction, y.morningAction) < INERTIA_CONFIG.textJaccardThreshold) return NO;
  }

  // (b) 所要時間の急短縮
  const recentDurations = recent
    .map((l) => l.morningDurationSec)
    .filter((d): d is number => typeof d === "number");
  if (recentDurations.length < N) return NO; // 3日とも計測がある事が条件
  const recentMedian = median(recentDurations);
  if (recentMedian == null) return NO;

  const baselinePool = mornings
    .slice(N, N + INERTIA_CONFIG.baselineWindow)
    .map((l) => l.morningDurationSec)
    .filter((d): d is number => typeof d === "number");
  if (baselinePool.length < INERTIA_CONFIG.baselineMinSamples) return NO;
  const baselineMedian = median(baselinePool);
  if (baselineMedian == null || baselineMedian <= 0) return NO;

  if (recentMedian > baselineMedian * INERTIA_CONFIG.durationDropRatio) return NO;

  return { show: true, message: INERTIA_MESSAGE };
}
