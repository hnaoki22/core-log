// 気分の長期ビュー用の純関数（2026-08-18 太田さん FB「トレンドを1ヶ月半→3ヶ月に」）。
//
// 3ヶ月（約13週）を日足ローソクで描くと1本が3px程度になり、色弱対応の
// 「下降＝白抜き」が潰れて色だけの符号化に戻ってしまう。そこで長期ビューは
//   - 週足ローソク: 始値＝その週の朝の気分の平均、終値＝夕の気分の平均
//     （週の中で朝→夕がどちらに動きがちだったか。塗り／白抜きが十分に見える幅）
//   - 日々の線: 各日の朝夕の中点（片方のみの日はその値）を細い折れ線で重ね、
//     「波」の振幅が広い時期／狭い時期が見えるようにする
// の2層で描く。集計はここで行い、描画側（MoodTrendLong）は座標変換だけにする。
//
// 日付演算は stats.ts / MoodCandlestick と同じ T12:00:00+09:00 方式（JST安全）。

export type MoodLevel = "excellent" | "good" | "okay" | "low";

export type MoodLog = {
  date: string; // YYYY-MM-DD
  energy: MoodLevel | null;
  eveningEnergy: MoodLevel | null;
};

export const MOOD_VALUE: Record<MoodLevel, number> = { excellent: 4, good: 3, okay: 2, low: 1 };

export type DailyMid = { date: string; mid: number };

export type WeeklyCandle = {
  weekStart: string; // 月曜（YYYY-MM-DD）
  open: number | null;  // 朝の気分の平均（記録が無い週は null）
  close: number | null; // 夕の気分の平均
  mornings: number;     // 朝の記録数
  evenings: number;     // 夕の記録数
};

export function moodValue(v: MoodLevel | null | undefined): number | null {
  return v ? MOOD_VALUE[v] : null;
}

/** JST安全な日付差（b - a、暦日） */
export function diffDaysJST(a: string, b: string): number {
  const da = new Date(a + "T12:00:00+09:00").getTime();
  const db = new Date(b + "T12:00:00+09:00").getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

export function addDaysJST(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** その日を含む週の月曜（ISO週）を返す */
export function weekStartMonday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  // getUTCDay: 0=日 … 6=土。T12:00+09:00 は UTC 03:00 同日なので曜日はJSTと一致する
  const dow = d.getUTCDay();
  const back = (dow + 6) % 7; // 月=0, 火=1, … 日=6
  return addDaysJST(dateStr, -back);
}

/**
 * 直近 days 日（最新記録日を終端）に含まれる日々の中点。
 * 朝夕どちらも無い日は含めない（欠測は詰めず、描画側で日付軸に載せる）。
 */
export function dailyMids(logs: MoodLog[], days: number): { start: string; end: string; points: DailyMid[] } | null {
  const withMood = logs
    .filter((l) => l.date && (l.energy || l.eveningEnergy))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (withMood.length === 0) return null;
  const end = withMood[withMood.length - 1].date;
  const start = addDaysJST(end, -(days - 1));
  const points: DailyMid[] = [];
  for (const l of withMood) {
    if (l.date < start || l.date > end) continue;
    const m = moodValue(l.energy);
    const e = moodValue(l.eveningEnergy);
    const mid = m != null && e != null ? (m + e) / 2 : (m ?? e);
    if (mid == null) continue;
    points.push({ date: l.date, mid });
  }
  return { start, end, points };
}

/**
 * 直近 days 日を週（月曜始まり）ごとに集計した週足。
 * 窓の開始週から終端週まで、記録の無い週も null 値で並べる（欠測を詰めない）。
 */
export function weeklyCandles(logs: MoodLog[], days: number): { start: string; end: string; weeks: WeeklyCandle[] } | null {
  const range = dailyMids(logs, days);
  if (!range) return null;
  const { start, end } = range;
  const firstWeek = weekStartMonday(start);
  const lastWeek = weekStartMonday(end);

  const acc = new Map<string, { m: number[]; e: number[] }>();
  for (const l of logs) {
    if (!l.date || l.date < start || l.date > end) continue;
    const wk = weekStartMonday(l.date);
    const slot = acc.get(wk) ?? { m: [], e: [] };
    const m = moodValue(l.energy);
    const e = moodValue(l.eveningEnergy);
    if (m != null) slot.m.push(m);
    if (e != null) slot.e.push(e);
    acc.set(wk, slot);
  }

  const weeks: WeeklyCandle[] = [];
  for (let wk = firstWeek; wk <= lastWeek; wk = addDaysJST(wk, 7)) {
    const slot = acc.get(wk);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    weeks.push({
      weekStart: wk,
      open: slot ? avg(slot.m) : null,
      close: slot ? avg(slot.e) : null,
      mornings: slot ? slot.m.length : 0,
      evenings: slot ? slot.e.length : 0,
    });
  }
  return { start, end, weeks };
}
