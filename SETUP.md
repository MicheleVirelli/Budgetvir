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
5. Paste and run [`supabase/migrations/0004_fix_group_create.sql`](supabase/migrations/0004_fix_group_create.sql)
   (lets a group's creator read back their new group and add themselves as the
   first member — fixes group creation).

6. Run the remaining migrations in order:
   `0005_placeholders.sql`, `0006_recurring_interval.sql`, `0007_group_categories.sql`,
   `0008_merge_placeholder.sql`, `0009_budgets.sql`.
7. Paste and run [`supabase/migrations/0010_bank.sql`](supabase/migrations/0010_bank.sql)
   (bank/card connection tables + RLS — needed only for the "Bank & cards" feature).

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

## 3b. Bank / card connection (optional — Enable Banking)

Connecting a real bank card uses **Enable Banking**, a Finland-based, FIN-FSA-regulated
open-banking provider (a licensed PSD2 **AISP**). Its free **Restricted Production** tier
lets you link **your own** accounts across Italian banks. By PSD2 law, automatic bank access
must go through a licensed intermediary — Enable Banking is that intermediary and the data
transits their infrastructure. Your bank login is entered only on your bank's own page;
Budgetvir never sees it, and the app's private key stays server-side only.

> Free-tier limit: Restricted Production links only the app owner's own accounts. Other
> users connecting their own cards would need the paid Production tier + a licence.

Setup:

1. Create an account at **enablebanking.com** → Control Panel → **register an application**.
   - Choose environment **Restricted Production** (real data, your own accounts).
   - The browser generates and **downloads a private key** (a `.pem`) — keep it safe.
   - Note the **Application ID**.
2. In the application settings, add the **redirect URL**:
   `https://<your-vercel-domain>/api/bank/callback`.
3. Add these **server-only** env vars in Vercel (Project → Settings → Environment
   Variables — do **not** prefix with `NEXT_PUBLIC_`):

   ```
   ENABLEBANKING_APP_ID=<your application id>
   ENABLEBANKING_PRIVATE_KEY=<contents of the downloaded .pem, incl. BEGIN/END lines>
   ENABLEBANKING_REDIRECT_URL=https://<your-vercel-domain>/api/bank/callback
   APP_BASE_URL=https://<your-vercel-domain>
   ```

   For `ENABLEBANKING_PRIVATE_KEY`, paste the PEM as-is (multi-line) or with `\n` escapes —
   both are handled. For local dev, put the same in `.env.local` and use
   `http://localhost:3000/api/bank/callback`.
4. Run migration `0010_bank.sql` (step 1.7 above).
5. Test against a **sandbox** ASPSP first, then your real bank. Transactions are stored in
   your Supabase, locked per-user by RLS. Syncing is on demand ("Sync now"), with a 6-hour
   cooldown to respect bank rate limits.

Prefer zero third parties? Skip this and use manual CSV import instead (group settings →
Import) — nothing leaves your control that way.

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
