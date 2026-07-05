/**
 * EnergyGlyph — 気分/エネルギー状態の自社製ラインアート・フェイスグリフ。
 *
 * OS絵文字（🔥😊😐😞）の置き換え。ブランドカラーで状態を伝える
 * ミニマルな線画で、プロダクト全体の気分表現を統一する。
 * 色は energy 値に対応（gold / green / gray / burgundy）。
 */

export type EnergyLevel = "excellent" | "good" | "okay" | "low";

export const ENERGY_COLORS: Record<EnergyLevel, string> = {
  excellent: "#C17817",
  good: "#2D6A4F",
  okay: "#8B8489",
  low: "#8B1A2B",
};

/** ごく薄い状態別ティント（カード背景・選択状態用） */
export const ENERGY_TINTS: Record<EnergyLevel, string> = {
  excellent: "#FAF4E9",
  good: "#EFF5F1",
  okay: "#F4F2F3",
  low: "#F8EFF0",
};

const MOUTHS: Record<EnergyLevel, string> = {
  excellent: "M7.5 13.5 Q12 18.5 16.5 13.5",
  good: "M8.5 14 Q12 16.8 15.5 14",
  okay: "M8.5 14.8 L15.5 14.8",
  low: "M8.5 16 Q12 13.2 15.5 16",
};

/** excellent のみ眉で強調し、4段階の判別性を上げる */
const BROWS: Partial<Record<EnergyLevel, [string, string]>> = {
  excellent: ["M7.2 7.4 Q8.6 6.2 10 7.1", "M14 7.1 Q15.4 6.2 16.8 7.4"],
};

type Props = {
  level: EnergyLevel | string | null | undefined;
  size?: number;
  className?: string;
  /** true でモノトーン（現在色）を継承。既定は状態色 */
  monochrome?: boolean;
};

export function EnergyGlyph({ level, size = 18, className, monochrome }: Props) {
  if (!level || !(level in MOUTHS)) return null;
  const lv = level as EnergyLevel;
  const color = monochrome ? "currentColor" : ENERGY_COLORS[lv];
  const brows = BROWS[lv];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9.25" />
      <circle cx="8.7" cy="10" r="0.6" fill={color} stroke="none" />
      <circle cx="15.3" cy="10" r="0.6" fill={color} stroke="none" />
      {brows && (
        <>
          <path d={brows[0]} strokeWidth={1.4} />
          <path d={brows[1]} strokeWidth={1.4} />
        </>
      )}
      <path d={MOUTHS[lv]} />
    </svg>
  );
}

/** チャート軸などで使う極小の状態ドット */
export function EnergyDot({
  level,
  size = 8,
  className,
}: {
  level: EnergyLevel | string | null | undefined;
  size?: number;
  className?: string;
}) {
  if (!level || !(level in ENERGY_COLORS)) return null;
  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "9999px",
        backgroundColor: ENERGY_COLORS[level as EnergyLevel],
      }}
      aria-hidden
    />
  );
}
