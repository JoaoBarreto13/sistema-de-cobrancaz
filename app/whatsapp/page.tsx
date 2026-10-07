import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getWhatsAppStatus } from '@/app/actions/billing'
import { WhatsAppClient } from './client'
import { DashboardNav } from '@/components/dashboard/nav'
import { ArrowLeft } from 'lucide-react'

export default async function WhatsAppPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  const whatsapp = await getWhatsAppStatus()
  const isAdmin = (session.user as { role?: string }).role === 'admin'

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav user={session.user as Parameters<typeof DashboardNav>[0]['user']} whatsapp={whatsapp} />

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft className="size-3.5" />
            Voltar ao painel
          </Link>
          <h1 className="text-2xl font-bold">WhatsApp</h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin ? 'Gerencie a conexão do bot com o WhatsApp.' : 'Status da conexão com o WhatsApp.'}
          </p>
        </div>

        <WhatsAppClient initialState={whatsapp} isAdmin={isAdmin} />
      </main>
    </div>
  )
}
