-- GSTSlip Pro entitlement, one row per signed-in user.
-- Access is computed from status + period_end so a cancelled plan still
-- works until it lapses. Razorpay ids are how webhooks match a payment
-- without trusting the browser.
create table if not exists entitlements (
  user_id text primary key,
  status text not null default 'free',
  plan text not null default 'gstslip_pro_monthly',
  subscribed_at timestamptz,
  period_end timestamptz,
  cancelled_at timestamptz,
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_customer_id text,
  updated_at timestamptz not null default now()
);

create unique index if not exists entitlements_razorpay_order_id_idx
  on entitlements (razorpay_order_id)
  where razorpay_order_id is not null;
