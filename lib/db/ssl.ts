import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PoolConfig } from 'pg'

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]'])

const DEFAULT_SUPABASE_CA = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----`

function parseDatabaseUrl(raw: string): { hostname: string; sanitizedConnectionString: string } {
  try {
    const url = new URL(raw)
    url.searchParams.delete('sslmode')
    return { hostname: url.hostname, sanitizedConnectionString: url.toString() }
  } catch {
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

function resolveCa(hostname: string): string | undefined {
  if (process.env.DATABASE_SSL_CA) {
    return process.env.DATABASE_SSL_CA.replace(/\\n/g, '\n')
  }
  if (process.env.DATABASE_SSL_CA_PATH && existsSync(process.env.DATABASE_SSL_CA_PATH)) {
    return readFileSync(process.env.DATABASE_SSL_CA_PATH, 'utf8')
  }
  const defaultCertPath = join(process.cwd(), 'certs', 'supabase-ca.crt')
  if (existsSync(defaultCertPath)) {
    return readFileSync(defaultCertPath, 'utf8')
  }
  // Se for conexão Supabase remota e não houver CA configurado no ambiente, usa o Supabase Root CA embutido
  if (hostname.includes('supabase.com') || hostname.includes('supabase.co')) {
    return DEFAULT_SUPABASE_CA
  }
  return undefined
}

export function getPoolConfig(): PoolConfig {
  const raw = process.env.DATABASE_URL
  if (!raw) throw new Error('DATABASE_URL não definida')

  const { hostname, sanitizedConnectionString } = parseDatabaseUrl(raw)
  if (LOCAL.has(hostname)) return { connectionString: sanitizedConnectionString, ssl: false }

  const ca = resolveCa(hostname)

  return { connectionString: sanitizedConnectionString, ssl: { ca, rejectUnauthorized: true } }
}
