"use client";

// 気分ローソク足グラフ（商品版最終型仕様書 v1.0 §4）
//
// - 1日＝1本。始値=朝気分（energy）、終値=夕気分（evening_energy）。
//   4段階を 1〜4 に数値化。
// - 朝<夕（上昇）/ 朝>夕（下降）を色分け。同値はフラット表現。
// - 夕未入力の日は朝のみのマーカー（丸印）。
// - 欠測日は「ありません」と突きつけない（§4 / 文字起こし01:21）:
//   日付軸は実カレンダー間隔のまま詰めず、記入日同士が離れている場合は
//   薄い点線で繋がりだけを見せる。咎めるコピーは一切入れない。
// - 表示系列は気分のみで開始。体調はAIスコア化（将来フェーズ）まで
//   切替不可のため、series prop で拡張余地だけ残す。
//
// 実装方式: 既存の「エネルギーの推移」チャート（ParticipantHomeClient）と
// 同じ自前SVG。外部チャートライブラリは導入しない（§4 プリフライト判断）。

import { EnergyDot } from "@/components/EnergyGlyph";

type CandleLog = {
  date: string; // YYYY-MM-DD
  energy: "excellent" | "good" | "okay" | "low" | null;
  eveningEnergy: "excellent" | "good" | "okay" | "low" | null;
};

const MOOD_VALUE: Record<string, number> = { excellent: 4, good: 3, okay: 2, low: 1 };

// 上昇=深緑 / 下降=深紅 / フラット=グレー（アプリの既存パレットに準拠）
const COLOR_UP = "#2D6A4F";
const COLOR_DOWN = "#8B1A2B";
const COLOR_FLAT = "#8B8489";
const COLOR_GRID = "#EFE8DD";
const COLOR_GAP_LINK = "#C9BDAE";

interface Props {
  logs: CandleLog[];          // 任意順でよい（内部で date 昇順に並べる）
  days?: number;              // 直近何日分を表示するか（カレンダー日数）。default 21
  title?: string;
  /** 将来の体調系列切替の拡張余地。現状 "mood" のみ */
  series?: "mood";
}

export function MoodCandlestick({ logs, days = 21, title = "気分の推移" }: Props) {
  // date 昇順・対象期間のみ・気分が1つ以上ある日のみを candle 対象にする
  const sorted = [...logs]
    .filter((l) => l.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const withMood = sorted.filter((l) => l.energy || l.eveningEnergy);
  if (withMood.length === 0) {
    // 欠測を咎めない: 空状態も静かな文言にとどめる
    return (
      <div className="card p-5">
        <h3 className="font-semibold text-sm text-[#1A1A2E] mb-2">{title}</h3>
        <p className="text-xs text-[#8B8489]">気分の記録が貯まると、ここに朝夕の動きが現れます。</p>
      </div>
    );
  }

  const lastDate = withMood[withMood.length - 1].date;
  const startDate = addDays(lastDate, -(days - 1));
  const visible = withMood.filter((l) => l.date >= startDate && l.date <= lastDate);

  // x 座標は「カレンダー日数オフセット」で決める＝欠測日を詰めない
  const totalDays = Math.max(1, diffDays(startDate, lastDate) + 1);

  const W = 320;
  const H = 120;
  const PX = 14;        // 左右パディング
  const PT = 10;
  const PB = 14;
  const plotW = W - PX * 2;
  const plotH = H - PT - PB;
  const slot = plotW / totalDays;
  const candleW = Math.min(10, Math.max(3, slot * 0.55));

  const yFor = (v: number) => PT + plotH - ((v - 1) / 3) * plotH;
  const xFor = (date: string) => PX + (diffDays(startDate, date) + 0.5) * slot;

  type Drawn = {
    x: number;
    open: number | null;
    close: number | null;
    date: string;
  };
  const drawn: Drawn[] = visible.map((l) => ({
    x: xFor(l.date),
    open: l.energy ? MOOD_VALUE[l.energy] : null,
    close: l.eveningEnergy ? MOOD_VALUE[l.eveningEnergy] : null,
    date: l.date,
  }));

  // 欠測ギャップの「繋がり」点線: 隣り合う記入日が暦日で2日以上離れている時、
  // 前日の終値（なければ始値）→ 次日の始値（なければ終値）を薄い点線で結ぶ
  const gapLinks: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 1; i < drawn.length; i++) {
    const prev = drawn[i - 1];
    const cur = drawn[i];
    if (diffDays(prev.date, cur.date) >= 2) {
      const prevVal = prev.close ?? prev.open;
      const curVal = cur.open ?? cur.close;
      if (prevVal != null && curVal != null) {
        gapLinks.push({ x1: prev.x, y1: yFor(prevVal), x2: cur.x, y2: yFor(curVal) });
      }
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-[#1A1A2E]">{title}</h3>
        <span className="text-[10px] text-[#8B8489] font-medium">朝 → 夕の動き</span>
      </div>

      <div className="relative">
        <div
          className="absolute left-0 top-0 bottom-0 flex flex-col justify-between py-1.5 items-center pointer-events-none"
          style={{ width: "16px" }}
        >
          <EnergyDot level="excellent" size={6} />
          <EnergyDot level="good" size={6} />
          <EnergyDot level="okay" size={6} />
          <EnergyDot level="low" size={6} />
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: "130px", marginLeft: "4px" }}
          preserveAspectRatio="none"
        >
          {[1, 2, 3, 4].map((v) => (
            <line
              key={v}
              x1={PX}
              y1={yFor(v)}
              x2={W - PX}
              y2={yFor(v)}
              stroke={COLOR_GRID}
              strokeWidth="0.5"
            />
          ))}

          {/* 欠測ギャップの繋がり（点線・薄色） */}
          {gapLinks.map((g, i) => (
            <line
              key={`gap-${i}`}
              x1={g.x1}
              y1={g.y1}
              x2={g.x2}
              y2={g.y2}
              stroke={COLOR_GAP_LINK}
              strokeWidth="1"
              strokeDasharray="2.5 3"
              opacity="0.7"
            />
          ))}

          {/* ローソク足本体 */}
          {drawn.map((d, i) => {
            if (d.open != null && d.close != null) {
              const up = d.close > d.open;
              const down = d.close < d.open;
              const color = up ? COLOR_UP : down ? COLOR_DOWN : COLOR_FLAT;
              const yTop = yFor(Math.max(d.open, d.close));
              const yBottom = yFor(Math.min(d.open, d.close));
              const bodyH = Math.max(2.5, yBottom - yTop); // 同値はフラット（細い横棒）
              return (
                <g key={i}>
                  <rect
                    x={d.x - candleW / 2}
                    y={d.open === d.close ? yFor(d.open) - 1.25 : yTop}
                    width={candleW}
                    height={d.open === d.close ? 2.5 : bodyH}
                    rx={1.5}
                    fill={color}
                  />
                </g>
              );
            }
            // 片方のみ（夕未入力＝朝のみマーカー / 朝なし夕のみも同様に1点）
            const v = d.open ?? d.close;
            if (v == null) return null;
            return (
              <circle
                key={i}
                cx={d.x}
                cy={yFor(v)}
                r={2.8}
                fill="white"
                stroke={COLOR_FLAT}
                strokeWidth="1.5"
              />
            );
          })}
        </svg>
      </div>

      <div className="flex justify-between mt-1.5 px-5">
        <span className="text-[9px] text-[#C9BDAE]">{startDate.slice(5).replace("-", "/")}</span>
        <span className="text-[9px] text-[#C9BDAE]">{lastDate.slice(5).replace("-", "/")}</span>
      </div>

      <div className="flex items-center gap-3 mt-2.5">
        <LegendSwatch color={COLOR_UP} label="朝より上向き" />
        <LegendSwatch color={COLOR_DOWN} label="朝より下向き" />
        <LegendSwatch color={COLOR_FLAT} label="フラット / 片方のみ" />
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] text-[#8B8489]">
      <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: color }}></span>
      {label}
    </span>
  );
}

// ===== JST-safe date helpers（stats.ts と同じ T12:00:00+09:00 方式） =====

function diffDays(a: string, b: string): number {
  const da = new Date(a + "T12:00:00+09:00").getTime();
  const db = new Date(b + "T12:00:00+09:00").getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  d.setUTCDate(d.getUTCDate() + n);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
