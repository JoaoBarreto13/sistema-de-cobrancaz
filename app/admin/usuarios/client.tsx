'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Plus, Key, Ban, ShieldCheck, Trash2 } from 'lucide-react'

type User = {
  id: string; name: string; email: string
  username?: string; role?: string; banned?: boolean; createdAt: Date
}

type Props = {
  users: User[]
  currentUserId: string
  createUser: (fd: FormData) => Promise<void>
  setPassword: (userId: string, fd: FormData) => Promise<void>
  banUser: (userId: string) => Promise<void>
  unbanUser: (userId: string) => Promise<void>
  removeUser: (userId: string) => Promise<void>
}

export function UserAdminPanel({ users, currentUserId, createUser, setPassword, banUser, unbanUser, removeUser }: Props) {
  const [showCreate, setShowCreate] = useState(false)
  const [resetTarget, setResetTarget] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function handleCreate(fd: FormData) {
    startTransition(async () => {
      try {
        await createUser(fd)
        toast.success('Usuário criado com sucesso!')
        setShowCreate(false)
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  async function handleSetPassword(userId: string, fd: FormData) {
    startTransition(async () => {
      try {
        await setPassword(userId, fd)
        toast.success('Senha redefinida!')
        setResetTarget(null)
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  async function handleBan(userId: string, isBanned: boolean) {
    if (!confirm(isBanned ? 'Desbloquear este usuário?' : 'Bloquear este usuário? Ele perderá acesso imediatamente.')) return
    startTransition(async () => {
      try {
        if (isBanned) { await unbanUser(userId); toast.success('Usuário desbloqueado.') }
        else { await banUser(userId); toast.success('Usuário bloqueado.') }
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  async function handleRemove(userId: string, name: string) {
    if (!confirm(`Remover "${name}" permanentemente? Todos os dados serão apagados.`)) return
    startTransition(async () => {
      try {
        await removeUser(userId)
        toast.success('Usuário removido.')
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Botão novo usuário */}
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(v => !v)} className="gap-2">
          <Plus className="size-4" />
          Novo usuário
        </Button>
      </div>

      {/* Formulário de criação */}
      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Criar novo usuário</CardTitle>
            <CardDescription>O usuário receberá acesso com o username e senha definidos aqui.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={handleCreate}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="new-username">Username</FieldLabel>
                  <Input id="new-username" name="username" placeholder="ex: joao.silva" pattern="[a-zA-Z0-9_.]{3,30}" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-name">Nome</FieldLabel>
                  <Input id="new-name" name="name" placeholder="João Silva" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-password">Senha (mín. 8 caracteres)</FieldLabel>
                  <Input id="new-password" name="password" type="password" minLength={8} required />
                </Field>
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending}>Criar usuário</Button>
                  <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Lista de usuários */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuários ({users.length})</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {users.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nenhum usuário encontrado.</p>}
          {users.map(u => {
            const isMe = u.id === currentUserId
            const displayName = u.username ?? u.name
            return (
              <div key={u.id} className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{displayName}</span>
                    {u.name !== displayName && <span className="text-xs text-muted-foreground">({u.name})</span>}
                    {u.role === 'admin' && <Badge variant="secondary" className="text-xs">admin</Badge>}
                    {u.banned && <Badge variant="destructive" className="text-xs">bloqueado</Badge>}
                    {isMe && <Badge variant="outline" className="text-xs">você</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Criado em {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>

                {/* Ações */}
                {!isMe && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {/* Redefinir senha */}
                    {resetTarget === u.id ? (
                      <form action={(fd) => handleSetPassword(u.id, fd)} className="flex gap-2 items-center">
                        <Input name="password" type="password" placeholder="Nova senha (mín. 8)" minLength={8} className="h-8 text-xs w-40" required />
                        <Button type="submit" size="sm" disabled={pending} className="h-8 text-xs">Salvar</Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setResetTarget(null)}>✕</Button>
                      </form>
                    ) : (
                      <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setResetTarget(u.id)}>
                        <Key className="size-3" /> Senha
                      </Button>
                    )}

                    {/* Bloquear / desbloquear */}
                    <Button
                      variant="outline"
                      size="sm"
                      className={`h-8 gap-1 text-xs ${u.banned ? 'text-green-600 border-green-300 hover:bg-green-50' : 'text-orange-600 border-orange-300 hover:bg-orange-50'}`}
                      onClick={() => handleBan(u.id, !!u.banned)}
                      disabled={pending}
                    >
                      {u.banned ? <><ShieldCheck className="size-3" /> Desbloquear</> : <><Ban className="size-3" /> Bloquear</>}
                    </Button>

                    {/* Remover */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => handleRemove(u.id, displayName)}
                      disabled={pending}
                    >
                      <Trash2 className="size-3" /> Remover
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
