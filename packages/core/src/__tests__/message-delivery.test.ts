import { describe, expect, it } from "vitest";
import { isInQuietHours, planDelivery, type DeliveryPreference } from "../message-delivery.js";

function pref(partial: Partial<DeliveryPreference> = {}): DeliveryPreference {
  return {
    preferredChannels: ["push", "email"],
    mode: "instant",
    deliveryPolicy: "first_success",
    quietHoursStart: null,
    quietHoursEnd: null,
    isEnabled: true,
    ...partial,
  };
}

describe("planDelivery", () => {
  it("first_success stops at first successful channel", () => {
    const plan = planDelivery(pref(), "info");
    expect(plan.channels).toEqual(["push", "email"]);
    expect(plan.stopAtFirstSuccess).toBe(true);
    expect(plan.deferred).toBe(false);
  });

  it("all_channels delivers everywhere", () => {
    const plan = planDelivery(pref({ deliveryPolicy: "all_channels" }), "info");
    expect(plan.stopAtFirstSuccess).toBe(false);
  });

  it("critical messages fan out on all channels even with first_success", () => {
    const plan = planDelivery(pref(), "critical");
    expect(plan.stopAtFirstSuccess).toBe(false);
  });

  it("digest modes defer external delivery", () => {
    expect(planDelivery(pref({ mode: "digest_daily" }), "info").deferred).toBe(true);
    expect(planDelivery(pref({ mode: "digest_weekly" }), "info").deferred).toBe(true);
  });

  it("never mode sends nothing externally", () => {
    const plan = planDelivery(pref({ mode: "never" }), "info");
    expect(plan.channels).toEqual([]);
    expect(plan.reason).toBe("never");
  });

  it("in_app_only sends nothing externally", () => {
    const plan = planDelivery(pref({ deliveryPolicy: "in_app_only" }), "info");
    expect(plan.reason).toBe("in_app_only");
  });

  it("respects quiet hours for non-critical messages", () => {
    // 23:00 falls within a 22:00-07:00 overnight quiet window.
    const at23 = new Date(Date.UTC(2026, 5, 1, 23, 0));
    const plan = planDelivery(pref({ quietHoursStart: "22:00", quietHoursEnd: "07:00" }), "info", at23);
    expect(plan.deferred).toBe(true);
    expect(plan.reason).toBe("quiet_hours");
  });

  it("ignores quiet hours for critical messages", () => {
    const at23 = new Date(Date.UTC(2026, 5, 1, 23, 0));
    const plan = planDelivery(pref({ quietHoursStart: "22:00", quietHoursEnd: "07:00" }), "critical", at23);
    expect(plan.deferred).toBe(false);
  });
});

describe("isInQuietHours", () => {
  it("handles overnight windows", () => {
    expect(isInQuietHours(new Date(Date.UTC(2026, 0, 1, 23, 30)), "22:00", "07:00")).toBe(true);
    expect(isInQuietHours(new Date(Date.UTC(2026, 0, 1, 3, 0)), "22:00", "07:00")).toBe(true);
    expect(isInQuietHours(new Date(Date.UTC(2026, 0, 1, 12, 0)), "22:00", "07:00")).toBe(false);
  });
  it("handles same-day windows", () => {
    expect(isInQuietHours(new Date(Date.UTC(2026, 0, 1, 10, 0)), "09:00", "17:00")).toBe(true);
    expect(isInQuietHours(new Date(Date.UTC(2026, 0, 1, 20, 0)), "09:00", "17:00")).toBe(false);
  });
});
