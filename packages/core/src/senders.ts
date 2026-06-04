import type { ChannelSender } from "./context.js";

/**
 * Default mock channel senders for the community MVP. They simulate delivery so
 * the full message pipeline (attempts, first_success fallback) works without
 * real Push/SMTP infrastructure.
 *
 * Push "fails" when no VAPID keys are configured, which lets `first_success`
 * fall back to email — demonstrating the documented fallback behaviour.
 */
export function buildDefaultSenders(): ChannelSender[] {
  const pushConfigured = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  const smtpConfigured = Boolean(process.env.SMTP_HOST);

  return [
    {
      channel: "push",
      async send() {
        if (!pushConfigured) {
          return { ok: false, provider: "web-push", error: "no VAPID keys configured" };
        }
        return { ok: true, provider: "web-push", providerMessageId: `push_${Date.now()}` };
      },
    },
    {
      channel: "email",
      async send({ userId, title }) {
        console.log(`[email] -> user ${userId}: ${title}${smtpConfigured ? "" : " (mock transport)"}`);
        return {
          ok: true,
          provider: smtpConfigured ? "smtp" : "mock-smtp",
          providerMessageId: `mail_${Date.now()}`,
        };
      },
    },
  ];
}
