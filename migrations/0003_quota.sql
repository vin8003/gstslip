-- Free-capture quota. Signed-in rows are keyed by user id; signed-out rows
-- use a hashed IP. captures_used never decreases (logout must not reset it).
create table if not exists capture_quota (
  id text primary key,
  kind text not null,
  captures_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists capture_quota_kind_idx on capture_quota (kind);

create table if not exists email_verify_codes (
  user_id text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
