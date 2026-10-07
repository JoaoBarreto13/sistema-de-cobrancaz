'use server'

import { db } from '@/lib/db'
import { billingGroups, customerGroups, customers, inboundMessages, messageAttachments, messageJobs, whatsappSessionState } from '@/lib/db/schema'
import { requireAdmin, requireUser } from '@/lib/session'
import { WA_STATE_KEY } from '@/lib/whatsapp'
import { phoneKey as mkPhoneKey } from '@/lib/phone'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

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
  const user = await requireUser()
  const userId = user.id
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
  const user = await requireUser()
  const userId = user.id
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
  const user = await requireUser()
  const userId = user.id
  const [group] = await db.select({ active: billingGroups.active }).from(billingGroups)
    .where(and(eq(billingGroups.id, id), eq(billingGroups.userId, userId))).limit(1)
  if (!group) throw new Error('Grupo não encontrado')
  await db.update(billingGroups).set({ active: !group.active, updatedAt: new Date() })
    .where(and(eq(billingGroups.id, id), eq(billingGroups.userId, userId)))
  revalidatePath('/')
}

export async function sendGroupNow(groupId: number) {
  const user = await requireUser()
  const userId = user.id
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
  const user = await requireUser()
  const userId = user.id
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
  const pk = mkPhoneKey(data.phone)
  const [customer] = await db.insert(customers).values({ userId, name: data.name, phone: data.phone, phoneKey: pk }).returning({ id: customers.id })
  if (data.groupId) {
    await db.insert(customerGroups).values({ userId, customerId: customer.id, groupId: data.groupId })
  }
  revalidatePath('/')
}

export async function updateCustomer(id: number, formData: FormData) {
  const user = await requireUser()
  const userId = user.id
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

  const pk = mkPhoneKey(data.phone)
  await db.update(customers).set({ name: data.name, phone: data.phone, phoneKey: pk, updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.userId, userId)))

  await db.delete(customerGroups).where(and(eq(customerGroups.customerId, id), eq(customerGroups.userId, userId)))
  if (data.groupId) {
    await db.insert(customerGroups).values({ userId, customerId: id, groupId: data.groupId })
  }
  revalidatePath('/')
}

export async function deleteCustomer(id: number) {
  const user = await requireUser()
  const userId = user.id
  await db.delete(messageJobs)
    .where(and(eq(messageJobs.customerId, id), eq(messageJobs.userId, userId), sql`${messageJobs.status} IN ('pending','processing')`))
  await db.delete(customerGroups)
    .where(and(eq(customerGroups.customerId, id), eq(customerGroups.userId, userId)))
  await db.delete(customers)
    .where(and(eq(customers.id, id), eq(customers.userId, userId)))
  revalidatePath('/')
}

export async function toggleCustomer(id: number) {
  const user = await requireUser()
  const userId = user.id
  const [customer] = await db.select({ active: customers.active }).from(customers)
    .where(and(eq(customers.id, id), eq(customers.userId, userId))).limit(1)
  if (!customer) throw new Error('Cliente não encontrado')
  await db.update(customers).set({ active: !customer.active, updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.userId, userId)))
  revalidatePath('/')
}

export async function sendOneOff(formData: FormData) {
  const user = await requireUser()
  const userId = user.id
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
  const user = await requireUser()
  const userId = user.id
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
  const user = await requireUser()
  const userId = user.id
  const deleted = await db.delete(customerGroups)
    .where(and(eq(customerGroups.customerId, customerId), eq(customerGroups.groupId, groupId), eq(customerGroups.userId, userId)))
    .returning({ id: customerGroups.id })
  if (deleted.length === 0) throw new Error('Vínculo não encontrado')
  revalidatePath('/')
}

export async function cancelJob(id: number) {
  const user = await requireUser()
  const userId = user.id
  const updated = await db.update(messageJobs)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(messageJobs.id, id), eq(messageJobs.userId, userId),
      sql`${messageJobs.status} IN ('pending','failed')`))
    .returning({ id: messageJobs.id })
  if (updated.length === 0) throw new Error('Job não pode ser cancelado (já enviado ou em processamento)')
  revalidatePath('/')
}

// Tarefa 4 — retryJob corrigido: confere status atomicamente no WHERE
export async function retryJob(id: number) {
  const user = await requireUser()
  const updated = await db.update(messageJobs)
    .set({
      status: 'pending',
      attempts: 0,
      error: null,
      scheduledFor: new Date(),
      lockedAt: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(messageJobs.id, id),
      eq(messageJobs.userId, user.id),
      sql`${messageJobs.status} IN ('failed','cancelled')`,
    ))
    .returning({ id: messageJobs.id })

  if (updated.length === 0) {
    const [job] = await db.select({ status: messageJobs.status }).from(messageJobs)
      .where(and(eq(messageJobs.id, id), eq(messageJobs.userId, user.id))).limit(1)
    if (!job) throw new Error('Mensagem não encontrada')
    throw new Error(`Só é possível reenviar mensagens com falha ou canceladas (status atual: ${job.status})`)
  }
  revalidatePath('/')
}

// Tarefa 2 — disconnectWhatsApp via comando no banco (worker executa)
export async function disconnectWhatsApp() {
  await requireAdmin()
  await db.update(whatsappSessionState)
    .set({ command: 'logout', updatedAt: new Date() })
    .where(eq(whatsappSessionState.userId, WA_STATE_KEY))
  revalidatePath('/whatsapp')
  revalidatePath('/')
}

// Tarefa 2 — getWhatsAppStatus lê linha 'global'; oculta QR para não-admin
export async function getWhatsAppStatus() {
  const user = await requireUser()
  const isAdmin = (user as { role?: string }).role === 'admin'
  const [state] = await db.select().from(whatsappSessionState)
    .where(eq(whatsappSessionState.userId, WA_STATE_KEY)).limit(1)
  if (!state) return null
  // Usuário comum não enxerga QR nem lastError
  if (!isAdmin) return { ...state, qrCode: null, lastError: null }
  return state
}

export async function getDashboardData() {
  const user = await requireUser()
  const userId = user.id
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
    db.select().from(whatsappSessionState).where(eq(whatsappSessionState.userId, WA_STATE_KEY)).limit(1),
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
    // Devolve apenas os campos que o Nav consome, impedindo vazamento de QR Code ou lastError no payload
    whatsapp: state[0] ? { status: state[0].status, phone: state[0].phone } : null,
    counts: counts[0] ?? { pending: 0, sent: 0, failed: 0 },
  }
}

// Tarefa 3 — Conversas otimizadas
export async function getConversations() {
  const user = await requireUser()
  const userId = user.id
  const isAdmin = (user as { role?: string }).role === 'admin'

  // Consulta lateral única: busca clientes ativos, contagem de não lidas e última mensagem em 1 único SQL
  const rows = await db.execute<{
    customer_id: number
    customer_name: string
    customer_phone: string
    customer_phone_key: string | null
    unread_count: number
    last_msg_id: number | null
    last_msg_kind: string | null
    last_msg_body: string | null
    last_msg_received_at: string | null
  }>(sql`
    SELECT
      c.id AS customer_id,
      c.name AS customer_name,
      c.phone AS customer_phone,
      c."phoneKey" AS customer_phone_key,
      COALESCE(u.unread_count, 0) AS unread_count,
      m.id AS last_msg_id,
      m.kind AS last_msg_kind,
      m.body AS last_msg_body,
      m."receivedAt" AS last_msg_received_at
    FROM customers c
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS unread_count
      FROM inbound_messages im
      WHERE im."phoneKey" = c."phoneKey" AND im."readAt" IS NULL
    ) u ON c."phoneKey" IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT id, kind, body, "receivedAt"
      FROM inbound_messages im
      WHERE im."phoneKey" = c."phoneKey"
      ORDER BY im."receivedAt" DESC
      LIMIT 1
    ) m ON c."phoneKey" IS NOT NULL
    WHERE c."userId" = ${userId} AND c.active = true
    ORDER BY COALESCE(m."receivedAt", c."createdAt") DESC
  `)

  const conversations = rows.rows.map(r => ({
    customer: {
      id: r.customer_id,
      name: r.customer_name,
      phone: r.customer_phone,
      phoneKey: r.customer_phone_key,
    },
    lastMessage: r.last_msg_id ? {
      id: r.last_msg_id,
      kind: r.last_msg_kind ?? 'text',
      body: r.last_msg_body,
      receivedAt: r.last_msg_received_at ? new Date(r.last_msg_received_at) : new Date(),
    } : null,
    unread: Number(r.unread_count),
  }))

  // Admin vê também mensagens de números não identificados (que não batem com NENHUM cliente do sistema)
  let unidentified: Array<typeof inboundMessages.$inferSelect> = []
  if (isAdmin) {
    unidentified = await db.select().from(inboundMessages)
      .where(sql`${inboundMessages.phoneKey} IS NULL OR NOT EXISTS (
        SELECT 1 FROM customers c WHERE c."phoneKey" = ${inboundMessages.phoneKey}
      )`)
      .orderBy(desc(inboundMessages.receivedAt))
      .limit(50)
  }

  return { conversations, unidentified }
}

export async function getThread(customerId: number) {
  const user = await requireUser()
  const userId = user.id
  const [customer] = await db.select().from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.userId, userId))).limit(1)
  if (!customer) throw new Error('Cliente não encontrado')

  // Mensagens enviadas (com limite de 100 mensagens)
  const sent = await db.select({
    id: messageJobs.id, message: messageJobs.message, sentAt: messageJobs.sentAt,
    status: messageJobs.status,
  }).from(messageJobs)
    .where(and(eq(messageJobs.customerId, customerId), eq(messageJobs.userId, userId),
      eq(messageJobs.status, 'sent')))
    .orderBy(desc(messageJobs.sentAt))
    .limit(100)

  // Mensagens recebidas acompanhadas de anexo se houver (com limite de 100 mensagens)
  const receivedRows = customer.phoneKey
    ? await db.select({
        id: inboundMessages.id,
        waMessageId: inboundMessages.waMessageId,
        remoteJid: inboundMessages.remoteJid,
        phone: inboundMessages.phone,
        phoneKey: inboundMessages.phoneKey,
        pushName: inboundMessages.pushName,
        kind: inboundMessages.kind,
        body: inboundMessages.body,
        mediaStatus: inboundMessages.mediaStatus,
        receivedAt: inboundMessages.receivedAt,
        attachmentId: messageAttachments.id,
        attachmentMimetype: messageAttachments.mimetype,
        attachmentFileName: messageAttachments.fileName,
        attachmentSizeBytes: messageAttachments.sizeBytes,
      })
      .from(inboundMessages)
      .leftJoin(messageAttachments, eq(messageAttachments.inboundMessageId, inboundMessages.id))
      .where(eq(inboundMessages.phoneKey, customer.phoneKey))
      .orderBy(desc(inboundMessages.receivedAt))
      .limit(100)
    : []

  const received = receivedRows.map(r => ({
    id: r.id,
    waMessageId: r.waMessageId,
    remoteJid: r.remoteJid,
    phone: r.phone,
    phoneKey: r.phoneKey,
    pushName: r.pushName,
    kind: r.kind,
    body: r.body,
    mediaStatus: r.mediaStatus,
    receivedAt: r.receivedAt,
    attachment: r.attachmentId ? {
      id: r.attachmentId,
      mimetype: r.attachmentMimetype!,
      fileName: r.attachmentFileName,
      sizeBytes: r.attachmentSizeBytes!,
    } : null,
  }))

  // Reverter para ordem cronológica (antigas primeiro)
  sent.reverse()
  received.reverse()

  return { customer, sent, received }
}

export async function markConversationRead(customerId: number) {
  const user = await requireUser()
  const userId = user.id
  const [customer] = await db.select({ phoneKey: customers.phoneKey }).from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.userId, userId))).limit(1)
  if (!customer?.phoneKey) return
  await db.update(inboundMessages).set({ readAt: new Date() })
    .where(and(eq(inboundMessages.phoneKey, customer.phoneKey), isNull(inboundMessages.readAt)))
  revalidatePath('/')
}

// Tarefa 1 — Gestão de usuários (somente admin)
export async function listUsers() {
  await requireAdmin()
  const { auth } = await import('@/lib/auth')
  const { headers } = await import('next/headers')
  const res = await auth.api.listUsers({ headers: await headers(), query: {} })
  return res
}

export async function adminCreateUser(formData: FormData) {
  await requireAdmin()
  const { auth } = await import('@/lib/auth')
  const { headers } = await import('next/headers')
  const u = String(formData.get('username')).toLowerCase().trim()
  const usernameOriginal = String(formData.get('username')).trim()
  const name = String(formData.get('name')).trim()
  const password = String(formData.get('password'))

  if (!/^[a-z0-9_.]{3,30}$/i.test(u)) throw new Error('Username inválido (3-30 chars, a-z 0-9 _ .)')
  if (password.length < 8) throw new Error('Senha mínima de 8 caracteres')

  await auth.api.createUser({
    body: {
      email: `${u}@ceifabot.local`,
      password,
      name,
      role: 'user',
      data: { username: u, displayUsername: usernameOriginal },
    },
    headers: await headers(),
  })
  revalidatePath('/admin/usuarios')
}

export async function adminSetPassword(userId: string, formData: FormData) {
  await requireAdmin()
  const { auth } = await import('@/lib/auth')
  const { headers } = await import('next/headers')
  const newPassword = String(formData.get('password'))
  if (newPassword.length < 8) throw new Error('Senha mínima de 8 caracteres')
  await auth.api.setUserPassword({ body: { userId, newPassword }, headers: await headers() })
  revalidatePath('/admin/usuarios')
}

export async function adminBanUser(targetUserId: string) {
  const me = await requireAdmin()
  if (me.id === targetUserId) throw new Error('Não é possível bloquear a si mesmo')
  const { auth } = await import('@/lib/auth')
  const { headers } = await import('next/headers')
  await auth.api.banUser({ body: { userId: targetUserId }, headers: await headers() })
  revalidatePath('/admin/usuarios')
}

export async function adminUnbanUser(targetUserId: string) {
  await requireAdmin()
  const { auth } = await import('@/lib/auth')
  const { headers } = await import('next/headers')
  await auth.api.unbanUser({ body: { userId: targetUserId }, headers: await headers() })
  revalidatePath('/admin/usuarios')
}

export async function adminRemoveUser(targetUserId: string) {
  const me = await requireAdmin()
  if (me.id === targetUserId) throw new Error('Não é possível remover a si mesmo')
  const { auth } = await import('@/lib/auth')
  const { headers } = await import('next/headers')

  // Remover primeiro no Better Auth (se falhar, os dados do usuário não são apagados)
  await auth.api.removeUser({ body: { userId: targetUserId }, headers: await headers() })

  // Com o usuário removido com sucesso no Auth, limpar seus dados em transação
  await db.transaction(async (tx) => {
    await tx.delete(messageJobs).where(eq(messageJobs.userId, targetUserId))
    await tx.delete(customerGroups).where(eq(customerGroups.userId, targetUserId))
    await tx.delete(customers).where(eq(customers.userId, targetUserId))
    await tx.delete(billingGroups).where(eq(billingGroups.userId, targetUserId))
  })

  revalidatePath('/admin/usuarios')
}
