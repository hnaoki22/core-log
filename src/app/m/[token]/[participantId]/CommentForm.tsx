"use client";

import { useState } from "react";

type Props = {
  token: string;
  entryId: string;
  existingComment?: string | null;
};

export default function CommentForm({ token, entryId, existingComment }: Props) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedComment, setSavedComment] = useState(existingComment || "");
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (!comment.trim()) return;
    setIsSubmitting(true);
    setMessage("");

    try {
      const res = await fetch("/api/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          participantId: entryId,
          comment: comment.trim(),
        }),
      });

      if (res.ok) {
        setSavedComment(comment.trim());
        setComment("");
        setIsOpen(false);
        setMessage("保存しました");
        setTimeout(() => setMessage(""), 3000);
      } else {
        setMessage("保存に失敗しました");
      }
    } catch {
      setMessage("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-2">
      {/* Display saved comment */}
      {savedComment && (
        <div className="bg-blue-50 rounded p-2 mb-2">
          <p className="text-xs text-blue-700">
            <span className="font-semibold">上司コメント：</span>
            {savedComment}
          </p>
        </div>
      )}

      {/* Success/error message */}
      {message && (
        <p className={`text-xs mb-1 ${message === "保存しました" ? "text-green-600" : "text-red-500"}`}>
          {message}
        </p>
      )}

      {/* Toggle button */}
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          <span>💬</span>
          {savedComment ? "コメントを編集" : "コメントする"}
        </button>
      ) : (
        <div className="space-y-2 bg-gray-50 rounded-lg p-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="コメントを入力..."
            className="w-full text-xs border rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            rows={3}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setIsOpen(false); setComment(""); }}
              className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1"
            >
              キャンセル
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !comment.trim()}
              className="text-xs bg-blue-600 text-white rounded-lg px-3 py-1 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "保存中..." : "送信"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
