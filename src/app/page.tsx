import { getAllParticipants, getAllManagers } from "@/lib/mock-data";

export default function Home() {
  const participants = getAllParticipants();
  const managers = getAllManagers();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#5B4FD6] to-[#7C6FEA] p-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12 pt-12">
          <h1 className="text-4xl font-bold text-white mb-2">CORE Log</h1>
          <p className="text-white/80">リーダーシップ開発プログラム</p>
        </div>

        <div className="space-y-8">
          <section className="bg-white rounded-xl p-6 shadow-lg">
            <h2 className="text-xl font-bold text-[#1E1B3A] mb-4">参加者ページ</h2>
            <div className="space-y-2">
              {participants.map((p) => (
                <a
                  key={p.token}
                  href={`/p/${p.token}`}
                  className="block p-4 bg-gradient-to-r from-[#EDE9FF] to-white rounded-lg border border-[#E8E5F0] hover:shadow-md transition-shadow"
                >
                  <div className="font-semibold text-[#5B4FD6]">{p.name}</div>
                  <div className="text-sm text-[#8B85A8]">{p.department}</div>
                  <div className="text-xs text-[#8B85A8] mt-1">Token: {p.token}</div>
                </a>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-xl p-6 shadow-lg">
            <h2 className="text-xl font-bold text-[#1E1B3A] mb-4">マネージャーページ</h2>
            <div className="space-y-2">
              {managers.map((m) => (
                <a
                  key={m.token}
                  href={`/m/${m.token}`}
                  className="block p-4 bg-gradient-to-r from-[#FFF8F0] to-white rounded-lg border border-[#E8E5F0] hover:shadow-md transition-shadow"
                >
                  <div className="font-semibold text-[#FF8C42]">{m.name}</div>
                  <div className="text-sm text-[#8B85A8]">{m.department}</div>
                  <div className="text-xs text-[#8B85A8] mt-1">Token: {m.token}</div>
                </a>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
