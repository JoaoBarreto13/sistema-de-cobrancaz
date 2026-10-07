'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function AuthForm() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(formData: FormData) {
    setLoading(true)
    setError('')
    const username = String(formData.get('username'))
    const password = String(formData.get('password'))
    const result = await authClient.signIn.username({ username, password })
    setLoading(false)
    if (result.error) return setError(result.error.message || 'Usuário ou senha incorretos.')
    router.push('/')
    router.refresh()
  }

  return (
    <Card className="w-full max-w-md border-border/70 shadow-xl shadow-primary/5">
      <CardHeader>
        <Image src="/auth-logo.png" alt="CeifaBot Logo" width={56} height={56} className="mb-3 size-14 rounded-xl object-contain" priority />
        <CardTitle className="text-2xl">Acesse o CeifaBot</CardTitle>
        <CardDescription>Gerencie cobranças e mensagens pelo seu WhatsApp.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="username">Usuário</FieldLabel>
              <Input id="username" name="username" autoComplete="username" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Senha</FieldLabel>
              <Input id="password" name="password" type="password" minLength={8} required />
            </Field>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? 'Aguarde...' : 'Entrar'}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
