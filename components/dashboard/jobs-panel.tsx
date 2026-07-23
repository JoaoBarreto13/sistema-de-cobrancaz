'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { cancelJob } from '@/app/actions/billing'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { XCircle } from 'lucide-react'

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
const typeMap: Record<string, string> = { monthly: 'Mensal', one_off: 'Avulso' }

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
        toast.success('Job cancelado.')
      } catch (e: unknown) {
        toast.error((e as Error).message ?? 'Erro ao cancelar')
      }
    })
  }

  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={handleCancel}
      className="gap-1 text-xs text-destructive hover:text-destructive">
      <XCircle className="size-3.5" />
      <span className="hidden sm:inline">Cancelar</span>
    </Button>
  )
}

export function JobsPanel({ jobs, counts }: { jobs: Job[]; counts: Counts }) {
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

      {jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">Nenhuma mensagem na fila ainda.</p>
          <p className="text-sm mt-1">As cobranças mensais aparecerão aqui quando forem programadas.</p>
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
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map(j => {
                const s = statusMap[j.status] ?? { label: j.status, variant: 'outline' as const }
                const cancellable = j.status === 'pending' || j.status === 'failed'
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
                    <TableCell className="text-sm text-muted-foreground max-w-60 truncate" title={j.message}>{j.message}</TableCell>
                    <TableCell className="text-right">
                      {cancellable && <CancelButton jobId={j.id} />}
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
