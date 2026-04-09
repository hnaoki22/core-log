"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useRef } from "react";

type Step = "send" | "verify";

interface OTPResponse {
  success: boolean;
  verified?: boolean;
  emailHint?: string;
  error?: string;
  remainingAttempts?: number;
}

export default function OTPVerificationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [step, setStep] = useState<Step>("send");
  const [emailHint, setEmailHint] = useState<string>("");
  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [remainingAttempts, setRemainingAttempts] = useState<number>(5);
  const [, setCodeSent] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Request OTP
  async function handleSendCode() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          action: "send",
        }),
      });

      const data: OTPResponse = await res.json();

      if (data.success) {
        if (data.verified) {
          // OTP disabled (dev mode) - redirect immediately
          const redirectPath = await determineRedirectPath();
          router.push(redirectPath);
          return;
        }

        setEmailHint(data.emailHint || "");
        setStep("verify");
        setCodeSent(true);
        // Focus first digit
        setTimeout(() => {
          inputRefs.current[0]?.focus();
        }, 0);
      } else {
        setError(data.error || "Failed to send verification code");
      }
    } catch (err) {
      setError("Communication error. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Verify OTP
  async function handleVerifyCode() {
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      setError("Please enter all 6 digits");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          action: "verify",
          code: fullCode,
        }),
      });

      const data: OTPResponse = await res.json();

      if (data.success && data.verified) {
        // Redirect to appropriate page
        const redirectPath = await determineRedirectPath();
        router.push(redirectPath);
      } else {
        setRemainingAttempts(data.remainingAttempts || 0);
        setError(data.error || "Invalid code");
        // Reset code input
        setCode(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      setError("Communication error. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Determine where to redirect based on token type
  async function determineRedirectPath(): Promise<string> {
    try {
      // Try to fetch logs to determine if participant
      const res = await fetch(`/api/logs?token=${token}`);
      if (res.ok) {
        return `/p/${token}`;
      }
    } catch (err) {
      console.error(err);
    }

    // Default to manager page (or could be admin)
    return `/m/${token}`;
  }

  // Handle digit input
  function handleCodeChange(index: number, value: string) {
    // Only allow digits
    const digit = value.replace(/[^0-9]/g, "");

    if (digit.length > 1) {
      // Handle paste
      const digits = digit.split("");
      const newCode = [...code];
      for (let i = 0; i < Math.min(digits.length, 6 - index); i++) {
        newCode[index + i] = digits[i];
      }
      setCode(newCode);

      // Move focus to last filled position
      const lastFilledIndex = Math.min(index + digits.length - 1, 5);
      if (lastFilledIndex < 5) {
        inputRefs.current[lastFilledIndex + 1]?.focus();
      }
    } else {
      // Single digit input
      const newCode = [...code];
      newCode[index] = digit;
      setCode(newCode);

      // Auto-advance to next field
      if (digit && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  }

  // Handle backspace
  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      // Move to previous field if current is empty
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "Enter" && code.join("").length === 6) {
      handleVerifyCode();
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center text-white text-lg">
              🔐
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-[#1A1A2E] mb-2">メール認証</h1>
          <p className="text-sm text-[#5B5560]">
            {step === "send"
              ? "アカウントにアクセスするために、メール認証が必要です"
              : "認証コードを入力してください"}
          </p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E5DCD0]">
          {step === "send" && (
            <div className="space-y-4">
              <p className="text-sm text-[#5B5560]">
                登録されているメールアドレスに認証コードを送信します。
              </p>

              <button
                onClick={handleSendCode}
                disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-medium py-3 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                認証コードを送信
              </button>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
            </div>
          )}

          {step === "verify" && (
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-sm text-[#5B5560] mb-1">送信先</p>
                <p className="font-medium text-[#1A1A2E]">{emailHint}</p>
              </div>

              {/* 6-digit input boxes */}
              <div className="flex justify-center gap-2">
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    disabled={loading}
                    className="w-12 h-12 text-center text-xl font-bold border-2 border-[#C9BDAE] rounded-lg focus:border-indigo-500 focus:outline-none bg-white disabled:bg-[#F5F0EB] disabled:opacity-50"
                    placeholder="0"
                  />
                ))}
              </div>

              {/* Verify button */}
              <button
                onClick={handleVerifyCode}
                disabled={loading || code.join("").length !== 6}
                className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-medium py-3 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                認証する
              </button>

              {/* Error message */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  <p className="font-medium">{error}</p>
                  {remainingAttempts > 0 && (
                    <p className="text-xs mt-1">残り試行回数: {remainingAttempts}</p>
                  )}
                </div>
              )}

              {/* Resend link */}
              <div className="text-center pt-2 border-t border-[#E5DCD0]">
                <button
                  onClick={() => {
                    setStep("send");
                    setCode(["", "", "", "", "", ""]);
                    setError("");
                    setRemainingAttempts(5);
                    setCodeSent(false);
                  }}
                  disabled={loading}
                  className="text-sm text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  新しいコードをリクエスト
                </button>
              </div>

              {/* Info text */}
              <p className="text-xs text-[#8B8489] text-center">
                認証コードは10分間有効です
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-xs text-[#8B8489] text-center mt-8">
          Project CORE — Powered by Human Mature
        </p>
      </div>
    </div>
  );
}
