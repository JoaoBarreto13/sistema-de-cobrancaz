import { betterAuth } from 'better-auth'
import { admin, username } from 'better-auth/plugins'
import { pool } from '@/lib/db'

const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : undefined

let primaryUrl = process.env.BETTER_AUTH_URL
if (vercelUrl && (!primaryUrl || primaryUrl.includes('localhost'))) {
  primaryUrl = vercelUrl
}
if (!primaryUrl) {
  primaryUrl = vercelUrl ?? 'http://localhost:5000'
}

const urls = Array.from(new Set([
  primaryUrl,
  vercelUrl,
  process.env.BETTER_AUTH_URL,
  process.env.V0_RUNTIME_URL,
].filter(Boolean) as string[]))

const useSecureCookies = primaryUrl.startsWith('https://')

export const auth = betterAuth({
  database: pool,
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 },
  plugins: [
    username({ minUsernameLength: 3, maxUsernameLength: 30 }),
    admin({ defaultRole: 'user', adminRoles: ['admin'] }),
  ],
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.SESSION_SECRET,
  baseURL: primaryUrl,
  trustedOrigins: urls,
  advanced: useSecureCookies ? { defaultCookieAttributes: { sameSite: 'none', secure: true } } : undefined,
})
