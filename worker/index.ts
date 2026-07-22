import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
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

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
async function updateConnection(status: string, qrCode: string | null = null, lastError: string | null = null, phone: string | null = null) {
  const users = await db.execute<{ id: string }>(sql`select id from "user"`)
  for (const row of users.rows) await db.insert(whatsappSessionState).values({ userId: row.id, status, qrCode, lastError, phone }).onConflictDoUpdate({ target: whatsappSessionState.userId, set: { status, qrCode, lastError, phone, updatedAt: new Date() } })
}
async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
  socket = makeWASocket({ auth: state, printQRInTerminal: false, syncFullHistory: false, markOnlineOnConnect: false })
  socket.ev.on('creds.update', saveCreds)
  socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) { qrcode.generate(qr, { small: true }); await updateConnection('waiting_qr', qr) }
    if (connection === 'open') { connected = true; await updateConnection('connected', null, null, socket?.user?.id?.split(':')[0] || null); console.log('[worker] WhatsApp conectado') }
    if (connection === 'close') {
      connected = false
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode
      const loggedOut = code === DisconnectReason.loggedOut
      await updateConnection(loggedOut ? 'logged_out' : 'reconnecting', null, lastDisconnect?.error?.message || 'Conexão encerrada')
      if (!loggedOut) setTimeout(connect, 4_000)
    }
  })
}
function render(template: string, customer: string, amountCents: number, dueDay: number) {
  return template.replaceAll('{{nome}}', customer).replaceAll('{{valor}}', (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })).replaceAll('{{vencimento}}', String(dueDay))
}
async function scheduleMonthly() {
  const now = new Date(); const localDate = formatInTimeZone(now, TIMEZONE, 'yyyy-MM-dd'); const [year, month, today] = localDate.split('-').map(Number)
  const groups = await db.select().from(billingGroups).where(eq(billingGroups.active, true))
  for (const group of groups) {
    const effectiveDay = Math.min(group.dueDay, getDaysInMonth(new Date(year, month - 1)))
    if (today !== effectiveDay) continue
    const scheduledFor = fromZonedTime(`${localDate} ${group.sendTime}:00`, TIMEZONE)
    if (scheduledFor > now) continue
    const members = await db.select({ id: customers.id, name: customers.name }).from(customerGroups).innerJoin(customers, and(eq(customers.id, customerGroups.customerId), eq(customers.userId, group.userId))).where(and(eq(customerGroups.userId, group.userId), eq(customerGroups.groupId, group.id), eq(customers.active, true)))
    for (const customer of members) await db.insert(messageJobs).values({ userId: group.userId, customerId: customer.id, groupId: group.id, type: 'monthly', message: render(group.messageTemplate, customer.name, group.amountCents, group.dueDay), amountCents: group.amountCents, scheduledFor, idempotencyKey: `monthly:${group.id}:${customer.id}:${year}-${month}` }).onConflictDoNothing()
  }
}
async function processNext() {
  if (!connected || !socket) return
  const result = await db.execute<{ id: number }>(sql`UPDATE message_jobs SET status = 'processing', "lockedAt" = now(), attempts = attempts + 1, "updatedAt" = now() WHERE id = (SELECT id FROM message_jobs WHERE (status = 'pending' OR (status = 'processing' AND "lockedAt" < now() - interval '10 minutes')) AND "scheduledFor" <= now() ORDER BY "scheduledFor" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`)
  const id = result.rows[0]?.id; if (!id) return
  const [job] = await db.select({ id: messageJobs.id, message: messageJobs.message, attempts: messageJobs.attempts, phone: customers.phone }).from(messageJobs).innerJoin(customers, and(eq(customers.id, messageJobs.customerId), eq(customers.userId, messageJobs.userId))).where(eq(messageJobs.id, id)).limit(1)
  if (!job) return
  try {
    const jid = `${job.phone.replace(/\D/g, '')}@s.whatsapp.net`
    await socket.sendMessage(jid, { text: job.message })
    await db.update(messageJobs).set({ status: 'sent', sentAt: new Date(), error: null, updatedAt: new Date() }).where(eq(messageJobs.id, id))
    await wait(SEND_DELAY_MS)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida'
    await db.update(messageJobs).set({ status: job.attempts >= 3 ? 'failed' : 'pending', error: message, scheduledFor: new Date(Date.now() + 5 * 60_000), updatedAt: new Date() }).where(eq(messageJobs.id, id))
  }
}
async function tick() { try { await scheduleMonthly(); await processNext() } catch (error) { console.error('[worker] Falha no ciclo:', error) } }
connect().then(() => { setInterval(tick, INTERVAL_MS); tick() }).catch(error => { console.error('[worker] Não iniciou:', error); process.exit(1) })
