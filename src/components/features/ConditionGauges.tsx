// logform v2 F1/F3: 体調3ゲージ（睡眠の質・体の疲労感・頭のさえ）の選択UI。
//
// - 4段階・中間なし（GAUGE_STEPS）。端点ラベルのみ（記述的：ぐっすり↔浅い 等）。
// - §7 に従い「良い/悪い」の評価色は付けない。選択pipは単色アクセント（ブランドのインク色）。
// - 既存 energy 4択と同じ操作感（p-*/rounded/border-2 のタップボタン）に揃える。
// - 各項目は任意（未選択でも先へ進める）。オルソソムニア回避＝強制しない。

import { GAUGE_DEFS, GAUGE_STEPS, type GaugeDef, type GaugeRaws } from "@/lib/condition-gauges";

export type { GaugeRaws };

export function ConditionGauges({
  value,
  onChange,
  onFirstInteract,
  defs = GAUGE_DEFS,
}: {
  value: GaugeRaws;
  onChange: (next: GaugeRaws) => void;
  onFirstInteract?: () => void;
  defs?: GaugeDef[];
}) {
  return (
    <div className="space-y-6">
      {defs.map((g) => {
        const cur = value[g.key];
        return (
          <div key={g.key} className="space-y-2">
            <p className="text-[#1A1A2E] font-medium text-sm">{g.label}</p>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#8B8489] w-16 shrink-0">{g.leftLabel}</span>
              <div className="flex gap-2 flex-1">
                {Array.from({ length: GAUGE_STEPS }, (_, i) => {
                  const pos = i + 1;
                  const selected = cur === pos;
                  return (
                    <button
                      key={pos}
                      type="button"
                      aria-label={`${g.label} ${pos}/${GAUGE_STEPS}`}
                      aria-pressed={selected}
                      onClick={() => {
                        onFirstInteract?.();
                        onChange({ ...value, [g.key]: pos });
                      }}
                      className={`flex-1 h-10 rounded-lg border-2 transition-all duration-150 ${
                        selected
                          ? "border-[#1A1A2E] bg-[#1A1A2E]"
                          : "border-[#E5DCD0] bg-white hover:border-[#C9BDAE]"
                      }`}
                    />
                  );
                })}
              </div>
              <span className="text-[11px] text-[#8B8489] w-16 shrink-0 text-right">{g.rightLabel}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
