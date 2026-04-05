# CORE-01: Detection Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A stateful per-unit state machine that consumes raw sensor readings and hardware events, applies detection logic (dwell timer, departure timeout, sensor agreement), and emits typed detection events via a callback.

**Architecture:** `DetectionEngine` holds a `Map<unitId, UnitState>`. Each `UnitState` runs its own setTimeout-based dwell and departure timers. The engine is pure business logic — no DB access, no WebSocket — it only calls the `onEvent` callback registered at construction. Vitest fake timers make the timer logic fully testable without waiting.

**Tech Stack:** TypeScript, Vitest fake timers

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/src/types/sensor.ts` | Already exists | `DetectionEvent`, `SensorReading`, `HardwareEvent` types |
| `backend/src/services/detectionEngine.ts` | Create | `DetectionEngine` class |
| `backend/src/services/detectionEngine.test.ts` | Create | State machine tests with fake timers |
| `backend/src/index.ts` | Modify | Instantiate `DetectionEngine`, pass callbacks to `sensorRoutes` |

---

## Task 1: DetectionEngine (TDD)

- [ ] **Step 1: Write failing tests — `backend/src/services/detectionEngine.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DetectionEngine } from './detectionEngine'
import type { DetectionEvent } from '../types/sensor'

const defaultConfig = {
  minSensorAgreement: 2,
  dwellMinSeconds: 3,
  departureTimeoutSeconds: 5,
  imuPickupThresholdG: 1.5,
  imuExaminationEnabled: true,
  imuDurationThresholdMs: 500,
  pirEnabled: true,
  pirCooldownSeconds: 10,
}

const makeTof = (activeCount: number) =>
  Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    distance_mm: i < activeCount ? 500 : 4000,
    status: (i < activeCount ? 'valid' : 'out_of_range') as 'valid' | 'out_of_range' | 'error',
  }))

const makeReading = (unitId: string, activeCount: number) => ({
  unit_id: unitId,
  ts: Date.now(),
  tof: makeTof(activeCount),
  pir: { triggered: false, last_trigger_ms: 0 },
  imu: {
    accel: { x: 0.02, y: 0.98, z: 0.01 },
    gyro: { x: 0, y: 0, z: 0 },
    mag: { x: 0, y: 0, z: 0 },
  },
})

describe('DetectionEngine', () => {
  let events: DetectionEvent[]
  let engine: DetectionEngine

  beforeEach(() => {
    vi.useFakeTimers()
    events = []
    engine = new DetectionEngine(e => events.push(e))
    engine.addUnit('unit-01', defaultConfig, [
      { index: 1, maxDist: 1000, minDist: 50 },
      { index: 2, maxDist: 1000, minDist: 50 },
      { index: 3, maxDist: 1000, minDist: 50 },
      { index: 4, maxDist: 1000, minDist: 50 },
      { index: 5, maxDist: 1000, minDist: 50 },
      { index: 6, maxDist: 1000, minDist: 50 },
    ])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits session_started after dwell threshold is met', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    expect(events).toHaveLength(0) // pending, not started yet

    vi.advanceTimersByTime(3_000)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('session_started')
  })

  it('does NOT emit session_started if person leaves before dwell threshold', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(1_000)
    engine.process('unit-01', makeReading('unit-01', 0)) // person leaves
    vi.advanceTimersByTime(5_000)
    expect(events).toHaveLength(0)
  })

  it('emits session_ended with dwellSeconds after departure timeout', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(3_000) // session_started

    vi.advanceTimersByTime(10_000) // person present for 10s
    engine.process('unit-01', makeReading('unit-01', 0)) // person leaves
    vi.advanceTimersByTime(5_000) // departure timeout

    const ended = events.find(e => e.type === 'session_ended')
    expect(ended).toBeDefined()
    if (ended?.type === 'session_ended') {
      expect(ended.dwellSeconds).toBeGreaterThanOrEqual(13)
    }
  })

  it('cancels departure and keeps session active if person returns', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(3_000) // session_started

    engine.process('unit-01', makeReading('unit-01', 0)) // starts departure timer
    vi.advanceTimersByTime(2_000) // not yet timed out
    engine.process('unit-01', makeReading('unit-01', 3)) // person returns
    vi.advanceTimersByTime(10_000) // wait well past departure timeout

    expect(events.some(e => e.type === 'session_ended')).toBe(false)
  })

  it('emits product_picked_up when imu_pickup event arrives during active session', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(3_000) // session_started

    engine.processEvent('unit-01', {
      unit_id: 'unit-01',
      ts: Date.now(),
      event: 'imu_pickup',
      value: { magnitude: 2.1 },
    })

    expect(events.some(e => e.type === 'product_picked_up')).toBe(true)
  })

  it('does NOT emit product_picked_up when session is not active', () => {
    engine.processEvent('unit-01', {
      unit_id: 'unit-01',
      ts: Date.now(),
      event: 'imu_pickup',
      value: {},
    })
    expect(events.some(e => e.type === 'product_picked_up')).toBe(false)
  })

  it('ignores readings below minSensorAgreement', () => {
    engine.process('unit-01', makeReading('unit-01', 1)) // only 1 sensor, threshold is 2
    vi.advanceTimersByTime(10_000)
    expect(events).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run — expect to fail**

```bash
cd backend && npm run test -- detectionEngine
```

Expected: FAIL — `Cannot find module './detectionEngine'`

- [ ] **Step 3: Create `backend/src/services/detectionEngine.ts`**

```typescript
import type { SensorReading, HardwareEvent, DetectionEvent } from '../types/sensor'

type TofConfig = { index: number; minDist: number; maxDist: number }

type UnitConfig = {
  minSensorAgreement: number
  dwellMinSeconds: number
  departureTimeoutSeconds: number
  imuPickupThresholdG: number
  imuExaminationEnabled: boolean
  imuDurationThresholdMs: number
  pirEnabled: boolean
  pirCooldownSeconds: number
}

type SessionState = 'idle' | 'pending' | 'active' | 'departing'

type UnitState = {
  config: UnitConfig
  tofConfig: TofConfig[]
  state: SessionState
  sessionStartedAt: Date | null
  dwellTimer: ReturnType<typeof setTimeout> | null
  departureTimer: ReturnType<typeof setTimeout> | null
}

type EventHandler = (event: DetectionEvent) => void

export class DetectionEngine {
  private units = new Map<string, UnitState>()
  private onEvent: EventHandler

  constructor(onEvent: EventHandler) {
    this.onEvent = onEvent
  }

  addUnit(unitId: string, config: UnitConfig, tofConfig: TofConfig[]): void {
    this.units.set(unitId, {
      config,
      tofConfig,
      state: 'idle',
      sessionStartedAt: null,
      dwellTimer: null,
      departureTimer: null,
    })
  }

  updateConfig(unitId: string, config: UnitConfig, tofConfig: TofConfig[]): void {
    const unit = this.units.get(unitId)
    if (unit) {
      unit.config = config
      unit.tofConfig = tofConfig
    }
  }

  process(unitId: string, reading: SensorReading): void {
    const unit = this.units.get(unitId)
    if (!unit) return

    const activeSensors = reading.tof.filter(t => {
      const cfg = unit.tofConfig.find(c => c.index === t.id)
      if (!cfg) return false
      return t.status === 'valid' && t.distance_mm >= cfg.minDist && t.distance_mm <= cfg.maxDist
    }).length

    const detected = activeSensors >= unit.config.minSensorAgreement

    if (unit.state === 'idle' && detected) {
      unit.state = 'pending'
      unit.dwellTimer = setTimeout(() => {
        unit.state = 'active'
        unit.sessionStartedAt = new Date()
        this.onEvent({ type: 'session_started', unitId, ts: new Date() })
      }, unit.config.dwellMinSeconds * 1000)
    } else if (unit.state === 'pending' && !detected) {
      clearTimeout(unit.dwellTimer!)
      unit.dwellTimer = null
      unit.state = 'idle'
    } else if (unit.state === 'active' && !detected) {
      unit.state = 'departing'
      unit.departureTimer = setTimeout(() => {
        const dwellSeconds = unit.sessionStartedAt
          ? Math.round((Date.now() - unit.sessionStartedAt.getTime()) / 1000)
          : 0
        unit.state = 'idle'
        unit.sessionStartedAt = null
        this.onEvent({ type: 'session_ended', unitId, ts: new Date(), dwellSeconds })
      }, unit.config.departureTimeoutSeconds * 1000)
    } else if (unit.state === 'departing' && detected) {
      clearTimeout(unit.departureTimer!)
      unit.departureTimer = null
      unit.state = 'active'
    }
  }

  processEvent(unitId: string, event: HardwareEvent): void {
    const unit = this.units.get(unitId)
    if (!unit) return

    if (event.event === 'imu_pickup' && unit.state === 'active') {
      this.onEvent({ type: 'product_picked_up', unitId, ts: new Date() })
    }
  }
}
```

- [ ] **Step 4: Run — expect to pass**

```bash
npm run test -- detectionEngine
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/detectionEngine.ts backend/src/services/detectionEngine.test.ts
git commit -m "feat: add detection engine with state machine"
```

---

## Task 2: Wire Detection Engine into `index.ts`

- [ ] **Step 1: Update `backend/src/index.ts`**

Replace the placeholder `onReading` and `onEvent` callbacks with real `DetectionEngine` calls. Also load `TofSensor` configs on startup.

```typescript
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { healthRoutes } from './routes/health'
import { sensorRoutes } from './routes/sensors'
import { UnitRegistry } from './lib/unitRegistry'
import { DetectionEngine } from './services/detectionEngine'
import { prisma } from './lib/prisma'

const registry = new UnitRegistry()

const start = async () => {
  const units = await prisma.sensorUnit.findMany({
    include: { configuration: true, tofSensors: true },
  })

  // SessionManager callback will be added in CORE-02; use a placeholder for now
  const engine = new DetectionEngine(event => {
    console.log('detection event:', event)
  })

  for (const unit of units) {
    registry.register(unit.id)
    if (unit.configuration) {
      engine.addUnit(unit.id, unit.configuration, unit.tofSensors)
    }
  }

  const fastify = Fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>()

  await fastify.register(cors, { origin: 'http://localhost:5174' })
  await fastify.register(healthRoutes)
  await fastify.register(sensorRoutes, {
    registry,
    onReading: (unitId, reading) => engine.process(unitId, reading),
    onEvent: (unitId, event) => engine.processEvent(unitId, event),
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

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: wire detection engine into server startup"
```
