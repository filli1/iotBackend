# Sensor Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove PIR from payload, replace IMU axes with vibration intensity (optional), support variable ToF sensor count, add ping endpoint, and rename productPickedUp → productInteracted throughout.

**Architecture:** DB migration first, then backend types/services, then frontend. Each task is independently committable and leaves the codebase in a consistent state.

**Tech Stack:** Prisma (SQLite), Fastify + TypeBox, React + Zustand, Vitest

---

### Task 1: Prisma schema + migration

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Update schema.prisma**

Replace the entire file content with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  phoneNumber  String?
  createdAt    DateTime @default(now())

  subscriptions UnitSubscription[]
}

model SensorUnit {
  id          String   @id
  name        String
  location    String
  productName String
  apiKey      String   @unique
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tofSensors    TofSensor[]
  sessions      PresenceSession[]
  alertRule     AlertRule?
  configuration UnitConfiguration?
  subscriptions UnitSubscription[]
}

model TofSensor {
  id      String @id @default(cuid())
  unitId  String
  index   Int
  label   String
  minDist Int
  maxDist Int

  unit SensorUnit @relation(fields: [unitId], references: [id], onDelete: Cascade)

  @@unique([unitId, index])
}

model PresenceSession {
  id                String    @id @default(cuid())
  unitId            String
  startedAt         DateTime
  endedAt           DateTime?
  dwellSeconds      Int       @default(0)
  productInteracted Boolean   @default(false)
  status            String    @default("active")

  unit   SensorUnit     @relation(fields: [unitId], references: [id], onDelete: Cascade)
  events SessionEvent[]
}

model SessionEvent {
  id        String   @id @default(cuid())
  sessionId String
  type      String
  ts        DateTime
  payload   String?

  session PresenceSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}

model AlertRule {
  id                    String  @id @default(cuid())
  unitId                String  @unique
  dwellThresholdSeconds Int     @default(30)
  requireInteraction    Boolean @default(false)
  enabled               Boolean @default(true)

  unit SensorUnit @relation(fields: [unitId], references: [id], onDelete: Cascade)
}

model UnitConfiguration {
  id                     String  @id @default(cuid())
  unitId                 String  @unique
  minSensorAgreement     Int     @default(2)
  departureTimeoutSeconds Int    @default(5)
  dwellMinSeconds        Int     @default(3)
  imuVibrationThreshold  Float   @default(0.08)
  imuEnabled             Boolean @default(true)
  imuDurationThresholdMs Int     @default(150)

  unit SensorUnit @relation(fields: [unitId], references: [id], onDelete: Cascade)
}

model UnitSubscription {
  id        String   @id @default(cuid())
  userId    String
  unitId    String
  createdAt DateTime @default(now())

  user User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  unit SensorUnit @relation(fields: [unitId], references: [id], onDelete: Cascade)

  @@unique([userId, unitId])
}
```

- [ ] **Step 2: Run migration**

```bash
cd backend && npx prisma migrate dev --name rename-sensor-fields
```

Expected: migration created and applied, output ends with "Your database is now in sync with your schema."

- [ ] **Step 3: Generate Prisma client**

```bash
cd backend && npx prisma generate
```

Expected: "Generated Prisma Client"

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "chore: rename sensor fields in prisma schema"
```

---

### Task 2: Backend sensor types

**Files:**
- Modify: `backend/src/types/sensor.ts`

- [ ] **Step 1: Replace sensor.ts**

```typescript
export type TofReading = {
  id: number
  distance_mm: number
  status: 'valid' | 'out_of_range' | 'error'
}

export type ImuReading = {
  vibration_intensity: number
}

export type SensorReading = {
  unit_id: string
  ts: number
  tof: TofReading[]
  imu?: ImuReading
}

export type HardwareEventType = 'imu_shock' | 'imu_vibration'

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
  | { type: 'product_interacted'; unitId: string; ts: Date }
```

- [ ] **Step 2: Verify TypeScript compiles (it won't yet — that's expected)**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -40
```

Expected: errors in detectionEngine, sessionManager, sensors route etc. — this is correct, we fix them in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add backend/src/types/sensor.ts
git commit -m "feat: replace IMU axes with vibration_intensity, rename event types"
```

---

### Task 3: Detection engine

**Files:**
- Modify: `backend/src/services/detectionEngine.ts`
- Modify: `backend/src/services/detectionEngine.test.ts`

- [ ] **Step 1: Update detectionEngine.test.ts**

Replace the entire file:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DetectionEngine } from './detectionEngine'
import type { DetectionEvent } from '../types/sensor'

const defaultConfig = {
  minSensorAgreement: 2,
  dwellMinSeconds: 3,
  departureTimeoutSeconds: 5,
  imuVibrationThreshold: 0.08,
  imuEnabled: true,
  imuDurationThresholdMs: 150,
}

const makeTof = (activeCount: number) =>
  Array.from({ length: activeCount }, (_, i) => ({
    id: i + 1,
    distance_mm: 500,
    status: 'valid' as const,
  }))

const makeReading = (unitId: string, activeCount: number) => ({
  unit_id: unitId,
  ts: Date.now(),
  tof: makeTof(activeCount),
  imu: { vibration_intensity: 0.01 },
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
    ])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits session_started after dwell threshold is met', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    expect(events).toHaveLength(0)

    vi.advanceTimersByTime(3_000)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('session_started')
  })

  it('does NOT emit session_started if person leaves before dwell threshold', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(1_000)
    engine.process('unit-01', makeReading('unit-01', 0))
    vi.advanceTimersByTime(5_000)
    expect(events).toHaveLength(0)
  })

  it('emits session_ended with dwellSeconds after departure timeout', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(3_000)
    vi.advanceTimersByTime(10_000)
    engine.process('unit-01', makeReading('unit-01', 0))
    vi.advanceTimersByTime(5_000)

    const ended = events.find(e => e.type === 'session_ended')
    expect(ended).toBeDefined()
    if (ended?.type === 'session_ended') {
      expect(ended.dwellSeconds).toBeGreaterThanOrEqual(13)
    }
  })

  it('cancels departure and keeps session active if person returns', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(3_000)
    engine.process('unit-01', makeReading('unit-01', 0))
    vi.advanceTimersByTime(2_000)
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(10_000)
    expect(events.some(e => e.type === 'session_ended')).toBe(false)
  })

  it('emits product_interacted when imu_vibration fires during active session', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(3_000)

    engine.processEvent('unit-01', {
      unit_id: 'unit-01',
      ts: Date.now(),
      event: 'imu_vibration',
      value: { intensity: 0.42 },
    })

    expect(events.some(e => e.type === 'product_interacted')).toBe(true)
  })

  it('does NOT emit product_interacted when session is not active', () => {
    engine.processEvent('unit-01', {
      unit_id: 'unit-01',
      ts: Date.now(),
      event: 'imu_vibration',
      value: { intensity: 0.42 },
    })
    expect(events.some(e => e.type === 'product_interacted')).toBe(false)
  })

  it('does NOT emit product_interacted when imuEnabled is false', () => {
    engine.updateConfig('unit-01', { ...defaultConfig, imuEnabled: false }, [
      { index: 1, maxDist: 1000, minDist: 50 },
    ])
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(3_000)

    engine.processEvent('unit-01', {
      unit_id: 'unit-01',
      ts: Date.now(),
      event: 'imu_vibration',
      value: { intensity: 0.42 },
    })
    expect(events.some(e => e.type === 'product_interacted')).toBe(false)
  })

  it('ignores readings below minSensorAgreement', () => {
    engine.process('unit-01', makeReading('unit-01', 1))
    vi.advanceTimersByTime(10_000)
    expect(events).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx vitest run src/services/detectionEngine.test.ts
```

Expected: FAIL — `imuVibrationThreshold` not on config type, `imu_vibration` not a valid event type.

- [ ] **Step 3: Replace detectionEngine.ts**

```typescript
import type { SensorReading, HardwareEvent, DetectionEvent } from '../types/sensor'

type TofConfig = { index: number; minDist: number; maxDist: number }

type UnitConfig = {
  minSensorAgreement: number
  dwellMinSeconds: number
  departureTimeoutSeconds: number
  imuVibrationThreshold: number
  imuEnabled: boolean
  imuDurationThresholdMs: number
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
    if (!unit || !unit.config.imuEnabled) return

    if (event.event === 'imu_vibration' && unit.state === 'active') {
      this.onEvent({ type: 'product_interacted', unitId, ts: new Date() })
    }
  }

  destroy(): void {
    for (const unit of this.units.values()) {
      if (unit.dwellTimer) clearTimeout(unit.dwellTimer)
      if (unit.departureTimer) clearTimeout(unit.departureTimer)
    }
    this.units.clear()
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && npx vitest run src/services/detectionEngine.test.ts
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/detectionEngine.ts backend/src/services/detectionEngine.test.ts
git commit -m "feat: rename IMU config fields, imu_vibration triggers product_interacted"
```

---

### Task 4: Session manager

**Files:**
- Modify: `backend/src/services/sessionManager.ts`
- Modify: `backend/src/services/sessionManager.test.ts`

- [ ] **Step 1: Update sessionManager.test.ts**

Replace the entire file:

```typescript
vi.mock('./twilioNotifier', () => ({
  sendWhatsApp: vi.fn().mockResolvedValue(undefined),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SessionManager } from './sessionManager'
import type { WsBroadcaster } from '../ws/broadcaster'
import { sendWhatsApp } from './twilioNotifier'

const mockPrisma = {
  presenceSession: {
    create: vi.fn().mockResolvedValue({ id: 'sess-1' }),
    update: vi.fn().mockResolvedValue({}),
  },
  sessionEvent: {
    create: vi.fn().mockResolvedValue({}),
  },
  alertRule: {
    findUnique: vi.fn().mockResolvedValue({
      enabled: true,
      dwellThresholdSeconds: 30,
      requireInteraction: false,
    }),
  },
  sensorUnit: {
    findUnique: vi.fn().mockResolvedValue({ name: 'Stand A' }),
  },
  unitSubscription: {
    findMany: vi.fn().mockResolvedValue([]),
  },
}

const mockBroadcaster = { broadcast: vi.fn() } as unknown as WsBroadcaster

describe('SessionManager', () => {
  let manager: SessionManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new SessionManager(mockPrisma as any, mockBroadcaster)
  })

  it('creates a PresenceSession on session_started', async () => {
    await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
    expect(mockPrisma.presenceSession.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ unitId: 'unit-01', status: 'active' }) })
    )
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session_event', event: 'session_started' })
    )
  })

  it('closes the session on session_ended', async () => {
    await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
    await manager.handleDetectionEvent({ type: 'session_ended', unitId: 'unit-01', ts: new Date(), dwellSeconds: 45 })
    expect(mockPrisma.presenceSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'completed', dwellSeconds: 45 }) })
    )
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session_event', event: 'session_ended', dwellSeconds: 45 })
    )
  })

  it('sets productInteracted on product_interacted event', async () => {
    await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
    await manager.handleDetectionEvent({ type: 'product_interacted', unitId: 'unit-01', ts: new Date() })
    expect(mockPrisma.presenceSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ productInteracted: true }) })
    )
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session_event', event: 'product_interacted' })
    )
  })

  it('broadcasts alert_fired when dwell threshold is met on session_ended', async () => {
    await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
    await manager.handleDetectionEvent({ type: 'session_ended', unitId: 'unit-01', ts: new Date(), dwellSeconds: 45 })
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'alert_fired', unitId: 'unit-01' })
    )
  })

  it('does NOT fire alert when dwell is below threshold', async () => {
    await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
    await manager.handleDetectionEvent({ type: 'session_ended', unitId: 'unit-01', ts: new Date(), dwellSeconds: 10 })
    const alertCalls = (mockBroadcaster.broadcast as ReturnType<typeof vi.fn>).mock.calls
      .filter(([msg]) => msg.type === 'alert_fired')
    expect(alertCalls).toHaveLength(0)
  })

  it('sends WhatsApp to subscribed users when alert fires', async () => {
    mockPrisma.unitSubscription.findMany.mockResolvedValueOnce([
      { user: { phoneNumber: '+4553575520' } },
    ])
    await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
    await manager.handleDetectionEvent({ type: 'session_ended', unitId: 'unit-01', ts: new Date(), dwellSeconds: 45 })
    await new Promise(r => setTimeout(r, 10))
    expect(sendWhatsApp).toHaveBeenCalledWith('+4553575520', expect.stringContaining('Stand A'))
  })

  it('does NOT call sendWhatsApp when there are no subscribers', async () => {
    await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
    await manager.handleDetectionEvent({ type: 'session_ended', unitId: 'unit-01', ts: new Date(), dwellSeconds: 45 })
    await new Promise(r => setTimeout(r, 10))
    expect(sendWhatsApp).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx vitest run src/services/sessionManager.test.ts
```

Expected: FAIL — `product_interacted` not in switch, `requirePickup` vs `requireInteraction` mismatch.

- [ ] **Step 3: Replace sessionManager.ts**

```typescript
import type { PrismaClient } from '@prisma/client'
import type { WsBroadcaster } from '../ws/broadcaster'
import type { DetectionEvent } from '../types/sensor'
import { sendWhatsApp } from './twilioNotifier'

type ActiveSession = {
  sessionId: string
  unitId: string
  startedAt: Date
  productInteracted: boolean
  alertFired: boolean
  dwellCheckTimer: ReturnType<typeof setInterval>
}

export class SessionManager {
  private activeSessions = new Map<string, ActiveSession>()
  private prisma: PrismaClient
  private broadcaster: WsBroadcaster

  constructor(prisma: PrismaClient, broadcaster: WsBroadcaster) {
    this.prisma = prisma
    this.broadcaster = broadcaster
  }

  async handleDetectionEvent(event: DetectionEvent): Promise<void> {
    switch (event.type) {
      case 'session_started':
        await this.onSessionStarted(event.unitId, event.ts)
        break
      case 'session_ended':
        await this.onSessionEnded(event.unitId, event.ts, event.dwellSeconds)
        break
      case 'product_interacted':
        await this.onProductInteracted(event.unitId, event.ts)
        break
    }
  }

  private async onSessionStarted(unitId: string, ts: Date): Promise<void> {
    const session = await this.prisma.presenceSession.create({
      data: { unitId, startedAt: ts, status: 'active' },
    })

    const activeSession: ActiveSession = {
      sessionId: session.id,
      unitId,
      startedAt: ts,
      productInteracted: false,
      alertFired: false,
      dwellCheckTimer: setInterval(async () => {
        const active = this.activeSessions.get(unitId)
        if (!active || active.alertFired) return
        const dwellSeconds = Math.round((Date.now() - active.startedAt.getTime()) / 1000)
        await this.checkAlertRule(unitId, active, dwellSeconds)
      }, 5_000),
    }

    this.activeSessions.set(unitId, activeSession)

    this.broadcaster.broadcast({
      type: 'session_event',
      event: 'session_started',
      unitId,
      sessionId: session.id,
      ts: ts.toISOString(),
    })
  }

  private async onSessionEnded(unitId: string, ts: Date, dwellSeconds: number): Promise<void> {
    const active = this.activeSessions.get(unitId)
    if (!active) return

    clearInterval(active.dwellCheckTimer)

    await this.prisma.presenceSession.update({
      where: { id: active.sessionId },
      data: { endedAt: ts, dwellSeconds, status: 'completed' },
    })

    this.broadcaster.broadcast({
      type: 'session_event',
      event: 'session_ended',
      unitId,
      sessionId: active.sessionId,
      dwellSeconds,
      productInteracted: active.productInteracted,
      ts: ts.toISOString(),
    })

    await this.checkAlertRule(unitId, active, dwellSeconds)

    this.activeSessions.delete(unitId)
  }

  private async onProductInteracted(unitId: string, ts: Date): Promise<void> {
    const active = this.activeSessions.get(unitId)
    if (!active) return

    active.productInteracted = true

    await this.prisma.presenceSession.update({
      where: { id: active.sessionId },
      data: { productInteracted: true },
    })

    await this.prisma.sessionEvent.create({
      data: { sessionId: active.sessionId, type: 'product_interacted', ts },
    })

    this.broadcaster.broadcast({
      type: 'session_event',
      event: 'product_interacted',
      unitId,
      sessionId: active.sessionId,
      ts: ts.toISOString(),
    })
  }

  private async checkAlertRule(unitId: string, session: ActiveSession, dwellSeconds: number): Promise<void> {
    if (session.alertFired) return

    const rule = await this.prisma.alertRule.findUnique({ where: { unitId } })
    if (!rule || !rule.enabled) return

    const dwellMet = dwellSeconds >= rule.dwellThresholdSeconds
    const interactionMet = !rule.requireInteraction || session.productInteracted

    if (dwellMet && interactionMet) {
      session.alertFired = true
      const reason = rule.requireInteraction && session.productInteracted
        ? 'dwell_and_interaction'
        : session.productInteracted
          ? 'interaction'
          : 'dwell_threshold'

      this.broadcaster.broadcast({
        type: 'alert_fired',
        unitId,
        sessionId: session.sessionId,
        reason,
        ts: new Date().toISOString(),
      })

      const [unit, subscriptions] = await Promise.all([
        this.prisma.sensorUnit.findUnique({ where: { id: unitId } }),
        this.prisma.unitSubscription.findMany({
          where: { unitId },
          include: { user: { select: { phoneNumber: true } } },
        }),
      ])

      const phones = subscriptions
        .map(s => s.user.phoneNumber)
        .filter((p): p is string => p !== null)

      if (unit && phones.length > 0) {
        const body = `Alert: Customer at ${unit.name} — ${dwellSeconds}s dwell${session.productInteracted ? ', product interacted with' : ''}`
        phones.forEach(phone => {
          sendWhatsApp(phone, body).catch(err => {
            console.error('WhatsApp notification failed:', err)
          })
        })
      }
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && npx vitest run src/services/sessionManager.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/sessionManager.ts backend/src/services/sessionManager.test.ts
git commit -m "feat: rename productPickedUp to productInteracted in session manager"
```

---

### Task 5: Sensor ingest route + ping endpoint

**Files:**
- Modify: `backend/src/routes/sensors.ts`
- Modify: `backend/src/routes/sensors.test.ts`

- [ ] **Step 1: Update sensors.test.ts**

Replace the entire file:

```typescript
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
      payload: { unit_id: 'unit-99', ts: Date.now(), tof: [] },
    })
    expect(res.statusCode).toBe(404)
  })

  it('marks the unit as seen on a valid reading', async () => {
    const app = buildApp(registry)
    await app.inject({
      method: 'POST',
      url: '/api/sensors/data',
      payload: { unit_id: 'unit-01', ts: Date.now(), tof: [] },
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx vitest run src/routes/sensors.test.ts
```

Expected: FAIL — old imu schema, missing ping endpoint.

- [ ] **Step 3: Replace sensors.ts**

```typescript
import { Type } from '@fastify/type-provider-typebox'
import type { FastifyPluginAsync } from 'fastify'
import type { UnitRegistry } from '../lib/unitRegistry'
import type { SensorReading, HardwareEvent } from '../types/sensor'
import { isSensorReading } from '../types/sensor'
import type { HealthMonitor } from '../services/healthMonitor'
import { prisma } from '../lib/prisma'

const SensorReadingSchema = Type.Object({
  unit_id: Type.String(),
  ts: Type.Number(),
  tof: Type.Array(Type.Object({
    id: Type.Number(),
    distance_mm: Type.Number(),
    status: Type.Union([Type.Literal('valid'), Type.Literal('out_of_range'), Type.Literal('error')]),
  })),
  imu: Type.Optional(Type.Object({
    vibration_intensity: Type.Number({ minimum: 0 }),
  })),
})

const HardwareEventSchema = Type.Object({
  unit_id: Type.String(),
  ts: Type.Number(),
  event: Type.Union([Type.Literal('imu_shock'), Type.Literal('imu_vibration')]),
  value: Type.Record(Type.String(), Type.Unknown()),
})

const PayloadSchema = Type.Union([SensorReadingSchema, HardwareEventSchema])

const PingSchema = Type.Object({
  unit_id: Type.String(),
})

type PluginOptions = {
  registry: UnitRegistry
  onReading: (unitId: string, reading: SensorReading) => void
  onEvent: (unitId: string, event: HardwareEvent) => void
  healthMonitor: HealthMonitor
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

      const apiKey = request.headers['x-api-key']
      const unit = await prisma.sensorUnit.findUnique({
        where: { id: payload.unit_id },
        select: { apiKey: true },
      })
      if (!unit || unit.apiKey !== apiKey) {
        return reply.status(401).send({ error: 'Invalid API key' })
      }

      opts.registry.markSeen(payload.unit_id)

      if (isSensorReading(payload)) {
        opts.onReading(payload.unit_id, payload)
        opts.healthMonitor.process(payload.unit_id, payload)
      } else {
        opts.onEvent(payload.unit_id, payload)
      }

      return { ok: true }
    }
  )

  fastify.post(
    '/api/sensors/ping',
    { schema: { body: PingSchema } },
    async (request, reply) => {
      const { unit_id } = request.body as { unit_id: string }

      if (!opts.registry.isKnown(unit_id)) {
        return reply.status(404).send({ error: 'Unknown unit_id' })
      }

      const apiKey = request.headers['x-api-key']
      const unit = await prisma.sensorUnit.findUnique({
        where: { id: unit_id },
        select: { apiKey: true },
      })
      if (!unit || unit.apiKey !== apiKey) {
        return reply.status(401).send({ error: 'Invalid API key' })
      }

      opts.registry.markSeen(unit_id)
      return reply.status(204).send()
    }
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && npx vitest run src/routes/sensors.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/sensors.ts backend/src/routes/sensors.test.ts
git commit -m "feat: update sensor ingest schema, add ping endpoint"
```

---

### Task 6: Sessions route

**Files:**
- Modify: `backend/src/routes/sessions.ts`
- Modify: `backend/src/routes/sessions.test.ts`

- [ ] **Step 1: Update sessions.test.ts**

Change every occurrence of `productPickedUp` to `productInteracted` in the test file. The `createMany` data, filter test, and header assertion:

```typescript
// In beforeAll createMany:
{ unitId: UNIT_ID, startedAt: new Date(now.getTime() - 60000), endedAt: now, dwellSeconds: 45, productInteracted: true, status: 'completed' },
{ unitId: UNIT_ID, startedAt: new Date(now.getTime() - 30000), endedAt: now, dwellSeconds: 10, productInteracted: false, status: 'completed' },

// Filter test:
it('filters by productInteracted', async () => {
  const app = await buildApp()
  const res = await app.inject({ method: 'GET', url: '/api/sessions?productInteracted=true' })
  const body = JSON.parse(res.body)
  expect(body.data.every((s: { productInteracted: boolean }) => s.productInteracted === true)).toBe(true)
})

// CSV header assertion (two places):
expect(lines[0]).toBe('id,unitId,unitName,startedAt,endedAt,dwellSeconds,productInteracted')
expect(res.body.trim()).toBe('id,unitId,unitName,startedAt,endedAt,dwellSeconds,productInteracted')
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx vitest run src/routes/sessions.test.ts
```

Expected: FAIL — `productPickedUp` column referenced in schema/queries.

- [ ] **Step 3: Replace sessions.ts**

```typescript
import { Type } from '@fastify/type-provider-typebox'
import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma'
import type { Prisma } from '@prisma/client'

const QuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
  sortBy: Type.Optional(Type.String({ default: 'startedAt' })),
  sortDir: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')], { default: 'desc' })),
  unitId: Type.Optional(Type.String()),
  dateFrom: Type.Optional(Type.String()),
  dateTo: Type.Optional(Type.String()),
  minDwellSeconds: Type.Optional(Type.Integer({ minimum: 0 })),
  productInteracted: Type.Optional(Type.Boolean()),
})

const ExportQuerySchema = Type.Object({
  unitId: Type.Optional(Type.String()),
  dateFrom: Type.Optional(Type.String()),
  dateTo: Type.Optional(Type.String()),
  minDwellSeconds: Type.Optional(Type.Integer({ minimum: 0 })),
  productInteracted: Type.Optional(Type.Boolean()),
})

export function buildWhere(q: Record<string, unknown>): Prisma.PresenceSessionWhereInput {
  const where: Prisma.PresenceSessionWhereInput = { status: 'completed' }
  if (q.unitId) where.unitId = q.unitId as string
  if (q.dateFrom || q.dateTo) {
    where.startedAt = {}
    if (q.dateFrom) where.startedAt.gte = new Date(q.dateFrom as string)
    if (q.dateTo) where.startedAt.lt = new Date(q.dateTo as string)
  }
  if (q.minDwellSeconds !== undefined) where.dwellSeconds = { gte: q.minDwellSeconds as number }
  if (q.productInteracted !== undefined) where.productInteracted = q.productInteracted as boolean
  return where
}

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/sessions/export.csv',
    { schema: { querystring: ExportQuerySchema } },
    async (request, reply) => {
      const q = request.query as Record<string, unknown>
      const where = buildWhere(q)

      const rows = await prisma.presenceSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        include: { unit: { select: { name: true } } },
      })

      const header = 'id,unitId,unitName,startedAt,endedAt,dwellSeconds,productInteracted'
      const body = rows
        .map(r =>
          [
            `"${r.id}"`,
            `"${r.unitId}"`,
            `"${r.unit.name}"`,
            `"${r.startedAt.toISOString()}"`,
            `"${r.endedAt?.toISOString() ?? ''}"`,
            r.dwellSeconds,
            r.productInteracted,
          ].join(',')
        )
        .join('\n')

      const date = new Date().toISOString().slice(0, 10)
      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="sessions-${date}.csv"`)
        .send(rows.length > 0 ? `${header}\n${body}` : header)
    }
  )

  fastify.get(
    '/api/sessions',
    { schema: { querystring: QuerySchema } },
    async (request) => {
      const q = request.query as Record<string, unknown>
      const page = (q.page as number) ?? 1
      const pageSize = (q.pageSize as number) ?? 25
      const sortBy = (q.sortBy as string) ?? 'startedAt'
      const sortDir = (q.sortDir as 'asc' | 'desc') ?? 'desc'
      const where = buildWhere(q)

      const [total, rows] = await Promise.all([
        prisma.presenceSession.count({ where }),
        prisma.presenceSession.findMany({
          where,
          orderBy: { [sortBy]: sortDir },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { unit: { select: { name: true } } },
        }),
      ])

      return {
        data: rows.map(r => ({
          id: r.id,
          unitId: r.unitId,
          unitName: r.unit.name,
          startedAt: r.startedAt.toISOString(),
          endedAt: r.endedAt?.toISOString() ?? null,
          dwellSeconds: r.dwellSeconds,
          productInteracted: r.productInteracted,
          status: r.status,
        })),
        total,
        page,
        pageSize,
        pageCount: Math.ceil(total / pageSize),
      }
    }
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && npx vitest run src/routes/sessions.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/sessions.ts backend/src/routes/sessions.test.ts
git commit -m "feat: rename productPickedUp to productInteracted in sessions route"
```

---

### Task 7: Analytics queries + units route

**Files:**
- Modify: `backend/src/lib/analyticsQueries.ts`
- Modify: `backend/src/routes/units.ts`

- [ ] **Step 1: Replace analyticsQueries.ts**

```typescript
import { prisma } from './prisma'

type WhereParams = { unitId?: string; from?: string; to?: string }

function dateCondition(alias: string, p: WhereParams): string {
  const parts: string[] = [`${alias}.status = 'completed'`]
  if (p.unitId) parts.push(`${alias}."unitId" = '${p.unitId.replace(/'/g, "''")}'`)
  if (p.from) parts.push(`${alias}."startedAt" >= '${p.from}'`)
  if (p.to) parts.push(`${alias}."startedAt" < '${p.to}'`)
  return parts.join(' AND ')
}

export async function getSummary(p: WhereParams) {
  const where = dateCondition('s', p)
  const rows = await prisma.$queryRawUnsafe<{
    totalSessions: bigint
    avgDwellSeconds: number | null
    interactionCount: bigint
    avgDwellWithInteraction: number | null
  }[]>(`
    SELECT
      COUNT(*) as "totalSessions",
      AVG("dwellSeconds") as "avgDwellSeconds",
      SUM(CASE WHEN "productInteracted" = 1 THEN 1 ELSE 0 END) as "interactionCount",
      AVG(CASE WHEN "productInteracted" = 1 THEN "dwellSeconds" END) as "avgDwellWithInteraction"
    FROM "PresenceSession" s
    WHERE ${where}
  `)
  const r = rows[0]
  const total = Number(r.totalSessions)
  return {
    totalSessions: total,
    avgDwellSeconds: r.avgDwellSeconds ? Math.round(r.avgDwellSeconds) : 0,
    interactionRate: total > 0 ? Number(r.interactionCount) / total : 0,
    avgDwellWithInteraction: r.avgDwellWithInteraction ? Math.round(r.avgDwellWithInteraction) : 0,
  }
}

export async function getDailyStats(p: WhereParams) {
  const where = dateCondition('s', p)
  const rows = await prisma.$queryRawUnsafe<{ date: string; sessions: bigint; interactions: bigint }[]>(`
    SELECT
      date("startedAt") as date,
      COUNT(*) as sessions,
      SUM(CASE WHEN "productInteracted" = 1 THEN 1 ELSE 0 END) as interactions
    FROM "PresenceSession" s
    WHERE ${where}
    GROUP BY date("startedAt")
    ORDER BY date("startedAt") ASC
  `)
  return rows.map(r => ({ date: r.date, sessions: Number(r.sessions), interactions: Number(r.interactions) }))
}

export async function getHeatmap(p: WhereParams) {
  const where = dateCondition('s', p)
  const rows = await prisma.$queryRawUnsafe<{ dow: string; hour: string; sessions: bigint }[]>(`
    SELECT
      strftime('%w', "startedAt") as dow,
      strftime('%H', "startedAt") as hour,
      COUNT(*) as sessions
    FROM "PresenceSession" s
    WHERE ${where}
    GROUP BY dow, hour
  `)
  return rows.map(r => ({ dayOfWeek: Number(r.dow), hour: Number(r.hour), sessions: Number(r.sessions) }))
}

export async function getDwellTrend(p: WhereParams) {
  const where = dateCondition('s', p)
  const rows = await prisma.$queryRawUnsafe<{ date: string; avgDwell: number }[]>(`
    SELECT
      date("startedAt") as date,
      AVG("dwellSeconds") as "avgDwell"
    FROM "PresenceSession" s
    WHERE ${where}
    GROUP BY date("startedAt")
    ORDER BY date("startedAt") ASC
  `)
  return rows.map(r => ({ date: r.date, avgDwellSeconds: Math.round(r.avgDwell) }))
}
```

- [ ] **Step 2: Update units.ts — rename config fields in PatchConfigBody, add sensor CRUD, include tofSensors in GET**

Replace the entire `units.ts`:

```typescript
import { randomBytes } from 'node:crypto'
import { Type, type Static } from '@fastify/type-provider-typebox'
import type { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import type { UnitRegistry } from '../lib/unitRegistry'
import type { DetectionEngine } from '../services/detectionEngine'

const DEFAULT_TOF_LABELS = ['left-wide', 'left', 'center-left', 'center-right', 'right', 'right-wide']

function generateApiKey(): string {
  return randomBytes(24).toString('hex')
}

const CreateUnitBody = Type.Object({
  id: Type.String({ minLength: 3, maxLength: 32 }),
  location: Type.String({ minLength: 1 }),
  productName: Type.String({ minLength: 1 }),
})

type PluginOptions = { registry: UnitRegistry; engine: DetectionEngine }

export const unitRoutes: FastifyPluginAsync<PluginOptions> = async (fastify, opts) => {
  fastify.post(
    '/api/units',
    { schema: { body: CreateUnitBody } },
    async (request, reply) => {
      const { id, location, productName } = request.body as Static<typeof CreateUnitBody>

      const existing = await prisma.sensorUnit.findUnique({ where: { id } })
      if (existing) return reply.status(409).send({ error: 'Unit ID already exists' })

      const unit = await prisma.sensorUnit.create({
        data: {
          id, name: productName, location, productName,
          apiKey: generateApiKey(),
          configuration: { create: {} },
          alertRule: { create: {} },
          tofSensors: {
            create: DEFAULT_TOF_LABELS.map((label, i) => ({
              index: i + 1,
              label,
              minDist: 50,
              maxDist: 1000,
            })),
          },
        },
      })

      opts.registry.register(unit.id)
      return reply.status(201).send(unit)
    }
  )

  fastify.get('/api/units', async () => {
    const units = await prisma.sensorUnit.findMany({
      orderBy: { createdAt: 'asc' },
      include: { tofSensors: { orderBy: { index: 'asc' } } },
    })
    return {
      units: units.map(u => {
        const status = opts.registry.getStatus(u.id)
        return { ...u, online: status?.online ?? false, lastSeen: status?.lastSeen ?? null }
      }),
    }
  })

  const PatchUnitBody = Type.Object({
    location: Type.Optional(Type.String({ minLength: 1 })),
    productName: Type.Optional(Type.String({ minLength: 1 })),
  })

  fastify.patch(
    '/api/units/:unitId',
    { schema: { body: PatchUnitBody } },
    async (request, reply) => {
      const { unitId } = request.params as { unitId: string }
      const body = request.body as Static<typeof PatchUnitBody>
      const data = { ...body, ...(body.productName && { name: body.productName }) }
      try {
        const unit = await prisma.sensorUnit.update({ where: { id: unitId }, data })
        return reply.send(unit)
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
          return reply.status(404).send({ error: 'Unit not found' })
        }
        throw e
      }
    }
  )

  fastify.delete('/api/units/:unitId', async (request, reply) => {
    const { unitId } = request.params as { unitId: string }
    try {
      await prisma.sensorUnit.delete({ where: { id: unitId } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        return reply.status(404).send({ error: 'Unit not found' })
      }
      throw e
    }
    return reply.send({ ok: true })
  })

  fastify.get('/api/units/:unitId/config', async (request, reply) => {
    const { unitId } = request.params as { unitId: string }
    const [configuration, sensors, alertRule] = await Promise.all([
      prisma.unitConfiguration.findUnique({ where: { unitId } }),
      prisma.tofSensor.findMany({ where: { unitId }, orderBy: { index: 'asc' } }),
      prisma.alertRule.findUnique({ where: { unitId } }),
    ])
    if (!configuration) return reply.status(404).send({ error: 'Unit not found' })
    return { configuration, sensors, alertRule }
  })

  fastify.get('/api/units/:unitId/sensors', async (request, reply) => {
    const { unitId } = request.params as { unitId: string }
    const sensors = await prisma.tofSensor.findMany({ where: { unitId }, orderBy: { index: 'asc' } })
    if (!sensors.length) return reply.status(404).send({ error: 'Unit not found' })
    return { sensors }
  })

  const AddSensorBody = Type.Object({
    label: Type.String({ minLength: 1 }),
    minDist: Type.Optional(Type.Number({ minimum: 10, maximum: 500 })),
    maxDist: Type.Optional(Type.Number({ minimum: 100, maximum: 4000 })),
  })

  fastify.post(
    '/api/units/:unitId/sensors',
    { schema: { body: AddSensorBody } },
    async (request, reply) => {
      const { unitId } = request.params as { unitId: string }
      const body = request.body as Static<typeof AddSensorBody>

      const existing = await prisma.tofSensor.findMany({ where: { unitId }, orderBy: { index: 'asc' } })
      if (existing.length >= 6) {
        return reply.status(400).send({ error: 'Maximum 6 sensors per unit' })
      }

      const nextIndex = existing.length > 0 ? Math.max(...existing.map(s => s.index)) + 1 : 1
      const sensor = await prisma.tofSensor.create({
        data: {
          unitId,
          index: nextIndex,
          label: body.label,
          minDist: body.minDist ?? 50,
          maxDist: body.maxDist ?? 1000,
        },
      })

      const [cfg, sensors] = await Promise.all([
        prisma.unitConfiguration.findUnique({ where: { unitId } }),
        prisma.tofSensor.findMany({ where: { unitId } }),
      ])
      if (cfg) opts.engine.updateConfig(unitId, cfg, sensors)

      return reply.status(201).send(sensor)
    }
  )

  fastify.delete('/api/units/:unitId/sensors/:index', async (request, reply) => {
    const { unitId, index } = request.params as { unitId: string; index: string }
    const sensorIndex = parseInt(index, 10)

    const existing = await prisma.tofSensor.findMany({ where: { unitId } })
    if (existing.length <= 1) {
      return reply.status(400).send({ error: 'Unit must have at least 1 sensor' })
    }

    try {
      await prisma.tofSensor.deleteMany({ where: { unitId, index: sensorIndex } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        return reply.status(404).send({ error: 'Sensor not found' })
      }
      throw e
    }

    const [cfg, sensors] = await Promise.all([
      prisma.unitConfiguration.findUnique({ where: { unitId } }),
      prisma.tofSensor.findMany({ where: { unitId } }),
    ])
    if (cfg) opts.engine.updateConfig(unitId, cfg, sensors)

    return reply.send({ ok: true })
  })

  fastify.get('/api/units/:unitId/api-key', async (request, reply) => {
    const { unitId } = request.params as { unitId: string }
    const unit = await prisma.sensorUnit.findUnique({ where: { id: unitId }, select: { apiKey: true } })
    if (!unit) return reply.status(404).send({ error: 'Unit not found' })
    return { apiKey: unit.apiKey }
  })

  const PatchConfigBody = Type.Object({
    configuration: Type.Optional(Type.Partial(Type.Object({
      minSensorAgreement: Type.Number({ minimum: 1, maximum: 6 }),
      departureTimeoutSeconds: Type.Number({ minimum: 1, maximum: 30 }),
      dwellMinSeconds: Type.Number({ minimum: 1, maximum: 30 }),
      imuVibrationThreshold: Type.Number({ minimum: 0, maximum: 5 }),
      imuEnabled: Type.Boolean(),
      imuDurationThresholdMs: Type.Number({ minimum: 100, maximum: 2000 }),
    }))),
    sensors: Type.Optional(Type.Array(Type.Object({
      index: Type.Number(),
      label: Type.Optional(Type.String()),
      minDist: Type.Optional(Type.Number({ minimum: 10, maximum: 500 })),
      maxDist: Type.Optional(Type.Number({ minimum: 100, maximum: 4000 })),
    }))),
    alertRule: Type.Optional(Type.Partial(Type.Object({
      dwellThresholdSeconds: Type.Number({ minimum: 1 }),
      requireInteraction: Type.Boolean(),
      enabled: Type.Boolean(),
    }))),
  })

  fastify.patch(
    '/api/units/:unitId/config',
    { schema: { body: PatchConfigBody } },
    async (request, reply) => {
      const { unitId } = request.params as { unitId: string }
      const body = request.body as Static<typeof PatchConfigBody>

      await prisma.$transaction(async tx => {
        if (body.configuration) {
          await tx.unitConfiguration.update({ where: { unitId }, data: body.configuration })
        }
        if (body.sensors) {
          for (const s of body.sensors) {
            await tx.tofSensor.updateMany({
              where: { unitId, index: s.index },
              data: {
                ...(s.label !== undefined && { label: s.label }),
                ...(s.minDist !== undefined && { minDist: s.minDist }),
                ...(s.maxDist !== undefined && { maxDist: s.maxDist }),
              },
            })
          }
        }
        if (body.alertRule) {
          await tx.alertRule.update({ where: { unitId }, data: body.alertRule })
        }
      })

      const [cfg, sensors] = await Promise.all([
        prisma.unitConfiguration.findUnique({ where: { unitId } }),
        prisma.tofSensor.findMany({ where: { unitId } }),
      ])
      if (cfg) opts.engine.updateConfig(unitId, cfg, sensors)

      return reply.send({ ok: true })
    }
  )
}
```

- [ ] **Step 3: Run all backend tests**

```bash
cd backend && npx vitest run
```

Expected: all tests PASS (units.test.ts may need updating — see next step if any fail).

- [ ] **Step 4: If units.test.ts fails, check what assertions reference old field names and update them**

Open `backend/src/routes/units.test.ts` and replace any `imuPickupThresholdG`, `imuExaminationEnabled`, `requirePickup`, `productPickedUp` with the new names. Then re-run:

```bash
cd backend && npx vitest run src/routes/units.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/analyticsQueries.ts backend/src/routes/units.ts backend/src/routes/units.test.ts
git commit -m "feat: rename analytics fields, add sensor CRUD, include tofSensors in GET /api/units"
```

---

### Task 8: Update index.ts

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Update index.ts**

Add `POST /api/sensors/ping` to `PUBLIC_ROUTES` and update the `onReading` broadcast to handle optional `imu`:

```typescript
const PUBLIC_ROUTES = new Set([
  'POST /api/auth/login',
  'POST /api/auth/register',
  'GET /api/auth/setup-status',
  'POST /api/sensors/data',
  'POST /api/sensors/ping',
  'GET /ws',
])
```

Update the `onReading` callback in the `sensorRoutes` registration:

```typescript
onReading: (unitId, reading) => {
  broadcaster.broadcast({
    type: 'sensor_reading',
    unitId,
    ts: new Date().toISOString(),
    tof: reading.tof,
    ...(reading.imu !== undefined && { imu: reading.imu }),
  })
  engine.process(unitId, reading)
},
```

- [ ] **Step 2: Run all backend tests**

```bash
cd backend && npx vitest run
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: add ping to public routes, handle optional imu in broadcast"
```

---

### Task 9: Frontend types and hooks

**Files:**
- Modify: `frontend/src/lib/wsStore.ts`
- Modify: `frontend/src/hooks/useUnitConfig.ts`
- Modify: `frontend/src/hooks/useSessions.ts`
- Modify: `frontend/src/hooks/useUnits.ts`

- [ ] **Step 1: Replace wsStore.ts**

```typescript
import { create } from 'zustand'

export type TofReading = { id: number; distance_mm: number; status: 'valid' | 'out_of_range' | 'error' }
export type ImuReading = { vibration_intensity: number }

export type PresenceState = 'idle' | 'pending' | 'active' | 'departing'

export type UnitLiveState = {
  unitId: string
  status: 'online' | 'offline'
  lastSeen: string | null
  presenceState: PresenceState
  tof: TofReading[]
  imu: ImuReading | null
  lastEvent: { event: string; ts: string } | null
}

export type EventFeedEntry = {
  id: string
  unitId: string
  event: string
  ts: string
  dwellSeconds?: number
  productInteracted?: boolean
}

export type ActiveAlert = {
  id: string
  unitId: string
  reason: string
  ts: string
  snoozedUntil?: number
}

export type HealthWarning = { condition: string; sensorIndex?: number; message: string; ts: string }

export type WsStore = {
  connected: boolean
  units: Record<string, UnitLiveState>
  activeAlerts: ActiveAlert[]
  eventFeed: EventFeedEntry[]
  healthWarnings: Record<string, HealthWarning[]>
  setConnected: (v: boolean) => void
  handleMessage: (msg: Record<string, unknown>) => void
  dismissAlert: (sessionId: string) => void
  snoozeAlert: (sessionId: string, ms: number) => void
  dismissHealthWarning: (unitId: string, condition: string, sensorIndex?: number) => void
}

export const useWsStore = create<WsStore>((set) => ({
  connected: false,
  units: {},
  activeAlerts: [],
  eventFeed: [],
  healthWarnings: {},

  setConnected: (connected) => set({ connected }),

  handleMessage: (msg) => {
    const type = msg.type as string
    const unitId = msg.unitId as string

    if (type === 'sensor_reading') {
      set(state => ({
        units: {
          ...state.units,
          [unitId]: {
            ...state.units[unitId],
            unitId,
            status: 'online',
            lastSeen: msg.ts as string,
            presenceState: (msg.presenceState as PresenceState) ?? state.units[unitId]?.presenceState ?? 'idle',
            tof: msg.tof as TofReading[],
            imu: (msg.imu as ImuReading) ?? null,
            lastEvent: state.units[unitId]?.lastEvent ?? null,
          },
        },
      }))
    } else if (type === 'session_event') {
      const entry: EventFeedEntry = {
        id: `${msg.sessionId as string}-${msg.event as string}-${msg.ts as string}`,
        unitId,
        event: msg.event as string,
        ts: msg.ts as string,
        dwellSeconds: msg.dwellSeconds as number | undefined,
        productInteracted: msg.productInteracted as boolean | undefined,
      }
      set(state => ({
        units: {
          ...state.units,
          [unitId]: {
            ...state.units[unitId],
            unitId,
            lastEvent: { event: msg.event as string, ts: msg.ts as string },
          },
        },
        eventFeed: [entry, ...state.eventFeed].slice(0, 200),
      }))
    } else if (type === 'unit_status') {
      set(state => ({
        units: {
          ...state.units,
          [unitId]: {
            ...state.units[unitId],
            unitId,
            status: msg.status as 'online' | 'offline',
            lastSeen: msg.lastSeen as string,
          },
        },
      }))
    } else if (type === 'alert_fired') {
      set(state => ({
        activeAlerts: [
          ...state.activeAlerts,
          { id: msg.sessionId as string, unitId, reason: msg.reason as string, ts: msg.ts as string },
        ],
      }))
    } else if (type === 'health_alert') {
      const warning: HealthWarning = {
        condition: msg.condition as string,
        sensorIndex: msg.sensorIndex as number | undefined,
        message: msg.message as string,
        ts: msg.ts as string,
      }
      set(state => ({
        healthWarnings: {
          ...state.healthWarnings,
          [unitId]: [
            ...(state.healthWarnings[unitId] ?? []).filter(
              w => !(w.condition === warning.condition && w.sensorIndex === warning.sensorIndex)
            ),
            warning,
          ],
        },
      }))
    } else if (type === 'health_alert_cleared') {
      const condition = msg.condition as string
      const sensorIndex = msg.sensorIndex as number | undefined
      set(state => ({
        healthWarnings: {
          ...state.healthWarnings,
          [unitId]: (state.healthWarnings[unitId] ?? []).filter(
            w => !(w.condition === condition && w.sensorIndex === sensorIndex)
          ),
        },
      }))
    }
  },

  dismissAlert: (sessionId) =>
    set(state => ({ activeAlerts: state.activeAlerts.filter(a => a.id !== sessionId) })),

  snoozeAlert: (sessionId, ms) =>
    set(state => ({
      activeAlerts: state.activeAlerts.map(a =>
        a.id === sessionId ? { ...a, snoozedUntil: Date.now() + ms } : a
      ),
    })),

  dismissHealthWarning: (unitId, condition, sensorIndex) =>
    set(state => ({
      healthWarnings: {
        ...state.healthWarnings,
        [unitId]: (state.healthWarnings[unitId] ?? []).filter(
          w => !(w.condition === condition && w.sensorIndex === sensorIndex)
        ),
      },
    })),
}))
```

- [ ] **Step 2: Update useUnitConfig.ts**

Replace the `UnitConfig` and `AlertRuleConfig` types and update the `FullConfig` type:

```typescript
export type TofSensorConfig = {
  id: string; index: number; label: string; minDist: number; maxDist: number
}
export type UnitConfig = {
  id: string; minSensorAgreement: number; departureTimeoutSeconds: number
  dwellMinSeconds: number;
  imuVibrationThreshold: number; imuEnabled: boolean; imuDurationThresholdMs: number
}
export type AlertRuleConfig = {
  id: string; dwellThresholdSeconds: number; requireInteraction: boolean; enabled: boolean
}

export type FullConfig = { configuration: UnitConfig; sensors: TofSensorConfig[]; alertRule: AlertRuleConfig }
```

Keep the rest of the file (`useUnitConfig` function body) unchanged, but add `reload` to the return:

```typescript
return { config, loading, error, saving, saved, save, reload: load }
```

- [ ] **Step 3: Update useSessions.ts**

Change the `Session` type — `productPickedUp` → `productInteracted`:

```typescript
export type Session = {
  id: string; unitId: string; unitName: string; startedAt: string
  endedAt: string | null; dwellSeconds: number; productInteracted: boolean
}
```

- [ ] **Step 4: Update useAnalytics.ts — rename summary type fields**

Open `frontend/src/hooks/useAnalytics.ts`. Find the summary type (or inline type) and rename `pickupRate` → `interactionRate` and `avgDwellWithPickup` → `avgDwellWithInteraction`. Example — if the file contains:

```typescript
type Summary = { totalSessions: number; avgDwellSeconds: number; pickupRate: number; avgDwellWithPickup: number }
```

Change it to:

```typescript
type Summary = { totalSessions: number; avgDwellSeconds: number; interactionRate: number; avgDwellWithInteraction: number }
```

- [ ] **Step 5: Update useUnits.ts**

Add `tofSensors` to the `Unit` type:

```typescript
export type TofSensorConfig = {
  id: string; index: number; label: string; minDist: number; maxDist: number
}

export type Unit = {
  id: string
  name: string
  location: string
  productName: string
  online: boolean
  lastSeen: string | null
  createdAt: string
  tofSensors: TofSensorConfig[]
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/wsStore.ts frontend/src/hooks/useUnitConfig.ts frontend/src/hooks/useSessions.ts frontend/src/hooks/useUnits.ts frontend/src/hooks/useAnalytics.ts
git commit -m "feat: update frontend types for renamed fields and new IMU shape"
```

---

### Task 10: Frontend components

**Files:**
- Modify: `frontend/src/components/ImuBadge.tsx`
- Modify: `frontend/src/components/SensorUnitCard.tsx`
- Modify: `frontend/src/components/SummaryCards.tsx`
- Modify: `frontend/src/components/SessionTable.tsx`
- Modify: `frontend/src/components/SessionFilters.tsx`

- [ ] **Step 1: Replace ImuBadge.tsx**

```tsx
type Props = { lastEvent: string | null }
export function ImuBadge({ lastEvent }: Props) {
  const label = lastEvent === 'imu_vibration' ? 'Vibration' : lastEvent === 'imu_shock' ? 'Shock' : 'Idle'
  const colour = lastEvent ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400'
  return <span className={`text-xs px-2 py-0.5 rounded-full ${colour}`}>IMU {label}</span>
}
```

- [ ] **Step 2: Replace SensorUnitCard.tsx**

Remove `DEFAULT_CONFIGS`, accept `tofSensors` as a prop, pass them to `TofGrid`:

```tsx
import { Link } from 'react-router-dom'
import { useWsStore } from '../lib/wsStore'
import { TofGrid } from './TofGrid'
import { ImuBadge } from './ImuBadge'
import { HealthWarningBar } from './HealthWarningBar'

const PRESENCE_LABELS: Record<string, string> = {
  idle: 'Idle', pending: 'Detecting…', active: 'Person Present', departing: 'Leaving…',
}
const PRESENCE_COLOURS: Record<string, string> = {
  idle: 'bg-gray-700 text-gray-400', pending: 'bg-yellow-600 text-white',
  active: 'bg-green-600 text-white', departing: 'bg-orange-500 text-white',
}

type TofSensorConfig = { index: number; label: string; maxDist: number }

type Props = {
  unitId: string
  unitName: string
  tofSensors: TofSensorConfig[]
  subscribed: boolean
  onSubscribeToggle: (unitId: string, subscribed: boolean) => void
}

export function SensorUnitCard({ unitId, unitName, tofSensors, subscribed, onSubscribeToggle }: Props) {
  const unit = useWsStore(s => s.units[unitId])

  const presenceState = unit?.presenceState ?? 'idle'
  const online = unit?.status === 'online'

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-semibold">{unitName}</span>
          <span className="text-gray-400 text-xs ml-2">{unitId}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onSubscribeToggle(unitId, subscribed)}
            title={subscribed ? 'Unsubscribe from alerts' : 'Subscribe to alerts'}
            className="text-lg leading-none"
          >
            {subscribed ? '🔔' : '🔕'}
          </button>
          <span className={`flex items-center gap-1 text-xs ${online ? 'text-green-400' : 'text-gray-500'}`}>
            <span className={`w-2 h-2 rounded-full ${online ? 'bg-green-400' : 'bg-gray-500'}`} />
            {online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      <HealthWarningBar unitId={unitId} />

      <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${PRESENCE_COLOURS[presenceState]}`}>
        {PRESENCE_LABELS[presenceState]}
      </span>

      <TofGrid readings={unit?.tof ?? []} configs={tofSensors} />

      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <ImuBadge lastEvent={unit?.lastEvent?.event ?? null} />
        </div>
        <Link
          to={`/setup/units/${unitId}/configure`}
          className="text-blue-400 hover:text-blue-300 text-xs"
        >
          Configure ▸
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Replace SummaryCards.tsx**

```tsx
type Summary = {
  totalSessions: number
  avgDwellSeconds: number
  interactionRate: number
  avgDwellWithInteraction: number
}

function formatDwell(s: number) {
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

type Props = { summary: Summary }

export function SummaryCards({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-gray-800 rounded-lg p-4">
        <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Total Sessions</p>
        <p className="text-2xl font-bold">{summary.totalSessions}</p>
      </div>
      <div className="bg-gray-800 rounded-lg p-4">
        <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Avg Dwell</p>
        <p className="text-2xl font-bold">{formatDwell(summary.avgDwellSeconds)}</p>
      </div>
      <div className="bg-gray-800 rounded-lg p-4">
        <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Interaction Rate</p>
        <p className="text-2xl font-bold">{(summary.interactionRate * 100).toFixed(1)}%</p>
      </div>
      <div className="bg-gray-800 rounded-lg p-4">
        <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Avg Dwell (Interaction)</p>
        <p className="text-2xl font-bold">{formatDwell(summary.avgDwellWithInteraction)}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Replace SessionTable.tsx**

```tsx
import type { Session } from '../hooks/useSessions'

function formatDwell(s: number) {
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

type Props = { sessions: Session[]; sortBy: string; sortDir: string; onSort: (col: string) => void }

export function SessionTable({ sessions, sortBy, sortDir, onSort }: Props) {
  const arrow = (col: string) => sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-400 border-b border-gray-700">
          {[['unitName','Unit'],['startedAt','Started'],['dwellSeconds','Dwell'],['productInteracted','Interacted']].map(([col, label]) => (
            <th
              key={col}
              onClick={() => onSort(col)}
              className="pb-2 pr-4 cursor-pointer hover:text-white select-none"
            >
              {label}{arrow(col)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sessions.map(s => (
          <tr key={s.id} className="border-b border-gray-800">
            <td className="py-2 pr-4">{s.unitName}</td>
            <td className="py-2 pr-4 text-gray-300 tabular-nums">{new Date(s.startedAt).toLocaleString()}</td>
            <td className="py-2 pr-4 tabular-nums">{formatDwell(s.dwellSeconds)}</td>
            <td className={`py-2 ${s.productInteracted ? 'text-green-400' : 'text-gray-500'}`}>
              {s.productInteracted ? 'Yes' : 'No'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 5: Replace SessionFilters.tsx**

```tsx
type Props = {
  params: URLSearchParams
  onFilter: (key: string, value: string | null) => void
}

export function SessionFilters({ params, onFilter }: Props) {
  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <input
        type="date"
        value={params.get('dateFrom') ?? ''}
        onChange={e => onFilter('dateFrom', e.target.value || null)}
        className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
        placeholder="From"
      />
      <input
        type="date"
        value={params.get('dateTo') ?? ''}
        onChange={e => onFilter('dateTo', e.target.value || null)}
        className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
        placeholder="To"
      />
      <input
        type="number"
        min={0}
        value={params.get('minDwellSeconds') ?? ''}
        onChange={e => onFilter('minDwellSeconds', e.target.value || null)}
        placeholder="Min dwell (s)"
        className="bg-gray-700 text-white rounded px-2 py-1 text-sm w-32"
      />
      <select
        value={params.get('productInteracted') ?? ''}
        onChange={e => onFilter('productInteracted', e.target.value || null)}
        className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
      >
        <option value="">Interacted: All</option>
        <option value="true">Interacted: Yes</option>
        <option value="false">Interacted: No</option>
      </select>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ImuBadge.tsx frontend/src/components/SensorUnitCard.tsx frontend/src/components/SummaryCards.tsx frontend/src/components/SessionTable.tsx frontend/src/components/SessionFilters.tsx
git commit -m "feat: update frontend components for renamed fields and dynamic ToF grid"
```

---

### Task 11: Frontend pages

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/pages/ConfigurePage.tsx`

- [ ] **Step 1: Update DashboardPage.tsx**

Pass `tofSensors` from the unit to `SensorUnitCard`:

```tsx
{registeredUnits.map(u => (
  <SensorUnitCard
    key={u.id}
    unitId={u.id}
    unitName={u.name}
    tofSensors={u.tofSensors}
    subscribed={subscribedUnitIds.has(u.id)}
    onSubscribeToggle={handleSubscribeToggle}
  />
))}
```

- [ ] **Step 2: Replace ConfigurePage.tsx**

```tsx
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useUnitConfig } from '../hooks/useUnitConfig'
import type { FullConfig } from '../hooks/useUnitConfig'
import { apiFetch } from '../lib/api'
import { Tooltip } from '../components/Tooltip'

type Subscriber = {
  userId: string
  email: string
  phoneNumber: string | null
  createdAt: string
}

type UserOption = {
  id: string
  email: string
  phoneNumber: string | null
}

export function ConfigurePage() {
  const { unitId } = useParams<{ unitId: string }>()
  const { config, loading, saving, saved, error, save, reload } = useUnitConfig(unitId!)
  const [draft, setDraft] = useState<FullConfig | null>(null)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [keyCopied, setKeyCopied] = useState(false)

  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [allUsers, setAllUsers] = useState<UserOption[]>([])
  const [addUserId, setAddUserId] = useState('')

  const loadSubscribers = () =>
    apiFetch<{ subscribers: Subscriber[] }>(`/api/units/${unitId}/subscriptions`)
      .then(d => setSubscribers(d.subscribers))
      .catch((err: unknown) => { console.error('Failed to load subscribers:', err) })

  useEffect(() => {
    loadSubscribers()
    apiFetch<{ users: UserOption[] }>('/api/users')
      .then(d => setAllUsers(d.users))
      .catch((err: unknown) => { console.error('Failed to load users:', err) })
  }, [unitId])

  const handleAddSubscriber = async () => {
    if (!addUserId) return
    try {
      await apiFetch(`/api/units/${unitId}/subscriptions/${addUserId}`, { method: 'POST' })
      setAddUserId('')
      await loadSubscribers()
    } catch (err: unknown) {
      console.error('Failed to add subscriber:', err)
    }
  }

  const handleRemoveSubscriber = async (userId: string) => {
    try {
      await apiFetch(`/api/units/${unitId}/subscriptions/${userId}`, { method: 'DELETE' })
      await loadSubscribers()
    } catch (err: unknown) {
      console.error('Failed to remove subscriber:', err)
    }
  }

  useEffect(() => { if (config) setDraft(config) }, [config])

  useEffect(() => {
    apiFetch<{ apiKey: string }>(`/api/units/${unitId}/api-key`)
      .then(d => setApiKey(d.apiKey))
      .catch(() => {})
  }, [unitId])

  const copyKey = () => {
    if (!apiKey) return
    navigator.clipboard.writeText(apiKey).then(() => {
      setKeyCopied(true)
      setTimeout(() => setKeyCopied(false), 2000)
    })
  }

  const handleAddSensor = async () => {
    if (!draft || draft.sensors.length >= 6) return
    try {
      await apiFetch(`/api/units/${unitId}/sensors`, {
        method: 'POST',
        body: JSON.stringify({ label: `sensor-${draft.sensors.length + 1}`, minDist: 50, maxDist: 1000 }),
      })
      await reload()
    } catch (err: unknown) {
      console.error('Failed to add sensor:', err)
    }
  }

  const handleRemoveSensor = async (index: number) => {
    if (!draft || draft.sensors.length <= 1) return
    try {
      await apiFetch(`/api/units/${unitId}/sensors/${index}`, { method: 'DELETE' })
      await reload()
    } catch (err: unknown) {
      console.error('Failed to remove sensor:', err)
    }
  }

  if (loading || !draft) return <div className="p-6">Loading…</div>
  if (error) return <div className="p-6 text-red-400">{error}</div>

  const setConfig = (field: keyof FullConfig['configuration'], value: number | boolean) =>
    setDraft(d => d ? { ...d, configuration: { ...d.configuration, [field]: value } } : d)

  const setAlert = (field: keyof FullConfig['alertRule'], value: number | boolean) =>
    setDraft(d => d ? { ...d, alertRule: { ...d.alertRule, [field]: value } } : d)

  const setSensor = (index: number, field: 'label' | 'minDist' | 'maxDist', value: string | number) =>
    setDraft(d => d ? {
      ...d,
      sensors: d.sensors.map(s => s.index === index ? { ...s, [field]: value } : s),
    } : d)

  const handleSave = async () => {
    if (!draft) return
    await save({
      configuration: draft.configuration,
      sensors: draft.sensors.map(s => ({ index: s.index, label: s.label, minDist: s.minDist, maxDist: s.maxDist })),
      alertRule: draft.alertRule,
    })
  }

  const numInput = (value: number, onChange: (v: number) => void, min: number, max: number) => (
    <input
      type="number" min={min} max={max} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-24 bg-gray-700 text-white rounded px-2 py-1 text-sm"
    />
  )

  const toggle = (checked: boolean, onChange: (v: boolean) => void) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-600'}`}
    >
      <span className={`block w-4 h-4 bg-white rounded-full mx-1 transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  )

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Link to="/setup/units" className="text-gray-400 hover:text-white text-sm">← Units</Link>
          <h1 className="text-2xl font-bold">Configure {unitId}</h1>
        </div>

        {/* ToF Sensors */}
        <section>
          <h2 className="text-lg font-semibold mb-3">ToF Sensors</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-left">
                <th className="pb-2">Index</th>
                <th className="pb-2">Label<Tooltip text="A human-readable name for this sensor, shown in calibration view." /></th>
                <th className="pb-2">Min (mm)<Tooltip text="Minimum distance a reading must be to count as a detection." /></th>
                <th className="pb-2">Max (mm)<Tooltip text="Maximum distance a reading counts as a detection." /></th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {draft.sensors.map(s => (
                <tr key={s.index} className="border-t border-gray-800">
                  <td className="py-2 pr-4 text-gray-400">{s.index}</td>
                  <td className="py-2 pr-4"><input value={s.label} onChange={e => setSensor(s.index, 'label', e.target.value)} className="bg-gray-700 text-white rounded px-2 py-1 text-sm w-36" /></td>
                  <td className="py-2 pr-4">{numInput(s.minDist, v => setSensor(s.index, 'minDist', v), 10, 500)}</td>
                  <td className="py-2">{numInput(s.maxDist, v => setSensor(s.index, 'maxDist', v), 100, 4000)}</td>
                  <td className="py-2 pl-2">
                    <button
                      type="button"
                      onClick={() => handleRemoveSensor(s.index)}
                      disabled={draft.sensors.length <= 1}
                      className="text-red-400 hover:text-red-300 text-xs disabled:opacity-30"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-4 mt-2">
            <button
              type="button"
              onClick={handleAddSensor}
              disabled={draft.sensors.length >= 6}
              className="text-blue-400 hover:text-blue-300 text-xs disabled:opacity-30"
            >
              + Add sensor
            </button>
            <Link to={`/calibrate/${unitId}`} target="_blank" className="text-blue-400 text-xs hover:text-blue-300">Open Calibration Mode ↗</Link>
          </div>
        </section>

        {/* Detection Logic */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Detection Logic</h2>
          <div className="space-y-3">
            {([
              ['Min sensor agreement', 'minSensorAgreement', 1, 6, 'How many ToF sensors must simultaneously detect presence.'],
              ['Dwell minimum (s)', 'dwellMinSeconds', 1, 30, 'How long presence must be continuously detected before a session starts.'],
              ['Departure timeout (s)', 'departureTimeoutSeconds', 1, 30, 'How long absence must persist before the session ends.'],
            ] as [string, keyof FullConfig['configuration'], number, number, string][]).map(([label, field, min, max, tip]) => (
              <div key={field} className="flex items-center justify-between">
                <span className="text-gray-300 text-sm flex items-center">{label}<Tooltip text={tip} /></span>
                {numInput(draft.configuration[field] as number, v => setConfig(field, v), min, max)}
              </div>
            ))}
          </div>
        </section>

        {/* IMU */}
        <section>
          <h2 className="text-lg font-semibold mb-3">IMU</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-300 text-sm flex items-center">IMU enabled<Tooltip text="Enable vibration-based product interaction detection. Disable if no IMU is installed." /></span>
              {toggle(draft.configuration.imuEnabled, v => setConfig('imuEnabled', v))}
            </div>
            {draft.configuration.imuEnabled && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 text-sm flex items-center">Vibration threshold (g RMS)<Tooltip text="Minimum vibration intensity (g RMS) the IMU must measure to register a product interaction event." /></span>
                  {numInput(draft.configuration.imuVibrationThreshold, v => setConfig('imuVibrationThreshold', v), 0, 5)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 text-sm flex items-center">Duration threshold (ms)<Tooltip text="How long the vibration must be sustained to count as a product interaction event." /></span>
                  {numInput(draft.configuration.imuDurationThresholdMs, v => setConfig('imuDurationThresholdMs', v), 100, 2000)}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Alert Rule */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Alert Rule</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm flex items-center">Alert enabled<Tooltip text="When enabled, a WhatsApp alert is sent to all subscribers when the rule conditions are met." /></span>{toggle(draft.alertRule.enabled, v => setAlert('enabled', v))}</div>
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm flex items-center">Dwell threshold (s)<Tooltip text="Customer must be present for at least this many seconds before an alert is sent." /></span>{numInput(draft.alertRule.dwellThresholdSeconds, v => setAlert('dwellThresholdSeconds', v), 1, 300)}</div>
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm flex items-center">Require interaction<Tooltip text="If enabled, the alert only fires if the customer also interacted with the product." /></span>{toggle(draft.alertRule.requireInteraction, v => setAlert('requireInteraction', v))}</div>
          </div>
        </section>

        {/* Notifications */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Notifications</h2>
          <p className="text-gray-400 text-sm mb-3">
            Users subscribed here receive a WhatsApp alert when this unit's alert rule fires.
            A valid phone number must be set on the user account.
          </p>
          {subscribers.length === 0 ? (
            <p className="text-gray-500 text-sm">No subscribers yet.</p>
          ) : (
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="text-gray-400 text-left">
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Phone</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map(s => (
                  <tr key={s.userId} className="border-t border-gray-800">
                    <td className="py-2 pr-4">{s.email}</td>
                    <td className="py-2 pr-4 text-gray-400">{s.phoneNumber ?? '—'}</td>
                    <td className="py-2">
                      <button type="button" onClick={() => handleRemoveSubscriber(s.userId)} className="text-red-400 hover:text-red-300 text-xs">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex items-center gap-3">
            <select value={addUserId} onChange={e => setAddUserId(e.target.value)} className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-sm">
              <option value="">Add a user…</option>
              {allUsers
                .filter(u => !subscribers.some(s => s.userId === u.id))
                .map(u => (
                  <option key={u.id} value={u.id}>
                    {u.email}{u.phoneNumber ? ` (${u.phoneNumber})` : ' (no phone)'}
                  </option>
                ))}
            </select>
            <button type="button" onClick={handleAddSubscriber} disabled={!addUserId} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm disabled:opacity-50">Add</button>
          </div>
        </section>

        {/* API Key */}
        <section>
          <h2 className="text-lg font-semibold mb-3">API Key</h2>
          <p className="text-gray-400 text-sm mb-3">
            Flash this key into your Arduino sketch as <code className="bg-gray-700 px-1 rounded">API_KEY</code>.
            It must be sent as the <code className="bg-gray-700 px-1 rounded">X-Api-Key</code> header on every POST.
          </p>
          <div className="flex items-center gap-3">
            <code className="flex-1 bg-gray-900 text-green-400 text-sm px-3 py-2 rounded font-mono break-all">{apiKey ?? '…'}</code>
            <button onClick={copyKey} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm flex-shrink-0">{keyCopied ? 'Copied ✓' : 'Copy'}</button>
          </div>
        </section>

        <div className="flex items-center gap-4 pt-2">
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {saved && <span className="text-green-400 text-sm">Saved ✓</span>}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript check on frontend**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors. If errors appear, fix field name mismatches.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx frontend/src/pages/ConfigurePage.tsx
git commit -m "feat: update dashboard and configure page for sensor redesign"
```

---

### Task 12: Update Arduino REQUIREMENTS.md

**Files:**
- Modify: `arduino/REQUIREMENTS.md`

- [ ] **Step 1: Replace arduino/REQUIREMENTS.md**

```markdown
# Arduino Firmware Requirements — Store Attention Sensor Bridge

## Overview

The Arduino acts as a **dumb sensor-to-WiFi bridge**. It reads from the attached sensors, serialises the data as JSON, and HTTP POSTs it to the backend. All detection logic (dwell time, engagement scoring, alert rules) runs on the backend — the Arduino has no awareness of presence sessions or business rules.

**Hardware:** Arduino MKR WiFi 1010 + 1–6× VL53L1X ToF + Grove IMU 9DOF (accelerometer used for vibration detection)

---

## 1. Connectivity

### 1.1 WiFi
- Connect to a configured SSID and password at boot.
- Retry connection indefinitely if the network is unavailable at startup.
- Reconnect automatically if the WiFi link drops during operation.
- Use the `WiFiNINA` library.

### 1.2 Backend endpoints
- Sensor data: **HTTP POST** to `http://<backend-ip>:7000/api/sensors/data`
- Heartbeat ping: **HTTP POST** to `http://<backend-ip>:7000/api/sensors/ping`
- Required headers on every request:
  - `Content-Type: application/json`
  - `X-Api-Key: <key>` — the API key shown on the unit's Configure page in the dashboard. Hardcode it in the sketch as a `#define API_KEY "..."` constant.
- The backend IP and port are hardcoded in the sketch (same local network, no DNS required).
- On a `401` response, log "Invalid API key" to Serial and halt.
- On any other non-2xx response, log the status code to Serial and continue.

---

## 2. Sensor Reading Loop

### 2.1 Timing
- The main loop runs every **500 ms** (±50 ms jitter acceptable).
- One full sensor reading payload is POSTed each iteration.
- Hardware events (see §4) may be POSTed at any time outside the main loop.
- A heartbeat ping is sent to `/api/sensors/ping` every **30 seconds** as a fallback (the regular 500 ms POSTs already keep the unit online; the ping is only needed if no sensor data is flowing).

### 2.2 `unit_id`
- Each sketch is flashed with a hardcoded `unit_id` string (e.g. `"unit-01"`).
- The `unit_id` must match a unit registered in the backend before data will be accepted.

### 2.3 Timestamp
- `ts` is the number of milliseconds since the Unix epoch.
- Use `WiFi.getTime()` (SNTP) to get wall-clock time. Multiply to ms.
- If NTP is unavailable, use `millis()` as a fallback.

---

## 3. Sensor Reading Payload

Every 500 ms, POST the following JSON to `/api/sensors/data`:

```json
{
  "unit_id": "unit-01",
  "ts": 1711612800000,
  "tof": [
    { "id": 1, "distance_mm": 823, "status": "valid" },
    { "id": 2, "distance_mm": 790, "status": "valid" },
    { "id": 3, "distance_mm": 4000, "status": "out_of_range" }
  ],
  "imu": {
    "vibration_intensity": 0.04
  }
}
```

**Notes:**
- `tof` contains only the sensors that are wired up (1–6 entries). Always include all wired sensors even if in error state.
- `imu` is optional. Omit the field entirely if no IMU is installed or if IMU is disabled in configuration.

### 3.1 ToF sensors (`tof`)

| Field | Type | Description |
|---|---|---|
| `id` | integer 1–6 | Sensor index. Fixed mapping (see §3.1.1). |
| `distance_mm` | integer | Raw distance in millimetres from the VL53L1X. |
| `status` | string | `"valid"`, `"out_of_range"`, or `"error"`. |

**Status rules:**
- `"valid"` — sensor returned a distance within its measurement range.
- `"out_of_range"` — sensor fired but the target is beyond its range.
- `"error"` — sensor did not respond on I2C or returned an unrecoverable range error.

**Always include all wired sensor entries**, even if a sensor is in error state. Never omit an entry for a sensor that is physically connected.

#### 3.1.1 Physical sensor-to-index mapping

```
Index 1 — left-wide
Index 2 — left
Index 3 — center-left
Index 4 — center-right
Index 5 — right
Index 6 — right-wide
```

This mapping is fixed in hardware. Not all indices need to be present — only wire up as many sensors as the installation requires.

#### 3.1.2 I2C addressing
- The VL53L1X sensors all share the same default I2C address (0x29). Each sensor's XSHUT pin must be driven individually to assign unique addresses at boot.
- Recommended address assignment: sensors 1–6 → addresses 0x30–0x35.
- If a sensor fails to respond during address assignment, mark all its readings as `"error"` for the rest of the session.

### 3.2 IMU (`imu`)

The sensor is mounted **beneath or in front of the product** (not on it). The IMU detects surface vibrations transmitted through the shelf when someone touches or picks up the product.

| Field | Type | Description |
|---|---|---|
| `vibration_intensity` | float | RMS vibration magnitude in g, computed over the 500 ms window. |

**How to compute `vibration_intensity`:**
1. Sample the accelerometer internally at the highest available ODR ≤ 200 Hz throughout the 500 ms loop cycle.
2. For each sample, compute the vector magnitude: `|a| = sqrt(ax² + ay² + az²)`.
3. Subtract 1.0 g from each magnitude to remove the static gravity component (or use the hardware high-pass filter if available).
4. Compute the RMS of these gravity-corrected magnitudes across all samples.
5. Report this value as `vibration_intensity`.

At rest on a stable surface, `vibration_intensity` should be < 0.05 g RMS. A shelf tap or product lift should produce > 0.15 g RMS.

**IMU is optional.** If no IMU is installed or if it fails to initialise, omit the `imu` field entirely from the payload.

---

## 4. Hardware Event Payload

In addition to the periodic reading, fire a **separate HTTP POST** to the same endpoint when a discrete hardware event is detected:

```json
{
  "unit_id": "unit-01",
  "ts": 1711612800000,
  "event": "imu_vibration",
  "value": { "intensity": 0.42 }
}
```

| `event` | Trigger condition | `value` fields |
|---|---|---|
| `"imu_vibration"` | Vibration intensity above threshold, sustained > 150 ms | `{ "intensity": <float> }` |
| `"imu_shock"` | Single-sample acceleration spike above a higher threshold | `{ "peak_g": <float>, "axis": "x"\|"y"\|"z" }` |

**PIR sensor:** The PIR sensor (if installed) is used **on-device only** as a local trigger to wake the sketch from low-power mode or to pre-arm the ToF sensors. It is **not** reported to the backend — do not include it in any payload.

**Detection thresholds** are baked into the sketch as `#define` constants.

Suggested defaults:
- `IMU_VIBRATION_THRESHOLD_G` = 0.15 (sustained > 150 ms triggers `imu_vibration` event)
- `IMU_SHOCK_THRESHOLD_G` = 1.5 (single-sample spike triggers `imu_shock` event)

Events may be sent between reading cycles. Do not queue events — send immediately and resume the loop.

---

## 5. Heartbeat Ping

Every **30 seconds**, POST to `/api/sensors/ping`:

```json
{ "unit_id": "unit-01" }
```

- Same `X-Api-Key` header required.
- Expected response: `204 No Content`.
- On `401`: log "Invalid API key" and halt.
- This keeps the unit marked as **Online** in the dashboard even when no ToF activity is detected (e.g. quiet store periods).

---

## 6. Libraries

| Library | Purpose |
|---|---|
| `WiFiNINA` | WiFi connection and NTP time |
| `ArduinoHttpClient` | HTTP POST |
| `VL53L1X` (Pololu) | ToF sensor ranging |
| `Wire` | I2C bus |
| `ArduinoJson` (v6+) | JSON serialisation |
| IMU driver matching your Grove module | Accelerometer readings (check silkscreen for exact chip: LSM9DS1 or MPU-9250) |

---

## 7. Serial Logging

- Log to `Serial` at 115200 baud.
- On boot: print WiFi connection status and assigned IP.
- Each loop: print a one-line summary (e.g. `[500ms] 2/3 valid, vib=0.03g`).
- On HTTP error: print the status code and response body (truncated to 128 chars).
- On sensor error: print which sensor index failed.

---

## 8. Out of Scope

The following are **not** handled by the Arduino firmware:

- Presence session tracking or dwell time calculation
- Alert rule evaluation
- Sensor distance thresholds / zone configuration (these live in the backend)
- Storing readings locally (no SD card, no EEPROM persistence)
- OTA firmware updates
- TLS / HTTPS (plain HTTP on the local network is acceptable for POC)
- PIR reporting to backend (PIR is on-device only)
```

- [ ] **Step 2: Run all backend tests one final time**

```bash
cd backend && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 3: Run TypeScript check on both packages**

```bash
cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add arduino/REQUIREMENTS.md
git commit -m "docs: update Arduino REQUIREMENTS.md for sensor redesign"
```
