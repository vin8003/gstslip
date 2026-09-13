export type PaymentsMode = "off" | "test" | "live";

export const PLAN_ID = "gstslip_pro_monthly" as const;
export const PLAN_PRICE_INR = 499;
export const MIN_ORDER_PAISE = 100;
export const PRO_AMOUNT_PAISE = PLAN_PRICE_INR * 100;
export const PRO_CURRENCY = "INR";
export const PERIOD_DAYS = 30;
export const CHECKOUT_THEME = "#0f4d44";

export type EntitlementStatus = "free" | "active" | "cancelled" | "expired";

export type EntitlementRow = {
  user_id: string;
  status: string;
  plan: string;
  subscribed_at: string | null;
  period_end: string | null;
  cancelled_at: string | null;
  updated_at: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_customer_id: string | null;
};

export type BillingSnapshot = {
  status: EntitlementStatus;
  isPro: boolean;
  periodEnd: string | null;
  daysLeft: number;
  plan: typeof PLAN_ID;
  priceInr: number;
  /** True when Razorpay Key Id + Key Secret are set — Upgrade opens Checkout. */
  paymentsLive: boolean;
  paymentsMode: PaymentsMode;
};

const DAY_MS = 86_400_000;

function str(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function mapEntitlementRow(row: Record<string, unknown>): EntitlementRow {
  return {
    user_id: String(row.user_id),
    status: String(row.status ?? "free"),
    plan: String(row.plan ?? PLAN_ID),
    subscribed_at: str(row, "subscribed_at"),
    period_end: str(row, "period_end"),
    cancelled_at: str(row, "cancelled_at"),
    updated_at: str(row, "updated_at") ?? new Date().toISOString(),
    razorpay_order_id: str(row, "razorpay_order_id"),
    razorpay_payment_id: str(row, "razorpay_payment_id"),
    razorpay_customer_id: str(row, "razorpay_customer_id"),
  };
}

export function daysLeft(end: Date, now: Date): number {
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

export function computeSnapshot(row: EntitlementRow, now = new Date()): BillingSnapshot {
  const periodEnd = row.period_end ? new Date(row.period_end) : null;
  const paid =
    (row.status === "active" || row.status === "cancelled") &&
    periodEnd != null &&
    periodEnd.getTime() > now.getTime();
  let status: EntitlementStatus;
  if (paid && row.status === "cancelled") status = "cancelled";
  else if (paid) status = "active";
  else if (row.status === "cancelled" || row.status === "expired" || row.status === "active") {
    status = "expired";
  } else {
    status = "free";
  }
  return {
    status,
    isPro: paid,
    periodEnd: periodEnd ? periodEnd.toISOString() : null,
    daysLeft: paid && periodEnd ? daysLeft(periodEnd, now) : 0,
    plan: PLAN_ID,
    priceInr: PLAN_PRICE_INR,
    paymentsLive: false,
    paymentsMode: "off",
  };
}

export function unstartedSnapshot(): BillingSnapshot {
  return {
    status: "free",
    isPro: false,
    periodEnd: null,
    daysLeft: 0,
    plan: PLAN_ID,
    priceInr: PLAN_PRICE_INR,
    paymentsLive: false,
    paymentsMode: "off",
  };
}

/** Razorpay orders are integer paise. Below 100 is rejected. */
export function parseOrderAmount(raw: unknown): number {
  const amount = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(amount) || amount < MIN_ORDER_PAISE) {
    throw new Error("Amount must be at least 100 paise.");
  }
  return Math.round(amount);
}

/** Razorpay `current_end` is unix seconds. Missing value → now + period days. */
export function periodEndIso(currentEnd: unknown, now = new Date(), days = PERIOD_DAYS): string {
  if (typeof currentEnd === "number" && Number.isFinite(currentEnd) && currentEnd > 0) {
    return new Date(currentEnd * 1000).toISOString();
  }
  return addDays(now, days).toISOString();
}
