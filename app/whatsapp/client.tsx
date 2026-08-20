'use client'

import { useEffect, useState, useTransition } from 'react'
import QRCode from 'qrcode'
import { getWhatsAppStatus, disconnectWhatsApp } from '@/app/actions/billing'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Smartphone, Wifi, WifiOff, Loader2, RefreshCw, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

type WAState = {
  id: number; userId: string; status: string
  qrCode: string | null; phone: string | null
  lastError: string | null; updatedAt: Date
} | null

const STATUS_INFO: Record<string, { label: string; color: string; icon: React.ReactNode; desc: string }> = {
  connected: {
    label: 'Conectado',
    color: 'bg-green-500',
    icon: <Wifi className="size-5 text-green-600" />,
    desc: 'WhatsApp conectado e pronto para enviar mensagens.',
  },
  waiting_qr: {
    label: 'Aguardando QR',
    color: 'bg-yellow-500',
    icon: <Loader2 className="size-5 text-yellow-600 animate-spin" />,
    desc: 'Escaneie o QR code com seu WhatsApp para conectar.',
  },
  reconnecting: {
    label: 'Reconectando…',
    color: 'bg-yellow-500',
    icon: <Loader2 className="size-5 text-yellow-600 animate-spin" />,
    desc: 'Tentando reconectar automaticamente.',
  },
  logged_out: {
    label: 'Desconectado',
    color: 'bg-red-500',
    icon: <WifiOff className="size-5 text-red-600" />,
    desc: 'Sessão encerrada. Reinicie o worker e escaneie o QR code novamente.',
  },
  disconnected: {
    label: 'Offline',
    color: 'bg-zinc-400',
    icon: <WifiOff className="size-5 text-zinc-500" />,
    desc: 'Worker não está rodando ou aguardando conexão.',
  },
}

export function WhatsAppClient({ initialState }: { initialState: WAState }) {
  const [state, setState] = useState(initialState)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [lastPoll, setLastPoll] = useState(new Date())
  const [polling, startPolling] = useTransition()
  const [disconnecting, startDisconnecting] = useTransition()

  async function generateQr(raw: string) {
    try {
      const url = await QRCode.toDataURL(raw, { width: 280, margin: 2, color: { dark: '#111827', light: '#ffffff' } })
      setQrDataUrl(url)
    } catch { setQrDataUrl(null) }
  }

  async function poll() {
    startPolling(async () => {
      const fresh = await getWhatsAppStatus()
      setState(fresh)
      setLastPoll(new Date())
      if (fresh?.qrCode) await generateQr(fresh.qrCode)
      else setQrDataUrl(null)
    })
  }

  function handleDisconnect() {
    if (!confirm('Deseja realmente desconectar esta conta do WhatsApp? Será necessário escanear o QR Code novamente.')) return
    startDisconnecting(async () => {
      try {
        await disconnectWhatsApp()
        toast.success('WhatsApp desconectado com sucesso.')
        await poll()
      } catch (err: unknown) {
        toast.error((err as Error).message ?? 'Erro ao desconectar')
      }
    })
  }

  // Generate QR for initial state
  useEffect(() => {
    if (initialState?.qrCode) generateQr(initialState.qrCode)
  }, [initialState?.qrCode])

  // Auto-poll every 3 seconds when not connected
  useEffect(() => {
    poll()
    const shouldPoll = !state || state.status !== 'connected'
    if (!shouldPoll) return
    const id = setInterval(poll, 3000)
    return () => clearInterval(id)
  }, [state?.status])

  const info = STATUS_INFO[state?.status ?? 'disconnected']

  return (
    <div className="space-y-6 max-w-md">
      {/* Status card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                {info.icon}
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Status da conexão
                  <span className={`size-2 rounded-full ${info.color}`} />
                </CardTitle>
                <CardDescription>{info.label}</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={poll} disabled={polling} className="gap-1.5 shrink-0">
                <RefreshCw className={`size-3.5 ${polling ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{info.desc}</p>

          {state?.phone && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              <Smartphone className="size-4 shrink-0" />
              <span>+{state.phone}</span>
            </div>
          )}

          {state?.lastError && state.status !== 'connected' && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              <span className="font-medium">Último erro: </span>{state.lastError}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              Atualizado em {lastPoll.toLocaleTimeString('pt-BR')}
            </p>

            {state?.status === 'connected' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="gap-1 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <LogOut className="size-3.5" />
                {disconnecting ? 'Desconectando…' : 'Desconectar'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* QR code card */}
      {state && state.status !== 'connected' && state.status !== 'logged_out' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Escaneie o QR Code</CardTitle>
            <CardDescription>
              Abra o WhatsApp no seu celular → Menu → Dispositivos vinculados → Vincular dispositivo
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {qrDataUrl ? (
              <div className="rounded-xl border p-3 bg-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR Code WhatsApp" width={280} height={280} className="rounded-lg" />
              </div>
            ) : (
              <div className="flex size-72 flex-col items-center justify-center gap-3 rounded-xl border bg-muted">
                <Loader2 className="size-8 text-muted-foreground animate-spin" />
                <p className="text-sm text-muted-foreground">Aguardando QR Code do worker...</p>
              </div>
            )}
            <p className="text-xs text-center text-muted-foreground">
              O QR code expira em ~20 segundos. Um novo é gerado automaticamente.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Connected confirmation */}
      {state?.status === 'connected' && (
        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Wifi className="size-8 text-green-600" />
              <div>
                <p className="font-semibold text-green-800 dark:text-green-300">WhatsApp conectado!</p>
                <p className="text-sm text-green-700 dark:text-green-400">Cobranças serão enviadas automaticamente.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <div className="rounded-lg border p-4 space-y-2">
        <p className="text-sm font-medium">Como funciona</p>
        <ol className="space-y-1 text-sm text-muted-foreground list-decimal list-inside">
          <li>O worker do bot precisa estar rodando (workflow "Worker").</li>
          <li>Escaneie o QR code que aparece acima com o WhatsApp do número que enviará as cobranças.</li>
          <li>A conexão é mantida automaticamente. Se cair, um novo QR é gerado.</li>
          <li>Cada conta tem sua própria sessão na pasta <code className="text-xs bg-muted px-1 rounded">.baileys-auth/</code>.</li>
        </ol>
      </div>
    </div>
  )
}
