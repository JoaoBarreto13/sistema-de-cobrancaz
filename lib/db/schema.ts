import { boolean, integer, pgTable, serial, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false), image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(), updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})
export const session = pgTable('session', {
  id: text('id').primaryKey(), expiresAt: timestamp('expiresAt').notNull(), token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(), updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'), userAgent: text('userAgent'), userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
})
export const account = pgTable('account', {
  id: text('id').primaryKey(), accountId: text('accountId').notNull(), providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }), accessToken: text('accessToken'),
  refreshToken: text('refreshToken'), idToken: text('idToken'), accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'), scope: text('scope'), password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(), updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})
export const verification = pgTable('verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(), createdAt: timestamp('createdAt').notNull().defaultNow(), updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})
export const billingGroups = pgTable('billing_groups', {
  id: serial('id').primaryKey(), userId: text('userId').notNull(), name: varchar('name', { length: 120 }).notNull(), description: text('description'),
  amountCents: integer('amountCents').notNull(), dueDay: integer('dueDay').notNull(), sendTime: varchar('sendTime', { length: 5 }).notNull(),
  messageTemplate: text('messageTemplate').notNull(), active: boolean('active').notNull().default(true),
  createdAt: timestamp('createdAt').notNull().defaultNow(), updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})
export const customers = pgTable('customers', {
  id: serial('id').primaryKey(), userId: text('userId').notNull(), name: varchar('name', { length: 120 }).notNull(), phone: varchar('phone', { length: 20 }).notNull(),
  notes: text('notes'), active: boolean('active').notNull().default(true), createdAt: timestamp('createdAt').notNull().defaultNow(), updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (t) => [unique().on(t.userId, t.phone)])
export const customerGroups = pgTable('customer_groups', {
  id: serial('id').primaryKey(), userId: text('userId').notNull(), customerId: integer('customerId').notNull(), groupId: integer('groupId').notNull(), createdAt: timestamp('createdAt').notNull().defaultNow(),
}, (t) => [unique().on(t.userId, t.customerId, t.groupId)])
export const messageJobs = pgTable('message_jobs', {
  id: serial('id').primaryKey(), userId: text('userId').notNull(), customerId: integer('customerId').notNull(), groupId: integer('groupId'),
  type: varchar('type', { length: 20 }).notNull(), message: text('message').notNull(), amountCents: integer('amountCents'), scheduledFor: timestamp('scheduledFor').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), attempts: integer('attempts').notNull().default(0), idempotencyKey: varchar('idempotencyKey', { length: 180 }).notNull(),
  lockedAt: timestamp('lockedAt'), sentAt: timestamp('sentAt'), error: text('error'), createdAt: timestamp('createdAt').notNull().defaultNow(), updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (t) => [unique().on(t.userId, t.idempotencyKey)])
export const whatsappSessionState = pgTable('whatsapp_session_state', {
  id: serial('id').primaryKey(), userId: text('userId').notNull().unique(), status: varchar('status', { length: 30 }).notNull().default('disconnected'),
  qrCode: text('qrCode'), phone: varchar('phone', { length: 30 }), lastError: text('lastError'), updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})
