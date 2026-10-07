import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

const url = process.env.DATABASE_URL!
const isLocal = /localhost|127\.0\.0\.1|\[::1\]/.test(url)
const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n')
  ?? (process.env.DATABASE_SSL_CA_PATH ? readFileSync(process.env.DATABASE_SSL_CA_PATH, 'utf8') : undefined)

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url,
    ...(isLocal ? {} : { ssl: { ca, rejectUnauthorized: true } }),
  },
})
