# WhatsApp Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send Twilio WhatsApp alerts to subscribed users when a sensor unit's alert rule fires mid-session.

**Architecture:** A new `UnitSubscription` join table tracks which users subscribe to which units. When `SessionManager.checkAlertRule` fires, it fetches subscribed phone numbers and dispatches WhatsApp messages via a thin `twilioNotifier` wrapper — fire-and-forget, errors logged not thrown. A bell icon on each dashboard card lets users toggle their own subscription; the configure page exposes full admin management.

**Tech Stack:** Twilio Node SDK (`twilio`), Prisma (new model + migration), Fastify routes, React hook + Tailwind UI.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `backend/src/services/twilioNotifier.ts` | Thin Twilio SDK wrapper, reads env vars |
| Create | `backend/src/services/twilioNotifier.test.ts` | Unit tests for notifier |
| Create | `backend/src/routes/subscriptions.ts` | 6 subscription REST endpoints |
| Create | `frontend/src/hooks/useSubscriptions.ts` | Fetch + optimistic toggle for current user |
| Modify | `backend/prisma/schema.prisma` | Add `UnitSubscription` model + back-relations |
| Modify | `backend/src/services/sessionManager.ts` | Call `sendWhatsApp` in `checkAlertRule` |
| Modify | `backend/src/services/sessionManager.test.ts` | Add mock for new prisma models + WhatsApp test |
| Modify | `backend/src/index.ts` | Register `subscriptionRoutes` |
| Modify | `frontend/src/components/SensorUnitCard.tsx` | Add bell icon + subscription toggle |
| Modify | `frontend/src/pages/DashboardPage.tsx` | Hoist `useSubscriptions`, pass to cards |
| Modify | `frontend/src/pages/ConfigurePage.tsx` | Add notifications panel (list + add + remove) |
| Create | `.env.example` | Document Twilio env vars |

---

## Task 1: Prisma schema — add UnitSubscription

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add model and back-relations to schema**

Open `backend/prisma/schema.prisma` and make these changes:

Add to the `User` model (after the `createdAt` field):
```prisma
  subscriptions UnitSubscription[]
```

Add to the `SensorUnit` model (after the `configuration UnitConfiguration?` line):
```prisma
  subscriptions UnitSubscription[]
```

Append the new model at the end of the file:
```prisma
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
cd backend && npx prisma migrate dev --name add_unit_subscription
```

Expected: Migration created and applied, no errors.

- [ ] **Step 3: Regenerate Prisma client**

```bash
cd backend && npx prisma generate
```

Expected: `✔ Generated Prisma Client` with `UnitSubscription` model available.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add UnitSubscription model for notification subscriptions"
```

---

## Task 2: Install twilio package

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install twilio**

```bash
cd backend && npm install twilio
```

Expected: `twilio` appears in `dependencies` in `package.json`. The package bundles its own TypeScript types — no `@types/twilio` needed.

- [ ] **Step 2: Commit**

```bash
git add backend/package.json package-lock.json
git commit -m "chore: add twilio dependency"
```

---

## Task 3: TwilioNotifier service + tests

**Files:**
- Create: `backend/src/services/twilioNotifier.ts`
- Create: `backend/src/services/twilioNotifier.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/twilioNotifier.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockCreate = vi.fn().mockResolvedValue({ sid: 'SM123' })

vi.mock('twilio', () => ({
  default: vi.fn(() => ({ messages: { create: mockCreate } })),
}))

import { sendWhatsApp } from './twilioNotifier'

describe('sendWhatsApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TWILIO_ACCOUNT_SID = 'AC123'
    process.env.TWILIO_AUTH_TOKEN = 'token123'
    process.env.TWILIO_FROM_NUMBER = 'whatsapp:+14155238886'
  })

  afterEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.TWILIO_FROM_NUMBER
  })

  it('calls twilio messages.create with correct parameters', async () => {
    await sendWhatsApp('+4553575520', 'Test message')
    expect(mockCreate).toHaveBeenCalledWith({
      from: 'whatsapp:+14155238886',
      to: 'whatsapp:+4553575520',
      body: 'Test message',
    })
  })

  it('throws if TWILIO_ACCOUNT_SID is missing', async () => {
    delete process.env.TWILIO_ACCOUNT_SID
    await expect(sendWhatsApp('+4553575520', 'Test')).rejects.toThrow(
      'Twilio credentials not configured'
    )
  })

  it('throws if TWILIO_AUTH_TOKEN is missing', async () => {
    delete process.env.TWILIO_AUTH_TOKEN
    await expect(sendWhatsApp('+4553575520', 'Test')).rejects.toThrow(
      'Twilio credentials not configured'
    )
  })

  it('throws if TWILIO_FROM_NUMBER is missing', async () => {
    delete process.env.TWILIO_FROM_NUMBER
    await expect(sendWhatsApp('+4553575520', 'Test')).rejects.toThrow(
      'Twilio credentials not configured'
    )
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && npx vitest run src/services/twilioNotifier.test.ts
```

Expected: FAIL — `Cannot find module './twilioNotifier'`

- [ ] **Step 3: Implement twilioNotifier**

Create `backend/src/services/twilioNotifier.ts`:

```typescript
import twilio from 'twilio'

export async function sendWhatsApp(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_FROM_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio credentials not configured')
  }

  const client = twilio(accountSid, authToken)
  await client.messages.create({
    from: fromNumber,
    to: `whatsapp:${to}`,
    body,
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && npx vitest run src/services/twilioNotifier.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/twilioNotifier.ts backend/src/services/twilioNotifier.test.ts
git commit -m "feat: add twilioNotifier service for WhatsApp dispatch"
```

---

## Task 4: Update SessionManager to send WhatsApp notifications

**Files:**
- Modify: `backend/src/services/sessionManager.ts`
- Modify: `backend/src/services/sessionManager.test.ts`

- [ ] **Step 1: Add failing tests to sessionManager.test.ts**

At the top of `backend/src/services/sessionManager.test.ts`, add the vi.mock call (before all imports):

```typescript
vi.mock('./twilioNotifier', () => ({
  sendWhatsApp: vi.fn().mockResolvedValue(undefined),
}))
```

Add the import after existing imports:
```typescript
import { sendWhatsApp } from './twilioNotifier'
```

Update `mockPrisma` to include the two new Prisma models (merge into the existing object):
```typescript
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
  sensorUnit: {
    findUnique: vi.fn().mockResolvedValue({ name: 'Stand A' }),
  },
  unitSubscription: {
    findMany: vi.fn().mockResolvedValue([]),
  },
}
```

Add these two new tests inside the `describe('SessionManager')` block:

```typescript
it('sends WhatsApp to subscribed users when alert fires', async () => {
  mockPrisma.unitSubscription.findMany.mockResolvedValueOnce([
    { user: { phoneNumber: '+4553575520' } },
  ])
  await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
  await manager.handleDetectionEvent({ type: 'session_ended', unitId: 'unit-01', ts: new Date(), dwellSeconds: 45 })

  await new Promise(r => setTimeout(r, 10)) // allow fire-and-forget to settle

  expect(sendWhatsApp).toHaveBeenCalledWith(
    '+4553575520',
    expect.stringContaining('Stand A')
  )
})

it('does NOT call sendWhatsApp when there are no subscribers', async () => {
  await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
  await manager.handleDetectionEvent({ type: 'session_ended', unitId: 'unit-01', ts: new Date(), dwellSeconds: 45 })

  await new Promise(r => setTimeout(r, 10))

  expect(sendWhatsApp).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
cd backend && npx vitest run src/services/sessionManager.test.ts
```

Expected: 2 new tests FAIL (existing 5 tests should still pass — they just have empty subscriber arrays now).

- [ ] **Step 3: Update SessionManager.checkAlertRule**

In `backend/src/services/sessionManager.ts`, add the import at the top:

```typescript
import { sendWhatsApp } from './twilioNotifier'
```

Replace the entire `checkAlertRule` method with:

```typescript
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

    // Fire-and-forget WhatsApp notifications
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
      const body = `Alert: Customer at ${unit.name} — ${dwellSeconds}s dwell${session.productPickedUp ? ', product picked up' : ''}`
      Promise.all(phones.map(phone => sendWhatsApp(phone, body))).catch(err => {
        console.error('WhatsApp notification failed:', err)
      })
    }
  }
}
```

- [ ] **Step 4: Run all SessionManager tests**

```bash
cd backend && npx vitest run src/services/sessionManager.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/sessionManager.ts backend/src/services/sessionManager.test.ts
git commit -m "feat: send WhatsApp to unit subscribers when alert fires"
```

---

## Task 5: Subscription REST routes

**Files:**
- Create: `backend/src/routes/subscriptions.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Create subscriptions route file**

Create `backend/src/routes/subscriptions.ts`:

```typescript
import { Prisma } from '@prisma/client'
import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma'

export const subscriptionRoutes: FastifyPluginAsync = async (fastify) => {
  // List all subscribers for a unit (admin view)
  fastify.get('/api/units/:unitId/subscriptions', async (request) => {
    const { unitId } = request.params as { unitId: string }
    const subscriptions = await prisma.unitSubscription.findMany({
      where: { unitId },
      include: { user: { select: { id: true, email: true, phoneNumber: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return {
      subscribers: subscriptions.map(s => ({
        userId: s.userId,
        email: s.user.email,
        phoneNumber: s.user.phoneNumber,
        createdAt: s.createdAt,
      })),
    }
  })

  // Subscribe current user to a unit
  fastify.post('/api/units/:unitId/subscriptions', async (request, reply) => {
    const { unitId } = request.params as { unitId: string }
    const { sub } = request.user as { sub: string }
    try {
      await prisma.unitSubscription.create({ data: { userId: sub, unitId } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return reply.status(409).send({ error: 'Already subscribed' })
      }
      throw e
    }
    return reply.status(201).send({ ok: true })
  })

  // Unsubscribe current user from a unit
  fastify.delete('/api/units/:unitId/subscriptions', async (request) => {
    const { unitId } = request.params as { unitId: string }
    const { sub } = request.user as { sub: string }
    await prisma.unitSubscription.deleteMany({ where: { userId: sub, unitId } })
    return { ok: true }
  })

  // Get all unit IDs the current user is subscribed to
  fastify.get('/api/me/subscriptions', async (request) => {
    const { sub } = request.user as { sub: string }
    const subs = await prisma.unitSubscription.findMany({
      where: { userId: sub },
      select: { unitId: true },
    })
    return { unitIds: subs.map(s => s.unitId) }
  })

  // Admin: subscribe a specific user to a unit
  fastify.post('/api/units/:unitId/subscriptions/:userId', async (request, reply) => {
    const { unitId, userId } = request.params as { unitId: string; userId: string }
    try {
      await prisma.unitSubscription.create({ data: { userId, unitId } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return reply.status(409).send({ error: 'Already subscribed' })
      }
      throw e
    }
    return reply.status(201).send({ ok: true })
  })

  // Admin: remove a specific user's subscription
  fastify.delete('/api/units/:unitId/subscriptions/:userId', async (request) => {
    const { unitId, userId } = request.params as { unitId: string; userId: string }
    await prisma.unitSubscription.deleteMany({ where: { userId, unitId } })
    return { ok: true }
  })
}
```

- [ ] **Step 2: Register routes in index.ts**

In `backend/src/index.ts`, add the import at the top with the other route imports:

```typescript
import { subscriptionRoutes } from './routes/subscriptions'
```

Inside the `start` function, add the registration after the existing route registrations (e.g. after `fastify.register(sensorRoutes, ...)`):

```typescript
await fastify.register(subscriptionRoutes)
```

- [ ] **Step 3: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/subscriptions.ts backend/src/index.ts
git commit -m "feat: add subscription REST endpoints"
```

---

## Task 6: useSubscriptions hook

**Files:**
- Create: `frontend/src/hooks/useSubscriptions.ts`

- [ ] **Step 1: Create the hook**

Create `frontend/src/hooks/useSubscriptions.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'

export function useSubscriptions() {
  const [subscribedUnitIds, setSubscribedUnitIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<{ unitIds: string[] }>('/api/me/subscriptions')
      .then(d => setSubscribedUnitIds(new Set(d.unitIds)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const subscribe = useCallback(async (unitId: string) => {
    setSubscribedUnitIds(prev => new Set([...prev, unitId]))
    try {
      await apiFetch(`/api/units/${unitId}/subscriptions`, { method: 'POST' })
    } catch {
      setSubscribedUnitIds(prev => {
        const next = new Set(prev)
        next.delete(unitId)
        return next
      })
    }
  }, [])

  const unsubscribe = useCallback(async (unitId: string) => {
    setSubscribedUnitIds(prev => {
      const next = new Set(prev)
      next.delete(unitId)
      return next
    })
    try {
      await apiFetch(`/api/units/${unitId}/subscriptions`, { method: 'DELETE' })
    } catch {
      setSubscribedUnitIds(prev => new Set([...prev, unitId]))
    }
  }, [])

  return { subscribedUnitIds, loading, subscribe, unsubscribe }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useSubscriptions.ts
git commit -m "feat: add useSubscriptions hook for bell icon state"
```

---

## Task 7: Bell icon on SensorUnitCard + DashboardPage wiring

**Files:**
- Modify: `frontend/src/components/SensorUnitCard.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Update SensorUnitCard props and add bell icon**

Replace the entire contents of `frontend/src/components/SensorUnitCard.tsx`:

```typescript
import { Link } from 'react-router-dom'
import { useWsStore } from '../lib/wsStore'
import { TofGrid } from './TofGrid'
import { PirBadge } from './PirBadge'
import { ImuBadge } from './ImuBadge'
import { HealthWarningBar } from './HealthWarningBar'

const PRESENCE_LABELS: Record<string, string> = {
  idle: 'Idle', pending: 'Detecting…', active: 'Person Present', departing: 'Leaving…',
}
const PRESENCE_COLOURS: Record<string, string> = {
  idle: 'bg-gray-700 text-gray-400', pending: 'bg-yellow-600 text-white',
  active: 'bg-green-600 text-white', departing: 'bg-orange-500 text-white',
}

const DEFAULT_CONFIGS = Array.from({ length: 6 }, (_, i) => ({
  index: i + 1,
  label: ['left-wide', 'left', 'center-left', 'center-right', 'right', 'right-wide'][i],
  maxDist: 1000,
}))

type Props = {
  unitId: string
  unitName: string
  subscribed: boolean
  onSubscribeToggle: (unitId: string, subscribed: boolean) => void
}

export function SensorUnitCard({ unitId, unitName, subscribed, onSubscribeToggle }: Props) {
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

      <TofGrid readings={unit?.tof ?? []} configs={DEFAULT_CONFIGS} />

      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <PirBadge triggered={unit?.pir?.triggered ?? false} />
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

- [ ] **Step 2: Update DashboardPage to hoist subscription state**

Replace the entire contents of `frontend/src/pages/DashboardPage.tsx`:

```typescript
import { useEffect, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { SensorUnitCard } from '../components/SensorUnitCard'
import { ConnectionBanner } from '../components/ConnectionBanner'
import { AlertBanner } from '../components/AlertBanner'
import { AccountMenu } from '../components/AccountMenu'
import { apiFetch } from '../lib/api'
import type { Unit } from '../hooks/useUnits'
import { EventFeed } from '../components/EventFeed'
import { useSubscriptions } from '../hooks/useSubscriptions'

export function DashboardPage() {
  useWebSocket()
  const [registeredUnits, setRegisteredUnits] = useState<Unit[]>([])
  const { subscribedUnitIds, subscribe, unsubscribe } = useSubscriptions()

  useEffect(() => {
    apiFetch<{ units: Unit[] }>('/api/units').then(d => setRegisteredUnits(d.units)).catch(() => {})
  }, [])

  const handleSubscribeToggle = (unitId: string, currentlySubscribed: boolean) => {
    if (currentlySubscribed) {
      unsubscribe(unitId)
    } else {
      subscribe(unitId)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <AlertBanner />
      <ConnectionBanner />
      <div className="p-6 h-screen flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Live Dashboard</h1>
          <AccountMenu />
        </div>
        <div className="flex-1 flex gap-4 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {registeredUnits.length === 0 ? (
              <p className="text-gray-400">No units registered. <a href="/setup/units" className="text-blue-400 hover:underline">Register one →</a></p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {registeredUnits.map(u => (
                  <SensorUnitCard
                    key={u.id}
                    unitId={u.id}
                    unitName={u.name}
                    subscribed={subscribedUnitIds.has(u.id)}
                    onSubscribeToggle={handleSubscribeToggle}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="w-72 flex-shrink-0">
            <EventFeed />
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SensorUnitCard.tsx frontend/src/pages/DashboardPage.tsx
git commit -m "feat: add bell subscription toggle to unit cards"
```

---

## Task 8: Notifications panel on ConfigurePage

**Files:**
- Modify: `frontend/src/pages/ConfigurePage.tsx`

- [ ] **Step 1: Add subscription state and handlers to ConfigurePage**

At the top of `frontend/src/pages/ConfigurePage.tsx`, add two new imports alongside the existing ones:

```typescript
import { useEffect, useState } from 'react'  // already imported — no change needed
```

Add these two new type definitions just before the `ConfigurePage` function:

```typescript
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
```

Inside the `ConfigurePage` function body, after the existing state declarations (after `const [keyCopied, setKeyCopied] = useState(false)`), add:

```typescript
const [subscribers, setSubscribers] = useState<Subscriber[]>([])
const [allUsers, setAllUsers] = useState<UserOption[]>([])
const [addUserId, setAddUserId] = useState('')

const loadSubscribers = () =>
  apiFetch<{ subscribers: Subscriber[] }>(`/api/units/${unitId}/subscriptions`)
    .then(d => setSubscribers(d.subscribers))
    .catch(() => {})

useEffect(() => {
  loadSubscribers()
  apiFetch<{ users: UserOption[] }>('/api/users')
    .then(d => setAllUsers(d.users))
    .catch(() => {})
}, [unitId])

const handleAddSubscriber = async () => {
  if (!addUserId) return
  try {
    await apiFetch(`/api/units/${unitId}/subscriptions/${addUserId}`, { method: 'POST' })
    setAddUserId('')
    await loadSubscribers()
  } catch {
    // already subscribed or other error — ignore
  }
}

const handleRemoveSubscriber = async (userId: string) => {
  await apiFetch(`/api/units/${unitId}/subscriptions/${userId}`, { method: 'DELETE' })
  await loadSubscribers()
}
```

- [ ] **Step 2: Add notifications section to the JSX**

Inside the `return (...)` block of `ConfigurePage`, add this section after the `{/* Alert Rule */}` closing `</section>` tag and before the `{/* API Key */}` section:

```tsx
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
              <button
                type="button"
                onClick={() => handleRemoveSubscriber(s.userId)}
                className="text-red-400 hover:text-red-300 text-xs"
              >
                Remove
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )}

  <div className="flex items-center gap-3">
    <select
      value={addUserId}
      onChange={e => setAddUserId(e.target.value)}
      className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-sm"
    >
      <option value="">Add a user…</option>
      {allUsers
        .filter(u => !subscribers.some(s => s.userId === u.id))
        .map(u => (
          <option key={u.id} value={u.id}>
            {u.email}{u.phoneNumber ? ` (${u.phoneNumber})` : ' (no phone)'}
          </option>
        ))}
    </select>
    <button
      type="button"
      onClick={handleAddSubscriber}
      disabled={!addUserId}
      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm disabled:opacity-50"
    >
      Add
    </button>
  </div>
</section>
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ConfigurePage.tsx
git commit -m "feat: add notifications panel to configure page"
```

---

## Task 9: .env.example

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Create .env.example**

Create `.env.example` in the repo root:

```bash
# Backend
JWT_SECRET=change-me-in-production

# Twilio WhatsApp notifications
# Get these from https://console.twilio.com
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=whatsapp:+14155238886
```

- [ ] **Step 2: Verify .gitignore excludes .env**

```bash
grep -E '^\.env$' .gitignore
```

If `.env` is not in `.gitignore`, add it:
```bash
echo '.env' >> .gitignore
```

- [ ] **Step 3: Commit**

```bash
git add .env.example .gitignore
git commit -m "chore: add .env.example with Twilio credentials template"
```

---

## Final check

- [ ] **Run all backend tests**

```bash
cd backend && npx vitest run
```

Expected: All tests PASS.

- [ ] **Run backend typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Run frontend typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.
