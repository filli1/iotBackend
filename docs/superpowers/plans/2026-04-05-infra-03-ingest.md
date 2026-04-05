# INFRA-03: Sensor Data Ingest Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept raw sensor payloads from the Arduino via `POST /api/sensors/data`, validate them, track unit online/offline status in memory, and forward readings to the detection engine.

**Architecture:** A Fastify route validates two payload shapes (sensor reading vs hardware event) with TypeBox. A `UnitRegistry` singleton tracks online/offline state using a timestamp map and a 30-second background timer. CORS is added to allow the frontend (port 5174) to make REST calls.

**Tech Stack:** Fastify 4, TypeBox, @fastify/cors, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/src/types/sensor.ts` | Create | TypeScript types for all sensor payloads and detection events |
| `backend/src/lib/unitRegistry.ts` | Create | In-memory online/offline tracker |
| `backend/src/routes/sensors.ts` | Create | `POST /api/sensors/data` route |
| `backend/src/routes/sensors.test.ts` | Create | Route tests using Fastify inject |
| `backend/src/lib/unitRegistry.test.ts` | Create | Registry unit tests |
| `backend/src/index.ts` | Modify | Register CORS + sensors route |
| `backend/package.json` | Modify | Add `@fastify/cors` |

---

## Task 1: Sensor Types

- [ ] **Step 1: Create `backend/src/types/sensor.ts`**

```typescript
export type TofReading = {
  id: number
  distance_mm: number
  status: 'valid' | 'out_of_range' | 'error'
}

export type PirState = {
  triggered: boolean
  last_trigger_ms: number
}

export type ImuVector = { x: number; y: number; z: number }

export type ImuState = {
  accel: ImuVector
  gyro: ImuVector
  mag: ImuVector
}

export type SensorReading = {
  unit_id: string
  ts: number
  tof: TofReading[]
  pir: PirState
  imu: ImuState
}

export type HardwareEventType = 'pir_trigger' | 'imu_shock' | 'imu_pickup' | 'imu_rotation'

export type HardwareEvent = {
  unit_id: string
  ts: number
  event: HardwareEventType
  value: Record<string, unknown>
}

export type SensorPayload = SensorReading | HardwareEvent

export function isSensorReading(p: SensorPayload): p is SensorReading {
  return 'tof' in p
}

export type DetectionEvent =
  | { type: 'session_started'; unitId: string; ts: Date }
  | { type: 'session_ended'; unitId: string; ts: Date; dwellSeconds: number }
  | { type: 'product_picked_up'; unitId: string; ts: Date }
  | { type: 'product_put_down'; unitId: string; ts: Date }
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/types/
git commit -m "feat: add sensor payload types"
```

---

## Task 2: Unit Registry

- [ ] **Step 1: Write failing tests — `backend/src/lib/unitRegistry.test.ts`**

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { UnitRegistry } from './unitRegistry'

describe('UnitRegistry', () => {
  let registry: UnitRegistry

  beforeEach(() => {
    vi.useFakeTimers()
    registry = new UnitRegistry()
  })

  afterEach(() => {
    registry.stop()
    vi.useRealTimers()
  })

  it('registers a unit as known', () => {
    registry.register('unit-01')
    expect(registry.isKnown('unit-01')).toBe(true)
  })

  it('marks a unit online when seen', () => {
    registry.register('unit-01')
    registry.markSeen('unit-01')
    expect(registry.getStatus('unit-01')?.online).toBe(true)
  })

  it('marks a unit offline after 60 seconds without a reading', () => {
    const offlineCb = vi.fn()
    registry.onOffline(offlineCb)
    registry.register('unit-01')
    registry.markSeen('unit-01')

    vi.advanceTimersByTime(61_000)

    expect(registry.getStatus('unit-01')?.online).toBe(false)
    expect(offlineCb).toHaveBeenCalledWith('unit-01')
  })

  it('returns null for unknown unit', () => {
    expect(registry.getStatus('unknown')).toBeNull()
    expect(registry.isKnown('unknown')).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect to fail**

```bash
cd backend && npm run test -- unitRegistry
```

Expected: FAIL — `Cannot find module './unitRegistry'`

- [ ] **Step 3: Create `backend/src/lib/unitRegistry.ts`**

```typescript
type UnitStatus = {
  lastSeen: Date
  online: boolean
}

type OfflineCallback = (unitId: string) => void

export class UnitRegistry {
  private units = new Map<string, UnitStatus>()
  private offlineCallbacks: OfflineCallback[] = []
  private timer: ReturnType<typeof setInterval>

  constructor(checkIntervalMs = 30_000, offlineAfterMs = 60_000) {
    this.timer = setInterval(() => {
      const now = Date.now()
      for (const [unitId, status] of this.units) {
        if (status.online && now - status.lastSeen.getTime() > offlineAfterMs) {
          status.online = false
          this.offlineCallbacks.forEach(cb => cb(unitId))
        }
      }
    }, checkIntervalMs)
  }

  register(unitId: string): void {
    if (!this.units.has(unitId)) {
      this.units.set(unitId, { lastSeen: new Date(0), online: false })
    }
  }

  markSeen(unitId: string): void {
    const status = this.units.get(unitId)
    if (status) {
      status.lastSeen = new Date()
      status.online = true
    }
  }

  isKnown(unitId: string): boolean {
    return this.units.has(unitId)
  }

  getStatus(unitId: string): UnitStatus | null {
    return this.units.get(unitId) ?? null
  }

  onOffline(cb: OfflineCallback): void {
    this.offlineCallbacks.push(cb)
  }

  stop(): void {
    clearInterval(this.timer)
  }
}
```

- [ ] **Step 4: Run — expect to pass**

```bash
npm run test -- unitRegistry
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/unitRegistry.ts backend/src/lib/unitRegistry.test.ts
git commit -m "feat: add unit registry for online/offline tracking"
```

---

## Task 3: Install CORS Plugin

- [ ] **Step 1: Add `@fastify/cors` to `backend/package.json` dependencies**

```json
"@fastify/cors": "^9.0.0"
```

- [ ] **Step 2: Install**

```bash
npm install
```

---

## Task 4: Ingest Route (TDD)

- [ ] **Step 1: Write failing tests — `backend/src/routes/sensors.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
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
```

- [ ] **Step 2: Run — expect to fail**

```bash
npm run test -- sensors
```

Expected: FAIL — `Cannot find module './sensors'`

- [ ] **Step 3: Create `backend/src/routes/sensors.ts`**

```typescript
import { Type } from '@fastify/type-provider-typebox'
import type { FastifyPluginAsync } from 'fastify'
import type { UnitRegistry } from '../lib/unitRegistry'
import type { SensorReading, HardwareEvent } from '../types/sensor'
import { isSensorReading } from '../types/sensor'

const ImuVector = Type.Object({ x: Type.Number(), y: Type.Number(), z: Type.Number() })

const SensorReadingSchema = Type.Object({
  unit_id: Type.String(),
  ts: Type.Number(),
  tof: Type.Array(Type.Object({
    id: Type.Number(),
    distance_mm: Type.Number(),
    status: Type.Union([Type.Literal('valid'), Type.Literal('out_of_range'), Type.Literal('error')]),
  })),
  pir: Type.Object({ triggered: Type.Boolean(), last_trigger_ms: Type.Number() }),
  imu: Type.Object({ accel: ImuVector, gyro: ImuVector, mag: ImuVector }),
})

const HardwareEventSchema = Type.Object({
  unit_id: Type.String(),
  ts: Type.Number(),
  event: Type.Union([
    Type.Literal('pir_trigger'),
    Type.Literal('imu_shock'),
    Type.Literal('imu_pickup'),
    Type.Literal('imu_rotation'),
  ]),
  value: Type.Record(Type.String(), Type.Unknown()),
})

const PayloadSchema = Type.Union([SensorReadingSchema, HardwareEventSchema])

type PluginOptions = {
  registry: UnitRegistry
  onReading: (unitId: string, reading: SensorReading) => void
  onEvent: (unitId: string, event: HardwareEvent) => void
}

export const sensorRoutes: FastifyPluginAsync<PluginOptions> = async (fastify, opts) => {
  fastify.post(
    '/api/sensors/data',
    { schema: { body: PayloadSchema } },
    async (request, reply) => {
      const payload = request.body as SensorReading | HardwareEvent

      if (!opts.registry.isKnown(payload.unit_id)) {
        return reply.status(404).send({ error: 'Unknown unit_id' })
      }

      opts.registry.markSeen(payload.unit_id)

      if (isSensorReading(payload)) {
        opts.onReading(payload.unit_id, payload)
      } else {
        opts.onEvent(payload.unit_id, payload)
      }

      return { ok: true }
    }
  )
}
```

- [ ] **Step 4: Run — expect to pass**

```bash
npm run test -- sensors
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/sensors.ts backend/src/routes/sensors.test.ts
git commit -m "feat: add sensor data ingest endpoint"
```

---

## Task 5: Wire CORS and Route into `index.ts`

- [ ] **Step 1: Update `backend/src/index.ts`**

```typescript
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { healthRoutes } from './routes/health'
import { sensorRoutes } from './routes/sensors'
import { UnitRegistry } from './lib/unitRegistry'
import { prisma } from './lib/prisma'

const registry = new UnitRegistry()

const start = async () => {
  // Load all registered units into the registry on startup
  const units = await prisma.sensorUnit.findMany({ select: { id: true } })
  for (const unit of units) {
    registry.register(unit.id)
  }

  const fastify = Fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>()

  await fastify.register(cors, { origin: 'http://localhost:5174' })
  await fastify.register(healthRoutes)
  await fastify.register(sensorRoutes, {
    registry,
    onReading: (unitId, reading) => {
      // DetectionEngine will be wired here in CORE-01
      fastify.log.info({ unitId }, 'sensor reading received')
    },
    onEvent: (unitId, event) => {
      // DetectionEngine will be wired here in CORE-01
      fastify.log.info({ unitId, event: event.event }, 'hardware event received')
    },
  })

  await fastify.listen({ port: 7000, host: '0.0.0.0' })
}

start().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck -w backend
```

Expected: zero errors.

- [ ] **Step 3: Start the server and smoke test**

```bash
npm run dev -w backend
```

In a second terminal:
```bash
curl -s -X POST http://localhost:7000/api/sensors/data \
  -H "Content-Type: application/json" \
  -d '{"unit_id":"unit-01","ts":0,"tof":[],"pir":{"triggered":false,"last_trigger_ms":0},"imu":{"accel":{"x":0,"y":0,"z":0},"gyro":{"x":0,"y":0,"z":0},"mag":{"x":0,"y":0,"z":0}}}'
```

Expected: `{"error":"Unknown unit_id"}` with 404 (no units registered yet — correct).

- [ ] **Step 4: Commit**

```bash
git add backend/src/index.ts backend/package.json
git commit -m "feat: wire CORS and sensor ingest route into fastify server"
```
