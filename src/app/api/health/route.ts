import { NextResponse } from "next/server";

export async function GET() {
  const checks = {
    supabase: !!(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL),
    resend: !!process.env.RESEND_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  };

  const allHealthy = Object.values(checks).every((check) => check);
  const status = allHealthy ? "ok" : "degraded";

  return NextResponse.json({
    status,
    timestamp: new Date().toISOString(),
    checks,
  });
}
