import { readFileSync } from 'node:fs'
import type { PoolConfig } from 'pg'

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]'])

function parseDatabaseUrl(raw: string): { hostname: string; sanitizedConnectionString: string } {
  try {
    const url = new URL(raw)
    url.searchParams.delete('sslmode')
    return { hostname: url.hostname, sanitizedConnectionString: url.toString() }
  } catch {
    // Fallback: se a senha tiver caracteres especiais não codificados (ex: @, #, /)
    // Tentar separar pelo último '@' que delimita credentials de host:port/db
    const match = raw.match(/^(postgres(?:ql)?:\/\/)(?:([^:]+)(?::(.*))?@)?([^:/?#]+)(?::(\d+))?(\/[^?#]*)?(?:\?(.*))?$/)
    if (match) {
      const [, proto, user, pass, host, port, dbPath, query] = match
      const encodedUser = user ? encodeURIComponent(decodeURIComponent(user)) : ''
      const encodedPass = pass ? encodeURIComponent(decodeURIComponent(pass)) : ''
      const auth = encodedUser ? (encodedPass ? `${encodedUser}:${encodedPass}@` : `${encodedUser}@`) : ''
      const portPart = port ? `:${port}` : ''
      const pathPart = dbPath || ''
      const searchParams = new URLSearchParams(query || '')
      searchParams.delete('sslmode')
      const qs = searchParams.toString() ? `?${searchParams.toString()}` : ''
      const reconstructed = `${proto}${auth}${host}${portPart}${pathPart}${qs}`
      return { hostname: host, sanitizedConnectionString: reconstructed }
    }
    const sanitized = raw.replace(/([?&])sslmode=[^&]*(&|$)/g, '$1').replace(/[?&]$/, '')
    return { hostname: '', sanitizedConnectionString: sanitized }
  }
}

export function getPoolConfig(): PoolConfig {
  const raw = process.env.DATABASE_URL
  if (!raw) throw new Error('DATABASE_URL não definida')

  const { hostname, sanitizedConnectionString } = parseDatabaseUrl(raw)
  if (LOCAL.has(hostname)) return { connectionString: sanitizedConnectionString, ssl: false }

  const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n')
    ?? (process.env.DATABASE_SSL_CA_PATH ? readFileSync(process.env.DATABASE_SSL_CA_PATH, 'utf8') : undefined)

  return { connectionString: sanitizedConnectionString, ssl: { ca, rejectUnauthorized: true } }
}
