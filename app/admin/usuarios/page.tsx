import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { DashboardNav } from '@/components/dashboard/nav'
import { getWhatsAppStatus, adminCreateUser, adminSetPassword, adminBanUser, adminUnbanUser, adminRemoveUser } from '@/app/actions/billing'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserAdminPanel } from './client'

export default async function AdminUsuariosPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  if ((session.user as { role?: string }).role !== 'admin') redirect('/')

  // Buscar lista de usuários
  const whatsapp = await getWhatsAppStatus()

  // listUsers via Better Auth API
  let users: Array<{
    id: string; name: string; email: string
    username?: string; role?: string; banned?: boolean; createdAt: Date
  }> = []
  try {
    const { auth: serverAuth } = await import('@/lib/auth')
    const hdrs = await headers()
    const res = await serverAuth.api.listUsers({ headers: hdrs, query: {} })
    users = (res?.users ?? res ?? []) as typeof users
  } catch (e) {
    console.error('Erro ao listar usuários:', e)
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav user={session.user as Parameters<typeof DashboardNav>[0]['user']} whatsapp={whatsapp} />
      <main className="mx-auto max-w-4xl px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Gerenciar Usuários</h1>
          <p className="text-muted-foreground mt-1">Crie e gerencie os usuários que têm acesso ao CeifaBot.</p>
        </div>

        <UserAdminPanel
          users={users}
          currentUserId={session.user.id}
          createUser={adminCreateUser}
          setPassword={adminSetPassword}
          banUser={adminBanUser}
          unbanUser={adminUnbanUser}
          removeUser={adminRemoveUser}
        />
      </main>
    </div>
  )
}
