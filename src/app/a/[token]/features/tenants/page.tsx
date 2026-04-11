"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";

type Tenant = {
  id: string;
  name: string;
  status: "active" | "inactive";
  participantCount: number;
};

type ApiResponse = {
  tenants?: Tenant[];
  error?: string;
  success?: boolean;
};

export default function TenantsPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { isOn, loaded } = useFeatures();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Load feature flag
  useEffect(() => {
    if (!loaded) return;
    if (!isOn("tier-g.multiTenant")) {
      router.push(`/a/${token}`);
    }
  }, [loaded, isOn, token, router]);

  // Fetch tenants
  useEffect(() => {
    async function fetchTenants() {
      try {
        const res = await fetch(`/api/features/tenants?token=${token}`);
        if (!res.ok) throw new Error("failed to fetch");
        const data = (await res.json()) as ApiResponse;
        setTenants(data.tenants || []);
      } catch {
        setMessage({ type: "err", text: "読み込みに失敗しました" });
      } finally {
        setLoading(false);
      }
    }
    if (token) fetchTenants();
  }, [token]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setMessage({ type: "err", text: "テナント名は必須です" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/features/tenants?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: formName }),
      });
      if (!res.ok) throw new Error("failed to add");
      const newData = (await res.json()) as ApiResponse;
      setTenants(newData.tenants || []);
      setFormName("");
      setShowForm(false);
      setMessage({ type: "ok", text: "テナントを追加しました" });
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
          <h1 className="text-xl font-semibold tracking-tight">マルチテナント管理</h1>
          <p className="text-xs text-[#C9BDAE] mt-1">複数組織を一元管理</p>
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

        {/* Add Button */}
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full btn-primary text-sm py-2"
        >
          {showForm ? "キャンセル" : "新規テナント追加"}
        </button>

        {/* Add form */}
        {showForm && (
          <div className="card p-5 space-y-4 border-2 border-[#1A1A2E]">
            <h3 className="text-sm font-semibold text-[#1A1A2E]">新規テナント</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="テナント名"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
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

        {/* Tenants list */}
        {tenants.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-[#8B8489] text-sm">テナントがまだありません</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tenants.map((tenant) => (
              <div key={tenant.id} className="card p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-[#1A1A2E] break-words">{tenant.name}</h3>
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          tenant.status === "active"
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-gray-50 text-gray-700 border border-gray-200"
                        }`}
                      >
                        {tenant.status === "active" ? "稼働中" : "休止中"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="pt-3 border-t border-[#EFE8DD]">
                  <p className="text-xs text-[#5B5560]">
                    参加者数: <span className="text-sm font-semibold text-[#1A1A2E]">{tenant.participantCount}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
