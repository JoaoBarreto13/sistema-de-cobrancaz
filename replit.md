# WhatsApp Billing Bot

A WhatsApp-based billing automation system built with Next.js, Drizzle ORM, Better Auth, and Baileys.

## Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: Better Auth (email/password)
- **WhatsApp**: Baileys (`@whiskeysockets/baileys`)
- **UI**: shadcn/ui + Tailwind CSS 4

## How to run

Two processes run in parallel:

1. **Next.js app** (`Start application` workflow): `pnpm dev` — serves the dashboard on port 5000
2. **WhatsApp worker** (`Worker` workflow): `pnpm tsx worker/index.ts` — runs the Baileys connection and message scheduler

## Required environment secrets

| Key | Description |
|-----|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Secret for session signing (already set) |
| `BETTER_AUTH_SECRET` | Secret for Better Auth token signing (can reuse SESSION_SECRET value) |

## Architecture

- `app/` — Next.js pages and server actions
- `app/actions/billing.ts` — server actions: createGroup, createCustomer, sendOneOff, getDashboardData
- `lib/db/schema.ts` — Drizzle schema (billing_groups, customers, customer_groups, message_jobs, whatsapp_session_state)
- `worker/index.ts` — Baileys worker: manages WhatsApp connection, monthly scheduler, message queue processor
- `components/ui/` — shadcn/ui component library

## Key design decisions

- Amounts stored as `amountCents` (integer) to avoid floating-point issues
- Message jobs use idempotency keys (`monthly:groupId:customerId:YYYY-MM`) to prevent duplicate billing
- WhatsApp session state (QR code, connection status) stored in DB so the dashboard can display it
- Worker polls every 30 seconds for pending jobs and monthly schedule triggers

## User preferences

- Portuguese (Brazilian) language throughout the app
- Timezone: America/Sao_Paulo
