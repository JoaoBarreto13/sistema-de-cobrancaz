import 'dotenv/config'
import makeWASocket, {
  DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, Browsers,
  normalizeMessageContent, getContentType, downloadMediaMessage,
} from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import { rmSync } from 'node:fs'
import { and, eq, lte, or, sql } from 'drizzle-orm'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { getDaysInMonth } from 'date-fns'
import { db } from '../lib/db'
import { billingGroups, customerGroups, customers, inboundMessages, messageAttachments, messageJobs, whatsappSessionState } from '../lib/db/schema'
import { WA_STATE_KEY } from '../lib/whatsapp'
import { phoneKey as mkPhoneKey } from '../lib/phone'

const TIMEZONE = 'America/Sao_Paulo'
const SESSION_DIR = process.env.BAILEYS_AUTH_DIR || '.baileys-auth'
const INTERVAL_MS = 30_000
const SEND_DELAY_MS = 8_000
const ATTACHMENT_MAX_MB = Number(process.env.ATTACHMENT_MAX_MB ?? 15)
const ALLOWED_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

let socket: ReturnType<typeof makeWASocket> | null = null
let connected = false
let wasEverConnected = false
let loggingOut = false
let reconnectTimer: NodeJS.Timeout | null = null

function scheduleReconnect(ms: number) {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, ms)
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ─── Estado global (linha 'global' no banco) ────────────────────────────────
async function syncStateToGlobal(
  status: string,
  qrCode: string | null = null,
  lastError: string | null = null,
  phone: string | null = null,
  command?: string | null,
) {
  try {
    const updateSet: Record<string, unknown> = {
      status, qrCode, lastError, phone, updatedAt: new Date(),
    }
    // Só atualiza command quando passado explicitamente, para não sobrescrever comando pendente
    if (command !== undefined) {
      updateSet.command = command
    }
    await db.insert(whatsappSessionState).values({
      userId: WA_STATE_KEY, status, qrCode, lastError, phone,
      ...(command !== undefined ? { command } : {}),
    }).onConflictDoUpdate({
      target: whatsappSessionState.userId,
      set: updateSet,
    })
  } catch (error) {
    console.error('[worker] Erro ao sincronizar status:', error)
  }
}

async function updateConnection(
  status: string,
  qrCode: string | null = null,
  lastError: string | null = null,
  phone: string | null = null,
) {
  console.log(`[worker] Status: ${status}${qrCode ? ' (com QR)' : ''}${lastError ? ` | Erro: ${lastError}` : ''}${phone ? ` | Tel: ${phone}` : ''}`)
  // Não passa command: mantém o que estiver no banco
  await syncStateToGlobal(status, qrCode, lastError, phone)
}

// ─── Logout explícito ────────────────────────────────────────────────────────
async function doLogout() {
  loggingOut = true
  wasEverConnected = false
  console.log('[worker] Executando logout...')
  try { await socket?.logout() } catch { /* ignorar */ }
  try { rmSync(SESSION_DIR, { recursive: true, force: true }) } catch { /* ignorar */ }
  await syncStateToGlobal('disconnected', null, 'Desconectado manualmente', null, null)
  loggingOut = false
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  scheduleReconnect(1_000)
}

// ─── Captura de mensagens recebidas (Tarefa 3) ───────────────────────────────
const FRIENDLY_TYPES: Record<string, string> = {
  audioMessage: '[áudio]',
  stickerMessage: '[figurinha]',
  videoMessage: '[vídeo]',
  imageMessage: '[imagem]',
  documentMessage: '[documento]',
  documentWithCaptionMessage: '[documento]',
  contactMessage: '[contato]',
  contactsArrayMessage: '[contatos]',
  locationMessage: '[localização]',
  liveLocationMessage: '[localização]',
}

async function handleInbound(msg: Parameters<ReturnType<typeof makeWASocket>['ev']['on']>[1] extends (args: infer A) => void ? A extends { messages: Array<infer M> } ? M : never : never) {
  if (msg.key.fromMe) return
  const jid = msg.key.remoteJid ?? ''
  if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) return

  const waMessageId = msg.key.id ?? ''
  if (!waMessageId) return

  // Evitar baixar mídia novamente se a mensagem já foi gravada
  const [alreadyExists] = await db.select({ id: inboundMessages.id }).from(inboundMessages)
    .where(eq(inboundMessages.waMessageId, waMessageId)).limit(1)
  if (alreadyExists) return

  const content = normalizeMessageContent(msg.message ?? null)
  if (!content) return
  const msgType = getContentType(content)
  if (!msgType || msgType === 'reactionMessage' || msgType === 'protocolMessage') return

  // Resolver número: tratar @lid (Baileys 7) checando remoteJidAlt
  const remoteJid = jid
  const remoteJidAlt = (msg.key as { remoteJidAlt?: string })?.remoteJidAlt ?? ''

  let resolvedRaw: string | null = null
  if (remoteJid.endsWith('@s.whatsapp.net')) {
    resolvedRaw = remoteJid.split('@')[0]
  } else if (remoteJidAlt.endsWith('@s.whatsapp.net')) {
    resolvedRaw = remoteJidAlt.split('@')[0]
  }

  let rawPhone: string | null = null
  let pKey: string | null = null

  if (resolvedRaw) {
    const digits = resolvedRaw.replace(/\D/g, '')
    // Um telefone válido possui de 10 a 15 dígitos. Se não resolver, phone e phoneKey ficam null.
    if (digits.length >= 10 && digits.length <= 15) {
      rawPhone = digits
      pKey = mkPhoneKey(digits)
    }
  }

  // Determinar kind e body com nomes amigáveis
  let kind: 'text' | 'image' | 'document' | 'other' = 'other'
  let body: string | null = null

  if (msgType === 'conversation' || msgType === 'extendedTextMessage') {
    kind = 'text'
    body = (content as { conversation?: string; extendedTextMessage?: { text?: string } }).conversation
      ?? (content as { extendedTextMessage?: { text?: string } }).extendedTextMessage?.text
      ?? null
  } else if (msgType === 'imageMessage') {
    kind = 'image'
    body = (content as { imageMessage?: { caption?: string } }).imageMessage?.caption ?? FRIENDLY_TYPES.imageMessage
  } else if (msgType === 'documentMessage' || msgType === 'documentWithCaptionMessage') {
    kind = 'document'
    const docMsg = (content as { documentMessage?: { caption?: string; fileName?: string } }).documentMessage
    body = docMsg?.caption ?? docMsg?.fileName ?? FRIENDLY_TYPES.documentMessage
  } else {
    kind = 'other'
    body = FRIENDLY_TYPES[msgType] ?? `[${msgType}]`
  }

  const receivedAt = new Date(Number(msg.messageTimestamp) * 1000)
  const pushName = msg.pushName ?? null

  let inboundId: number | null = null
  let mediaStatus: 'none' | 'stored' | 'too_large' | 'unsupported' | 'failed' = 'none'
  let attachmentData: { buf: Buffer; mimetype: string; fileName: string | null; sizeBytes: number } | null = null

  // Download de anexos (apenas se for imagem ou documento permitido)
  if (kind === 'image' || kind === 'document') {
    const imgMsg = (content as { imageMessage?: { mimetype?: string; fileLength?: number | null } }).imageMessage
    const docMsg = (content as { documentMessage?: { mimetype?: string; fileLength?: number | null; fileName?: string } }).documentMessage
    const mimetype = imgMsg?.mimetype ?? docMsg?.mimetype ?? ''
    const fileLength = Number(imgMsg?.fileLength ?? docMsg?.fileLength ?? 0)
    const fileName = docMsg?.fileName ?? null

    if (!ALLOWED_MIMETYPES.has(mimetype)) {
      mediaStatus = 'unsupported'
    } else if (fileLength > ATTACHMENT_MAX_MB * 1024 * 1024) {
      mediaStatus = 'too_large'
    } else {
      try {
        const buf = (await downloadMediaMessage(
          msg as Parameters<typeof downloadMediaMessage>[0],
          'buffer',
          {},
          { logger: socket!.logger, reuploadRequest: socket!.updateMediaMessage } as any,
        )) as Buffer
        attachmentData = { buf, mimetype, fileName, sizeBytes: buf.length }
        mediaStatus = 'stored'
      } catch (e) {
        console.error('[worker] Falha ao baixar anexo:', e)
        mediaStatus = 'failed'
      }
    }
  }

  await db.transaction(async (tx) => {
    const inserted = await tx.insert(inboundMessages).values({
      waMessageId,
      remoteJid: jid,
      phone: rawPhone,
      phoneKey: pKey,
      pushName,
      kind,
      body,
      mediaStatus,
      receivedAt,
    }).onConflictDoNothing().returning({ id: inboundMessages.id })

    inboundId = inserted[0]?.id ?? null
    if (!inboundId) return

    if (attachmentData) {
      await tx.insert(messageAttachments).values({
        inboundMessageId: inboundId,
        mimetype: attachmentData.mimetype,
        fileName: attachmentData.fileName,
        sizeBytes: attachmentData.sizeBytes,
        data: attachmentData.buf,
      })
    }
  })
}

// ─── Conectar ao WhatsApp ────────────────────────────────────────────────────
async function connect() {
  if (loggingOut) return
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  console.log('[worker] Iniciando conexão com WhatsApp...')

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)

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
        // Logout pelo celular → limpar sessão e gerar QR novo
        console.log('[worker] Sessão encerrada pelo usuário (logout via celular). Gerando QR novo...')
        wasEverConnected = false
        try { rmSync(SESSION_DIR, { recursive: true, force: true }) } catch { /* ignorar */ }
        await updateConnection('waiting_qr', null, 'Sessão encerrada — escaneie o QR novamente')
        scheduleReconnect(2_000)
      } else if (!wasEverConnected) {
        console.log(`[worker] Conexão fechou antes de conectar (${errorMsg}). Aguardando novo QR...`)
        await updateConnection('waiting_qr', null, errorMsg)
        scheduleReconnect(2_000)
      } else {
        console.log(`[worker] Conexão perdida (${errorMsg}). Reconectando em 4s...`)
        await updateConnection('reconnecting', null, errorMsg)
        scheduleReconnect(4_000)
      }
    }
  })

  // Captura de mensagens recebidas (Tarefa 3)
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return
    for (const msg of messages) {
      try { await handleInbound(msg as Parameters<typeof handleInbound>[0]) }
      catch (e) { console.error('[worker] Falha ao salvar mensagem recebida:', e) }
    }
  })
}

// ─── Helpers de envio ────────────────────────────────────────────────────────
function render(template: string, customer: string, amountCents: number, dueDay: number) {
  return template.replaceAll('{{nome}}', customer).replaceAll('{{valor}}', (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })).replaceAll('{{vencimento}}', String(dueDay))
}

async function scheduleMonthly() {
  const now = new Date()
  const localDate = formatInTimeZone(now, TIMEZONE, 'yyyy-MM-dd')
  const [year, month, today] = localDate.split('-').map(Number)
  const groups = await db.select().from(billingGroups).where(eq(billingGroups.active, true))

  for (const group of groups) {
    if (group.sendDate) {
      if (localDate !== group.sendDate) continue
    } else {
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
    const [res1] = (await sock.onWhatsApp(clean)) ?? []
    if (res1?.exists && res1.jid) {
      console.log(`[worker] Número verificado no WhatsApp: ${clean} -> JID: ${res1.jid}`)
      return res1.jid
    }

    if (clean.startsWith('55') && clean.length === 13) {
      const without9 = clean.slice(0, 4) + clean.slice(5)
      const [res2] = (await sock.onWhatsApp(without9)) ?? []
      if (res2?.exists && res2.jid) {
        console.log(`[worker] Número verificado sem o 9º dígito: ${without9} -> JID: ${res2.jid}`)
        return res2.jid
      }
    }

    if (clean.startsWith('55') && clean.length === 12) {
      const with9 = clean.slice(0, 4) + '9' + clean.slice(4)
      const [res3] = (await sock.onWhatsApp(with9)) ?? []
      if (res3?.exists && res3.jid) {
        console.log(`[worker] Número verificado com o 9º dígito: ${with9} -> JID: ${res3.jid}`)
        return res3.jid
      }
    }
  } catch (err) {
    console.error('[worker] Erro ao consultar onWhatsApp:', err)
  }

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

// ─── Tick principal ──────────────────────────────────────────────────────────
async function tick() {
  try {
    // Verificar comando de logout pendente (Tarefa 2.3)
    const [row] = await db.select().from(whatsappSessionState)
      .where(eq(whatsappSessionState.userId, WA_STATE_KEY)).limit(1)
    if (row?.command === 'logout' && !loggingOut) {
      await db.update(whatsappSessionState)
        .set({ command: null, updatedAt: new Date() })
        .where(eq(whatsappSessionState.userId, WA_STATE_KEY))
      await doLogout()
      return
    }

    await scheduleMonthly()
    await processNext()
  } catch (error) {
    console.error('[worker] Falha no ciclo:', error)
  }
}

connect().then(() => { setInterval(tick, INTERVAL_MS); tick() }).catch(error => { console.error('[worker] Não iniciou:', error); process.exit(1) })
