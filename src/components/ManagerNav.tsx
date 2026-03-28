"use client";

import Link from "next/link";

interface ManagerNavProps {
  title: string;
  backHref?: string;
}

export function ManagerNav({ title, backHref }: ManagerNavProps) {
  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-[#E8E5F0] shadow-sm">
      <div className="max-w-md mx-auto px-6 py-4 flex items-center gap-3">
        {backHref ? (
          <Link
            href={backHref}
            className="text-[#5B4FD6] hover:bg-[#F8F7FF] p-2 rounded-lg transition-colors flex-shrink-0"
          >
            ← 戻る
          </Link>
        ) : (
          <div className="w-10" />
        )}
        <div className="flex-1">
          <h1 className="font-semibold text-[#1E1B3A]">{title}</h1>
        </div>
      </div>
    </nav>
  
 "�