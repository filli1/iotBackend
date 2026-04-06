import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { unitRoutes } from './units'
import { UnitRegistry } from '../lib/unitRegistry'
import { prisma } from '../lib/prisma'

function buildApp(registry: UnitRegistry) {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>()
  app.register(unitRoutes, { registry })
  return app
}

describe('/api/units', () => {
  let registry: UnitRegistry

  beforeEach(() => {
    registry = new UnitRegistry()
  })

  afterEach(async () => {
    registry.stop()
    await prisma.sensorUnit.deleteMany({ where: { id: { in: ['reg-test-01', 'reg-test-02'] } } })
  })

  it('POST creates a unit and returns 201', async () => {
    const app = buildApp(registry)
    const res = await app.inject({
      method: 'POST',
      url: '/api/units',
      payload: { id: 'reg-test-01', name: 'Stand A', location: 'Aisle 1', productName: 'Widget', ipAddress: '192.168.1.10' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.id).toBe('reg-test-01')
  })

  it('POST returns 409 for duplicate id', async () => {
    const app = buildApp(registry)
    await app.inject({
      method: 'POST',
      url: '/api/units',
      payload: { id: 'reg-test-02', name: 'Stand B', location: 'Aisle 2', productName: 'Gadget', ipAddress: '192.168.1.11' },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/units',
      payload: { id: 'reg-test-02', name: 'Stand B', location: 'Aisle 2', productName: 'Gadget', ipAddress: '192.168.1.11' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('GET returns list of units', async () => {
    const app = buildApp(registry)
    await app.inject({
      method: 'POST',
      url: '/api/units',
      payload: { id: 'reg-test-01', name: 'Stand A', location: 'Aisle 1', productName: 'Widget', ipAddress: '192.168.1.10' },
    })
    const res = await app.inject({ method: 'GET', url: '/api/units' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.units.some((u: { id: string }) => u.id === 'reg-test-01')).toBe(true)
  })

  it('DELETE removes the unit', async () => {
    const app = buildApp(registry)
    await app.inject({
      method: 'POST',
      url: '/api/units',
      payload: { id: 'reg-test-01', name: 'Stand A', location: 'Aisle 1', productName: 'Widget', ipAddress: '192.168.1.10' },
    })
    const res = await app.inject({ method: 'DELETE', url: '/api/units/reg-test-01' })
    expect(res.statusCode).toBe(200)
    const found = await prisma.sensorUnit.findUnique({ where: { id: 'reg-test-01' } })
    expect(found).toBeNull()
  })
})
