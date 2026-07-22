'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LogOut, MessageCircle } from 'lucide-react'

type WAStatus = { status: string; phone: string | null } | null

export function DashboardNav({ user, whatsapp }: { user: { name: string; email: string }; whatsapp: WAStatus }) {
  const router = useRouter()
  const pathname = usePathname()

  async function handleSignOut() {
    await authClient.signOut()
    router.push('/sign-in')
    router.refresh()
  }

  const statusColor = {
    connected: 'bg-green-500',
    waiting_qr: 'bg-yellow-500',
    reconnecting: 'bg-yellow-500',
    logged_out: 'bg-red-500',
    disconnected: 'bg-zinc-400',
  }[whatsapp?.status ?? 'disconnected'] ?? 'bg-zinc-400'

  const statusLabel = {
    connected: `Conectado${whatsapp?.phone ? ` · ${whatsapp.phone}` : ''}`,
    waiting_qr: 'Aguardando QR',
    reconnecting: 'Reconectando…',
    logged_out: 'Desconectado',
    disconnected: 'Offline',
  }[whatsapp?.status ?? 'disconnected'] ?? 'Offline'

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg shrink-0">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">C</div>
          <span className="hidden sm:block">Cobrar</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1 ml-2">
          <Link href="/" className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${pathname === '/' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
            Painel
          </Link>
          <Link href="/whatsapp" className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${pathname === '/whatsapp' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
            <MessageCircle className="size-3.5" />
            WhatsApp
          </Link>
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* WA Status */}
        <Link href="/whatsapp" className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <span className={`size-2 rounded-full ${statusColor}`} />
          {statusLabel}
        </Link>

        {/* User + sign out */}
        <div className="flex items-center gap-2">
          <span className="hidden md:block text-sm text-muted-foreground truncate max-w-40">{user.email}</span>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1.5">
            <LogOut className="size-3.5" />
            <span className="hidden sm:block">Sair</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
