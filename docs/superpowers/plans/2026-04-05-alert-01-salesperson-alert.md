# ALERT-01: Salesperson Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a prominent in-app banner when an alert rule fires (dwell threshold and/or product pickup), with acknowledge and snooze actions.

**Architecture:** The backend `SessionManager` already broadcasts `alert_fired` messages and the Zustand store already has an `activeAlerts` slice with `dismissAlert` and `snoozeAlert` actions (added in DASH-01). This item adds a periodic dwell-check in `SessionManager` so alerts fire mid-session (not just on session end), then builds the `AlertBanner` frontend component.

**Tech Stack:** React, Zustand, Tailwind, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/src/services/sessionManager.ts` | Modify | Add 5s periodic dwell check per active session |
| `frontend/src/components/AlertBanner.tsx` | Create | Fixed alert overlay with snooze/acknowledge |
| `frontend/src/pages/DashboardPage.tsx` | Modify | Render `<AlertBanner />` |

---

## Task 1: Periodic Dwell Check in SessionManager

- [ ] **Step 1: Update `backend/src/services/sessionManager.ts`**

Add `dwellCheckTimer` to `ActiveSession`:

```typescript
type ActiveSession = {
  sessionId: string
  unitId: string
  startedAt: Date
  productPickedUp: boolean
  alertFired: boolean
  dwellCheckTimer: ReturnType<typeof setInterval>
}
```

Update `onSessionStarted` to start the interval:

```typescript
private async onSessionStarted(unitId: string, ts: Date): Promise<void> {
  const session = await this.prisma.presenceSession.create({
    data: { unitId, startedAt: ts, status: 'active' },
  })

  const activeSession: ActiveSession = {
    sessionId: session.id,
    unitId,
    startedAt: ts,
    productPickedUp: false,
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
```

Update `onSessionEnded` to clear the interval:

```typescript
private async onSessionEnded(unitId: string, ts: Date, dwellSeconds: number): Promise<void> {
  const active = this.activeSessions.get(unitId)
  if (!active) return

  clearInterval(active.dwellCheckTimer)

  // ... rest of existing onSessionEnded code unchanged
}
```

- [ ] **Step 2: Run tests — expect no regressions**

```bash
cd backend && npm run test -- sessionManager
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/sessionManager.ts
git commit -m "feat: add periodic dwell check for mid-session alert firing"
```

---

## Task 2: AlertBanner Component

- [ ] **Step 1: Create `frontend/src/components/AlertBanner.tsx`**

```tsx
import { useWsStore } from '../lib/wsStore'
import type { ActiveAlert } from '../lib/wsStore'

const REASON_LABELS: Record<string, string> = {
  dwell_threshold: 'Customer has been waiting a while',
  pickup: 'Customer picked up the product',
  dwell_and_pickup: 'Customer picked up the product after waiting',
}

const SNOOZE_OPTIONS = [
  { label: '2 min', ms: 2 * 60 * 1000 },
  { label: '5 min', ms: 5 * 60 * 1000 },
  { label: '10 min', ms: 10 * 60 * 1000 },
]

function SingleAlert({ alert, onDismiss, onSnooze }: {
  alert: ActiveAlert
  onDismiss: () => void
  onSnooze: (ms: number) => void
}) {
  const isSnoozed = alert.snoozedUntil && Date.now() < alert.snoozedUntil
  if (isSnoozed) return null

  const hasPickup = alert.reason === 'pickup' || alert.reason === 'dwell_and_pickup'
  const bg = hasPickup ? 'bg-red-700' : 'bg-amber-600'

  return (
    <div className={`${bg} text-white px-4 py-3 flex items-center justify-between gap-4`}>
      <div>
        <span className="font-semibold">🔔 Salesperson needed — {alert.unitId}</span>
        <span className="text-sm opacity-90 ml-2">{REASON_LABELS[alert.reason] ?? alert.reason}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {SNOOZE_OPTIONS.map(opt => (
          <button
            key={opt.ms}
            onClick={() => onSnooze(opt.ms)}
            className="text-xs bg-black/20 hover:bg-black/30 px-2 py-1 rounded"
          >
            Snooze {opt.label}
          </button>
        ))}
        <button
          onClick={onDismiss}
          className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded font-semibold"
        >
          Acknowledge ✓
        </button>
      </div>
    </div>
  )
}

export function AlertBanner() {
  const activeAlerts = useWsStore(s => s.activeAlerts)
  const dismissAlert = useWsStore(s => s.dismissAlert)
  const snoozeAlert = useWsStore(s => s.snoozeAlert)

  const visible = activeAlerts.filter(a => !a.snoozedUntil || Date.now() >= a.snoozedUntil)
  if (visible.length === 0) return null

  return (
    <div className="fixed top-0 inset-x-0 z-40 flex flex-col">
      {visible.slice(0, 3).map(alert => (
        <SingleAlert
          key={alert.id}
          alert={alert}
          onDismiss={() => dismissAlert(alert.id)}
          onSnooze={ms => snoozeAlert(alert.id, ms)}
        />
      ))}
      {visible.length > 3 && (
        <div className="bg-gray-800 text-white text-xs text-center py-1">
          +{visible.length - 3} more alerts
        </div>
      )}
    </div>
  )
}
```

---

## Task 3: Add AlertBanner to Dashboard

- [ ] **Step 1: Update `frontend/src/pages/DashboardPage.tsx`**

Import and render `AlertBanner`:

```tsx
import { AlertBanner } from '../components/AlertBanner'
```

Add `<AlertBanner />` as the first child inside the outer `div`:

```tsx
<div className="min-h-screen bg-gray-950 text-white">
  <AlertBanner />
  <ConnectionBanner />
  {/* ... rest unchanged */}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck -w frontend
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AlertBanner.tsx frontend/src/pages/DashboardPage.tsx backend/src/services/sessionManager.ts
git commit -m "feat: add salesperson alert banner with snooze and acknowledge"
```

---

## Task 4: Smoke Test

- [ ] **Step 1: Register a unit with a low alert threshold**

Via `PATCH /api/units/unit-01/config`:
```bash
curl -s -X PATCH http://localhost:7000/api/units/unit-01/config \
  -H "Content-Type: application/json" \
  -d '{"alertRule":{"dwellThresholdSeconds":10,"enabled":true}}'
```

- [ ] **Step 2: Simulate a presence session**

POST sensor readings with 3 active sensors every 500ms for 15 seconds (to exceed the 10s threshold), then stop. After `dwellMinSeconds` (3s by default) a session starts. After 10s the alert should fire.

- [ ] **Step 3: Verify alert appears on dashboard**

Expected: amber banner appears at the top of the dashboard. Snooze and Acknowledge buttons work.
