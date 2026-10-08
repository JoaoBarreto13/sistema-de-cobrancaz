import { betterAuth } from 'better-auth'
import { admin, username } from 'better-auth/plugins'
import { pool } from '@/lib/db'

const isProd = process.env.NODE_ENV === 'production'

const detectedBaseUrl =
  process.env.BETTER_AUTH_URL && !process.env.BETTER_AUTH_URL.includes('localhost')
    ? process.env.BETTER_AUTH_URL
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.BETTER_AUTH_URL ?? 'http://localhost:5000'

export const auth = betterAuth({
  database: pool,
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 },
  plugins: [
    username({ minUsernameLength: 3, maxUsernameLength: 30 }),
    admin({ defaultRole: 'user', adminRoles: ['admin'] }),
  ],
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.SESSION_SECRET,
  baseURL: detectedBaseUrl,
  trustedOrigins: [
    'https://*.vercel.app',
    'https://*.vercel.sh',
    'http://localhost:5000',
    'http://localhost:3000',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:3000',
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : []),
  ],
  advanced: {
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: isProd,
    },
  },
})
