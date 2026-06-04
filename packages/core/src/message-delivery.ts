import type { DeliveryPolicy, MessageChannel, MessageMode, MessageSeverity } from "@naxeu/shared";

export interface DeliveryPreference {
  preferredChannels: string[];
  mode: MessageMode;
  deliveryPolicy: DeliveryPolicy;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  isEnabled: boolean;
}

export interface DeliveryPlan {
  /** External channels to attempt, in order. */
  channels: MessageChannel[];
  /** When true, the executor stops after the first successful channel. */
  stopAtFirstSuccess: boolean;
  /** True when external delivery is deferred (digest / quiet hours). */
  deferred: boolean;
  reason: "ok" | "disabled" | "never" | "digest" | "quiet_hours" | "in_app_only";
}

const EXTERNAL_CHANNELS: MessageChannel[] = ["push", "email", "sms"];

/** Parses "HH:MM" (or "HH:MM:SS") to minutes since midnight. */
function toMinutes(value: string): number {
  const [h, m] = value.split(":");
  return Number.parseInt(h ?? "0", 10) * 60 + Number.parseInt(m ?? "0", 10);
}

/** True when `now` falls inside the quiet-hours window (supports wrap-around). */
export function isInQuietHours(now: Date, start?: string | null, end?: string | null): boolean {
  if (!start || !end) return false;
  const current = now.getUTCHours() * 60 + now.getUTCMinutes();
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return false;
  // Same-day window (e.g. 09:00-17:00) vs overnight window (e.g. 22:00-07:00).
  return s < e ? current >= s && current < e : current >= s || current < e;
}

/**
 * Decides how an in-app message should additionally be delivered externally.
 *
 * Rules (per spec):
 *  - The message is always visible in-app; this only governs external channels.
 *  - Default policy `first_success`: try channels in order, stop at first OK,
 *    so push success means no email.
 *  - `all_channels` (or critical messages) deliver on every channel.
 *  - Digest modes and quiet hours defer external delivery.
 */
export function planDelivery(
  pref: DeliveryPreference,
  severity: MessageSeverity,
  now: Date = new Date(),
): DeliveryPlan {
  if (!pref.isEnabled) {
    return { channels: [], stopAtFirstSuccess: false, deferred: false, reason: "disabled" };
  }
  if (pref.mode === "never") {
    return { channels: [], stopAtFirstSuccess: false, deferred: false, reason: "never" };
  }
  if (pref.deliveryPolicy === "in_app_only") {
    return { channels: [], stopAtFirstSuccess: false, deferred: false, reason: "in_app_only" };
  }
  if (pref.mode === "digest_daily" || pref.mode === "digest_weekly" || pref.deliveryPolicy === "digest") {
    return { channels: [], stopAtFirstSuccess: false, deferred: true, reason: "digest" };
  }

  const isCritical = severity === "critical";
  // Quiet hours suppress external delivery unless the message is critical.
  if (!isCritical && isInQuietHours(now, pref.quietHoursStart, pref.quietHoursEnd)) {
    return { channels: [], stopAtFirstSuccess: false, deferred: true, reason: "quiet_hours" };
  }

  const channels = pref.preferredChannels.filter((c): c is MessageChannel =>
    EXTERNAL_CHANNELS.includes(c as MessageChannel),
  );

  // all_channels, or critical messages, fan out everywhere; otherwise first win.
  const allChannels = pref.deliveryPolicy === "all_channels" || isCritical;
  return {
    channels,
    stopAtFirstSuccess: !allChannels,
    deferred: false,
    reason: "ok",
  };
}
