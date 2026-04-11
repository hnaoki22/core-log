"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";

type KnowledgeItem = {
  id: string;
  title: string;
  content: string;
  author: string;
  tags: string[];
  createdAt: string;
};

type ApiResponse = {
  items?: KnowledgeItem[];
  error?: string;
  success?: boolean;
};

export default function KnowledgePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { isOn, loaded } = useFeatures();

  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formTags, setFormTags] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Load feature flag
  useEffect(() => {
    if (!loaded) return;
    if (!isOn("tier-b.knowledgeLibrary")) {
      router.push(`/a/${token}`);
    }
  }, [loaded, isOn, token, router]);

  // Fetch items
  useEffect(() => {
    async function fetchItems() {
      try {
        const res = await fetch(`/api/features/knowledge?token=${token}`);
        if (!res.ok) throw new Error("failed to fetch");
        const data = (await res.json()) as ApiResponse;
        setItems(data.items || []);
      } catch {
        setMessage({ type: "err", text: "読み込みに失敗しました" });
      } finally {
        setLoading(false);
      }
    }
    if (token) fetchItems();
  }, [token]);

  // Get all unique tags
  const allTags = Array.from(new Set(items.flatMap((item) => item.tags)));

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesQuery =
      !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTags = selectedTags.length === 0 || selectedTags.some((tag) => item.tags.includes(tag));
    return matchesQuery && matchesTags;
  });

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) {
      setMessage({ type: "err", text: "タイトルと内容は必須です" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/features/knowledge?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          title: formTitle,
          content: formContent,
          tags: formTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error("failed to add");
      const newData = (await res.json()) as ApiResponse;
      setItems(newData.items || []);
      setFormTitle("");
      setFormContent("");
      setFormTags("");
      setShowForm(false);
      setMessage({ type: "ok", text: "ナレッジを追加しました" });
    } catch {
      setMessage({ type: "err", text: "追加に失敗しました" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-[3px] border-[#1A1A2E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#8B8489] text-sm">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F0EB]">
      {/* Header */}
      <header className="gradient-header-admin text-white px-5 pt-12 pb-6">
        <div className="max-w-2xl mx-auto relative z-10">
          <Link
            href={`/a/${token}`}
            className="inline-flex items-center gap-1 text-[#C9BDAE] hover:text-white text-sm mb-3 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            管理画面に戻る
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">ナレッジライブラリ</h1>
          <p className="text-xs text-[#C9BDAE] mt-1">組織のナレッジを一元管理</p>
        </div>
      </header>

      <main className="px-5 py-6 space-y-5 max-w-2xl mx-auto">
        {/* Message */}
        {message && (
          <div
            className={`px-4 py-3 rounded-lg text-sm ${
              message.type === "ok"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Controls */}
        <div className="card p-5 space-y-4">
          {/* Search */}
          <input
            type="text"
            placeholder="タイトルまたは内容で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border border-[#E0D9CE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] focus:ring-offset-1"
          />

          {/* Tags filter */}
          {allTags.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide">タグでフィルタ</p>
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() =>
                      setSelectedTags((prev) =>
                        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                      )
                    }
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      selectedTags.includes(tag)
                        ? "bg-[#1A1A2E] text-white"
                        : "bg-[#EFE8DD] text-[#5B5560] hover:bg-[#E0D9CE]"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add button */}
          <button
            onClick={() => setShowForm(!showForm)}
            className="w-full btn-primary text-sm py-2"
          >
            {showForm ? "キャンセル" : "新規追加"}
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="card p-5 space-y-4 border-2 border-[#1A1A2E]">
            <h3 className="text-sm font-semibold text-[#1A1A2E]">新規ナレッジ</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="タイトル"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full px-3 py-2 border border-[#E0D9CE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] focus:ring-offset-1"
              />
              <textarea
                placeholder="内容"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-[#E0D9CE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] focus:ring-offset-1 resize-none"
              />
              <input
                type="text"
                placeholder="タグ（カンマ区切り）"
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
                className="w-full px-3 py-2 border border-[#E0D9CE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] focus:ring-offset-1"
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full btn-primary text-sm py-2 disabled:opacity-50"
              >
                {submitting ? "追加中..." : "追加"}
              </button>
            </form>
          </div>
        )}

        {/* Items list */}
        {filteredItems.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-[#8B8489] text-sm">ナレッジがまだありません</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div key={item.id} className="card p-5 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-[#1A1A2E] break-words">{item.title}</h3>
                    <p className="text-xs text-[#8B8489] mt-1">{item.author}</p>
                  </div>
                  <time className="text-xs text-[#8B8489] whitespace-nowrap">
                    {new Date(item.createdAt).toLocaleDateString("ja-JP")}
                  </time>
                </div>
                <p className="text-sm text-[#5B5560] line-clamp-2">{item.content}</p>
                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-2">
                    {item.tags.map((tag) => (
                      <span key={tag} className="px-2 py-1 bg-[#EFE8DD] text-[#5B5560] text-xs rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
