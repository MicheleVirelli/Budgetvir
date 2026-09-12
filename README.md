# Budgetvir

A personalized, Splitwise-style expense splitter for friends and family — built
as an installable **PWA** with **Next.js** and **Supabase**.

## Features

- 📧 Email + password sign up / sign in (email confirmation).
- 👥 Create groups (name + optional photo) and add people by searching their email.
- 🧾 Add expenses with an optional emoji, a required title, an amount, who paid,
  the participants, and an optional receipt photo.
- ➗ Every split mode: **equally**, **by percentage**, **by exact amount**,
  **by shares**, and **by adjustment** — with a live per-person preview.
- 📊 Balances screen showing who owes whom, per group.
- 📱 Installable on phones (PWA with offline app shell).

## Getting started

See **[SETUP.md](SETUP.md)** for the one-time Supabase setup (run the SQL
migrations, create the storage buckets, configure auth) and how to run locally.

```bash
npm install
npm run dev
```

## Tech

Next.js 15 (App Router) · Supabase (Postgres + Auth + Storage, RLS) · Tailwind
CSS · TypeScript. Deployed on Vercel.

Coming later: settle-up / recording payments, simplify debts, friends & activity
feeds.
