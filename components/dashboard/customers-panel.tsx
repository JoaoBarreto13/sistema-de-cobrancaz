'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { createCustomer, toggleCustomer, sendOneOff } from '@/app/actions/billing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Power, Send } from 'lucide-react'

type Customer = {
  id: number; name: string; phone: string; active: boolean
  groupId: number | null; groupName: string | null
}
type Group = { id: number; name: string; active: boolean }

function CreateCustomerForm({ groups, onDone }: { groups: Group[]; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [groupId, setGroupId] = useState<string>('')
  const activeGroups = groups.filter(g => g.active)

  function handleSubmit(formData: FormData) {
    if (!groupId) { toast.error('Selecione um grupo'); return }
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
          <FieldLabel>Grupo de cobrança</FieldLabel>
          {activeGroups.length > 0 ? (
            <Select onValueChange={v => setGroupId(v ?? '')} value={groupId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione um grupo" />
              </SelectTrigger>
              <SelectContent>
                {activeGroups.map(g => (
                  <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum grupo ativo. Crie um grupo primeiro na aba Grupos.
            </p>
          )}
        </Field>
        <Button type="submit" disabled={pending || activeGroups.length === 0 || !groupId}>
          {pending ? 'Salvando…' : 'Adicionar cliente'}
        </Button>
      </FieldGroup>
    </form>
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

export function CustomersPanel({ customers, groups }: { customers: Customer[]; groups: Group[] }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [oneOffTarget, setOneOffTarget] = useState<Customer | null>(null)
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

      {/* Send one-off dialog */}
      <Dialog open={!!oneOffTarget} onOpenChange={v => { if (!v) setOneOffTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Envio avulso</DialogTitle></DialogHeader>
          {oneOffTarget && <SendOneOffDialog customer={oneOffTarget} onDone={() => setOneOffTarget(null)} />}
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
                    {c.groupName
                      ? <Badge variant="outline">{c.groupName}</Badge>
                      : <span className="text-muted-foreground text-sm">–</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.active ? 'default' : 'secondary'}>
                      {c.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" disabled={!c.active}
                        onClick={() => setOneOffTarget(c)} className="gap-1 text-xs">
                        <Send className="size-3.5" />
                        <span className="hidden sm:inline">Avulso</span>
                      </Button>
                      <Button variant="ghost" size="sm" disabled={pending}
                        onClick={() => handleToggle(c.id)} className="gap-1 text-xs">
                        <Power className="size-3.5" />
                        {c.active ? 'Pausar' : 'Ativar'}
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
