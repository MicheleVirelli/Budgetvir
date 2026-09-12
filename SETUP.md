# Budgetvir — Setup

A personalized Splitwise built with Next.js + Supabase, deployed on Vercel.

## 1. Supabase database

1. Open your project → **SQL Editor**.
2. Paste and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   (tables, RLS policies, signup trigger).
3. Paste and run [`supabase/migrations/0002_storage.sql`](supabase/migrations/0002_storage.sql)
   (creates the `avatars` and `receipts` storage buckets + policies).

> The migrations are idempotent — safe to re-run.

## 2. Supabase Auth

1. **Authentication → Providers → Email**: make sure **Email** is enabled.
2. **Authentication → URL Configuration**:
   - Set **Site URL** to your Vercel domain (e.g. `https://budgetvir.vercel.app`).
   - Add **Redirect URLs**:
     - `http://localhost:3000/**`
     - `https://<your-vercel-domain>/**`
3. Email confirmation is **on** by default (users must click a link in their
   email to activate the account). For quick local testing you can temporarily
   turn it off under **Authentication → Providers → Email → Confirm email**.

## 3. Environment variables

Already set on Vercel. For local development, `.env.local` contains:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

## 4. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## 5. Deploy

Vercel is linked to the repo — every push to the default branch deploys
automatically. Make sure the two `NEXT_PUBLIC_*` env vars are present in the
Vercel project settings.

## Features (this iteration)

- Email + password sign up / sign in (with email confirmation).
- Create groups (name required, photo optional).
- Search other users by email and add them to a group.
- Add expenses: required title, optional emoji, amount, who paid, participants,
  optional receipt photo.
- All split modes: **equally**, **by percentage**, **by exact amount**,
  **by shares**, **by adjustment**.
- Balances screen (who owes whom), per group.
- Profile page with display name + avatar.

Deferred for later: settle-up / recording payments, simplify debts, friends &
activity feeds.
