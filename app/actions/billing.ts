'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { billingGroups, customerGroups, customers, messageJobs, whatsappSessionState } from '@/lib/db/schema'
import { and, desc, eq, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Não autorizado')
  return session.user.id
}
const phoneSchema = z.string().transform(v => v.replace(/\D/g, '')).pipe(z.string().min(10).max(15))
const groupSchema = z.object({
  name: z.string().min(2).max(120),
  amount: z.coerce.number().positive(),
  dueDay: z.coerce.number().int().min(1).max(31),
  sendTime: z.string().regex(/^\d{2}:\d{2}$/),
  message: z.string().min(5).max(2000),
})

export async function createGroup(formData: FormData) {
  const userId = await getUserId()
  const data = groupSchema.parse({
    name: formData.get('name'), amount: formData.get('amount'),
    dueDay: formData.get('dueDay'), sendTime: formData.get('sendTime'), message: formData.get('message'),
  })
  await db.insert(billingGroups).values({ userId, name: data.name, amountCents: Math.round(data.amount * 100), dueDay: data.dueDay, sendTime: data.sendTime, messageTemplate: data.message })
  revalidatePath('/')
}

export async function updateGroup(id: number, formData: FormData) {
  const userId = await getUserId()
  const data = groupSchema.parse({
    name: formData.get('name'), amount: formData.get('amount'),
    dueDay: formData.get('dueDay'), sendTime: formData.get('sendTime'), message: formData.get('message'),
  })
  await db.update(billingGroups).set({ name: data.name, amountCents: Math.round(data.amount * 100), dueDay: data.dueDay, sendTime: data.sendTime, messageTemplate: data.message, updatedAt: new Date() })
    .where(and(eq(billingGroups.id, id), eq(billingGroups.userId, userId)))
  revalidatePath('/')
}

export async function toggleGroup(id: number) {
  const userId = await getUserId()
  const [group] = await db.select({ active: billingGroups.active }).from(billingGroups)
    .where(and(eq(billingGroups.id, id), eq(billingGroups.userId, userId))).limit(1)
  if (!group) throw new Error('Grupo não encontrado')
  await db.update(billingGroups).set({ active: !group.active, updatedAt: new Date() }).where(eq(billingGroups.id, id))
  revalidatePath('/')
}

export async function createCustomer(formData: FormData) {
  const userId = await getUserId()
  const data = z.object({
    name: z.string().min(2).max(120), phone: phoneSchema,
    groupId: z.coerce.number().int().positive(),
  }).parse({ name: formData.get('name'), phone: formData.get('phone'), groupId: formData.get('groupId') })
  const [customer] = await db.insert(customers).values({ userId, name: data.name, phone: data.phone }).returning({ id: customers.id })
  await db.insert(customerGroups).values({ userId, customerId: customer.id, groupId: data.groupId })
  revalidatePath('/')
}

export async function toggleCustomer(id: number) {
  const userId = await getUserId()
  const [customer] = await db.select({ active: customers.active }).from(customers)
    .where(and(eq(customers.id, id), eq(customers.userId, userId))).limit(1)
  if (!customer) throw new Error('Cliente não encontrado')
  await db.update(customers).set({ active: !customer.active, updatedAt: new Date() }).where(eq(customers.id, id))
  revalidatePath('/')
}

export async function sendOneOff(formData: FormData) {
  const userId = await getUserId()
  const data = z.object({
    customerId: z.coerce.number().int().positive(),
    message: z.string().min(1).max(4000),
  }).parse({ customerId: formData.get('customerId'), message: formData.get('message') })
  const [customer] = await db.select({ id: customers.id }).from(customers)
    .where(and(eq(customers.id, data.customerId), eq(customers.userId, userId), eq(customers.active, true))).limit(1)
  if (!customer) throw new Error('Cliente inválido')
  await db.insert(messageJobs).values({ userId, customerId: customer.id, type: 'one_off', message: data.message, scheduledFor: new Date(), idempotencyKey: `one-off:${crypto.randomUUID()}` })
  revalidatePath('/')
}

export async function getWhatsAppStatus() {
  const userId = await getUserId()
  const [state] = await db.select().from(whatsappSessionState).where(eq(whatsappSessionState.userId, userId)).limit(1)
  return state ?? null
}

export async function getDashboardData() {
  const userId = await getUserId()
  const [groupRows, customerRows, jobs, state, counts] = await Promise.all([
    db.select().from(billingGroups).where(eq(billingGroups.userId, userId)).orderBy(desc(billingGroups.createdAt)),
    db.select({
      id: customers.id, name: customers.name, phone: customers.phone, active: customers.active,
      groupId: customerGroups.groupId, groupName: billingGroups.name,
    }).from(customers)
      .leftJoin(customerGroups, and(eq(customerGroups.customerId, customers.id), eq(customerGroups.userId, userId)))
      .leftJoin(billingGroups, and(eq(billingGroups.id, customerGroups.groupId), eq(billingGroups.userId, userId)))
      .where(eq(customers.userId, userId)).orderBy(desc(customers.createdAt)),
    db.select({
      id: messageJobs.id, type: messageJobs.type, status: messageJobs.status,
      message: messageJobs.message, scheduledFor: messageJobs.scheduledFor,
      sentAt: messageJobs.sentAt, error: messageJobs.error, customerName: customers.name,
    }).from(messageJobs)
      .leftJoin(customers, and(eq(customers.id, messageJobs.customerId), eq(customers.userId, userId)))
      .where(eq(messageJobs.userId, userId)).orderBy(desc(messageJobs.createdAt)).limit(50),
    db.select().from(whatsappSessionState).where(eq(whatsappSessionState.userId, userId)).limit(1),
    db.select({
      pending: sql<number>`count(*) filter (where ${messageJobs.status} = 'pending')`,
      sent: sql<number>`count(*) filter (where ${messageJobs.status} = 'sent')`,
      failed: sql<number>`count(*) filter (where ${messageJobs.status} = 'failed')`,
    }).from(messageJobs).where(eq(messageJobs.userId, userId)),
  ])
  return {
    groups: groupRows,
    customers: customerRows,
    jobs,
    whatsapp: state[0] ?? null,
    counts: counts[0] ?? { pending: 0, sent: 0, failed: 0 },
  }
}
