'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function AuthForm() {
  const router = useRouter(); const [mode, setMode] = useState<'in' | 'up'>('in'); const [error, setError] = useState(''); const [loading, setLoading] = useState(false)
  async function submit(formData: FormData) {
    setLoading(true); setError('')
    const email = String(formData.get('email')); const password = String(formData.get('password')); const name = String(formData.get('name') || 'Administrador')
    const result = mode === 'in' ? await authClient.signIn.email({ email, password }) : await authClient.signUp.email({ email, password, name })
    setLoading(false)
    if (result.error) return setError(result.error.message || 'Não foi possível acessar.')
    router.push('/'); router.refresh()
  }
  return <Card className="w-full max-w-md border-border/70 shadow-xl shadow-primary/5"><CardHeader><div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground">C</div><CardTitle className="text-2xl">{mode === 'in' ? 'Acesse o Cobrar' : 'Crie seu acesso'}</CardTitle><CardDescription>Gerencie cobranças e mensagens pelo seu WhatsApp.</CardDescription></CardHeader><CardContent><form action={submit}><FieldGroup>{mode === 'up' && <Field><FieldLabel htmlFor="name">Nome</FieldLabel><Input id="name" name="name" required /></Field>}<Field><FieldLabel htmlFor="email">E-mail</FieldLabel><Input id="email" name="email" type="email" required /></Field><Field><FieldLabel htmlFor="password">Senha</FieldLabel><Input id="password" name="password" type="password" minLength={8} required /></Field>{error && <p className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={loading}>{loading ? 'Aguarde...' : mode === 'in' ? 'Entrar' : 'Cadastrar'}</Button><Button type="button" variant="ghost" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'Primeiro acesso? Cadastre-se' : 'Já possui acesso? Entrar'}</Button></FieldGroup></form></CardContent></Card>
}
