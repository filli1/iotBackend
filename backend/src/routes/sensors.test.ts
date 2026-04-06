import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { sensorRoutes } from './sensors'
import { UnitRegistry } from '../lib/unitRegistry'

function buildApp(registry: UnitRegistry) {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>()
  const onReading = () => {}
  const onEvent = () => {}
  app.register(sensorRoutes, { registry, onReading, onEvent })
  return app
}

describe('POST /api/sensors/data', () => {
  let registry: UnitRegistry

  beforeEach(() => {
    registry = new UnitRegistry()
    registry.register('unit-01')
  })

  afterEach(() => {
    registry.stop()
  })

  it('accepts a valid sensor reading and returns { ok: true }', async () => {
    const app = buildApp(registry)
    const res = await app.inject({
      method: 'POST',
      url: '/api/sensors/data',
      payload: {
        unit_id: 'unit-01',
        ts: Date.now(),
        tof: [
          { id: 1, distance_mm: 800, status: 'valid' },
          { id: 2, distance_mm: 750, status: 'valid' },
          { id: 3, distance_mm: 4000, status: 'out_of_range' },
          { id: 4, distance_mm: 810, status: 'valid' },
          { id: 5, distance_mm: 4000, status: 'out_of_range' },
          { id: 6, distance_mm: 4000, status: 'out_of_range' },
        ],
        pir: { triggered: false, last_trigger_ms: 0 },
        imu: {
          accel: { x: 0.02, y: 0.98, z: 0.01 },
          gyro: { x: 0.5, y: -0.3, z: 0.1 },
          mag: { x: 25.1, y: -12.4, z: 40.2 },
        },
      },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
  })

  it('accepts a valid hardware event payload', async () => {
    const app = buildApp(registry)
    const res = await app.inject({
      method: 'POST',
      url: '/api/sensors/data',
      payload: {
        unit_id: 'unit-01',
        ts: Date.now(),
        event: 'imu_pickup',
        value: { magnitude: 2.1 },
      },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
  })

  it('returns 404 for unknown unit_id', async () => {
    const app = buildApp(registry)
    const res = await app.inject({
      method: 'POST',
      url: '/api/sensors/data',
      payload: {
        unit_id: 'unit-99',
        ts: Date.now(),
        tof: [],
        pir: { triggered: false, last_trigger_ms: 0 },
        imu: {
          accel: { x: 0, y: 0, z: 0 },
          gyro: { x: 0, y: 0, z: 0 },
          mag: { x: 0, y: 0, z: 0 },
        },
      },
    })
    expect(res.statusCode).toBe(404)
  })

  it('marks the unit as seen on a valid reading', async () => {
    const app = buildApp(registry)
    await app.inject({
      method: 'POST',
      url: '/api/sensors/data',
      payload: {
        unit_id: 'unit-01',
        ts: Date.now(),
        tof: [],
        pir: { triggered: false, last_trigger_ms: 0 },
        imu: {
          accel: { x: 0, y: 0, z: 0 },
          gyro: { x: 0, y: 0, z: 0 },
          mag: { x: 0, y: 0, z: 0 },
        },
      },
    })
    expect(registry.getStatus('unit-01')?.online).toBe(true)
  })
})
