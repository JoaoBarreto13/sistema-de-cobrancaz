'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { cancelJob, retryJob } from '@/app/actions/billing'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { XCircle, RotateCcw, Eye, Copy, Check } from 'lucide-react'

type Job = {
  id: number; type: string; status: string; message: string
  scheduledFor: Date; sentAt: Date | null; error: string | null; customerName: string | null
}
type Counts = { pending: number; sent: number; failed: number }

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending:    { label: 'Pendente',   variant: 'secondary' },
  processing: { label: 'Enviando',   variant: 'outline' },
  sent:       { label: 'Enviado',    variant: 'default' },
  failed:     { label: 'Falhou',     variant: 'destructive' },
  cancelled:  { label: 'Cancelado',  variant: 'outline' },
}
const typeMap: Record<string, string> = { monthly: 'Mensal', one_off: 'Avulso', group_manual: 'Grupo (Disparo)' }

function fmt(d: Date | null) {
  if (!d) return '–'
  return format(new Date(d), "dd/MM HH:mm", { locale: ptBR })
}

function CancelButton({ jobId }: { jobId: number }) {
  const [pending, startTransition] = useTransition()

  function handleCancel() {
    startTransition(async () => {
      try {
        await cancelJob(jobId)
        toast.success('Envio cancelado.')
      } catch (e: unknown) {
        toast.error((e as Error).message ?? 'Erro ao cancelar')
      }
    })
  }

  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={handleCancel}
      className="gap-1 text-xs text-destructive hover:text-destructive" title="Cancelar envio">
      <XCircle className="size-3.5" />
      <span className="hidden sm:inline">Cancelar</span>
    </Button>
  )
}

function RetryButton({ jobId }: { jobId: number }) {
  const [pending, startTransition] = useTransition()

  function handleRetry() {
    startTransition(async () => {
      try {
        await retryJob(jobId)
        toast.success('Mensagem recolocada na fila para envio imediato!')
      } catch (e: unknown) {
        toast.error((e as Error).message ?? 'Erro ao reenviar')
      }
    })
  }

  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={handleRetry}
      className="gap-1 text-xs text-primary hover:text-primary" title="Tentar reenviar agora">
      <RotateCcw className={`size-3.5 ${pending ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">Reenviar</span>
    </Button>
  )
}

function ViewMessageDialog({ job, onDone }: { job: Job; onDone: () => void }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(job.message)
    setCopied(true)
    toast.success('Mensagem copiada para a área de transferência!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground pb-2 border-b">
        <span>Destinatário: <strong className="text-foreground">{job.customerName ?? 'Cliente'}</strong></span>
        <span>Tipo: <strong className="text-foreground">{typeMap[job.type] ?? job.type}</strong></span>
      </div>

      <div className="rounded-lg bg-muted/70 p-4 border text-sm whitespace-pre-wrap font-sans text-foreground leading-relaxed">
        {job.message}
      </div>

      {job.error && (
        <div className="rounded-lg bg-destructive/10 text-destructive text-xs p-3 border border-destructive/20">
          <strong>Erro registrado:</strong> {job.error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
          {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
          {copied ? 'Copiado!' : 'Copiar texto'}
        </Button>
        <Button size="sm" onClick={onDone}>Fechar</Button>
      </div>
    </div>
  )
}

export function JobsPanel({ jobs, counts }: { jobs: Job[]; counts: Counts }) {
  const [viewingJob, setViewingJob] = useState<Job | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Fila de mensagens</h2>
          <p className="text-sm text-muted-foreground">Histórico e status dos envios.</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-zinc-400" />{counts.pending} pendentes</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-green-500" />{counts.sent} enviadas</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-red-500" />{counts.failed} falhas</span>
        </div>
      </div>

      {/* View message dialog */}
      <Dialog open={!!viewingJob} onOpenChange={v => { if (!v) setViewingJob(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Detalhes da mensagem</DialogTitle></DialogHeader>
          {viewingJob && <ViewMessageDialog job={viewingJob} onDone={() => setViewingJob(null)} />}
        </DialogContent>
      </Dialog>

      {jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">Nenhuma mensagem na fila ainda.</p>
          <p className="text-sm mt-1">As cobranças aparecerão aqui quando forem agendadas ou disparadas.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Agendado para</TableHead>
                <TableHead>Enviado em</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map(j => {
                const s = statusMap[j.status] ?? { label: j.status, variant: 'outline' as const }
                const cancellable = j.status === 'pending' || j.status === 'failed'
                const retryable = j.status === 'failed' || j.status === 'cancelled'

                return (
                  <TableRow key={j.id} className={j.status === 'cancelled' ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">{j.customerName ?? '–'}</TableCell>
                    <TableCell><Badge variant="outline">{typeMap[j.type] ?? j.type}</Badge></TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <Badge variant={s.variant}>{s.label}</Badge>
                        {j.error && <p className="text-xs text-destructive truncate max-w-40" title={j.error}>{j.error}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmt(j.scheduledFor)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmt(j.sentAt)}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setViewingJob(j)}
                        className="text-left text-sm text-muted-foreground max-w-52 truncate block hover:text-foreground transition-colors hover:underline cursor-pointer"
                        title="Clique para ver o texto completo"
                      >
                        {j.message}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setViewingJob(j)} title="Visualizar mensagem completa" className="gap-1 text-xs">
                          <Eye className="size-3.5" />
                        </Button>
                        {retryable && <RetryButton jobId={j.id} />}
                        {cancellable && <CancelButton jobId={j.id} />}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
