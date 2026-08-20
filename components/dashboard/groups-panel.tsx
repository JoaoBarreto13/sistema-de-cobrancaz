'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { createGroup, updateGroup, toggleGroup, deleteGroup, sendGroupNow } from '@/app/actions/billing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Power, Send, Trash2 } from 'lucide-react'

type Group = {
  id: number; name: string; amountCents: number; dueDay: number
  sendTime: string; sendDate: string | null; messageTemplate: string; active: boolean
}

function GroupForm({ group, onDone }: { group?: Group; onDone: () => void }) {
  const [pending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        if (group) await updateGroup(group.id, formData)
        else await createGroup(formData)
        toast.success(group ? 'Grupo atualizado!' : 'Grupo criado!')
        onDone()
      } catch (e: unknown) {
        toast.error((e as Error).message ?? 'Erro ao salvar grupo')
      }
    })
  }

  return (
    <form action={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel>Nome do grupo</FieldLabel>
          <Input name="name" required defaultValue={group?.name} placeholder="Ex: Mensalidade Básica" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>Valor (R$)</FieldLabel>
            <Input name="amount" type="number" step="0.01" min="0.01" required
              defaultValue={group ? (group.amountCents / 100).toFixed(2) : ''} placeholder="150.00" />
          </Field>
          <Field>
            <FieldLabel>Dia de vencimento</FieldLabel>
            <Input name="dueDay" type="number" min="1" max="31" required
              defaultValue={group?.dueDay} placeholder="10" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>Data de envio</FieldLabel>
            <Input name="sendDate" type="date" defaultValue={group?.sendDate ?? ''} />
            <p className="mt-1 text-xs text-muted-foreground">
              Opcional. Se vazio, envia todo mês no dia de vencimento.
            </p>
          </Field>
          <Field>
            <FieldLabel>Horário de envio</FieldLabel>
            <Input name="sendTime" type="time" required defaultValue={group?.sendTime ?? '09:00'} />
          </Field>
        </div>
        <Field>
          <FieldLabel>Mensagem template</FieldLabel>
          <Textarea name="message" rows={4} required defaultValue={group?.messageTemplate}
            placeholder="Olá {{nome}}, sua mensalidade de {{valor}} vence dia {{vencimento}}. Pague via Pix: 00000. Obrigado!" />
          <p className="mt-1 text-xs text-muted-foreground">
            Variáveis: <code className="bg-muted px-1 rounded text-xs">{'{{nome}}'}</code>{' '}
            <code className="bg-muted px-1 rounded text-xs">{'{{valor}}'}</code>{' '}
            <code className="bg-muted px-1 rounded text-xs">{'{{vencimento}}'}</code>
          </p>
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : group ? 'Atualizar grupo' : 'Criar grupo'}
        </Button>
      </FieldGroup>
    </form>
  )
}

function DeleteGroupDialog({ group, onDone }: { group: Group; onDone: () => void }) {
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteGroup(group.id)
        toast.success('Grupo excluído.')
        onDone()
      } catch (e: unknown) {
        toast.error((e as Error).message ?? 'Erro ao excluir grupo')
      }
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Tem certeza que deseja excluir o grupo <strong>{group.name}</strong>?
        Todos os clientes serão desvinculados. Jobs já enviados não serão afetados.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone} disabled={pending}>Cancelar</Button>
        <Button variant="destructive" onClick={handleDelete} disabled={pending}>
          {pending ? 'Excluindo…' : 'Excluir grupo'}
        </Button>
      </div>
    </div>
  )
}

export function GroupsPanel({ groups }: { groups: Group[] }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Group | null>(null)
  const [deleting, setDeleting] = useState<Group | null>(null)
  const [pending, startTransition] = useTransition()

  function handleToggle(id: number) {
    startTransition(async () => {
      try { await toggleGroup(id) }
      catch (e: unknown) { toast.error((e as Error).message ?? 'Erro') }
    })
  }

  function handleSendGroupNow(id: number, name: string) {
    startTransition(async () => {
      try {
        await sendGroupNow(id)
        toast.success(`Cobranças do grupo "${name}" enviadas para a fila de disparo!`)
      } catch (e: unknown) {
        toast.error((e as Error).message ?? 'Erro ao disparar cobranças do grupo')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Grupos de cobrança</h2>
          <p className="text-sm text-muted-foreground">Cada grupo define valor, vencimento e mensagem padrão.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />Novo grupo
        </Button>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Criar grupo de cobrança</DialogTitle></DialogHeader>
          <GroupForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={v => { if (!v) setEditing(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar grupo</DialogTitle></DialogHeader>
          {editing && <GroupForm group={editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleting} onOpenChange={v => { if (!v) setDeleting(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Excluir grupo</DialogTitle></DialogHeader>
          {deleting && <DeleteGroupDialog group={deleting} onDone={() => setDeleting(null)} />}
        </DialogContent>
      </Dialog>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">Nenhum grupo criado ainda.</p>
          <p className="text-sm mt-1">Crie um grupo para começar a programar cobranças.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Envio</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map(g => (
                <TableRow key={g.id} className={!g.active ? 'opacity-50' : ''}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell>
                    {(g.amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </TableCell>
                  <TableCell>Dia {g.dueDay}</TableCell>
                  <TableCell>
                    <div className="text-sm">{g.sendTime}</div>
                    {g.sendDate && <div className="text-xs text-muted-foreground">{new Date(g.sendDate + 'T00:00:00').toLocaleDateString('pt-BR')}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={g.active ? 'default' : 'secondary'}>{g.active ? 'Ativo' : 'Inativo'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" disabled={!g.active || pending}
                        onClick={() => handleSendGroupNow(g.id, g.name)}
                        className="gap-1 text-xs text-primary hover:text-primary" title="Enviar cobrança agora para todos os clientes deste grupo">
                        <Send className="size-3.5" />
                        <span className="hidden sm:inline">Disparar</span>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(g)} title="Editar grupo">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => handleToggle(g.id)}
                        className="gap-1 text-xs" title={g.active ? 'Pausar grupo' : 'Ativar grupo'}>
                        <Power className="size-3.5" />
                        {g.active ? 'Pausar' : 'Ativar'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(g)}
                        className="gap-1 text-xs text-destructive hover:text-destructive" title="Excluir grupo">
                        <Trash2 className="size-3.5" />
                        <span className="hidden sm:inline">Excluir</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
