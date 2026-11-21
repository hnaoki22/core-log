// GET /api/admin/directory?token=xxx
// 管理画面の「環境とユーザー」の一覧。全環境と全ユーザー（ログイン用のパスつき）を返す。
//
// 管理者（is_admin）だけに返す。閲覧者（observer）とマネージャーには返さない：
// ログイン用のパスは、ほかの人の画面を開ける値なので。

import { NextRequest, NextResponse } from "next/server";
import { getManagerByToken } from "@/lib/participant-db";
import { loadAdminDirectory } from "@/lib/admin-directory-store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403, headers: NO_STORE });
  }

  const manager = await getManagerByToken(token);
  if (!manager || manager.isAdmin !== true) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403, headers: NO_STORE });
  }

  try {
    const directory = await loadAdminDirectory();
    return NextResponse.json(directory, { headers: NO_STORE });
  } catch (error) {
    logger.error("Admin directory load failed", { error: String(error) });
    return NextResponse.json(
      { error: "環境とユーザーの一覧を取得できませんでした" },
      { status: 500, headers: NO_STORE }
    );
  }
}
