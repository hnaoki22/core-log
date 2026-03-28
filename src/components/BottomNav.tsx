"use client";

interface BottomNavProps {
  active: "home" | "logs" | "feedback" | "mission";
  baseUrl: string;
}

export function BottomNav({ active, baseUrl }: BottomNavProps) {
  const tabs = [
    { id: "home", label: "ホーム", emoji: "🏠", path: "" },
    { id: "logs", label: "ログ", emoji: "📋", path: "logs" },
    { id: "feedback", label: "FB", emoji: "🎓", path: "feedback" },
    { id: "mission", label: "ミッション", emoji: "🎯", path: "mission" },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E8E5F0] safe-area-bottom">
      <div className="max-w-md mx-auto flex justify-around">
        {tabs.map((tab) => (
          <a
            key={tab.id}
            href={tab.path ? `${baseUrl}/${tab.path}` : baseUrl}
            className={`flex-1 flex flex-col items-center justify-center py-3 px-2 transition-colors ${
              active === tab.id
                ? "text-[#5B4FD6] border-t-2 border-[#5B4FD6]"
                : "text-[#8B85A8] hover:text-[#5B4FD6]"
            }`}
          >
            <div className="text-2xl mb-1">{tab.emoji}</div>
            <div className="text-xs font-medium text-center">{tab.label}</div>
          </a>
        ))}
      </div>
    </nav>
  );
}
