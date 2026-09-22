-- Bank/card connection via Enable Banking (a licensed PSD2 AISP). Stores the
-- minimum needed to show a personal "transactions channel" and push a chosen
-- transaction into a group as an expense. Everything is owner-scoped by RLS:
-- a user can only ever see and touch their own rows. No SECURITY DEFINER needed
-- (no cross-user access, no recursion). Idempotent. Run after 0001-0009.

-- A bank connection = one Enable Banking authorisation/session for one bank.
create table if not exists public.bank_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  aspsp_name    text not null,
  aspsp_country text not null default 'IT',
  eb_session_id text,                       -- Enable Banking session id (null until authorised)
  status        text not null default 'pending', -- 'pending' | 'linked' | 'error' | 'expired'
  valid_until   timestamptz,               -- consent expiry as returned by the bank
  created_at    timestamptz not null default now()
);
create index if not exists idx_bank_connections_user on public.bank_connections (user_id);

-- An account/card exposed by a connection.
create table if not exists public.bank_accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  connection_id  uuid not null references public.bank_connections (id) on delete cascade,
  eb_account_uid text not null,             -- Enable Banking account uid
  name           text,
  iban_masked    text,                      -- only the masked IBAN, never the full one
  currency       text not null default 'EUR',
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  unique (user_id, eb_account_uid)
);
create index if not exists idx_bank_accounts_user on public.bank_accounts (user_id);

-- A single transaction. Kept even after it is pushed to a group; added_group_id
-- / added_expense_id record where it went.
create table if not exists public.bank_transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  account_id       uuid not null references public.bank_accounts (id) on delete cascade,
  eb_tx_id         text not null,           -- Enable Banking entry reference (dedupe key)
  booking_date     date,
  amount           numeric(12, 2) not null, -- always stored positive; see direction
  currency         text not null default 'EUR',
  direction        text not null default 'debit', -- 'debit' (money out) | 'credit' (money in)
  description      text,
  counterparty     text,
  status           text not null default 'booked', -- 'booked' | 'pending'
  added_group_id   uuid references public.groups (id) on delete set null,
  added_expense_id uuid references public.expenses (id) on delete set null,
  dismissed        boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (user_id, eb_tx_id)
);
create index if not exists idx_bank_tx_user_date
  on public.bank_transactions (user_id, booking_date desc);

alter table public.bank_connections  enable row level security;
alter table public.bank_accounts      enable row level security;
alter table public.bank_transactions  enable row level security;

drop policy if exists "bank_connections_own" on public.bank_connections;
create policy "bank_connections_own" on public.bank_connections
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "bank_accounts_own" on public.bank_accounts;
create policy "bank_accounts_own" on public.bank_accounts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "bank_transactions_own" on public.bank_transactions;
create policy "bank_transactions_own" on public.bank_transactions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
