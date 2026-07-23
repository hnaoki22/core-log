// POST /api/entry
// Create morning entry or update with evening data
// Prevents duplicate entries for the same day

import { NextRequest, NextResponse } from "next/server";
import { createMorningEntry, createEveningOnlyEntry, updateEveningEntry, hasLoggedToday, getLogsByParticipant, insertSkipReason } from "@/lib/supabase";
import { computeSkipFollowup } from "@/lib/standalone";
import { getParticipantByToken, getManagerById } from "@/lib/participant-db";
import { sendNotificationEmail } from "@/lib/email";
import { isProgramEnded, isProgramNotStarted, getCurrentHourJST, isGracePeriod, MORNING_CLOSE_HOUR_JST } from "@/lib/date-utils";
import { sanitizeInput } from "@/lib/sanitize";
import { logger } from "@/lib/logger";
import { resolvePhaseMode, triggerBodyPromptIfNeeded } from "@/lib/kan-no-ki";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { sanitizeConditionGauges, sanitizeCarriedOver } from "@/lib/condition-gauges";

// standalone §5: 復帰日の未記入フォローアップ。
// その日最初のエントリ作成（morning / evening_only）後にのみ判定する。
// ギャップの事実は回答を待たず skip_reasons に先に記録する（空＝事実だけ記録）。
async function buildSkipFollowup(
  standalone: boolean,
  participantName: string,
  tenantId: string,
  participantId: string,
  date: string,
  pageId: string
): Promise<{ question: string; gapWeekdays: number; returnLogId: string } | null> {
  if (!standalone) return null;
  try {
    const logs = await getLogsByParticipant(participantName, tenantId, { includeKanNoKi: true });
    const fu = computeSkipFollowup(logs, date);
    if (!fu) return null;
    await insertSkipReason({
      tenantId,
      participantId,
      gapStart: fu.gapStart,
      gapEnd: fu.gapEnd,
      gapWeekdays: fu.gapWeekdays,
      returnLogId: pageId,
    });
    return { question: fu.question, gapWeekdays: fu.gapWeekdays, returnLogId: pageId };
  } catch (e) {
    logger.warn("skip followup computation failed (non-fatal)", { error: String(e), participantName });
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, token } = body;

    if (!token || !type) {
      return NextResponse.json({ error: "Token and type required" }, { status: 400 });
    }

    // Check if participant's program is still active
    const participant = await getParticipantByToken(token);
    if (!participant) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    if (!participant.tenantId) {
      logger.error("Entry API: participant missing tenantId (DB invariant broken)", { participantId: participant.id });
      return NextResponse.json({ error: "Participant tenant unresolved" }, { status: 500 });
    }
    const tenantId = participant.tenantId;
    const participantId = participant.id;
    // standalone商品モード（§1/§3）: 朝夕の気分を分離保存し、体調自由記述を受け付ける
    const standalone = await isFeatureEnabled("standalone_mode", tenantId);
    // logform v2（朝夕ログ刷新）: standalone の上に重ねるレイヤー。ON のテナントでのみ
    // 体調3ゲージ・アウトカム型設問・行動/意識設問・引き継ぎメタを受け付ける。
    const logformV2 = standalone && (await isFeatureEnabled("logform_v2", tenantId));
    if (participant.endDate && isProgramEnded(participant.endDate)) {
      return NextResponse.json({
        error: "プログラムは終了しています。日報の入力はできません。",
        programEnded: true,
      }, { status: 403 });
    }
    if (participant.startDate && isProgramNotStarted(participant.startDate)) {
      return NextResponse.json({
        error: "プログラムはまだ開始されていません。",
        notStarted: true,
      }, { status: 403 });
    }

    // Real Notion API
    if (type === "morning") {
      const { participantName, date, morningIntent, energy, dojoPhase, weekNum, morningDurationSec } = body;

      // 朝の記入は14:00まで（2026-07-22 戦略会議決定。旧: 正午12:00）
      // 深夜0:00〜1:59はグレースピリオド（前日扱い）なので朝の記入は不可
      const hour = getCurrentHourJST();
      if (hour >= MORNING_CLOSE_HOUR_JST || isGracePeriod()) {
        return NextResponse.json(
          { error: `朝の意図設定は${MORNING_CLOSE_HOUR_JST}:00までです。本日の振り返りをご記入ください。`, morningClosed: true },
          { status: 403 }
        );
      }

      // Sanitize user input
      const sanitizedMorningIntent = sanitizeInput(morningIntent || "");

      // Check if entry already exists for today
      const todayStatus = await hasLoggedToday(participantName, date, tenantId);
      if (todayStatus.hasMorning) {
        return NextResponse.json(
          { error: "今日の朝の記入は既に完了しています" },
          { status: 409 }
        );
      }

      const phaseMode = await resolvePhaseMode(participantId, tenantId);
      const sanitizedBodyIntent = body.bodyIntent ? sanitizeInput(String(body.bodyIntent)) : null;
      // standalone §3 画面①: 朝の体調（自由記述・空可）
      const sanitizedMorningCondition = standalone && body.morningCondition
        ? sanitizeInput(String(body.morningCondition))
        : null;
      // logform v2 朝フィールド（F1 体調3ゲージ / F2 Q2 行動 / F4 引き継ぎメタ）
      const sanitizedMorningAction = logformV2 && body.morningAction
        ? sanitizeInput(String(body.morningAction))
        : null;
      const v2Morning = logformV2
        ? {
            conditionGauges: sanitizeConditionGauges(body.conditionGauges),
            action: sanitizedMorningAction && sanitizedMorningAction.length > 0 ? sanitizedMorningAction : null,
            carriedOver: sanitizeCarriedOver(body.carriedOver),
            logformVersion: 2,
          }
        : undefined;
      const pageId = await createMorningEntry(
        participantName, date, sanitizedMorningIntent, energy,
        dojoPhase, weekNum, tenantId, participantId,
        typeof morningDurationSec === "number" ? morningDurationSec : null,
        phaseMode,
        sanitizedBodyIntent && sanitizedBodyIntent.length > 0 ? sanitizedBodyIntent : null,
        sanitizedMorningCondition && sanitizedMorningCondition.length > 0 ? sanitizedMorningCondition : null,
        v2Morning,
      );
      if (!pageId) {
        return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
      }
      // 観の期参加者で強い感情語が含まれていたら身体への問いかけを添える
      if (phaseMode === "kan-no-ki") {
        await triggerBodyPromptIfNeeded(participantId, tenantId, sanitizedMorningIntent, pageId);
      }
      // duration を含めて応答（フロントの「N 分 N 秒で書きました」表示用）
      const respDuration = typeof morningDurationSec === "number" && morningDurationSec >= 0 && morningDurationSec <= 1800
        ? Math.round(morningDurationSec) : null;

      // Notify manager that subordinate submitted morning log
      // standalone §7-2: 通知メールは本文スニペットを含む＝「誰も見れない」と
      // 矛盾するため送らない（6/15時点の最小実装）
      try {
        const participant = standalone ? null : await getParticipantByToken(token);
        if (participant?.managerId) {
          const mgr = await getManagerById(participant.managerId);
          if (mgr?.email && !mgr.email.includes("example.com")) {
            await sendNotificationEmail({
              to: mgr.email,
              recipientName: mgr.name.split(" ")[0],
              senderName: participantName,
              token: mgr.token,
              type: "daily_log_submitted",
              detail: `朝の意図：${sanitizedMorningIntent.substring(0, 60)}${sanitizedMorningIntent.length > 60 ? "…" : ""}`,
            });
          }
        }
      } catch (e) {
        logger.error("Failed to send manager notification", { error: String(e), participantName });
      }

      // standalone §5: 復帰日ならフォローアップ1問を完了画面に添える
      const skipFollowupM = await buildSkipFollowup(standalone, participantName, tenantId, participantId, date, pageId);

      logger.info("Morning entry created", { participantName, date, pageId, durationSec: respDuration });
      return NextResponse.json({ success: true, pageId, durationSec: respDuration, skipFollowup: skipFollowupM });
    }

    if (type === "evening") {
      const { pageId, eveningInsight, energy, participantName, eveningDurationSec } = body;
      if (!pageId) {
        return NextResponse.json({ error: "pageId is required for evening entry" }, { status: 400 });
      }

      // Sanitize user input
      const sanitizedEveningInsight = sanitizeInput(eveningInsight || "");

      // 観の期の身体欄（任意）。InputClient は kan-no-ki 時のみ bodyCheck を送る。
      // 従来この値を読まずに捨てていた（朝→夕フローで夕の身体欄が喪失するバグ）。
      const sanitizedBodyCheckE = body.bodyCheck ? sanitizeInput(String(body.bodyCheck)) : null;
      // standalone §2/§3: 夕の気分は evening_energy へ分離保存し、
      // energy（朝の気分）を上書きしない（energy=null で呼ぶ）。
      // 従来テナントは energy 上書きの既存挙動を完全維持（evening_energy も
      // 送らない＝migration とのデプロイ順序に依存しない・大幸無回帰）。
      const sanitizedEveningCondition = standalone && body.eveningCondition
        ? sanitizeInput(String(body.eveningCondition))
        : null;
      // logform v2 夕フィールド（F3 Q2 状態一言）
      const sanitizedEveningState = logformV2 && body.eveningState
        ? sanitizeInput(String(body.eveningState))
        : null;
      const success = await updateEveningEntry(
        pageId, sanitizedEveningInsight, standalone ? null : energy,
        typeof eveningDurationSec === "number" ? eveningDurationSec : null,
        sanitizedBodyCheckE && sanitizedBodyCheckE.length > 0 ? sanitizedBodyCheckE : null,
        standalone
          ? {
              eveningEnergy: energy || null,
              eveningCondition: sanitizedEveningCondition && sanitizedEveningCondition.length > 0 ? sanitizedEveningCondition : null,
              ...(logformV2
                ? {
                    conditionGauges: sanitizeConditionGauges(body.conditionGauges),
                    eveningState: sanitizedEveningState && sanitizedEveningState.length > 0 ? sanitizedEveningState : null,
                    carriedOver: sanitizeCarriedOver(body.carriedOver),
                    logformVersion: 2,
                  }
                : {}),
            }
          : undefined
      );
      if (!success) {
        return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
      }
      // 観の期参加者で強い感情語が含まれていたら身体への問いかけを添える
      try {
        const phaseModeE = await resolvePhaseMode(participantId, tenantId);
        if (phaseModeE === "kan-no-ki") {
          await triggerBodyPromptIfNeeded(participantId, tenantId, sanitizedEveningInsight, pageId);
        }
      } catch (e) {
        logger.warn("Body prompt trigger skipped (evening)", { error: String(e) });
      }
      const respDurationE = typeof eveningDurationSec === "number" && eveningDurationSec >= 0 && eveningDurationSec <= 1800
        ? Math.round(eveningDurationSec) : null;

      // Notify manager that subordinate submitted evening log
      // standalone §7-2: 通知メールは送らない（本文スニペット掲載のため）
      try {
        const participant = standalone ? null : await getParticipantByToken(token);
        if (participant?.managerId) {
          const mgr = await getManagerById(participant.managerId);
          if (mgr?.email && !mgr.email.includes("example.com")) {
            await sendNotificationEmail({
              to: mgr.email,
              recipientName: mgr.name.split(" ")[0],
              senderName: participantName || participant.name,
              token: mgr.token,
              type: "daily_log_submitted",
              detail: `本日の振り返り：${sanitizedEveningInsight.substring(0, 60)}${sanitizedEveningInsight.length > 60 ? "…" : ""}`,
            });
          }
        }
      } catch (e) {
        logger.error("Failed to send manager notification", { error: String(e), participantName });
      }

      logger.info("Evening entry updated", { participantName, pageId, durationSec: respDurationE });
      return NextResponse.json({ success: true, durationSec: respDurationE });
    }

    // 朝未記入で14:00（MORNING_CLOSE_HOUR_JST）を過ぎた場合の夕方のみエントリー
    if (type === "evening_only") {
      const { participantName, date, eveningInsight, energy, dojoPhase, weekNum, eveningDurationSec } = body;

      const sanitizedEveningInsight = sanitizeInput(eveningInsight || "");

      // Check if entry already exists for today
      const todayStatus = await hasLoggedToday(participantName, date, tenantId);
      if (todayStatus.hasEvening) {
        return NextResponse.json(
          { error: "今日の夕方の記入は既に完了しています" },
          { status: 409 }
        );
      }

      const phaseModeEO = await resolvePhaseMode(participantId, tenantId);
      const sanitizedBodyCheckEO = body.bodyCheck ? sanitizeInput(String(body.bodyCheck)) : null;
      // standalone §2/§3: 夕のみ記入では energy（朝の気分）は null のまま、
      // 夕の気分は evening_energy へ。従来テナントは既存挙動（energy=夕の値、
      // evening_energy は送らない）を完全維持。
      const sanitizedEveningConditionEO = standalone && body.eveningCondition
        ? sanitizeInput(String(body.eveningCondition))
        : null;
      // logform v2 夕フィールド（F3 Q2 状態一言）
      const sanitizedEveningStateEO = logformV2 && body.eveningState
        ? sanitizeInput(String(body.eveningState))
        : null;
      const pageId = await createEveningOnlyEntry(
        participantName, date, sanitizedEveningInsight, standalone ? null : energy,
        dojoPhase, weekNum, tenantId, participantId,
        typeof eveningDurationSec === "number" ? eveningDurationSec : null,
        phaseModeEO,
        sanitizedBodyCheckEO && sanitizedBodyCheckEO.length > 0 ? sanitizedBodyCheckEO : null,
        standalone
          ? {
              eveningEnergy: energy || null,
              eveningCondition: sanitizedEveningConditionEO && sanitizedEveningConditionEO.length > 0 ? sanitizedEveningConditionEO : null,
              ...(logformV2
                ? {
                    conditionGauges: sanitizeConditionGauges(body.conditionGauges),
                    eveningState: sanitizedEveningStateEO && sanitizedEveningStateEO.length > 0 ? sanitizedEveningStateEO : null,
                    carriedOver: sanitizeCarriedOver(body.carriedOver),
                    logformVersion: 2,
                  }
                : {}),
            }
          : undefined
      );
      if (!pageId) {
        return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
      }
      // 観の期参加者で強い感情語が含まれていたら身体への問いかけを添える
      if (phaseModeEO === "kan-no-ki") {
        await triggerBodyPromptIfNeeded(participantId, tenantId, sanitizedEveningInsight, pageId);
      }
      const respDurationEO = typeof eveningDurationSec === "number" && eveningDurationSec >= 0 && eveningDurationSec <= 1800
        ? Math.round(eveningDurationSec) : null;

      // Notify manager
      // standalone §7-2: 通知メールは送らない（本文スニペット掲載のため）
      try {
        const participant = standalone ? null : await getParticipantByToken(token);
        if (participant?.managerId) {
          const mgr = await getManagerById(participant.managerId);
          if (mgr?.email && !mgr.email.includes("example.com")) {
            await sendNotificationEmail({
              to: mgr.email,
              recipientName: mgr.name.split(" ")[0],
              senderName: participantName,
              token: mgr.token,
              type: "daily_log_submitted",
              detail: `本日の振り返り：${sanitizedEveningInsight.substring(0, 60)}${sanitizedEveningInsight.length > 60 ? "…" : ""}`,
            });
          }
        }
      } catch (e) {
        logger.error("Failed to send manager notification", { error: String(e), participantName });
      }

      // standalone §5: 復帰日ならフォローアップ1問を完了画面に添える
      const skipFollowupEO = await buildSkipFollowup(standalone, participantName, tenantId, participantId, date, pageId);

      logger.info("Evening-only entry created", { participantName, date, pageId, durationSec: respDurationEO });
      return NextResponse.json({ success: true, pageId, durationSec: respDurationEO, skipFollowup: skipFollowupEO });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    logger.error("Entry API error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
