import 'dotenv/config'
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, Browsers } from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import { and, eq, lte, or, sql } from 'drizzle-orm'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { getDaysInMonth } from 'date-fns'
import { db } from '../lib/db'
import { billingGroups, customerGroups, customers, messageJobs, whatsappSessionState } from '../lib/db/schema'

const TIMEZONE = 'America/Sao_Paulo'
const SESSION_DIR = process.env.BAILEYS_AUTH_DIR || '.baileys-auth'
const INTERVAL_MS = 30_000
const SEND_DELAY_MS = 8_000
let socket: ReturnType<typeof makeWASocket> | null = null
let connected = false
let wasEverConnected = false

let latestState = {
  status: 'disconnected',
  qrCode: null as string | null,
  lastError: null as string | null,
  phone: null as string | null,
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function syncStateToUsers() {
  try {
    const users = await db.execute<{ id: string }>(sql`select id from "user"`)
    if (users.rows.length === 0) {
      console.log('[worker] Nenhum usuário cadastrado ainda — estado do WhatsApp será sincronizado quando houver usuários.')
      return
    }
    for (const row of users.rows) {
      await db.insert(whatsappSessionState).values({
        userId: row.id,
        status: latestState.status,
        qrCode: latestState.qrCode,
        lastError: latestState.lastError,
        phone: latestState.phone,
      }).onConflictDoUpdate({
        target: whatsappSessionState.userId,
        set: {
          status: latestState.status,
          qrCode: latestState.qrCode,
          lastError: latestState.lastError,
          phone: latestState.phone,
          updatedAt: new Date(),
        },
      })
    }
  } catch (error) {
    console.error('[worker] Erro ao sincronizar status do WhatsApp:', error)
  }
}

async function updateConnection(status: string, qrCode: string | null = null, lastError: string | null = null, phone: string | null = null) {
  console.log(`[worker] Status: ${status}${qrCode ? ' (com QR)' : ''}${lastError ? ` | Erro: ${lastError}` : ''}${phone ? ` | Tel: ${phone}` : ''}`)
  latestState = { status, qrCode, lastError, phone }
  await syncStateToUsers()
}

async function connect() {
  console.log('[worker] Iniciando conexão com WhatsApp...')

  // Limpar sessão antiga se existir para garantir QR code fresco
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)

  // Buscar versão mais recente do protocolo para compatibilidade
  let version: [number, number, number] | undefined
  try {
    const { version: v } = await fetchLatestBaileysVersion()
    version = v
    console.log(`[worker] Usando versão do protocolo: ${v.join('.')}`)
  } catch (e) {
    console.log('[worker] Não foi possível buscar versão mais recente, usando padrão')
  }

  socket = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    browser: Browsers.ubuntu('Chrome'),
    ...(version ? { version } : {}),
  })
  socket.ev.on('creds.update', saveCreds)
  socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('[worker] QR Code gerado — escaneie com seu WhatsApp')
      qrcode.generate(qr, { small: true })
      await updateConnection('waiting_qr', qr)
    }
    if (connection === 'open') {
      connected = true
      wasEverConnected = true
      const phone = socket?.user?.id?.split(':')[0] || null
      console.log(`[worker] WhatsApp conectado! Número: ${phone}`)
      await updateConnection('connected', null, null, phone)
    }
    if (connection === 'close') {
      connected = false
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode
      const loggedOut = code === DisconnectReason.loggedOut
      const errorMsg = lastDisconnect?.error?.message || 'Conexão encerrada'

      if (loggedOut) {
        console.log('[worker] Sessão encerrada pelo usuário (logout)')
        await updateConnection('logged_out', null, errorMsg)
      } else if (!wasEverConnected) {
        // Nunca conectou — QR expirou ou falha inicial. Manter status waiting_qr
        // para que a UI continue mostrando a área de QR Code
        console.log(`[worker] Conexão fechou antes de conectar (${errorMsg}). Aguardando novo QR...`)
        await updateConnection('waiting_qr', null, errorMsg)
        setTimeout(connect, 2_000)
      } else {
        // Já estava conectado, caiu — reconectando
        console.log(`[worker] Conexão perdida (${errorMsg}). Reconectando em 4s...`)
        await updateConnection('reconnecting', null, errorMsg)
        setTimeout(connect, 4_000)
      }
    }
  })
}
function render(template: string, customer: string, amountCents: number, dueDay: number) {
  return template.replaceAll('{{nome}}', customer).replaceAll('{{valor}}', (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })).replaceAll('{{vencimento}}', String(dueDay))
}
async function scheduleMonthly() {
  const now = new Date()
  const localDate = formatInTimeZone(now, TIMEZONE, 'yyyy-MM-dd')
  const [year, month, today] = localDate.split('-').map(Number)
  const groups = await db.select().from(billingGroups).where(eq(billingGroups.active, true))

  for (const group of groups) {
    // 1. Se tiver data de envio específica (sendDate)
    if (group.sendDate) {
      if (localDate !== group.sendDate) continue
    } else {
      // 2. Se for envio mensal no dia de vencimento (dueDay)
      const effectiveDay = Math.min(group.dueDay, getDaysInMonth(new Date(year, month - 1)))
      if (today !== effectiveDay) continue
    }

    const scheduledFor = fromZonedTime(`${localDate} ${group.sendTime}:00`, TIMEZONE)
    if (scheduledFor > now) continue

    const members = await db.select({ id: customers.id, name: customers.name })
      .from(customerGroups)
      .innerJoin(customers, and(eq(customers.id, customerGroups.customerId), eq(customers.userId, group.userId)))
      .where(and(eq(customerGroups.userId, group.userId), eq(customerGroups.groupId, group.id), eq(customers.active, true)))

    if (members.length === 0) continue

    const idempotencyKeyPrefix = group.sendDate
      ? `date:${group.id}:${group.sendDate}`
      : `monthly:${group.id}:${year}-${month}`

    for (const customer of members) {
      const idempotencyKey = `${idempotencyKeyPrefix}:${customer.id}`
      const message = render(group.messageTemplate, customer.name, group.amountCents, group.dueDay)
      
      const inserted = await db.insert(messageJobs).values({
        userId: group.userId,
        customerId: customer.id,
        groupId: group.id,
        type: 'monthly',
        message,
        amountCents: group.amountCents,
        scheduledFor,
        idempotencyKey,
      }).onConflictDoNothing().returning({ id: messageJobs.id })

      if (inserted.length > 0) {
        console.log(`[worker] Cobrança automática agendada: Grupo "${group.name}" -> Cliente "${customer.name}"`)
      }
    }
  }
}
async function findWhatsAppJid(sock: ReturnType<typeof makeWASocket>, rawPhone: string): Promise<string | null> {
  if (!sock) return null
  let clean = rawPhone.replace(/\D/g, '')
  if ((clean.length === 10 || clean.length === 11) && !clean.startsWith('55')) {
    clean = `55${clean}`
  }

  try {
    // 1. Tenta verificar o número diretamente no WhatsApp
    const [res1] = await sock.onWhatsApp(clean)
    if (res1?.exists && res1.jid) {
      console.log(`[worker] Número verificado no WhatsApp: ${clean} -> JID: ${res1.jid}`)
      return res1.jid
    }

    // 2. Se for número brasileiro com 13 dígitos (55 + DDD + 9 dígitos), tenta sem o 9 (muitas contas antigas usam formato de 8 dígitos)
    if (clean.startsWith('55') && clean.length === 13) {
      const without9 = clean.slice(0, 4) + clean.slice(5)
      const [res2] = await sock.onWhatsApp(without9)
      if (res2?.exists && res2.jid) {
        console.log(`[worker] Número verificado sem o 9º dígito: ${without9} -> JID: ${res2.jid}`)
        return res2.jid
      }
    }

    // 3. Se for número brasileiro com 12 dígitos (55 + DDD + 8 dígitos), tenta com o 9
    if (clean.startsWith('55') && clean.length === 12) {
      const with9 = clean.slice(0, 4) + '9' + clean.slice(4)
      const [res3] = await sock.onWhatsApp(with9)
      if (res3?.exists && res3.jid) {
        console.log(`[worker] Número verificado com o 9º dígito: ${with9} -> JID: ${res3.jid}`)
        return res3.jid
      }
    }
  } catch (err) {
    console.error('[worker] Erro ao consultar onWhatsApp:', err)
  }

  // Fallback caso onWhatsApp não consiga checar
  return `${clean}@s.whatsapp.net`
}

async function processNext() {
  if (!connected || !socket) return
  const result = await db.execute<{ id: number }>(sql`UPDATE message_jobs SET status = 'processing', "lockedAt" = now(), attempts = attempts + 1, "updatedAt" = now() WHERE id = (SELECT id FROM message_jobs WHERE (status = 'pending' OR (status = 'processing' AND "lockedAt" < now() - interval '10 minutes')) AND "scheduledFor" <= now() ORDER BY "scheduledFor" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`)
  const id = result.rows[0]?.id; if (!id) return
  const [job] = await db.select({ id: messageJobs.id, message: messageJobs.message, attempts: messageJobs.attempts, phone: customers.phone, customerName: customers.name }).from(messageJobs).innerJoin(customers, and(eq(customers.id, messageJobs.customerId), eq(customers.userId, messageJobs.userId))).where(eq(messageJobs.id, id)).limit(1)
  if (!job) return
  try {
    console.log(`[worker] Preparando envio para ${job.customerName ?? 'Cliente'} (${job.phone})...`)
    const jid = await findWhatsAppJid(socket, job.phone)
    if (!jid) {
      throw new Error(`Número ${job.phone} não encontrado ou inválido no WhatsApp`)
    }

    console.log(`[worker] Enviando mensagem via WhatsApp para ${jid}...`)
    const sent = await socket.sendMessage(jid, { text: job.message })
    console.log(`[worker] ✓ Mensagem enviada com sucesso para ${jid} (ID: ${sent?.key?.id})`)

    await db.update(messageJobs).set({ status: 'sent', sentAt: new Date(), error: null, updatedAt: new Date() }).where(eq(messageJobs.id, id))
    await wait(SEND_DELAY_MS)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida'
    console.error(`[worker] ✗ Falha ao enviar para ${job.phone}:`, message)
    await db.update(messageJobs).set({ status: job.attempts >= 3 ? 'failed' : 'pending', error: message, scheduledFor: new Date(Date.now() + 5 * 60_000), updatedAt: new Date() }).where(eq(messageJobs.id, id))
  }
}
async function tick() {
  try {
    await syncStateToUsers()
    await scheduleMonthly()
    await processNext()
  } catch (error) {
    console.error('[worker] Falha no ciclo:', error)
  }
}
connect().then(() => { setInterval(tick, INTERVAL_MS); tick() }).catch(error => { console.error('[worker] Não iniciou:', error); process.exit(1) })
