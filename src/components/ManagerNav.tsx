"use client";

import Link from "next/link";

interface ManagerNavProps {
  title: string;
  backHref?: string;
}

export function ManagerNav({ title, backHref }: ManagerNavProps) {
  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-[#E5DCD0] shadow-sm">
      <div className="max-w-md mx-auto px-6 py-4 flex items-center gap-3">
        {backHref ? (
          <Link
            href={backHref}
            className="text-[#1A1A2E] hover:bg-[#F5F0EB] p-2 rounded-lg transition-colors flex-shrink-0"
          >
            ← 戻る
          </Link>
        ) : (
          <div className="w-10" />
        )}
        <div className="flex-1">
          <h1 className="font-semibold text-[#1A1A2E]">{title}</h1>
        </div>
      </div>
    </nav>
  );
}