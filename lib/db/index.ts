import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'
import { getPoolConfig } from './ssl'

export const pool = new Pool(getPoolConfig())
export const db = drizzle(pool, { schema })
