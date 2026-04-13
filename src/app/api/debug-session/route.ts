/**
 * DEBUG: Session diagnostic endpoint
 * GET /api/debug-session?token=xxx
 *
 * Returns detailed session state information for debugging.
 * This endpoint should be removed after the session bug is resolved.
 */

import { NextRequest, NextResponse } from "next/server";
import { isSessionValid, getSessionCookieName, createSignedSessionValue } from "@/lib/session";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "token parameter required" }, { status: 400 });
  }

  const cookieHeader = request.headers.get("cookie");
  const cookieName = getSessionCookieName(token);

  // Parse all cookies to see what's there
  const allCookieNames: string[] = [];
  // (raw value extracted below)

  if (cookieHeader) {
    const parts = cookieHeader.split(";");
    for (const part of parts) {
      const trimmed = part.trim();
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        allCookieNames.push(trimmed.substring(0, eqIdx));
      }
    }
  }

  // Find the specific session cookie
  let rawValue: string | null = null;
  let decodedValue: string | null = null;
  if (cookieHeader) {
    const match = cookieHeader.split(";").find(c => c.trim().startsWith(`${cookieName}=`));
    if (match) {
      rawValue = match.split("=").slice(1).join("=").trim();
      try {
        decodedValue = decodeURIComponent(rawValue);
      } catch {
        decodedValue = rawValue;
      }
    }
  }

  // Validate session
  const sessionValid = await isSessionValid(token, cookieHeader);

  // Generate what a fresh signed value would look like (for comparison)
  const freshSignedValue = await createSignedSessionValue(token);

  // Check if the decoded value's signature matches
  let signatureAnalysis: Record<string, unknown> = {};
  if (decodedValue) {
    const lastDot = decodedValue.lastIndexOf(".");
    if (lastDot > -1) {
      const payload = decodedValue.substring(0, lastDot);
      const receivedSig = decodedValue.substring(lastDot + 1);
      const expectedPayload = `verified:${token}`;

      // What the fresh value looks like
      const freshLastDot = freshSignedValue.lastIndexOf(".");
      const freshSig = freshSignedValue.substring(freshLastDot + 1);

      signatureAnalysis = {
        payload,
        expectedPayload,
        payloadMatch: payload === expectedPayload,
        receivedSigLength: receivedSig.length,
        expectedSigLength: freshSig.length,
        signaturesMatch: receivedSig === freshSig,
        receivedSigFirst8: receivedSig.substring(0, 8),
        expectedSigFirst8: freshSig.substring(0, 8),
      };
    } else {
      signatureAnalysis = { error: "no dot found in value", isLegacy: decodedValue === "verified" };
    }
  }

  // Environment info
  const envInfo = {
    nodeEnv: process.env.NODE_ENV,
    hasCronSecret: !!process.env.CRON_SECRET,
    cronSecretLength: process.env.CRON_SECRET?.length ?? 0,
    hasSessionSecret: !!process.env.SESSION_SECRET,
    sessionSecretLength: process.env.SESSION_SECRET?.length ?? 0,
    runtime: typeof EdgeRuntime !== "undefined" ? "edge" : "nodejs",
  };

  return NextResponse.json({
    token: token.substring(0, 6) + "...",
    cookieName,
    cookieHeaderPresent: !!cookieHeader,
    totalCookies: allCookieNames.length,
    allCookieNames,
    sessionCookieFound: !!rawValue,
    rawValueLength: rawValue?.length ?? 0,
    rawValueFirst30: rawValue?.substring(0, 30) ?? null,
    decodedValueFirst30: decodedValue?.substring(0, 30) ?? null,
    sessionValid,
    signatureAnalysis,
    envInfo,
    freshSignedValueLength: freshSignedValue.length,
    timestamp: new Date().toISOString(),
  });
}

// Suppress TypeScript error for EdgeRuntime check
declare const EdgeRuntime: string | undefined;
