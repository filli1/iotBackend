import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { sensorRoutes } from './sensors'
import { UnitRegistry } from '../lib/unitRegistry'
import type { HealthMonitor } from '../services/healthMonitor'

const mockHealthMonitor = { process: () => {} } as unknown as HealthMonitor

function buildApp(registry: UnitRegistry) {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>()
  app.register(sensorRoutes, { registry, onReading: () => {}, onEvent: () => {}, healthMonitor: mockHealthMonitor })
  return app
}

describe('POST /api/sensors/data', () => {
  let registry: UnitRegistry

  beforeEach(() => {
    registry = new UnitRegistry()
    registry.register('unit-01')
  })

  afterEach(() => { registry.stop() })

  it('accepts a sensor reading with imu and returns { ok: true }', async () => {
    const app = buildApp(registry)
    const res = await app.inject({
      method: 'POST',
      url: '/api/sensors/data',
      payload: {
        unit_id: 'unit-01',
        ts: Date.now(),
        tof: [{ id: 1, distance_mm: 800, status: 'valid' }],
        imu: { vibration_intensity: 0.03 },
      },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
  })

  it('accepts a sensor reading without imu field', async () => {
    const app = buildApp(registry)
    const res = await app.inject({
      method: 'POST',
      url: '/api/sensors/data',
      payload: {
        unit_id: 'unit-01',
        ts: Date.now(),
        tof: [{ id: 1, distance_mm: 800, status: 'valid' }],
      },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
  })

  it('accepts an imu_vibration hardware event', async () => {
    const app = buildApp(registry)
    const res = await app.inject({
      method: 'POST',
      url: '/api/sensors/data',
      payload: { unit_id: 'unit-01', ts: Date.now(), event: 'imu_vibration', value: { intensity: 0.42 } },
    })
    expect(res.statusCode).toBe(200)
  })

  it('accepts an imu_shock hardware event', async () => {
    const app = buildApp(registry)
    const res = await app.inject({
      method: 'POST',
      url: '/api/sensors/data',
      payload: { unit_id: 'unit-01', ts: Date.now(), event: 'imu_shock', value: { peak_g: 1.8, axis: 'z' } },
    })
    expect(res.statusCode).toBe(200)
  })

  it('returns 404 for unknown unit_id', async () => {
    const app = buildApp(registry)
    const res = await app.inject({
      method: 'POST',
      url: '/api/sensors/data',
      payload: { unit_id: 'unit-99', ts: Date.now(), tof: [{ id: 1, distance_mm: 800, status: 'valid' }] },
    })
    expect(res.statusCode).toBe(404)
  })

  it('marks the unit as seen on a valid reading', async () => {
    const app = buildApp(registry)
    await app.inject({
      method: 'POST',
      url: '/api/sensors/data',
      payload: { unit_id: 'unit-01', ts: Date.now(), tof: [{ id: 1, distance_mm: 800, status: 'valid' }] },
    })
    expect(registry.getStatus('unit-01')?.online).toBe(true)
  })
})

describe('POST /api/sensors/ping', () => {
  let registry: UnitRegistry

  beforeEach(() => {
    registry = new UnitRegistry()
    registry.register('unit-01')
  })

  afterEach(() => { registry.stop() })

  it('returns 204 and marks unit as seen', async () => {
    const app = buildApp(registry)
    const res = await app.inject({
      method: 'POST',
      url: '/api/sensors/ping',
      payload: { unit_id: 'unit-01' },
    })
    expect(res.statusCode).toBe(204)
    expect(registry.getStatus('unit-01')?.online).toBe(true)
  })

  it('returns 404 for unknown unit_id', async () => {
    const app = buildApp(registry)
    const res = await app.inject({
      method: 'POST',
      url: '/api/sensors/ping',
      payload: { unit_id: 'unit-99' },
    })
    expect(res.statusCode).toBe(404)
  })
})
