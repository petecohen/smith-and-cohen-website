-- Message board for the live streams section.
-- Apply with: psql "$DATABASE_URL" -f db/migrations/001_messages.sql
-- (or any Postgres client against the Neon database)

create table if not exists messages (
  id bigint generated always as identity primary key,
  -- 'general' for the general board, or a stream slug for per-session threads
  scope text not null check (scope ~ '^[a-z0-9-]{1,80}$'),
  name text not null check (char_length(name) between 1 and 40),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  -- soft-hide for moderation; hidden rows never appear in public reads
  hidden boolean not null default false,
  -- sha256 of client IP + salt, for rate limiting; raw IPs are never stored
  ip_hash text not null
);

create index if not exists messages_scope_visible_idx
  on messages (scope, created_at desc)
  where not hidden;

create index if not exists messages_rate_limit_idx
  on messages (ip_hash, created_at desc);
