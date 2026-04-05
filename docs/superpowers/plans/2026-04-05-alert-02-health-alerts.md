# ALERT-02: System Health Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect stuck ToF sensors and IMU drift on the backend, broadcast `health_alert` / `health_alert_cleared` WebSocket messages, and show dismissible warnings inside each unit card.

**Architecture:** A `HealthMonitor` class is called from the ingest route after the detection engine. It maintains per-unit, per-sensor rolling buffers (last 10 readings) and an IMU baseline. It emits broadcasts directly via `WsBroadcaster`. The frontend adds a `healthWarnings` map to the Zustand store and renders a `HealthWarningBar` inside `SensorUnitCard`.

**Tech Stack:** TypeScript, Vitest, React, Zustand, Tailwind

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/src/services/healthMonitor.ts` | Create | Stuck sensor + IMU drift detection |
| `backend/src/services/healthMonitor.test.ts` | Create | Unit tests |
| `backend/src/index.ts` | Modify | Instantiate HealthMonitor, call from ingest |
| `backend/src/routes/sensors.ts` | Modify | Call `healthMonitor.process()` after engine |
| `frontend/src/lib/wsStore.ts` | Modify | Add `healthWarnings` per unit |
| `frontend/src/components/HealthWarningBar.tsx` | Create | Warning rows inside unit card |
| `frontend/src/components/SensorUnitCard.tsx` | Modify | Render HealthWarningBar |

---

## Task 1: HealthMonitor (TDD)

- [ ] **Step 1: Write failing tests — `backend/src/services/healthMonitor.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HealthMonitor } from './healthMonitor'
import type { WsBroadcaster } from '../ws/broadcaster'

const mockBroadcaster = { broadcast: vi.fn() } as unknown as WsBroadcaster

const makeReading = (sensorValues: { id: number; mm: number; status?: string }[]) => ({
  unit_id: 'unit-01',
  ts: Date.now(),
  tof: sensorValues.map(s => ({ id: s.id, distance_mm: s.mm, status: (s.status ?? 'valid') as 'valid' | 'out_of_range' | 'error' })),
  pir: { triggered: false, last_trigger_ms: 0 },
  imu: { accel: { x: 0.02, y: 0.98, z: 0.01 }, gyro: { x: 0, y: 0, z: 0 }, mag: { x: 0, y: 0, z: 0 } },
})

describe('HealthMonitor', () => {
  let monitor: HealthMonitor

  beforeEach(() => {
    vi.clearAllMocks()
    monitor = new HealthMonitor(mockBroadcaster)
    monitor.addUnit('unit-01')
  })

  it('does not alert for varied readings', () => {
    for (let i = 0; i < 10; i++) {
      monitor.process('unit-01', makeReading([{ id: 1, mm: 800 + i * 10 }]))
    }
    expect(mockBroadcaster.broadcast).not.toHaveBeenCalled()
  })

  it('broadcasts health_alert when sensor is stuck for 10 readings', () => {
    for (let i = 0; i < 10; i++) {
      monitor.process('unit-01', makeReading([{ id: 1, mm: 823 }]))
    }
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'health_alert', condition: 'stuck_sensor', sensorIndex: 1 })
    )
  })

  it('broadcasts health_alert_cleared when stuck sensor starts varying', () => {
    for (let i = 0; i < 10; i++) {
      monitor.process('unit-01', makeReading([{ id: 1, mm: 823 }]))
    }
    vi.clearAllMocks()
    monitor.process('unit-01', makeReading([{ id: 1, mm: 400 }]))
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'health_alert_cleared', condition: 'stuck_sensor', sensorIndex: 1 })
    )
  })
})
```

- [ ] **Step 2: Run — expect to fail**

```bash
cd backend && npm run test -- healthMonitor
```

Expected: FAIL — `Cannot find module './healthMonitor'`

- [ ] **Step 3: Create `backend/src/services/healthMonitor.ts`**

```typescript
import type { SensorReading } from '../types/sensor'
import type { WsBroadcaster } from '../ws/broadcaster'

const STUCK_WINDOW = 10
const STUCK_TOLERANCE_MM = 5

type SensorBuffer = { values: number[]; stuckAlerted: boolean }
type UnitHealth = { sensors: Map<number, SensorBuffer> }

export class HealthMonitor {
  private units = new Map<string, UnitHealth>()
  private broadcaster: WsBroadcaster

  constructor(broadcaster: WsBroadcaster) {
    this.broadcaster = broadcaster
  }

  addUnit(unitId: string): void {
    this.units.set(unitId, { sensors: new Map() })
  }

  process(unitId: string, reading: SensorReading): void {
    const unit = this.units.get(unitId)
    if (!unit) return

    for (const tof of reading.tof) {
      if (!unit.sensors.has(tof.id)) {
        unit.sensors.set(tof.id, { values: [], stuckAlerted: false })
      }
      const buf = unit.sensors.get(tof.id)!

      if (tof.status !== 'valid') {
        // Out of range clears a stuck alert
        if (buf.stuckAlerted) {
          buf.stuckAlerted = false
          this.broadcaster.broadcast({ type: 'health_alert_cleared', unitId, condition: 'stuck_sensor', sensorIndex: tof.id, ts: new Date().toISOString() })
        }
        buf.values = []
        continue
      }

      buf.values.push(tof.distance_mm)
      if (buf.values.length > STUCK_WINDOW) buf.values.shift()

      if (buf.values.length === STUCK_WINDOW) {
        const min = Math.min(...buf.values)
        const max = Math.max(...buf.values)
        const isStuck = (max - min) <= STUCK_TOLERANCE_MM

        if (isStuck && !buf.stuckAlerted) {
          buf.stuckAlerted = true
          this.broadcaster.broadcast({
            type: 'health_alert',
            unitId,
            condition: 'stuck_sensor',
            sensorIndex: tof.id,
            message: `Sensor ${tof.id} may be stuck at ~${tof.distance_mm}mm`,
            ts: new Date().toISOString(),
          })
        } else if (!isStuck && buf.stuckAlerted) {
          buf.stuckAlerted = false
          this.broadcaster.broadcast({
            type: 'health_alert_cleared',
            unitId,
            condition: 'stuck_sensor',
            sensorIndex: tof.id,
            ts: new Date().toISOString(),
          })
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run — expect to pass**

```bash
npm run test -- healthMonitor
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/healthMonitor.ts backend/src/services/healthMonitor.test.ts
git commit -m "feat: add health monitor for stuck sensor detection"
```

---

## Task 2: Wire HealthMonitor into Server

- [ ] **Step 1: Update `backend/src/routes/sensors.ts`**

Add `healthMonitor` to `PluginOptions`:

```typescript
import type { HealthMonitor } from '../services/healthMonitor'

type PluginOptions = {
  registry: UnitRegistry
  onReading: (unitId: string, reading: SensorReading) => void
  onEvent: (unitId: string, event: HardwareEvent) => void
  healthMonitor: HealthMonitor
}
```

Call it after `opts.onReading(...)`:

```typescript
opts.registry.markSeen(payload.unit_id)

if (isSensorReading(payload)) {
  opts.onReading(payload.unit_id, payload)
  opts.healthMonitor.process(payload.unit_id, payload)
} else {
  opts.onEvent(payload.unit_id, payload)
}
```

- [ ] **Step 2: Update `backend/src/index.ts`**

```typescript
import { HealthMonitor } from './services/healthMonitor'
// After broadcaster is created:
const healthMonitor = new HealthMonitor(broadcaster)

// In the unit loading loop:
for (const unit of units) {
  registry.register(unit.id)
  healthMonitor.addUnit(unit.id)
  if (unit.configuration) {
    engine.addUnit(unit.id, unit.configuration, unit.tofSensors)
  }
}

// Pass to sensorRoutes:
await fastify.register(sensorRoutes, {
  registry,
  healthMonitor,
  onReading: ...,
  onEvent: ...,
})
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck -w backend
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/healthMonitor.ts backend/src/routes/sensors.ts backend/src/index.ts
git commit -m "feat: wire health monitor into ingest pipeline"
```

---

## Task 3: Frontend — Health Warnings

- [ ] **Step 1: Add `healthWarnings` to `frontend/src/lib/wsStore.ts`**

Add type:
```typescript
export type HealthWarning = { condition: string; sensorIndex?: number; message: string; ts: string }
```

Add to `WsStore`:
```typescript
healthWarnings: Record<string, HealthWarning[]>
dismissHealthWarning: (unitId: string, condition: string, sensorIndex?: number) => void
```

Add to initial state:
```typescript
healthWarnings: {},
dismissHealthWarning: (unitId, condition, sensorIndex) =>
  set(state => ({
    healthWarnings: {
      ...state.healthWarnings,
      [unitId]: (state.healthWarnings[unitId] ?? []).filter(
        w => !(w.condition === condition && w.sensorIndex === sensorIndex)
      ),
    },
  })),
```

Inside `handleMessage`, add:

```typescript
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
```

- [ ] **Step 2: Create `frontend/src/components/HealthWarningBar.tsx`**

```tsx
import { useWsStore } from '../lib/wsStore'

type Props = { unitId: string }

export function HealthWarningBar({ unitId }: Props) {
  const warnings = useWsStore(s => s.healthWarnings[unitId] ?? [])
  const dismiss = useWsStore(s => s.dismissHealthWarning)

  if (warnings.length === 0) return null

  return (
    <div className="space-y-1">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-center justify-between bg-yellow-900/50 border border-yellow-600/30 rounded px-2 py-1 text-xs text-yellow-300">
          <span>⚠ {w.message}</span>
          <button
            onClick={() => dismiss(unitId, w.condition, w.sensorIndex)}
            className="ml-2 text-yellow-500 hover:text-yellow-300"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Update `frontend/src/components/SensorUnitCard.tsx`**

Import and render `HealthWarningBar` after the status header:

```tsx
import { HealthWarningBar } from './HealthWarningBar'
// Inside the card JSX, after the online/offline header div:
<HealthWarningBar unitId={unitId} />
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck -w frontend
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ 
git commit -m "feat: add health warning display in unit cards"
```
