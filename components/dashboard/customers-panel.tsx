'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { createCustomer, updateCustomer, deleteCustomer, toggleCustomer, sendOneOff, unlinkCustomerFromGroup } from '@/app/actions/billing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Power, Send, Unlink, Trash2 } from 'lucide-react'

type Customer = {
  id: number; name: string; phone: string; active: boolean
  groupId: number | null; groupName: string | null
}
type Group = { id: number; name: string; active: boolean }

function CreateCustomerForm({ groups, onDone }: { groups: Group[]; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [groupId, setGroupId] = useState<string>('none')
  const activeGroups = groups.filter(g => g.active)

  function handleSubmit(formData: FormData) {
    formData.set('groupId', groupId)
    startTransition(async () => {
      try {
        await createCustomer(formData)
        toast.success('Cliente adicionado!')
        onDone()
      } catch (e: unknown) {
        toast.error((e as Error).message ?? 'Erro ao salvar cliente')
      }
    })
  }

  return (
    <form action={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel>Nome</FieldLabel>
          <Input name="name" required placeholder="João Silva" />
        </Field>
        <Field>
          <FieldLabel>Telefone (WhatsApp)</FieldLabel>
          <Input name="phone" required placeholder="5511999887766" />
          <p className="mt-1 text-xs text-muted-foreground">DDI + DDD + número (apenas dígitos)</p>
        </Field>
        <Field>
          <FieldLabel>Grupo de cobrança (opcional)</FieldLabel>
          <Select onValueChange={v => setGroupId(v ?? 'none')} value={groupId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione um grupo (ou deixe sem)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum (Sem grupo)</SelectItem>
              {activeGroups.map(g => (
                <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Adicionar cliente'}
        </Button>
      </FieldGroup>
    </form>
  )
}

function EditCustomerForm({ customer, groups, onDone }: { customer: Customer; groups: Group[]; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [groupId, setGroupId] = useState<string>(customer.groupId ? String(customer.groupId) : 'none')
  const activeGroups = groups.filter(g => g.active)

  function handleSubmit(formData: FormData) {
    formData.set('groupId', groupId)
    startTransition(async () => {
      try {
        await updateCustomer(customer.id, formData)
        toast.success('Cliente atualizado!')
        onDone()
      } catch (e: unknown) {
        toast.error((e as Error).message ?? 'Erro ao atualizar cliente')
      }
    })
  }

  return (
    <form action={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel>Nome</FieldLabel>
          <Input name="name" required defaultValue={customer.name} placeholder="João Silva" />
        </Field>
        <Field>
          <FieldLabel>Telefone (WhatsApp)</FieldLabel>
          <Input name="phone" required defaultValue={customer.phone} placeholder="5511999887766" />
          <p className="mt-1 text-xs text-muted-foreground">DDI + DDD + número (apenas dígitos)</p>
        </Field>
        <Field>
          <FieldLabel>Grupo de cobrança</FieldLabel>
          <Select onValueChange={v => setGroupId(v ?? 'none')} value={groupId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione um grupo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum (Sem grupo)</SelectItem>
              {activeGroups.map(g => (
                <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar alterações'}
        </Button>
      </FieldGroup>
    </form>
  )
}

function DeleteCustomerDialog({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteCustomer(customer.id)
        toast.success('Cliente excluído com sucesso.')
        onDone()
      } catch (e: unknown) {
        toast.error((e as Error).message ?? 'Erro ao excluir cliente')
      }
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Tem certeza que deseja excluir o cliente <strong>{customer.name}</strong> ({customer.phone})?
        Esta ação removerá todos os vínculos e agendamentos pendentes deste cliente.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone} disabled={pending}>Cancelar</Button>
        <Button variant="destructive" onClick={handleDelete} disabled={pending}>
          {pending ? 'Excluindo…' : 'Excluir cliente'}
        </Button>
      </div>
    </div>
  )
}

function SendOneOffDialog({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const [pending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    formData.set('customerId', String(customer.id))
    startTransition(async () => {
      try {
        await sendOneOff(formData)
        toast.success('Mensagem avulsa agendada!')
        onDone()
      } catch (e: unknown) {
        toast.error((e as Error).message ?? 'Erro ao enviar')
      }
    })
  }

  return (
    <form action={handleSubmit}>
      <FieldGroup>
        <div className="rounded-lg bg-muted p-3 text-sm">
          <p className="font-medium">{customer.name}</p>
          <p className="text-muted-foreground font-mono">{customer.phone}</p>
        </div>
        <Field>
          <FieldLabel>Mensagem</FieldLabel>
          <Textarea name="message" rows={5} required
            placeholder="Olá João, passando para avisar sobre o valor em aberto de R$150,00. Pague via Pix: chave@email.com. Obrigado!" />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? 'Enviando…' : 'Enviar agora'}
        </Button>
      </FieldGroup>
    </form>
  )
}

function UnlinkDialog({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const [pending, startTransition] = useTransition()

  function handleUnlink() {
    if (!customer.groupId) return
    startTransition(async () => {
      try {
        await unlinkCustomerFromGroup(customer.id, customer.groupId!)
        toast.success(`${customer.name} desvinculado do grupo.`)
        onDone()
      } catch (e: unknown) {
        toast.error((e as Error).message ?? 'Erro ao desvincular')
      }
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Desvincular <strong>{customer.name}</strong> do grupo <strong>{customer.groupName}</strong>?
        O cliente continuará cadastrado mas não receberá mais cobranças desse grupo.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone} disabled={pending}>Cancelar</Button>
        <Button variant="destructive" onClick={handleUnlink} disabled={pending}>
          {pending ? 'Desvinculando…' : 'Desvincular'}
        </Button>
      </div>
    </div>
  )
}

export function CustomersPanel({ customers, groups }: { customers: Customer[]; groups: Group[] }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editingTarget, setEditingTarget] = useState<Customer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [oneOffTarget, setOneOffTarget] = useState<Customer | null>(null)
  const [unlinkTarget, setUnlinkTarget] = useState<Customer | null>(null)
  const [pending, startTransition] = useTransition()

  function handleToggle(id: number) {
    startTransition(async () => {
      try { await toggleCustomer(id) }
      catch (e: unknown) { toast.error((e as Error).message ?? 'Erro') }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Clientes</h2>
          <p className="text-sm text-muted-foreground">Cadastre os clientes e associe-os a grupos de cobrança.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />Novo cliente
        </Button>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Adicionar cliente</DialogTitle></DialogHeader>
          <CreateCustomerForm groups={groups} onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingTarget} onOpenChange={v => { if (!v) setEditingTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar cliente</DialogTitle></DialogHeader>
          {editingTarget && <EditCustomerForm customer={editingTarget} groups={groups} onDone={() => setEditingTarget(null)} />}
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Excluir cliente</DialogTitle></DialogHeader>
          {deleteTarget && <DeleteCustomerDialog customer={deleteTarget} onDone={() => setDeleteTarget(null)} />}
        </DialogContent>
      </Dialog>

      {/* Send one-off dialog */}
      <Dialog open={!!oneOffTarget} onOpenChange={v => { if (!v) setOneOffTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Envio avulso</DialogTitle></DialogHeader>
          {oneOffTarget && <SendOneOffDialog customer={oneOffTarget} onDone={() => setOneOffTarget(null)} />}
        </DialogContent>
      </Dialog>

      {/* Unlink dialog */}
      <Dialog open={!!unlinkTarget} onOpenChange={v => { if (!v) setUnlinkTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Desvincular do grupo</DialogTitle></DialogHeader>
          {unlinkTarget && <UnlinkDialog customer={unlinkTarget} onDone={() => setUnlinkTarget(null)} />}
        </DialogContent>
      </Dialog>

      {customers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">Nenhum cliente cadastrado ainda.</p>
          <p className="text-sm mt-1">Adicione um cliente e associe-o a um grupo de cobrança.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map(c => (
                <TableRow key={c.id} className={!c.active ? 'opacity-50' : ''}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="font-mono text-sm">{c.phone}</TableCell>
                  <TableCell>
                    {c.groupName ? (
                      <Badge variant="outline">{c.groupName}</Badge>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingTarget(c)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded px-2 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
                      >
                        + Vincular grupo
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.active ? 'default' : 'secondary'}>
                      {c.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" disabled={!c.active}
                        onClick={() => setOneOffTarget(c)} className="gap-1 text-xs" title="Enviar mensagem avulsa">
                        <Send className="size-3.5" />
                        <span className="hidden sm:inline">Avulso</span>
                      </Button>

                      <Button variant="ghost" size="sm"
                        onClick={() => setEditingTarget(c)} className="gap-1 text-xs" title="Editar cliente / Trocar grupo">
                        <Pencil className="size-3.5" />
                      </Button>

                      <Button variant="ghost" size="sm" disabled={pending}
                        onClick={() => handleToggle(c.id)} className="gap-1 text-xs" title={c.active ? 'Pausar cliente' : 'Ativar cliente'}>
                        <Power className="size-3.5" />
                        {c.active ? 'Pausar' : 'Ativar'}
                      </Button>

                      {c.groupId && (
                        <Button variant="ghost" size="sm"
                          onClick={() => setUnlinkTarget(c)}
                          className="gap-1 text-xs text-amber-600 hover:text-amber-700" title="Desvincular do grupo atual">
                          <Unlink className="size-3.5" />
                          <span className="hidden sm:inline">Desvincular</span>
                        </Button>
                      )}

                      <Button variant="ghost" size="sm"
                        onClick={() => setDeleteTarget(c)}
                        className="gap-1 text-xs text-destructive hover:text-destructive" title="Excluir cliente">
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
