/**
 * Creates all database tables if they don't exist.
 * Run with: pnpm db:setup
 */
import 'dotenv/config'
import { Pool } from 'pg'
import { getPoolConfig } from '../lib/db/ssl'

const pool = new Pool(getPoolConfig())

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
  "sendDate" varchar(10),
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

-- Migrations for existing tables
ALTER TABLE "billing_groups" ADD COLUMN IF NOT EXISTS "sendDate" varchar(10);

-- Tarefa 1: colunas para plugins username e admin do Better Auth
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "username" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "displayUsername" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned" boolean DEFAULT false;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banReason" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banExpires" timestamp;
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "impersonatedBy" text;
CREATE UNIQUE INDEX IF NOT EXISTS "user_username_key" ON "user" ("username");

-- Tarefa 2: coluna command para desconexão via banco
ALTER TABLE "whatsapp_session_state" ADD COLUMN IF NOT EXISTS "command" varchar(20);

-- Tarefa 3: tabelas de mensagens recebidas e anexos
CREATE TABLE IF NOT EXISTS "inbound_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "waMessageId" varchar(80) NOT NULL,
  "remoteJid" varchar(80) NOT NULL,
  "phone" varchar(20),
  "phoneKey" varchar(20),
  "pushName" varchar(120),
  "kind" varchar(20) NOT NULL,
  "body" text,
  "mediaStatus" varchar(20) NOT NULL DEFAULT 'none',
  "receivedAt" timestamp NOT NULL,
  "readAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  UNIQUE ("remoteJid", "waMessageId")
);
CREATE INDEX IF NOT EXISTS "inbound_phonekey_idx" ON "inbound_messages" ("phoneKey", "receivedAt");

CREATE TABLE IF NOT EXISTS "message_attachments" (
  "id" serial PRIMARY KEY NOT NULL,
  "inboundMessageId" integer NOT NULL REFERENCES "inbound_messages"("id") ON DELETE CASCADE,
  "mimetype" varchar(100) NOT NULL,
  "fileName" varchar(255),
  "sizeBytes" integer NOT NULL,
  "data" bytea NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "phoneKey" varchar(20);
CREATE INDEX IF NOT EXISTS "customers_phonekey_idx" ON "customers" ("userId", "phoneKey");
UPDATE "customers" SET "phoneKey" = CASE
  WHEN phone LIKE '55%' AND length(phone) IN (12, 13) THEN left(phone, 4) || right(phone, 8)
  ELSE phone END
WHERE "phoneKey" IS NULL;
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
