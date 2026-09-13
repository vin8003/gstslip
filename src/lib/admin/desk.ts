import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  computeSnapshot,
  mapEntitlementRow,
  unstartedSnapshot,
  type EntitlementStatus,
  type PaymentsMode,
} from "@/lib/billing/plan";
import {
  extendPeriodEnd,
  grantSource,
  isAdminEmail,
  isPreviewOperatorMode,
} from "./access";

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}

export function isForbidden(err: unknown): boolean {
  return /forbidden/i.test(err instanceof Error ? err.message : String(err));
}

export type DeskAccount = {
  userId: string;
  name: string;
  email: string;
  createdAt: string | null;
  status: EntitlementStatus;
  isPro: boolean;
  periodEnd: string | null;
  daysLeft: number;
  orderId: string | null;
  paymentId: string | null;
  grantSource: "razorpay" | "desk" | "none";
};

export type DeskStats = {
  accounts: number;
  pro: number;
  cancelled: number;
  free: number;
};

export type DeskPayload = {
  allowed: boolean;
  previewOperator: boolean;
  paymentsMode: PaymentsMode;
  stats: DeskStats;
  accounts: DeskAccount[];
};

const EMPTY_STATS: DeskStats = { accounts: 0, pro: 0, cancelled: 0, free: 0 };

function emptyDesk(previewOperator: boolean, paymentsMode: PaymentsMode): DeskPayload {
  return {
    allowed: false,
    previewOperator,
    paymentsMode,
    stats: EMPTY_STATS,
    accounts: [],
  };
}

async function sql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function currentPaymentsMode(): Promise<PaymentsMode> {
  const live = await import("@/lib/billing/live");
  return live.paymentsMode();
}

async function emailOf(userId: string): Promise<string | null> {
  const db = await sql();
  const rows = await db<{ email: string | null }>`
    select email from "user" where id = ${userId} limit 1
  `;
  return rows[0]?.email ?? null;
}

async function assertAdmin(userId: string): Promise<void> {
  const email = await emailOf(userId);
  if (!isAdminEmail(email)) throw new ForbiddenError();
}

function mapAccount(row: Record<string, unknown>): DeskAccount {
  const entitlement = row.entitlement_status
    ? mapEntitlementRow({
        user_id: row.id,
        status: row.entitlement_status,
        plan: row.plan,
        subscribed_at: row.subscribed_at,
        period_end: row.period_end,
        cancelled_at: row.cancelled_at,
        updated_at: row.updated_at ?? new Date().toISOString(),
        razorpay_order_id: row.razorpay_order_id,
        razorpay_payment_id: row.razorpay_payment_id,
        razorpay_customer_id: row.razorpay_customer_id,
      })
    : null;
  const snap = entitlement ? computeSnapshot(entitlement) : unstartedSnapshot();
  const orderId = entitlement?.razorpay_order_id ?? null;
  const created = row.createdAt ?? row.created_at ?? null;
  return {
    userId: String(row.id),
    name: String(row.name ?? "").trim() || "GSTSlip account",
    email: String(row.email ?? "").trim(),
    createdAt: created instanceof Date ? created.toISOString() : created ? String(created) : null,
    status: snap.status,
    isPro: snap.isPro,
    periodEnd: snap.periodEnd,
    daysLeft: snap.daysLeft,
    orderId,
    paymentId: entitlement?.razorpay_payment_id ?? null,
    grantSource: grantSource(orderId),
  };
}

function statsOf(accounts: DeskAccount[]): DeskStats {
  const stats = { ...EMPTY_STATS, accounts: accounts.length };
  for (const account of accounts) {
    if (account.isPro && account.status === "cancelled") stats.cancelled += 1;
    else if (account.isPro) stats.pro += 1;
    else stats.free += 1;
  }
  return stats;
}

async function loadAccounts(query: string): Promise<DeskAccount[]> {
  const db = await sql();
  const rows = await db<Record<string, unknown>>`
    select
      u.id,
      u.name,
      u.email,
      u."createdAt",
      e.status as entitlement_status,
      e.plan,
      e.subscribed_at,
      e.period_end,
      e.cancelled_at,
      e.updated_at,
      e.razorpay_order_id,
      e.razorpay_payment_id,
      e.razorpay_customer_id
    from "user" u
    left join entitlements e on e.user_id = u.id
    order by u."createdAt" desc
    limit 200
  `;
  const mapped = rows.map((row) => mapAccount(row));
  const needle = query.trim().toLowerCase();
  if (!needle) return mapped;
  return mapped.filter(
    (account) =>
      account.email.toLowerCase().includes(needle) ||
      account.name.toLowerCase().includes(needle),
  );
}

export const getAdminAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ allowed: boolean; previewOperator: boolean }> => {
    const previewOperator = isPreviewOperatorMode();
    const email = await emailOf(context.userId);
    return { allowed: isAdminEmail(email), previewOperator };
  });

export const getAdminDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { q?: string } | undefined) => ({
    q: String(input?.q ?? "").trim().slice(0, 80),
  }))
  .handler(async ({ context, data }): Promise<DeskPayload> => {
    const mode = await currentPaymentsMode();
    const previewOperator = isPreviewOperatorMode();
    const email = await emailOf(context.userId);
    if (!isAdminEmail(email)) return emptyDesk(previewOperator, mode);
    const accounts = await loadAccounts(data.q);
    const all = data.q ? await loadAccounts("") : accounts;
    return {
      allowed: true,
      previewOperator,
      paymentsMode: mode,
      stats: statsOf(all),
      accounts,
    };
  });

export const adminGrantPro = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId?: string }) => {
    const userId = String(input?.userId ?? "").trim();
    if (!userId) throw new Error("Missing account.");
    return { userId };
  })
  .handler(async ({ context, data }): Promise<DeskAccount> => {
    await assertAdmin(context.userId);
    const db = await sql();
    const users = await db<Record<string, unknown>>`
      select id, name, email, "createdAt" from "user" where id = ${data.userId} limit 1
    `;
    if (!users[0]) throw new Error("Account not found.");
    await db`
      insert into entitlements (user_id, status, plan)
      values (${data.userId}, 'free', 'gstslip_pro_monthly')
      on conflict (user_id) do nothing
    `;
    const existing = await db<{ period_end: string | Date | null; razorpay_order_id: string | null }>`
      select period_end, razorpay_order_id from entitlements where user_id = ${data.userId} limit 1
    `;
    const periodEnd = extendPeriodEnd(
      existing[0]?.period_end instanceof Date
        ? existing[0].period_end.toISOString()
        : existing[0]?.period_end
          ? String(existing[0].period_end)
          : null,
    );
    const currentOrder = existing[0]?.razorpay_order_id ?? null;
    const deskOrder =
      currentOrder && !currentOrder.startsWith("desk_")
        ? currentOrder
        : `desk_${data.userId.replace(/[^a-zA-Z0-9]/g, "").slice(-10)}_${Date.now()}`.slice(0, 40);
    await db`
      update entitlements
      set status = 'active',
          subscribed_at = coalesce(subscribed_at, now()),
          period_end = ${periodEnd}::timestamptz,
          cancelled_at = null,
          razorpay_order_id = ${deskOrder},
          updated_at = now()
      where user_id = ${data.userId}
    `;
    const joined = await db<Record<string, unknown>>`
      select
        u.id,
        u.name,
        u.email,
        u."createdAt",
        e.status as entitlement_status,
        e.plan,
        e.subscribed_at,
        e.period_end,
        e.cancelled_at,
        e.updated_at,
        e.razorpay_order_id,
        e.razorpay_payment_id,
        e.razorpay_customer_id
      from "user" u
      left join entitlements e on e.user_id = u.id
      where u.id = ${data.userId}
      limit 1
    `;
    return mapAccount(joined[0] ?? users[0]);
  });

export const adminCancelPro = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId?: string }) => {
    const userId = String(input?.userId ?? "").trim();
    if (!userId) throw new Error("Missing account.");
    return { userId };
  })
  .handler(async ({ context, data }): Promise<DeskAccount> => {
    await assertAdmin(context.userId);
    const { applyCancelledPeriod } = await import("@/lib/billing/store");
    await applyCancelledPeriod(data.userId);
    const db = await sql();
    const joined = await db<Record<string, unknown>>`
      select
        u.id,
        u.name,
        u.email,
        u."createdAt",
        e.status as entitlement_status,
        e.plan,
        e.subscribed_at,
        e.period_end,
        e.cancelled_at,
        e.updated_at,
        e.razorpay_order_id,
        e.razorpay_payment_id,
        e.razorpay_customer_id
      from "user" u
      left join entitlements e on e.user_id = u.id
      where u.id = ${data.userId}
      limit 1
    `;
    if (!joined[0]) throw new Error("Account not found.");
    return mapAccount(joined[0]);
  });
