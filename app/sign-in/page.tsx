import { AuthForm } from '@/components/auth-form'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect('/')
  return <main className="flex min-h-screen items-center justify-center bg-muted p-6"><div className="flex w-full max-w-5xl items-center justify-center gap-12"><section className="hidden max-w-md flex-col gap-5 lg:flex"><p className="font-mono text-sm font-semibold uppercase tracking-widest text-primary">Cobranças no piloto automático</p><h1 className="text-balance text-5xl font-bold tracking-tight">Receba em dia, sem perder tempo cobrando.</h1><p className="text-pretty text-lg leading-relaxed text-muted-foreground">Organize clientes em grupos, programe mensagens mensais e acompanhe cada envio em um só lugar.</p></section><AuthForm /></div></main>
}
