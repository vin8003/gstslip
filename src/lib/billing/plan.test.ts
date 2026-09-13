import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_PRICE_INR,
  PRO_AMOUNT_PAISE,
  addDays,
  computeSnapshot,
  parseOrderAmount,
  periodEndIso,
  unstartedSnapshot,
  type EntitlementRow,
} from "./plan.ts";

function row(patch: Partial<EntitlementRow>): EntitlementRow {
  return {
    user_id: "u1",
    status: "free",
    plan: "gstslip_pro_monthly",
    subscribed_at: null,
    period_end: null,
    cancelled_at: null,
    updated_at: "2026-09-01T00:00:00.000Z",
    razorpay_order_id: null,
    razorpay_payment_id: null,
    razorpay_customer_id: null,
    ...patch,
  };
}

describe("billing snapshot", () => {
  it("keeps a free account off Pro", () => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    const snap = computeSnapshot(row({}), now);
    assert.equal(snap.status, "free");
    assert.equal(snap.isPro, false);
    assert.equal(snap.daysLeft, 0);
    assert.equal(snap.priceInr, PLAN_PRICE_INR);
    assert.equal(snap.paymentsLive, false);
  });

  it("keeps Pro open until period_end", () => {
    const now = new Date("2026-09-10T00:00:00.000Z");
    const snap = computeSnapshot(
      row({
        status: "active",
        subscribed_at: "2026-08-31T00:00:00.000Z",
        period_end: "2026-09-30T00:00:00.000Z",
      }),
      now,
    );
    assert.equal(snap.status, "active");
    assert.equal(snap.isPro, true);
    assert.equal(snap.daysLeft, 20);
  });

  it("lets a cancelled plan run until the paid period ends", () => {
    const now = new Date("2026-09-10T00:00:00.000Z");
    const snap = computeSnapshot(
      row({
        status: "cancelled",
        period_end: "2026-09-20T00:00:00.000Z",
        cancelled_at: "2026-09-05T00:00:00.000Z",
      }),
      now,
    );
    assert.equal(snap.status, "cancelled");
    assert.equal(snap.isPro, true);
  });

  it("closes Pro when the paid window lapses", () => {
    const now = new Date("2026-10-01T00:00:01.000Z");
    const snap = computeSnapshot(
      row({
        status: "active",
        period_end: "2026-09-30T00:00:00.000Z",
      }),
      now,
    );
    assert.equal(snap.status, "expired");
    assert.equal(snap.isPro, false);
    assert.equal(snap.daysLeft, 0);
  });

  it("addDays is used for a 30-day paid window", () => {
    const start = new Date("2026-08-30T00:00:00.000Z");
    assert.equal(addDays(start, 30).toISOString(), "2026-09-29T00:00:00.000Z");
  });

  it("starts unstarted as free, not Pro", () => {
    const snap = unstartedSnapshot();
    assert.equal(snap.status, "free");
    assert.equal(snap.isPro, false);
    assert.equal(snap.priceInr, 499);
  });
});

describe("order amount", () => {
  it("accepts GSTSlip Pro paise and rejects below 100", () => {
    assert.equal(parseOrderAmount(PRO_AMOUNT_PAISE), 49900);
    assert.throws(() => parseOrderAmount(99));
    assert.throws(() => parseOrderAmount("nope"));
  });
});

describe("period end from Razorpay", () => {
  it("reads unix current_end, else +30 days", () => {
    const unix = Date.parse("2026-09-30T00:00:00.000Z") / 1000;
    assert.equal(periodEndIso(unix), "2026-09-30T00:00:00.000Z");
    assert.equal(
      periodEndIso(null, new Date("2026-08-30T00:00:00.000Z"), 30),
      "2026-09-29T00:00:00.000Z",
    );
  });
});
