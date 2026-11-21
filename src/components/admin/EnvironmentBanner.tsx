import { environmentLabel, type DirectoryEnvironment, type EnvironmentTone } from "@/lib/admin-directory";

/**
 * 管理画面の上部に出す「いま見ている環境」の帯。
 * 環境を取り違えたまま登録や設定をしないように、本番は色を変える。
 * 表示だけ（API は呼ばない）。
 */

const TONE_CLASS: Record<EnvironmentTone, string> = {
  production: "bg-red-600 text-white",
  test: "bg-emerald-600 text-white",
  neutral: "bg-white/15 text-white",
};

export function EnvironmentBanner({ environment }: { environment: DirectoryEnvironment | null }) {
  if (environment === null) {
    return (
      <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-white/15 px-3 py-1.5 text-xs text-white">
        <span className="font-medium whitespace-nowrap">全環境を表示中</span>
        <span className="text-white/80">追加とインポートは、環境を1つ選んでから行えます</span>
      </div>
    );
  }
  const tone = environment.purpose?.tone ?? "neutral";
  return (
    <div className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-1.5 text-xs ${TONE_CLASS[tone]}`}>
      <span className="text-white/80 whitespace-nowrap">表示中の環境</span>
      <span className="font-semibold break-all">{environmentLabel(environment)}</span>
      {environment.purpose && (
        <span className="rounded-md bg-white/25 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap">
          {environment.purpose.label}
        </span>
      )}
    </div>
  );
}
