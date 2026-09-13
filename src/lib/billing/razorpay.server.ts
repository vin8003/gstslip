import {
  PERIOD_DAYS,
  PLAN_ID,
  PLAN_PRICE_INR,
  PRO_AMOUNT_PAISE,
  PRO_CURRENCY,
  parseOrderAmount,
} from "./plan";
import { paymentsLive } from "./live";
import { KEYS_REJECTED_MESSAGE, readRazorpayKeys } from "./credentials";
import { verifyOrderCheckoutSignature, verifyWebhookSignature } from "./signatures";
import type { CheckoutSession } from "./types";

export { paymentsLive } from "./live";
export type { CheckoutSession } from "./types";
export { PRO_AMOUNT_PAISE, PRO_CURRENCY, parseOrderAmount } from "./plan";

const API = "https://api.razorpay.com/v1";

export type SubscribeMode = "razorpay" | "preview" | "unset";

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status?: string;
  notes?: Record<string, string> | null;
  receipt?: string | null;
};

export class RazorpayHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RazorpayHttpError";
    this.status = status;
  }
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function keys() {
  return readRazorpayKeys();
}

/**
 * preview  — Grok live preview / PGLite, no keys: record Pro without charging.
 * razorpay — keys present: Checkout, entitlement only after payment.
 * unset    — public Neon without keys: refuse the free toggle.
 */
export function subscribeMode(): SubscribeMode {
  if (paymentsLive()) return "razorpay";
  if (!env("DATABASE_URL")) return "preview";
  return "unset";
}

function authHeader(): string {
  const { keyId, keySecret } = keys();
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`, "utf8").toString("base64")}`;
}

function describeRazorpayError(
  status: number,
  json: { error?: { description?: string; reason?: string; code?: string } },
): string {
  const desc = json.error?.description || json.error?.reason || `Razorpay ${status}`;
  if (status === 401 || /authentication failed/i.test(desc)) return KEYS_REJECTED_MESSAGE;
  return desc;
}

async function rzp<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { keyId, keySecret } = keys();
  if (!keyId || !keySecret) {
    throw new RazorpayHttpError(401, "Payment account is not connected.");
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { description?: string; reason?: string; code?: string };
  } & T;
  if (!res.ok) {
    throw new RazorpayHttpError(res.status, describeRazorpayError(res.status, json));
  }
  return json as T;
}

export async function createOrder(opts: {
  amount: number;
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  let amount: number;
  try {
    amount = parseOrderAmount(opts.amount);
  } catch (err) {
    throw new RazorpayHttpError(400, err instanceof Error ? err.message : "Invalid amount.");
  }
  const currency = (opts.currency || PRO_CURRENCY).trim() || PRO_CURRENCY;
  const receipt = (opts.receipt || `gs_${Date.now()}`).slice(0, 40);
  return rzp<RazorpayOrder>("POST", "/orders", {
    amount,
    currency,
    receipt,
    notes: opts.notes ?? {},
  });
}

export async function createProCheckout(opts: {
  userId: string;
  name: string;
  email: string;
}): Promise<CheckoutSession> {
  const { keyId } = keys();
  if (!keyId) throw new Error("Payment account is not connected.");
  const order = await createOrder({
    amount: PRO_AMOUNT_PAISE,
    currency: PRO_CURRENCY,
    receipt: `gs_${opts.userId.replace(/[^a-zA-Z0-9]/g, "").slice(-12)}_${Date.now()}`.slice(0, 40),
    notes: { user_id: opts.userId, plan: PLAN_ID },
  });
  return {
    keyId,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    name: "GSTSlip",
    description: `Pro · ₹${PLAN_PRICE_INR} / ${PERIOD_DAYS} days`,
    prefillName: opts.name,
    prefillEmail: opts.email,
  };
}

export async function fetchOrder(id: string): Promise<RazorpayOrder> {
  return rzp<RazorpayOrder>("GET", `/orders/${id}`);
}

export function assertOrderCheckout(orderId: string, paymentId: string, signature: string): boolean {
  return verifyOrderCheckoutSignature(orderId, paymentId, signature, keys().keySecret);
}

export function assertWebhook(rawBody: string, signature: string): boolean {
  return verifyWebhookSignature(rawBody, signature, env("RAZORPAY_WEBHOOK_SECRET"));
}
