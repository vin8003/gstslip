import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  PLAN_ID,
  computeSnapshot,
  mapEntitlementRow,
  periodEndIso,
  unstartedSnapshot,
  type BillingSnapshot,
  type EntitlementRow,
} from "./plan";
import type { SubscribeResult } from "./types";

export type { SubscribeResult } from "./types";

export function isUnauthorized(err: unknown): boolean {
  return /unauthorized/i.test(err instanceof Error ? err.message : String(err));
}

async function sql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

function mapRow(row: Record<string, unknown>): EntitlementRow {
  return mapEntitlementRow(row);
}

async function fetchRow(userId: string): Promise<EntitlementRow | null> {
  const db = await sql();
  const rows = await db`select * from entitlements where user_id = ${userId} limit 1`;
  if (!rows[0]) return null;
  return mapRow(rows[0] as Record<string, unknown>);
}

async function fetchRowByOrder(orderId: string): Promise<EntitlementRow | null> {
  const db = await sql();
  const rows = await db`
    select * from entitlements where razorpay_order_id = ${orderId} limit 1
  `;
  if (!rows[0]) return null;
  return mapRow(rows[0] as Record<string, unknown>);
}

async function ensureRow(userId: string): Promise<EntitlementRow> {
  const db = await sql();
  await db`
    insert into entitlements (user_id, status, plan)
    values (${userId}, 'free', ${PLAN_ID})
    on conflict (user_id) do nothing
  `;
  const row = await fetchRow(userId);
  if (!row) throw new Error("entitlement missing");
  return row;
}

async function accountOf(userId: string): Promise<{ name: string; email: string }> {
  const db = await sql();
  const rows = await db<{ name: string | null; email: string | null }>`
    select name, email from "user" where id = ${userId} limit 1
  `;
  return {
    name: rows[0]?.name?.trim() || "GSTSlip",
    email: rows[0]?.email?.trim() || "",
  };
}

async function markSnapshot(snap: BillingSnapshot): Promise<BillingSnapshot> {
  const { paymentsLive, paymentsMode } = await import("./live");
  return { ...snap, paymentsLive: paymentsLive(), paymentsMode: paymentsMode() };
}

export async function readSnapshot(userId: string): Promise<BillingSnapshot> {
  const row = await fetchRow(userId);
  const snap = row ? computeSnapshot(row) : unstartedSnapshot();
  return markSnapshot(snap);
}

export const getEntitlement = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BillingSnapshot> => {
    return readSnapshot(context.userId);
  });

async function grantPreview(userId: string): Promise<BillingSnapshot> {
  const db = await sql();
  await ensureRow(userId);
  const periodEnd = periodEndIso(null);
  await db`
    update entitlements
    set status = 'active',
        subscribed_at = coalesce(subscribed_at, now()),
        period_end = ${periodEnd}::timestamptz,
        cancelled_at = null,
        updated_at = now()
    where user_id = ${userId}
  `;
  return readSnapshot(userId);
}

export async function applyPaidPeriod(opts: {
  userId: string;
  orderId: string;
  paymentId?: string | null;
  currentEnd?: unknown;
}): Promise<BillingSnapshot> {
  const db = await sql();
  await ensureRow(opts.userId);
  const periodEnd = periodEndIso(opts.currentEnd);
  const paymentId = opts.paymentId ?? null;
  await db`
    update entitlements
    set status = 'active',
        subscribed_at = coalesce(subscribed_at, now()),
        period_end = case
          when period_end is not null and period_end > ${periodEnd}::timestamptz then period_end
          else ${periodEnd}::timestamptz
        end,
        cancelled_at = null,
        razorpay_order_id = ${opts.orderId},
        razorpay_payment_id = coalesce(${paymentId}, razorpay_payment_id),
        updated_at = now()
    where user_id = ${opts.userId}
  `;
  return readSnapshot(opts.userId);
}

export async function applyCancelledPeriod(userId: string): Promise<BillingSnapshot> {
  const db = await sql();
  await db`
    update entitlements
    set status = 'cancelled',
        cancelled_at = coalesce(cancelled_at, now()),
        updated_at = now()
    where user_id = ${userId}
      and status = 'active'
  `;
  return readSnapshot(userId);
}

export async function grantVerifiedOrder(opts: {
  userId: string;
  paymentId: string;
  orderId: string;
  signature: string;
}): Promise<BillingSnapshot> {
  const { assertOrderCheckout, fetchOrder, PRO_AMOUNT_PAISE, RazorpayHttpError } = await import(
    "./razorpay.server"
  );
  if (!opts.orderId || !opts.paymentId || !opts.signature) {
    throw new RazorpayHttpError(400, "Missing payment fields.");
  }
  if (!assertOrderCheckout(opts.orderId, opts.paymentId, opts.signature)) {
    throw new RazorpayHttpError(400, "Payment signature did not match.");
  }
  const order = await fetchOrder(opts.orderId);
  if (Number(order.amount) !== PRO_AMOUNT_PAISE) {
    throw new RazorpayHttpError(400, "Payment does not match GSTSlip Pro.");
  }
  const noteUser = order.notes?.user_id?.trim();
  if (noteUser && noteUser !== opts.userId) {
    throw new RazorpayHttpError(400, "Payment does not match this account.");
  }
  return applyPaidPeriod({
    userId: opts.userId,
    orderId: opts.orderId,
    paymentId: opts.paymentId,
    currentEnd: null,
  });
}

export const startSubscription = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SubscribeResult> => {
    const { subscribeMode, createProCheckout } = await import("./razorpay.server");
    const mode = subscribeMode();
    const row = await ensureRow(context.userId);
    const snap = await markSnapshot(computeSnapshot(row));

    if (mode === "unset") return { kind: "unset", snap };
    if (mode === "preview") return { kind: "preview", snap: await grantPreview(context.userId) };

    if (snap.status === "active") return { kind: "active", snap };

    if (snap.status === "cancelled" && snap.isPro) {
      return { kind: "covered", snap };
    }

    const account = await accountOf(context.userId);
    const checkout = await createProCheckout({
      userId: context.userId,
      name: account.name,
      email: account.email,
    });
    return { kind: "checkout", snap, checkout };
  });

export const confirmCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { paymentId?: string; orderId?: string; signature?: string }) => ({
    paymentId: String(input?.paymentId ?? "").trim(),
    orderId: String(input?.orderId ?? "").trim(),
    signature: String(input?.signature ?? "").trim(),
  }))
  .handler(async ({ context, data }): Promise<BillingSnapshot> => {
    return grantVerifiedOrder({
      userId: context.userId,
      paymentId: data.paymentId,
      orderId: data.orderId,
      signature: data.signature,
    });
  });

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BillingSnapshot> => {
    return applyCancelledPeriod(context.userId);
  });

type RazorpayEvent = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        notes?: Record<string, string> | null;
      };
    };
    order?: {
      entity?: {
        id?: string;
        amount?: number;
        notes?: Record<string, string> | null;
      };
    };
  };
};

export async function applyRazorpayEvent(event: RazorpayEvent): Promise<void> {
  const name = String(event.event ?? "");
  if (name !== "order.paid" && name !== "payment.captured") return;

  const order = event.payload?.order?.entity;
  const payment = event.payload?.payment?.entity;
  const orderId = order?.id || payment?.order_id;
  const paymentId = payment?.id ?? null;
  if (!orderId) return;

  let row = await fetchRowByOrder(orderId);
  const noteUser = order?.notes?.user_id?.trim() || payment?.notes?.user_id?.trim();
  if (!row && noteUser) row = await fetchRow(noteUser);
  if (!row && !noteUser) return;

  const userId = row?.user_id || noteUser;
  if (!userId) return;

  const { fetchOrder, PRO_AMOUNT_PAISE } = await import("./razorpay.server");
  try {
    const live = await fetchOrder(orderId);
    if (Number(live.amount) !== PRO_AMOUNT_PAISE) return;
    const liveUser = live.notes?.user_id?.trim();
    if (liveUser && liveUser !== userId) return;
  } catch {
    return;
  }

  await applyPaidPeriod({
    userId,
    orderId,
    paymentId,
    currentEnd: null,
  });
}
