import { db } from '@/lib/db'
import { customers, inboundMessages, messageAttachments } from '@/lib/db/schema'
import { requireUser } from '@/lib/session'
import { and, eq } from 'drizzle-orm'

const ALLOWED_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

const EXT_BY_MIMETYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null)
  if (!user) return new Response('Não autorizado', { status: 401 })

  const { id } = await params
  const attachmentId = Number(id)
  if (!Number.isInteger(attachmentId)) return new Response(null, { status: 404 })

  // Buscar anexo + mensagem associada
  const [row] = await db
    .select({
      data: messageAttachments.data,
      mimetype: messageAttachments.mimetype,
      fileName: messageAttachments.fileName,
      sizeBytes: messageAttachments.sizeBytes,
      phoneKey: inboundMessages.phoneKey,
    })
    .from(messageAttachments)
    .innerJoin(inboundMessages, eq(inboundMessages.id, messageAttachments.inboundMessageId))
    .where(eq(messageAttachments.id, attachmentId))
    .limit(1)

  if (!row) return new Response(null, { status: 404 })

  // Autorização: admin OU usuário tem cliente com esse phoneKey
  const isAdmin = (user as { role?: string }).role === 'admin'
  if (!isAdmin) {
    if (!row.phoneKey) return new Response(null, { status: 404 })
    const [match] = await db.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.userId, user.id), eq(customers.phoneKey, row.phoneKey))).limit(1)
    // Retornar 404 (não 403) para não revelar que o recurso existe
    if (!match) return new Response(null, { status: 404 })
  }

  // Garantir que o mimetype seja da lista permitida (nunca servir HTML/SVG etc.)
  const safeMimetype = ALLOWED_MIMETYPES.has(row.mimetype) ? row.mimetype : 'application/octet-stream'

  // Garantir extensão no nome do arquivo para "salvar como"
  let name = (row.fileName && row.fileName.trim()) || `anexo-${attachmentId}`
  if (!name.includes('.')) {
    const ext = EXT_BY_MIMETYPE[safeMimetype] ?? ''
    name += ext
  }

  // CSP: sandbox pode quebrar visualizador nativo de PDF no Chrome. Aplicar sandbox apenas em imagens.
  const isImage = safeMimetype.startsWith('image/')
  const csp = isImage
    ? "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    : "default-src 'none'; object-src 'self'"

  return new Response(row.data as unknown as BodyInit, {
    headers: {
      'Content-Type': safeMimetype,
      'Content-Length': String(row.sizeBytes),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': csp,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
