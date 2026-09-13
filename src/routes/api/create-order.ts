import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

async function handleCreateOrder(request: Request): Promise<Response> {
  const { requireUserId, UnauthorizedError } = await import("@/lib/auth/verify.server");
  const { assertSameSiteRequest, CrossSiteRequestError } = await import("@/lib/auth/isolation.server");
  const {
    PRO_AMOUNT_PAISE,
    PRO_CURRENCY,
    RazorpayHttpError,
    createOrder,
    parseOrderAmount,
  } = await import("@/lib/billing/razorpay.server");
  const { paymentsLive } = await import("@/lib/billing/live");
  const { PLAN_ID } = await import("@/lib/billing/plan");

  try {
    assertSameSiteRequest();
    const userId = await requireUserId();
    if (!paymentsLive()) {
      return json({ error: "Payments are not connected yet." }, 500);
    }

    let body: { amount?: unknown; currency?: unknown; receipt?: unknown } = {};
    const raw = await request.text();
    if (raw.trim()) {
      try {
        body = JSON.parse(raw) as typeof body;
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
    }

    let amount = PRO_AMOUNT_PAISE;
    if (body.amount != null) {
      try {
        amount = parseOrderAmount(body.amount);
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : "Invalid amount." }, 400);
      }
    }
    if (amount !== PRO_AMOUNT_PAISE) {
      return json({ error: "GSTSlip Pro is ₹499." }, 400);
    }

    const order = await createOrder({
      amount,
      currency: typeof body.currency === "string" ? body.currency : PRO_CURRENCY,
      receipt: typeof body.receipt === "string" ? body.receipt : undefined,
      notes: { user_id: userId, plan: PLAN_ID },
    });

    return json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (err) {
    if (err instanceof CrossSiteRequestError) return json({ error: err.message }, 403);
    if (err instanceof UnauthorizedError) return json({ error: "Unauthorized" }, 401);
    if (err instanceof RazorpayHttpError) {
      const status = err.status === 401 ? 401 : err.status >= 400 && err.status < 500 ? err.status : 500;
      return json({ error: err.message }, status);
    }
    return json({ error: err instanceof Error ? err.message : "Could not create order" }, 500);
  }
}

export const Route = createFileRoute("/api/create-order")({
  server: {
    handlers: {
      POST: ({ request }) => handleCreateOrder(request),
    },
  },
});
