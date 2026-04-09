import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { sessionRoutes } from './sessions'
import { prisma } from '../lib/prisma'

async function buildApp() {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>()
  await app.register(sessionRoutes)
  return app
}

const UNIT_ID = 'sessions-test-unit'

beforeAll(async () => {
  await prisma.sensorUnit.create({
    data: { id: UNIT_ID, name: 'Test', location: 'L', productName: 'P', apiKey: 'sessions-test-key' },
  })
  const now = new Date()
  await prisma.presenceSession.createMany({
    data: [
      { unitId: UNIT_ID, startedAt: new Date(now.getTime() - 60000), endedAt: now, dwellSeconds: 45, productInteracted: true, status: 'completed' },
      { unitId: UNIT_ID, startedAt: new Date(now.getTime() - 30000), endedAt: now, dwellSeconds: 10, productInteracted: false, status: 'completed' },
      { unitId: UNIT_ID, startedAt: now, status: 'active' },
    ],
  })
})

afterAll(async () => {
  await prisma.sensorUnit.delete({ where: { id: UNIT_ID } })
})

describe('GET /api/sessions', () => {
  it('returns only completed sessions by default', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/sessions' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.every((s: { status: string }) => s.status === 'completed')).toBe(true)
  })

  it('filters by productInteracted', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/sessions?productInteracted=true' })
    const body = JSON.parse(res.body)
    expect(body.data.every((s: { productInteracted: boolean }) => s.productInteracted === true)).toBe(true)
  })

  it('filters by minDwellSeconds', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/sessions?minDwellSeconds=20' })
    const body = JSON.parse(res.body)
    expect(body.data.every((s: { dwellSeconds: number }) => s.dwellSeconds >= 20)).toBe(true)
  })

  it('returns correct pagination fields', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/sessions?pageSize=1' })
    const body = JSON.parse(res.body)
    expect(body.data).toHaveLength(1)
    expect(body.pageCount).toBeGreaterThan(1)
    expect(body.total).toBeGreaterThanOrEqual(2)
  })

  it('GET /api/sessions/export.csv returns a CSV with header row', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/sessions/export.csv' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.headers['content-disposition']).toContain('attachment')
    const lines = res.body.split('\n')
    expect(lines[0]).toBe('id,unitId,unitName,startedAt,endedAt,dwellSeconds,productInteracted')
  })

  it('GET /api/sessions/export.csv returns data rows for matching sessions', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: `/api/sessions/export.csv?unitId=${UNIT_ID}` })
    const lines = res.body.trim().split('\n')
    // header + at least 2 completed sessions
    expect(lines.length).toBeGreaterThanOrEqual(3)
  })

  it('GET /api/sessions/export.csv returns header only when no sessions match', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/sessions/export.csv?unitId=no-such-unit' })
    expect(res.statusCode).toBe(200)
    expect(res.body.trim()).toBe('id,unitId,unitName,startedAt,endedAt,dwellSeconds,productInteracted')
  })
})
