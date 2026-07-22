import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDashboardData } from '@/app/actions/billing'
import { DashboardNav } from '@/components/dashboard/nav'
import { GroupsPanel } from '@/components/dashboard/groups-panel'
import { CustomersPanel } from '@/components/dashboard/customers-panel'
import { JobsPanel } from '@/components/dashboard/jobs-panel'
import { Card, CardContent } from '@/components/ui/card'
import { Users, Layers, CheckCircle2, Clock } from 'lucide-react'

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  const sp = await searchParams
  const tab = sp.tab ?? 'grupos'

  const data = await getDashboardData()
  const { groups, customers, jobs, whatsapp, counts } = data

  const activeCustomers = customers.filter(c => c.active).length
  const activeGroups = groups.filter(g => g.active).length

  const tabs = [
    { key: 'grupos', label: 'Grupos' },
    { key: 'clientes', label: 'Clientes' },
    { key: 'mensagens', label: 'Mensagens' },
  ]

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav user={session.user} whatsapp={whatsapp} />

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <Users className="size-4" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeCustomers}</p>
                <p className="text-xs text-muted-foreground">Clientes ativos</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                <Layers className="size-4" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeGroups}</p>
                <p className="text-xs text-muted-foreground">Grupos ativos</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle2 className="size-4" />
              </div>
              <div>
                <p className="text-2xl font-bold">{Number(counts.sent)}</p>
                <p className="text-xs text-muted-foreground">Mensagens enviadas</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                <Clock className="size-4" />
              </div>
              <div>
                <p className="text-2xl font-bold">{Number(counts.pending) + Number(counts.failed)}</p>
                <p className="text-xs text-muted-foreground">Pendentes / falhas</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div>
          <div className="flex border-b gap-1 mb-6">
            {tabs.map(t => (
              <Link
                key={t.key}
                href={`?tab=${t.key}`}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>

          {tab === 'grupos' && <GroupsPanel groups={groups} />}
          {tab === 'clientes' && <CustomersPanel customers={customers} groups={groups} />}
          {tab === 'mensagens' && <JobsPanel jobs={jobs} counts={counts} />}
        </div>
      </main>
    </div>
  )
}
