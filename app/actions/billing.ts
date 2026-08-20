'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { billingGroups, customerGroups, customers, messageJobs, whatsappSessionState } from '@/lib/db/schema'
import { and, desc, eq, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { existsSync, rmSync } from 'fs'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Não autorizado')
  return session.user.id
}
const phoneSchema = z.string().transform(v => {
  const digits = v.replace(/\D/g, '')
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`
  }
  return digits
}).pipe(z.string().min(10).max(15))
const groupSchema = z.object({
  name: z.string().min(2).max(120),
  amount: z.coerce.number().positive(),
  dueDay: z.coerce.number().int().min(1).max(31),
  sendTime: z.string().regex(/^\d{2}:\d{2}$/),
  sendDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  message: z.string().min(5).max(2000),
})

export async function createGroup(formData: FormData) {
  const userId = await getUserId()
  const rawSendDate = formData.get('sendDate')
  const data = groupSchema.parse({
    name: formData.get('name'), amount: formData.get('amount'),
    dueDay: formData.get('dueDay'), sendTime: formData.get('sendTime'),
    sendDate: rawSendDate && String(rawSendDate).trim() ? String(rawSendDate) : null,
    message: formData.get('message'),
  })
  await db.insert(billingGroups).values({ userId, name: data.name, amountCents: Math.round(data.amount * 100), dueDay: data.dueDay, sendTime: data.sendTime, sendDate: data.sendDate ?? null, messageTemplate: data.message })
  revalidatePath('/')
}

export async function updateGroup(id: number, formData: FormData) {
  const userId = await getUserId()
  const rawSendDate = formData.get('sendDate')
  const data = groupSchema.parse({
    name: formData.get('name'), amount: formData.get('amount'),
    dueDay: formData.get('dueDay'), sendTime: formData.get('sendTime'),
    sendDate: rawSendDate && String(rawSendDate).trim() ? String(rawSendDate) : null,
    message: formData.get('message'),
  })
  await db.update(billingGroups).set({ name: data.name, amountCents: Math.round(data.amount * 100), dueDay: data.dueDay, sendTime: data.sendTime, sendDate: data.sendDate ?? null, messageTemplate: data.message, updatedAt: new Date() })
    .where(and(eq(billingGroups.id, id), eq(billingGroups.userId, userId)))
  revalidatePath('/')
}

export async function toggleGroup(id: number) {
  const userId = await getUserId()
  const [group] = await db.select({ active: billingGroups.active }).from(billingGroups)
    .where(and(eq(billingGroups.id, id), eq(billingGroups.userId, userId))).limit(1)
  if (!group) throw new Error('Grupo não encontrado')
  await db.update(billingGroups).set({ active: !group.active, updatedAt: new Date() })
    .where(and(eq(billingGroups.id, id), eq(billingGroups.userId, userId)))
  revalidatePath('/')
}

export async function sendGroupNow(groupId: number) {
  const userId = await getUserId()
  const [group] = await db.select().from(billingGroups)
    .where(and(eq(billingGroups.id, groupId), eq(billingGroups.userId, userId), eq(billingGroups.active, true))).limit(1)
  if (!group) throw new Error('Grupo não encontrado ou inativo')

  const members = await db.select({ id: customers.id, name: customers.name, phone: customers.phone })
    .from(customerGroups)
    .innerJoin(customers, and(eq(customers.id, customerGroups.customerId), eq(customers.userId, userId)))
    .where(and(eq(customerGroups.userId, userId), eq(customerGroups.groupId, groupId), eq(customers.active, true)))

  if (members.length === 0) throw new Error('Este grupo não possui clientes ativos vinculados')

  function render(template: string, customer: string, amountCents: number, dueDay: number) {
    return template
      .replaceAll('{{nome}}', customer)
      .replaceAll('{{valor}}', (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
      .replaceAll('{{vencimento}}', String(dueDay))
  }

  for (const customer of members) {
    const message = render(group.messageTemplate, customer.name, group.amountCents, group.dueDay)
    await db.insert(messageJobs).values({
      userId,
      customerId: customer.id,
      groupId: group.id,
      type: 'group_manual',
      message,
      amountCents: group.amountCents,
      scheduledFor: new Date(),
      idempotencyKey: `group_manual:${group.id}:${customer.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    })
  }

  revalidatePath('/')
}

export async function createCustomer(formData: FormData) {
  const userId = await getUserId()
  const rawGroupId = formData.get('groupId')
  const data = z.object({
    name: z.string().min(2).max(120),
    phone: phoneSchema,
    groupId: z.coerce.number().int().positive().nullable().optional(),
  }).parse({
    name: formData.get('name'),
    phone: formData.get('phone'),
    groupId: rawGroupId && String(rawGroupId).trim() && String(rawGroupId) !== 'none' ? Number(rawGroupId) : null,
  })
  const [customer] = await db.insert(customers).values({ userId, name: data.name, phone: data.phone }).returning({ id: customers.id })
  if (data.groupId) {
    await db.insert(customerGroups).values({ userId, customerId: customer.id, groupId: data.groupId })
  }
  revalidatePath('/')
}

export async function updateCustomer(id: number, formData: FormData) {
  const userId = await getUserId()
  const rawGroupId = formData.get('groupId')
  const data = z.object({
    name: z.string().min(2).max(120),
    phone: phoneSchema,
    groupId: z.coerce.number().int().positive().nullable().optional(),
  }).parse({
    name: formData.get('name'),
    phone: formData.get('phone'),
    groupId: rawGroupId && String(rawGroupId).trim() && String(rawGroupId) !== 'none' ? Number(rawGroupId) : null,
  })

  await db.update(customers).set({ name: data.name, phone: data.phone, updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.userId, userId)))

  await db.delete(customerGroups).where(and(eq(customerGroups.customerId, id), eq(customerGroups.userId, userId)))
  if (data.groupId) {
    await db.insert(customerGroups).values({ userId, customerId: id, groupId: data.groupId })
  }
  revalidatePath('/')
}

export async function deleteCustomer(id: number) {
  const userId = await getUserId()
  await db.delete(messageJobs)
    .where(and(eq(messageJobs.customerId, id), eq(messageJobs.userId, userId), sql`${messageJobs.status} IN ('pending','processing')`))
  await db.delete(customerGroups)
    .where(and(eq(customerGroups.customerId, id), eq(customerGroups.userId, userId)))
  await db.delete(customers)
    .where(and(eq(customers.id, id), eq(customers.userId, userId)))
  revalidatePath('/')
}

export async function toggleCustomer(id: number) {
  const userId = await getUserId()
  const [customer] = await db.select({ active: customers.active }).from(customers)
    .where(and(eq(customers.id, id), eq(customers.userId, userId))).limit(1)
  if (!customer) throw new Error('Cliente não encontrado')
  await db.update(customers).set({ active: !customer.active, updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.userId, userId)))
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

export async function deleteGroup(id: number) {
  const userId = await getUserId()
  const [group] = await db.select({ id: billingGroups.id }).from(billingGroups)
    .where(and(eq(billingGroups.id, id), eq(billingGroups.userId, userId))).limit(1)
  if (!group) throw new Error('Grupo não encontrado')
  const pending = await db.select({ id: messageJobs.id }).from(messageJobs)
    .where(and(eq(messageJobs.groupId, id), eq(messageJobs.userId, userId),
      sql`${messageJobs.status} IN ('pending','processing')`)).limit(1)
  if (pending.length > 0) throw new Error('Grupo tem cobranças pendentes. Cancele-as antes de excluir.')
  await db.delete(customerGroups).where(and(eq(customerGroups.groupId, id), eq(customerGroups.userId, userId)))
  await db.delete(billingGroups).where(and(eq(billingGroups.id, id), eq(billingGroups.userId, userId)))
  revalidatePath('/')
}

export async function unlinkCustomerFromGroup(customerId: number, groupId: number) {
  const userId = await getUserId()
  const deleted = await db.delete(customerGroups)
    .where(and(eq(customerGroups.customerId, customerId), eq(customerGroups.groupId, groupId), eq(customerGroups.userId, userId)))
    .returning({ id: customerGroups.id })
  if (deleted.length === 0) throw new Error('Vínculo não encontrado')
  revalidatePath('/')
}

export async function cancelJob(id: number) {
  const userId = await getUserId()
  const updated = await db.update(messageJobs)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(messageJobs.id, id), eq(messageJobs.userId, userId),
      sql`${messageJobs.status} IN ('pending','failed')`))
    .returning({ id: messageJobs.id })
  if (updated.length === 0) throw new Error('Job não pode ser cancelado (já enviado ou em processamento)')
  revalidatePath('/')
}

export async function retryJob(id: number) {
  const userId = await getUserId()
  const updated = await db.update(messageJobs)
    .set({
      status: 'pending',
      attempts: 0,
      error: null,
      scheduledFor: new Date(),
      lockedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(messageJobs.id, id), eq(messageJobs.userId, userId)))
    .returning({ id: messageJobs.id })

  if (updated.length === 0) throw new Error('Mensagem não encontrada')
  revalidatePath('/')
}

export async function disconnectWhatsApp() {
  const userId = await getUserId()
  const sessionDir = process.env.BAILEYS_AUTH_DIR || '.baileys-auth'

  try {
    if (existsSync(sessionDir)) {
      rmSync(sessionDir, { recursive: true, force: true })
    }
  } catch (err) {
    console.error('Erro ao remover diretório da sessão:', err)
  }

  await db.update(whatsappSessionState).set({
    status: 'disconnected',
    qrCode: null,
    phone: null,
    lastError: 'Desconectado manualmente',
    updatedAt: new Date(),
  }).where(eq(whatsappSessionState.userId, userId))

  revalidatePath('/whatsapp')
  revalidatePath('/')
}

export async function getWhatsAppStatus() {
  const userId = await getUserId()
  let [state] = await db.select().from(whatsappSessionState).where(eq(whatsappSessionState.userId, userId)).limit(1)

  if (!state) {
    const [latestGlobal] = await db.select().from(whatsappSessionState).orderBy(desc(whatsappSessionState.updatedAt)).limit(1)
    if (latestGlobal) {
      const [inserted] = await db.insert(whatsappSessionState).values({
        userId,
        status: latestGlobal.status,
        qrCode: latestGlobal.qrCode,
        lastError: latestGlobal.lastError,
        phone: latestGlobal.phone,
      }).onConflictDoUpdate({
        target: whatsappSessionState.userId,
        set: {
          status: latestGlobal.status,
          qrCode: latestGlobal.qrCode,
          lastError: latestGlobal.lastError,
          phone: latestGlobal.phone,
          updatedAt: new Date(),
        },
      }).returning()
      return inserted ?? latestGlobal
    }
  }

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
