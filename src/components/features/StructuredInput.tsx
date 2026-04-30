"use client";

interface StructuredInputProps {
  value: { fact: string; observation: string; lesson: string };
  onChange: (value: { fact: string; observation: string; lesson: string }) => void;
  isMorning: boolean;
  /**
   * Optional: 記入時間計測用。3 つの textarea いずれかに最初にフォーカスしたタイミングで呼ばれる。
   * 親側で focusedAt を保持し、submit 時に経過秒数を計算する。
   */
  onFirstFocus?: () => void;
}

export function StructuredInput({ value, onChange, isMorning, onFirstFocus }: StructuredInputProps) {
  return (
    <div className="space-y-4">
      {/* 事実 */}
      <div>
        <label className="text-xs font-medium text-[#5B5560] uppercase tracking-wide block mb-2">
          何が起きたか？
        </label>
        <p className="text-[10px] text-[#8B8489] mb-1">事実（Fact）</p>
        <textarea
          value={value.fact}
          onChange={(e) => onChange({ ...value, fact: e.target.value })}
          onFocus={onFirstFocus}
          placeholder={isMorning ? "例：午後のプレゼンが予定されている" : "例：チームミーティングで意見が出た"}
          className="input-field min-h-[120px] resize-none leading-relaxed"
        />
        <p className="text-[11px] text-[#C9BDAE] text-right mt-1">{value.fact.length} 文字</p>
      </div>

      {/* 観察 */}
      <div>
        <label className="text-xs font-medium text-[#5B5560] uppercase tracking-wide block mb-2">
          何に気づいたか？
        </label>
        <p className="text-[10px] text-[#8B8489] mb-1">観察（Observation）</p>
        <textarea
          value={value.observation}
          onChange={(e) => onChange({ ...value, observation: e.target.value })}
          onFocus={onFirstFocus}
          placeholder={isMorning ? "例：自分は結論から説明する傾向がある" : "例：自分の質問が良い対話を生んだ"}
          className="input-field min-h-[120px] resize-none leading-relaxed"
        />
        <p className="text-[11px] text-[#C9BDAE] text-right mt-1">{value.observation.length} 文字</p>
      </div>

      {/* 教訓 */}
      <div>
        <label className="text-xs font-medium text-[#5B5560] uppercase tracking-wide block mb-2">
          何を学んだか？
        </label>
        <p className="text-[10px] text-[#8B8489] mb-1">教訓（Lesson）</p>
        <textarea
          value={value.lesson}
          onChange={(e) => onChange({ ...value, lesson: e.target.value })}
          onFocus={onFirstFocus}
          placeholder={isMorning ? "例：もっと簡潔に話すことを意識する" : "例：開かれた質問をすることが重要"}
          className="input-field min-h-[120px] resize-none leading-relaxed"
        />
        <p className="text-[11px] text-[#C9BDAE] text-right mt-1">{value.lesson.length} 文字</p>
      </div>
    </div>
  );
}
