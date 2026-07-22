/**
 * Creates all database tables if they don't exist.
 * Run with: pnpm tsx scripts/setup-db.ts
 */
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
})

const sql = `
CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  "image" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY NOT NULL,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamp,
  "refreshTokenExpiresAt" timestamp,
  "scope" text,
  "password" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "billing_groups" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "name" varchar(120) NOT NULL,
  "description" text,
  "amountCents" integer NOT NULL,
  "dueDay" integer NOT NULL,
  "sendTime" varchar(5) NOT NULL,
  "messageTemplate" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "customers" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "name" varchar(120) NOT NULL,
  "phone" varchar(20) NOT NULL,
  "notes" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  UNIQUE ("userId", "phone")
);

CREATE TABLE IF NOT EXISTS "customer_groups" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "customerId" integer NOT NULL,
  "groupId" integer NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  UNIQUE ("userId", "customerId", "groupId")
);

CREATE TABLE IF NOT EXISTS "message_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "customerId" integer NOT NULL,
  "groupId" integer,
  "type" varchar(20) NOT NULL,
  "message" text NOT NULL,
  "amountCents" integer,
  "scheduledFor" timestamp NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "idempotencyKey" varchar(180) NOT NULL,
  "lockedAt" timestamp,
  "sentAt" timestamp,
  "error" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  UNIQUE ("userId", "idempotencyKey")
);

CREATE TABLE IF NOT EXISTS "whatsapp_session_state" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" text NOT NULL UNIQUE,
  "status" varchar(30) NOT NULL DEFAULT 'disconnected',
  "qrCode" text,
  "phone" varchar(30),
  "lastError" text,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
`

async function main() {
  console.log('Connecting to database...')
  const client = await pool.connect()
  try {
    console.log('Running schema setup...')
    await client.query(sql)
    console.log('✓ All tables created (or already exist).')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => {
  console.error('Setup failed:', err.message)
  process.exit(1)
})
