# CORE-02: Session Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receive detection events from the engine, write sessions and events to the database, check alert rules, and broadcast all state changes over WebSocket.

**Architecture:** `SessionManager` holds an in-memory map of active sessions. It writes to Prisma on session open/close and on pickup events. It calls `WsBroadcaster.broadcast()` on every state change. The `WsBroadcaster` is a simple wrapper around `@fastify/websocket` that fans out to all connected clients. Both are instantiated in `index.ts` and wired together.

**Tech Stack:** Fastify 4, @fastify/websocket, Prisma, TypeScript, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/src/ws/broadcaster.ts` | Create | WebSocket server plugin + `broadcast()` helper |
| `backend/src/services/sessionManager.ts` | Create | DB writes, alert checks, WS broadcasts |
| `backend/src/services/sessionManager.test.ts` | Create | Tests with mocked Prisma + mocked broadcaster |
| `backend/src/index.ts` | Modify | Instantiate broadcaster + sessionManager, wire as engine callback |
| `backend/package.json` | Modify | Add `@fastify/websocket` |

---

## Task 1: Install WebSocket Plugin

- [ ] **Step 1: Add `@fastify/websocket` to `backend/package.json` dependencies**

```json
"@fastify/websocket": "^8.0.0"
```

- [ ] **Step 2: Install**

```bash
npm install
```

---

## Task 2: WebSocket Broadcaster

- [ ] **Step 1: Create `backend/src/ws/broadcaster.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import websocket from '@fastify/websocket'

export type WsMessage = Record<string, unknown>

export class WsBroadcaster {
  private fastify: FastifyInstance

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify
  }

  broadcast(message: WsMessage): void {
    const data = JSON.stringify(message)
    for (const client of this.fastify.websocketServer.clients) {
      if (client.readyState === 1) {
        client.send(data)
      }
    }
  }
}

export async function registerWs(fastify: FastifyInstance): Promise<WsBroadcaster> {
  await fastify.register(websocket)

  fastify.get('/ws', { websocket: true }, () => {
    // clients are tracked automatically by @fastify/websocket
  })

  return new WsBroadcaster(fastify)
}
```

---

## Task 3: Session Manager (TDD)

- [ ] **Step 1: Write failing tests — `backend/src/services/sessionManager.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SessionManager } from './sessionManager'
import type { WsBroadcaster } from '../ws/broadcaster'

// Minimal Prisma mock
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
      requirePickup: false,
    }),
  },
}

const mockBroadcaster = {
  broadcast: vi.fn(),
} as unknown as WsBroadcaster

describe('SessionManager', () => {
  let manager: SessionManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new SessionManager(mockPrisma as any, mockBroadcaster)
  })

  it('creates a PresenceSession on session_started', async () => {
    await manager.handleDetectionEvent({
      type: 'session_started',
      unitId: 'unit-01',
      ts: new Date(),
    })

    expect(mockPrisma.presenceSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ unitId: 'unit-01', status: 'active' }),
      })
    )
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session_event', event: 'session_started' })
    )
  })

  it('closes the session on session_ended', async () => {
    await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
    await manager.handleDetectionEvent({ type: 'session_ended', unitId: 'unit-01', ts: new Date(), dwellSeconds: 45 })

    expect(mockPrisma.presenceSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'completed', dwellSeconds: 45 }),
      })
    )
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session_event', event: 'session_ended', dwellSeconds: 45 })
    )
  })

  it('sets productPickedUp on product_picked_up event', async () => {
    await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
    await manager.handleDetectionEvent({ type: 'product_picked_up', unitId: 'unit-01', ts: new Date() })

    expect(mockPrisma.presenceSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ productPickedUp: true }),
      })
    )
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session_event', event: 'product_picked_up' })
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
})
```

- [ ] **Step 2: Run — expect to fail**

```bash
cd backend && npm run test -- sessionManager
```

Expected: FAIL — `Cannot find module './sessionManager'`

- [ ] **Step 3: Create `backend/src/services/sessionManager.ts`**

```typescript
import type { PrismaClient } from '@prisma/client'
import type { WsBroadcaster } from '../ws/broadcaster'
import type { DetectionEvent } from '../types/sensor'

type ActiveSession = {
  sessionId: string
  unitId: string
  startedAt: Date
  productPickedUp: boolean
  alertFired: boolean
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
      case 'product_picked_up':
        await this.onProductPickedUp(event.unitId, event.ts)
        break
      case 'product_put_down':
        await this.onProductPutDown(event.unitId, event.ts)
        break
    }
  }

  private async onSessionStarted(unitId: string, ts: Date): Promise<void> {
    const session = await this.prisma.presenceSession.create({
      data: { unitId, startedAt: ts, status: 'active' },
    })

    this.activeSessions.set(unitId, {
      sessionId: session.id,
      unitId,
      startedAt: ts,
      productPickedUp: false,
      alertFired: false,
    })

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
      productPickedUp: active.productPickedUp,
      ts: ts.toISOString(),
    })

    await this.checkAlertRule(unitId, active, dwellSeconds)

    this.activeSessions.delete(unitId)
  }

  private async onProductPickedUp(unitId: string, ts: Date): Promise<void> {
    const active = this.activeSessions.get(unitId)
    if (!active) return

    active.productPickedUp = true

    await this.prisma.presenceSession.update({
      where: { id: active.sessionId },
      data: { productPickedUp: true },
    })

    await this.prisma.sessionEvent.create({
      data: { sessionId: active.sessionId, type: 'product_picked_up', ts },
    })

    this.broadcaster.broadcast({
      type: 'session_event',
      event: 'product_picked_up',
      unitId,
      sessionId: active.sessionId,
      ts: ts.toISOString(),
    })
  }

  private async onProductPutDown(unitId: string, ts: Date): Promise<void> {
    const active = this.activeSessions.get(unitId)
    if (!active) return

    await this.prisma.sessionEvent.create({
      data: { sessionId: active.sessionId, type: 'product_put_down', ts },
    })

    this.broadcaster.broadcast({
      type: 'session_event',
      event: 'product_put_down',
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
    const pickupMet = !rule.requirePickup || session.productPickedUp

    if (dwellMet && pickupMet) {
      session.alertFired = true
      const reason = rule.requirePickup && session.productPickedUp
        ? 'dwell_and_pickup'
        : session.productPickedUp
          ? 'pickup'
          : 'dwell_threshold'

      this.broadcaster.broadcast({
        type: 'alert_fired',
        unitId,
        sessionId: session.sessionId,
        reason,
        ts: new Date().toISOString(),
      })
    }
  }
}
```

- [ ] **Step 4: Run — expect to pass**

```bash
npm run test -- sessionManager
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/sessionManager.ts backend/src/services/sessionManager.test.ts backend/src/ws/broadcaster.ts
git commit -m "feat: add session manager and WebSocket broadcaster"
```

---

## Task 4: Wire Everything in `index.ts`

- [ ] **Step 1: Update `backend/src/index.ts`**

```typescript
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { healthRoutes } from './routes/health'
import { sensorRoutes } from './routes/sensors'
import { UnitRegistry } from './lib/unitRegistry'
import { DetectionEngine } from './services/detectionEngine'
import { SessionManager } from './services/sessionManager'
import { registerWs } from './ws/broadcaster'
import { prisma } from './lib/prisma'

const registry = new UnitRegistry()

const start = async () => {
  const fastify = Fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>()

  await fastify.register(cors, { origin: 'http://localhost:5174' })

  const broadcaster = await registerWs(fastify)

  const sessionManager = new SessionManager(prisma, broadcaster)
  const engine = new DetectionEngine(event => {
    sessionManager.handleDetectionEvent(event).catch(err => {
      fastify.log.error(err, 'session manager error')
    })
  })

  const units = await prisma.sensorUnit.findMany({
    include: { configuration: true, tofSensors: true },
  })

  for (const unit of units) {
    registry.register(unit.id)
    if (unit.configuration) {
      engine.addUnit(unit.id, unit.configuration, unit.tofSensors)
    }
  }

  registry.onOffline(unitId => {
    broadcaster.broadcast({ type: 'unit_status', unitId, status: 'offline', lastSeen: new Date().toISOString() })
  })

  await fastify.register(healthRoutes)
  await fastify.register(sensorRoutes, {
    registry,
    onReading: (unitId, reading) => {
      broadcaster.broadcast({
        type: 'sensor_reading',
        unitId,
        ts: new Date().toISOString(),
        tof: reading.tof,
        pir: reading.pir,
        imu: reading.imu,
      })
      engine.process(unitId, reading)
    },
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
git add backend/src/index.ts backend/package.json
git commit -m "feat: wire session manager, broadcaster, and detection engine together"
```
