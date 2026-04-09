import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@prisma/client'

const url = process.env.DATABASE_URL ?? 'file:../../data/store-attention.db'
// Strip the "file:" prefix — better-sqlite3 takes a plain file path
const filename = url.replace(/^file:/, '')

const adapter = new PrismaBetterSqlite3({ url: filename })

export const prisma = new PrismaClient({ adapter })
