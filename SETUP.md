# Budgetvir — Setup

A personalized Splitwise built with Next.js + Supabase, deployed on Vercel.

## 1. Supabase database

1. Open your project → **SQL Editor**.
2. Paste and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   (core tables, RLS policies, signup trigger).
3. Paste and run [`supabase/migrations/0002_storage.sql`](supabase/migrations/0002_storage.sql)
   (creates the `avatars` and `receipts` storage buckets + policies).
4. Paste and run [`supabase/migrations/0003_pro.sql`](supabase/migrations/0003_pro.sql)
   (settlements, comments, activity feed + triggers, recurring expenses,
   categories/notes, group settings, invite/join + recurring RPCs).

> The migrations are idempotent — safe to re-run.

### Optional: demo data

After signing up **a@email.com**, **b@email.com** and **c@email.com** in the
app, run [`supabase/seed_demo.sql`](supabase/seed_demo.sql) in the SQL Editor to
create a fully populated 3-person group ("Viaggio a Lisbona") with expenses in
every split mode, settlements and a recurring template. It skips itself if the
group already exists.

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

## Features

- Email + password sign up / sign in (with email confirmation).
- Create groups (name + optional photo); add members by email search **or**
  by shareable invite link (`/join/<token>`).
- Add / **edit** expenses: title, optional emoji, **category**, amount, who paid,
  participants, date, notes, optional receipt photo.
- All split modes: **equally**, **by percentage**, **by exact amount**,
  **by shares**, **by adjustment** (live preview, exact-cent rounding).
- **Scan a receipt** (📷 on the add-expense screen): on-device OCR
  (Tesseract.js — no external service) reads the line items, then you assign
  each item to one or more people and it saves as an itemised expense.
- **Multi-currency** per expense; balances kept per currency (no FX).
- **Settle up** (record payments) and **Simplify debts** (per-group toggle).
- **Balances** — who owes whom, with one-tap settle.
- **Activity feed** per group and global, plus **comments** on expenses.
- **Recurring expenses** (auto-created when due).
- **Charts** (by category / payer / month), **CSV export**, and **import from a
  Splitwise CSV export** (group settings → Import) with column→member mapping.
- Search + category filters on the expense feed.
- Installable **PWA** — in-app install button + `/install` guide with QR.
- Profile page with display name + avatar.

Deferred: real receipt OCR, payment-provider integrations, email invitations,
push notifications.
