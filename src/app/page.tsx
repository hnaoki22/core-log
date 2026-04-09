export default function Home() {
  return (
    <div className="min-h-screen bg-[#1A1A2E] flex items-center justify-center p-6">
      <div className="max-w-md mx-auto text-center">
        <div className="mb-10">
          <div className="w-16 h-16 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl flex items-center justify-center mx-auto mb-8">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <h1 className="text-3xl font-semibold text-white tracking-tight mb-3">CORE Log</h1>
          <p className="text-gray-400 text-base font-light">リーダーシップ開発プログラム</p>
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-gray-300">
          <p className="text-sm leading-relaxed mb-4">
            CORE Logは、日々の気づきを記録し、成長を加速させるプログラムです。
          </p>
          <p className="text-xs text-gray-500">
            参加者の方は、配布された専用URLからアクセスしてください。
          </p>
        </div>

        <div className="mt-12 flex items-center justify-center gap-2">
          <div className="w-1 h-1 bg-gray-600 rounded-full"></div>
          <p className="text-gray-600 text-[11px] tracking-wide">
            Powered by Human Mature
          </p>
          <div className="w-1 h-1 bg-gray-600 rounded-full"></div>
        </div>
      </div>
    </div>
  );
}
