'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MessageSquare, FileText, Image as ImageIcon, ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react'
import { getThread, markConversationRead } from '@/app/actions/billing'
import type { getConversations } from '@/app/actions/billing'

type ConversationData = Awaited<ReturnType<typeof getConversations>>
type ThreadData = Awaited<ReturnType<typeof getThread>>

function AttachmentItem({ attachment, messageId }: { attachment: { id: number; mimetype: string; fileName: string | null }; messageId: number }) {
  const url = `/api/attachments/${attachment.id}`
  const isPDF = attachment.mimetype === 'application/pdf'
  return isPDF ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs hover:bg-muted transition-colors"
    >
      <FileText className="size-4 text-red-500 shrink-0" />
      <span className="truncate">{attachment.fileName ?? 'documento.pdf'}</span>
      <span className="text-muted-foreground shrink-0">Abrir PDF</span>
    </a>
  ) : (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border max-w-[200px] hover:opacity-90 transition-opacity">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={attachment.fileName ?? 'imagem'} className="w-full h-auto object-cover" loading="lazy" />
    </a>
  )
}

function MessageBubble({ msg, isSent }: {
  msg: { body?: string | null; kind?: string; mediaStatus?: string; receivedAt?: Date; sentAt?: Date | null; message?: string }
  isSent: boolean
}) {
  const text = isSent ? msg.message : msg.body
  const time = isSent
    ? (msg.sentAt ? new Date(msg.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '')
    : (msg.receivedAt ? new Date(msg.receivedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '')

  return (
    <div className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${isSent ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm'}`}>
        {text && <p className="whitespace-pre-wrap break-words">{text}</p>}
        {!isSent && msg.mediaStatus === 'too_large' && (
          <p className="text-xs opacity-70 flex items-center gap-1 mt-1"><AlertCircle className="size-3" />Anexo muito grande para baixar</p>
        )}
        {!isSent && msg.mediaStatus === 'unsupported' && (
          <p className="text-xs opacity-70 flex items-center gap-1 mt-1"><AlertCircle className="size-3" />Tipo de arquivo não suportado</p>
        )}
        {!isSent && msg.mediaStatus === 'failed' && (
          <p className="text-xs opacity-70 flex items-center gap-1 mt-1"><AlertCircle className="size-3" />Não foi possível baixar o anexo</p>
        )}
        <p className="text-xs opacity-50 mt-1 text-right">{time}</p>
      </div>
    </div>
  )
}

function ThreadView({ customerId, customerName, onBack }: { customerId: number; customerName: string; onBack: () => void }) {
  const [thread, setThread] = useState<ThreadData | null>(null)
  const [loading, startLoading] = useTransition()
  const router = useRouter()

  async function loadThread() {
    startLoading(async () => {
      try {
        const data = await getThread(customerId)
        setThread(data)
        await markConversationRead(customerId)
        router.refresh()
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  useEffect(() => { loadThread() }, [customerId])

  // Auto-refresh a cada 15 segundos
  useEffect(() => {
    const id = setInterval(loadThread, 15_000)
    return () => clearInterval(id)
  }, [customerId])

  // Mesclar e ordenar mensagens enviadas e recebidas
  const allMessages = thread ? [
    ...thread.sent.map(m => ({ ...m, _type: 'sent' as const, _time: m.sentAt ? new Date(m.sentAt).getTime() : 0 })),
    ...thread.received.map(m => ({ ...m, _type: 'received' as const, _time: new Date(m.receivedAt).getTime() })),
  ].sort((a, b) => a._time - b._time) : []

  return (
    <div className="flex flex-col h-[600px]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <p className="font-semibold">{customerName}</p>
          <p className="text-xs text-muted-foreground">{thread?.customer.phone}</p>
        </div>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={loadThread} disabled={loading} className="gap-1">
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {loading && !thread && (
          <div className="flex justify-center py-8">
            <RefreshCw className="size-6 text-muted-foreground animate-spin" />
          </div>
        )}
        {allMessages.map((msg) => (
          <div key={`${msg._type}-${msg.id}`} className="space-y-1">
            <MessageBubble msg={msg as Parameters<typeof MessageBubble>[0]['msg']} isSent={msg._type === 'sent'} />
            {msg._type === 'received' && (msg as { attachment?: { id: number; mimetype: string; fileName: string | null } | null }).attachment ? (
              <div className="flex justify-start pl-2 pt-1">
                <AttachmentItem
                  attachment={(msg as { attachment: { id: number; mimetype: string; fileName: string | null } }).attachment}
                  messageId={msg.id}
                />
              </div>
            ) : msg._type === 'received' && (msg as { mediaStatus?: string }).mediaStatus === 'stored' ? (
              <div className="flex justify-start pl-2">
                <p className="text-xs text-muted-foreground">[📎 Anexo armazenado]</p>
              </div>
            ) : null}
          </div>
        ))}
        {allMessages.length === 0 && !loading && (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhuma mensagem ainda.</p>
        )}
      </div>
    </div>
  )
}

export function ConversasPanel({ initialData, isAdmin }: { initialData: ConversationData; isAdmin: boolean }) {
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null)
  const [data] = useState(initialData)

  const totalUnread = data.conversations.reduce((sum, c) => sum + c.unread, 0)

  if (selected) {
    return (
      <Card>
        <CardContent className="pt-6">
          <ThreadView customerId={selected.id} customerName={selected.name} onBack={() => setSelected(null)} />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {data.conversations.length === 0 && data.unidentified.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="size-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Nenhuma conversa ainda. Os clientes que responderem às cobranças aparecerão aqui.</p>
          </CardContent>
        </Card>
      )}

      {data.conversations.map(({ customer, lastMessage, unread }) => (
        <Card
          key={customer.id}
          className="cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => setSelected({ id: customer.id, name: customer.name })}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted shrink-0">
              <MessageSquare className="size-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm truncate">{customer.name}</p>
                {unread > 0 && <Badge className="text-xs px-1.5 py-0">{unread}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {lastMessage?.body ?? (lastMessage ? '[mídia]' : 'Sem mensagens ainda')}
              </p>
            </div>
            {lastMessage && (
              <p className="text-xs text-muted-foreground shrink-0">
                {new Date(lastMessage.receivedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </p>
            )}
          </CardContent>
        </Card>
      ))}

      {isAdmin && data.unidentified.length > 0 && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Não identificados</CardTitle>
            <CardDescription className="text-xs">Mensagens de números sem cliente cadastrado.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {data.unidentified.map(msg => (
              <div key={msg.id} className="py-3">
                <p className="text-xs font-medium">{msg.phone ?? msg.remoteJid} {msg.pushName ? `· ${msg.pushName}` : ''}</p>
                <p className="text-xs text-muted-foreground truncate">{msg.body ?? '[mídia]'}</p>
                <p className="text-xs text-muted-foreground">{new Date(msg.receivedAt).toLocaleString('pt-BR')}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
