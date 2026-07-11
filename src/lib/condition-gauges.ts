// logform v2 体調3ゲージ（睡眠の質 / 体の疲労感 / 頭のさえ）の共有定義。
// UI・API・DB マッピングの単一の真実源（energy ラベルが7ファイルに散在した反省）。
//
// §7 禁止事項に従い「良い/悪い」の評価色・評価語は持たせない。端点ラベルは記述的
// （ぐっすり↔浅い 等）。中間ラベルは持たず「4段階・中間なし」の位置のみ（指示書 F1）。
// 端点の向きは既存 energy UI（ポジティブ先頭）に合わせ、左端＝ポジティブに統一。

export type GaugeKey = "sleep" | "fatigue" | "clarity";

// raw = 端点間の位置(1=左端..4=右端)。normalized = (raw-1)/(steps-1)*100。
// 段階数を将来変えても比較・移動平均が効くよう normalized を併記保存する（指示書§4）。
export type GaugeValue = { raw: number; normalized: number };
export type ConditionGauges = Partial<Record<GaugeKey, GaugeValue>>;

// 端点間の位置（1..GAUGE_STEPS）を項目キーごとに保持する raw マップ（UI state / body 送信用）。
export type GaugeRaws = Partial<Record<GaugeKey, number>>;

// 保存済み {raw,normalized} 構造 → raw 位置マップ（F4 引き継ぎでUIへ戻す時に使う）。
export function gaugesToRaws(g: ConditionGauges | null | undefined): GaugeRaws | null {
  if (!g) return null;
  const out: GaugeRaws = {};
  for (const def of GAUGE_DEFS) {
    const v = g[def.key];
    if (v && typeof v.raw === "number") out[def.key] = v.raw;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export type GaugeDef = {
  key: GaugeKey;
  label: string;
  leftLabel: string;  // 位置1（ポジティブ側）
  rightLabel: string; // 位置4
};

// 表示順・ラベルは指示書 F1 の文言をそのまま使う。
export const GAUGE_DEFS: GaugeDef[] = [
  { key: "sleep", label: "昨夜の睡眠の質", leftLabel: "ぐっすり", rightLabel: "浅い" },
  { key: "fatigue", label: "体の疲労感", leftLabel: "軽い", rightLabel: "重い" },
  { key: "clarity", label: "頭のさえ", leftLabel: "クリア", rightLabel: "ぼんやり" },
];

// 夕は睡眠を問わない（睡眠質は起床時想起の尺度＝朝専用。夕の再質問は測定学的に無効）。
// 朝=3項目（GAUGE_DEFS）/ 夕=2項目。描画・引き継ぎ・保存で使う有効キー集合の単一の真実源。
export const EVENING_GAUGE_KEYS: GaugeKey[] = ["fatigue", "clarity"];

export function gaugeDefsFor(isMorning: boolean): GaugeDef[] {
  return isMorning ? GAUGE_DEFS : GAUGE_DEFS.filter((g) => EVENING_GAUGE_KEYS.includes(g.key));
}

export const GAUGE_STEPS = 4; // 4段階・中間なし

export function normalizeGauge(raw: number, steps: number = GAUGE_STEPS): number {
  return Math.round(((raw - 1) / (steps - 1)) * 100);
}

// クライアント入力（{sleep:1-4,...} の raw、または {raw,normalized} 混在）を安全な
// {raw,normalized} 構造へ。未知キー・範囲外・非数値は捨てる（サーバー側 sanitize）。
export function sanitizeConditionGauges(input: unknown): ConditionGauges | null {
  if (!input || typeof input !== "object") return null;
  const src = input as Record<string, unknown>;
  const out: ConditionGauges = {};
  for (const def of GAUGE_DEFS) {
    const v = src[def.key];
    let raw: number | null = null;
    if (typeof v === "number") raw = v;
    else if (v && typeof v === "object" && typeof (v as { raw?: unknown }).raw === "number") {
      raw = (v as { raw: number }).raw;
    }
    if (raw === null || !Number.isFinite(raw)) continue;
    const r = Math.round(raw);
    if (r < 1 || r > GAUGE_STEPS) continue;
    out[def.key] = { raw: r, normalized: normalizeGauge(r) };
  }
  return Object.keys(out).length > 0 ? out : null;
}

// F4 引き継ぎメタで許可する項目名。未知値は捨てる（sanitize）。
export const CARRYABLE_KEYS: readonly string[] = [
  "morningIntent",
  "morningAction",
  "eveningInsight",
  "eveningState",
  "sleep",
  "fatigue",
  "clarity",
];

export function sanitizeCarriedOver(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const allow = new Set(CARRYABLE_KEYS);
  const out = Array.from(
    new Set(input.filter((x): x is string => typeof x === "string" && allow.has(x)))
  );
  return out.length > 0 ? out : null;
}
