-- Extracted invoices for reuse. Signed-in rows use user:<id>; signed-out rows
-- use the same hashed-IP owner key as capture_quota. Payload is JSON text so
-- PGLite and Neon stay in sync. Source photos stay off this table.
create table if not exists stored_invoices (
  id text not null,
  owner_key text not null,
  captured_at timestamptz not null,
  updated_at timestamptz not null default now(),
  source_name text not null default '',
  invoice_number text not null default '',
  supplier_name text not null default '',
  taxable_value text not null default '',
  analysis_status text not null default 'idle',
  pending_quota boolean not null default false,
  payload text not null,
  primary key (id, owner_key)
);

create index if not exists stored_invoices_owner_captured_idx
  on stored_invoices (owner_key, captured_at desc);

create index if not exists stored_invoices_owner_status_idx
  on stored_invoices (owner_key, analysis_status);
