export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#5B4FD6] to-[#7C6FEA] flex items-center justify-center p-6">
      <div className="max-w-md mx-auto text-center">
        <div className="mb-8">
          <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">📝</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">CORE Log</h1>
          <p className="text-white/80 text-lg">リーダーシップ開発プログラム</p>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 text-white/90">
          <p className="mb-4">
            CORE Logは、日々の気づきを記録し、成長を加速させるプログラムです。
          </p>
          <p className="text-sm text-white/60">
            参加者の方は、配布された専用URLからアクセスしてください。
          </p>
        </div>

        <p className="text-white/40 text-xs mt-8">
          © {new Date().getFullYear()} Project CORE — Powered by Human Mature
        </p>
      </div>
    </div>
  );
}
