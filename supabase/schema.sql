-- Lean database schema for Supabase (Postgres)
-- Run this once in your Supabase project's SQL Editor (Dashboard -> SQL Editor -> New query).
-- Maps directly onto the shapes already used in the app's local state, so no
-- data model redesign is needed later — just swapping localStorage for these calls.

create extension if not exists "uuid-ossp";

-- One row per signed-up account (employer or candidate).
create table accounts (
  email text primary key,               -- used as the natural key everywhere else
  type text not null check (type in ('employer', 'candidate')),
  name text not null,
  company text,                         -- employers only
  resume text,                          -- candidates only
  created_at timestamptz not null default now()
);

-- One row per open role a hiring manager is calibrating / has posted.
create table roles (
  id uuid primary key default uuid_generate_v4(),
  employer_email text not null references accounts(email) on delete cascade,
  title text not null default '',
  team text not null default '',
  tasks jsonb not null default '[]',
  must_haves jsonb not null default '[]',
  culture text not null default '',
  stages jsonb not null default '[]',
  company text not null default '',
  started boolean not null default false,
  hm_messages jsonb not null default '[]',  -- [{role: 'user'|'assistant', text: '...'}]
  created_at timestamptz not null default now()
);

-- One row per candidate application to a specific role.
create table applications (
  id uuid primary key default uuid_generate_v4(),
  role_id uuid not null references roles(id) on delete cascade,
  account_email text not null references accounts(email) on delete cascade,
  name text not null default '',
  resume text not null default '',
  messages jsonb not null default '[]',
  prep_questions jsonb,
  feedback jsonb,
  slots jsonb,
  selected_slot text,
  dash_summary jsonb,
  hm_decision text check (hm_decision in ('advance', 'more', 'decline')),
  hm_decision_at text,
  started_at text,
  created_at timestamptz not null default now()
);

-- One row per completed practice-mode mock interview report.
create table practice_history (
  id uuid primary key default uuid_generate_v4(),
  account_email text not null references accounts(email) on delete cascade,
  report jsonb not null,
  created_at timestamptz not null default now()
);

-- Row Level Security: required by Supabase before the public (anon) key can
-- read/write anything. This demo policy allows any signed-in-with-anon-key
-- client to read and write everything — fine for a pitch/demo with no real
-- sensitive data yet. Before real users are on this, these should be tightened
-- to check the caller's own email against account_email / employer_email.
alter table accounts enable row level security;
alter table roles enable row level security;
alter table applications enable row level security;
alter table practice_history enable row level security;

create policy "demo_allow_all_accounts" on accounts for all using (true) with check (true);
create policy "demo_allow_all_roles" on roles for all using (true) with check (true);
create policy "demo_allow_all_applications" on applications for all using (true) with check (true);
create policy "demo_allow_all_practice_history" on practice_history for all using (true) with check (true);

-- Links each app account to a real Supabase Auth login (added for real
-- authentication — see docs/AUTH_SETUP.md)
alter table accounts add column if not exists auth_user_id uuid references auth.users(id);
