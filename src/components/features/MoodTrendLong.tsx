"use client";

// 気分の推移・長期ビュー（約3ヶ月）— 2026-08-18 太田さん FB「1ヶ月半→3ヶ月に」
//
// 週足ローソク（始値＝朝の平均／終値＝夕の平均。上昇＝塗り、下降＝白抜き＝
// MoodCandlestick と同じ色弱対応の冗長符号化）＋ 日々の中点の細い折れ線。
// 日足のまま3ヶ月にすると1本が3px程度で白抜きが潰れるため、この2層にした。
// 欠測日・欠測週は詰めない（咎めるコピーは入れない。MoodCandlestick §4 と同じ）。
// 集計は lib/mood-series.ts（純関数・テスト済み）。ここは座標変換と描画だけ。

import { EnergyDot } from "@/components/EnergyGlyph";
import { dailyMids, weeklyCandles, diffDaysJST, type MoodLog } from "@/lib/mood-series";

const COLOR_UP = "#2D6A4F";
const COLOR_DOWN = "#8B1A2B";
const COLOR_FLAT = "#8B8489";
const COLOR_GRID = "#EFE8DD";
const COLOR_LINE = "#8B8489";

interface Props {
  logs: MoodLog[];
  days?: number; // default 91（13週）
  title?: string;
}

export function MoodTrendLong({ logs, days = 91, title = "気分の推移（長期・約3ヶ月）" }: Props) {
  const daily = dailyMids(logs, days);
  const weekly = weeklyCandles(logs, days);
  if (!daily || !weekly || daily.points.length === 0) {
    return (
      <div className="card p-5">
        <h3 className="font-semibold text-sm text-[#1A1A2E] mb-2">{title}</h3>
        <p className="text-xs text-[#8B8489]">気分の記録が貯まると、ここに数ヶ月の波が現れます。</p>
      </div>
    );
  }

  const { start, end } = daily;
  const totalDays = Math.max(1, diffDaysJST(start, end) + 1);

  const W = 320;
  const H = 130;
  const PX = 14;
  const PT = 10;
  const PB = 16;
  const plotW = W - PX * 2;
  const plotH = H - PT - PB;
  const dayW = plotW / totalDays;

  const yFor = (v: number) => PT + plotH - ((v - 1) / 3) * plotH;
  const xForDate = (date: string) => PX + (diffDaysJST(start, date) + 0.5) * dayW;

  // 週足の x は「その週の月〜日のうち窓に入る日」の中央に置く
  const weekBox = weekly.weeks.map((w) => {
    const wStart = w.weekStart < start ? start : w.weekStart;
    const wEndRaw = addDays(w.weekStart, 6);
    const wEnd = wEndRaw > end ? end : wEndRaw;
    const x1 = PX + diffDaysJST(start, wStart) * dayW;
    const x2 = PX + (diffDaysJST(start, wEnd) + 1) * dayW;
    return { ...w, x1, x2, xc: (x1 + x2) / 2, width: Math.max(4, (x2 - x1) * 0.55) };
  });

  const linePoints = daily.points.map((p) => `${xForDate(p.date).toFixed(1)},${yFor(p.mid).toFixed(1)}`).join(" ");

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-[#1A1A2E]">{title}</h3>
        <span className="text-[10px] text-[#8B8489] font-medium">週ごとの朝→夕 ＋ 日々の線</span>
      </div>

      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between py-1.5 items-center pointer-events-none" style={{ width: "16px" }}>
          <EnergyDot level="excellent" size={6} />
          <EnergyDot level="good" size={6} />
          <EnergyDot level="okay" size={6} />
          <EnergyDot level="low" size={6} />
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "140px", marginLeft: "4px" }} preserveAspectRatio="none">
          {[1, 2, 3, 4].map((v) => (
            <line key={v} x1={PX} y1={yFor(v)} x2={W - PX} y2={yFor(v)} stroke={COLOR_GRID} strokeWidth="0.5" />
          ))}

          {/* 日々の中点（波） */}
          {daily.points.length >= 2 && (
            <polyline points={linePoints} fill="none" stroke={COLOR_LINE} strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" opacity="0.55" />
          )}
          {daily.points.map((p) => (
            <circle key={p.date} cx={xForDate(p.date)} cy={yFor(p.mid)} r={1.4} fill={COLOR_LINE} opacity="0.7" />
          ))}

          {/* 週足 */}
          {weekBox.map((w) => {
            if (w.open == null || w.close == null) {
              const v = w.open ?? w.close;
              if (v == null) return null;
              return <circle key={w.weekStart} cx={w.xc} cy={yFor(v)} r={2.8} fill="white" stroke={COLOR_FLAT} strokeWidth="1.5" />;
            }
            const up = w.close > w.open;
            const down = w.close < w.open;
            const color = up ? COLOR_UP : down ? COLOR_DOWN : COLOR_FLAT;
            const yTop = yFor(Math.max(w.open, w.close));
            const yBottom = yFor(Math.min(w.open, w.close));
            const flat = Math.abs(w.close - w.open) < 0.05;
            const bodyH = flat ? 2.5 : Math.max(2.5, yBottom - yTop);
            const y = flat ? yFor(w.open) - 1.25 : yTop;
            return (
              <rect
                key={w.weekStart}
                x={w.xc - w.width / 2}
                y={y}
                width={w.width}
                height={bodyH}
                rx={1.5}
                fill={down ? "white" : color}
                stroke={down ? color : undefined}
                strokeWidth={down ? 1.5 : undefined}
                opacity={0.95}
              />
            );
          })}
        </svg>
      </div>

      <div className="flex justify-between mt-1.5 px-5">
        <span className="text-[9px] text-[#C9BDAE]">{start.slice(5).replace("-", "/")}</span>
        <span className="text-[9px] text-[#C9BDAE]">{end.slice(5).replace("-", "/")}</span>
      </div>

      <div className="flex items-center gap-3 mt-2.5 flex-wrap">
        <Legend color={COLOR_UP} label="週の朝より夕が上向き" />
        <Legend color={COLOR_DOWN} label="下向き" hollow />
        <Legend color={COLOR_LINE} label="日々の線" line />
      </div>
    </div>
  );
}

function Legend({ color, label, hollow = false, line = false }: { color: string; label: string; hollow?: boolean; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] text-[#8B8489]">
      {line ? (
        <span className="inline-block w-3 h-[2px]" style={{ backgroundColor: color, opacity: 0.6 }}></span>
      ) : (
        <span
          className="inline-block w-2 h-2 rounded-sm"
          style={hollow ? { border: `1.5px solid ${color}`, backgroundColor: "white" } : { backgroundColor: color }}
        ></span>
      )}
      {label}
    </span>
  );
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
