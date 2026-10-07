import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Não autorizado')
  return session.user
}

export async function requireAdmin() {
  const user = await requireUser()
  if ((user as { role?: string }).role !== 'admin') throw new Error('Apenas administradores')
  return user
}
