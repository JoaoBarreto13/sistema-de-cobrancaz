import { betterAuth } from 'better-auth'
import { admin, username } from 'better-auth/plugins'
import { pool } from '@/lib/db'

const urls = [process.env.BETTER_AUTH_URL, process.env.V0_RUNTIME_URL, process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`, process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`].filter(Boolean) as string[]
const useSecureCookies = urls[0]?.startsWith('https://') ?? false

export const auth = betterAuth({
  database: pool,
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 },
  plugins: [
    username({ minUsernameLength: 3, maxUsernameLength: 30 }),
    admin({ defaultRole: 'user', adminRoles: ['admin'] }),
  ],
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.SESSION_SECRET,
  baseURL: urls[0], trustedOrigins: urls,
  advanced: useSecureCookies ? { defaultCookieAttributes: { sameSite: 'none', secure: true } } : undefined,
})
