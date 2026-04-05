# DASH-01: Live Sensor Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/dashboard` page that shows real-time per-unit status cards with ToF sensor grid, PIR badge, IMU badge, and presence state — all updated via WebSocket at ~2 Hz.

**Architecture:** The backend already broadcasts `sensor_reading`, `session_event`, `unit_status`, and `alert_fired` messages over `/ws` (wired in CORE-02). This item builds the frontend: a Zustand store, a `useWebSocket` hook with auto-reconnect, and the visual components.

**Tech Stack:** React, Zustand, React Router, Tailwind, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/lib/wsStore.ts` | Create | Zustand store for live unit state |
| `frontend/src/hooks/useWebSocket.ts` | Create | WS connection with auto-reconnect |
| `frontend/src/pages/DashboardPage.tsx` | Create | Grid of SensorUnitCards |
| `frontend/src/components/SensorUnitCard.tsx` | Create | Per-unit status card |
| `frontend/src/components/TofGrid.tsx` | Create | 6-cell sensor visualisation |
| `frontend/src/components/PirBadge.tsx` | Create | PIR state pill |
| `frontend/src/components/ImuBadge.tsx` | Create | IMU state pill |
| `frontend/src/components/ConnectionBanner.tsx` | Create | "Reconnecting…" overlay |
| `frontend/src/App.tsx` | Modify | Add /dashboard route |

---

## Task 1: Zustand Store

- [ ] **Step 1: Create `frontend/src/lib/wsStore.ts`**

```typescript
import { create } from 'zustand'

export type TofReading = { id: number; distance_mm: number; status: 'valid' | 'out_of_range' | 'error' }
export type PirState = { triggered: boolean; last_trigger_ms: number }
export type ImuState = { accel: { x: number; y: number; z: number }; gyro: { x: number; y: number; z: number }; mag: { x: number; y: number; z: number } }

export type PresenceState = 'idle' | 'pending' | 'active' | 'departing'

export type UnitLiveState = {
  unitId: string
  status: 'online' | 'offline'
  lastSeen: string | null
  presenceState: PresenceState
  tof: TofReading[]
  pir: PirState | null
  imu: ImuState | null
  lastEvent: { event: string; ts: string } | null
}

export type ActiveAlert = {
  id: string
  unitId: string
  reason: string
  ts: string
  snoozedUntil?: number
}

export type WsStore = {
  connected: boolean
  units: Record<string, UnitLiveState>
  activeAlerts: ActiveAlert[]
  setConnected: (v: boolean) => void
  handleMessage: (msg: Record<string, unknown>) => void
  dismissAlert: (sessionId: string) => void
  snoozeAlert: (sessionId: string, ms: number) => void
}

export const useWsStore = create<WsStore>((set, get) => ({
  connected: false,
  units: {},
  activeAlerts: [],

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
            pir: msg.pir as PirState,
            imu: msg.imu as ImuState,
            lastEvent: state.units[unitId]?.lastEvent ?? null,
          },
        },
      }))
    } else if (type === 'session_event') {
      set(state => ({
        units: {
          ...state.units,
          [unitId]: {
            ...state.units[unitId],
            unitId,
            lastEvent: { event: msg.event as string, ts: msg.ts as string },
          },
        },
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
}))
```

---

## Task 2: WebSocket Hook

- [ ] **Step 1: Create `frontend/src/hooks/useWebSocket.ts`**

```typescript
import { useEffect, useRef } from 'react'
import { useWsStore } from '../lib/wsStore'

const WS_URL = 'ws://localhost:7000/ws'

export function useWebSocket() {
  const { setConnected, handleMessage } = useWsStore()
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryDelay = useRef(1000)

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        retryDelay.current = 1000
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as Record<string, unknown>
          handleMessage(msg)
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        setConnected(false)
        retryRef.current = setTimeout(() => {
          retryDelay.current = Math.min(retryDelay.current * 2, 30_000)
          connect()
        }, retryDelay.current)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      wsRef.current?.close()
      if (retryRef.current) clearTimeout(retryRef.current)
    }
  }, [setConnected, handleMessage])
}
```

---

## Task 3: Components

- [ ] **Step 1: Create `frontend/src/components/ConnectionBanner.tsx`**

```tsx
import { useWsStore } from '../lib/wsStore'

export function ConnectionBanner() {
  const connected = useWsStore(s => s.connected)
  if (connected) return null
  return (
    <div className="fixed top-0 inset-x-0 bg-yellow-600 text-white text-center text-sm py-1 z-50">
      Reconnecting to server…
    </div>
  )
}
```

- [ ] **Step 2: Create `frontend/src/components/PirBadge.tsx`**

```tsx
type Props = { triggered: boolean }
export function PirBadge({ triggered }: Props) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${triggered ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-400'}`}>
      PIR {triggered ? 'Triggered' : 'Idle'}
    </span>
  )
}
```

- [ ] **Step 3: Create `frontend/src/components/ImuBadge.tsx`**

```tsx
type Props = { lastEvent: string | null }
export function ImuBadge({ lastEvent }: Props) {
  const label = lastEvent === 'imu_pickup' ? 'Pickup' : lastEvent === 'imu_rotation' ? 'Rotation' : lastEvent === 'imu_shock' ? 'Shock' : 'Idle'
  const colour = lastEvent ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400'
  return <span className={`text-xs px-2 py-0.5 rounded-full ${colour}`}>IMU {label}</span>
}
```

- [ ] **Step 4: Create `frontend/src/components/TofGrid.tsx`**

```tsx
import type { TofReading } from '../lib/wsStore'

type SensorConfig = { index: number; label: string; maxDist: number }
type Props = { readings: TofReading[]; configs: SensorConfig[] }

export function TofGrid({ readings, configs }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {configs.map(cfg => {
        const reading = readings.find(r => r.id === cfg.index)
        const active = reading?.status === 'valid' && reading.distance_mm <= cfg.maxDist
        const bg = !reading || reading.status !== 'valid'
          ? 'bg-gray-800 text-gray-600'
          : active
            ? 'bg-green-700 text-white'
            : 'bg-blue-900 text-blue-300'
        return (
          <div key={cfg.index} className={`rounded p-2 text-center ${bg}`}>
            <div className="text-xs truncate">{cfg.label}</div>
            <div className="text-sm font-mono mt-1">
              {reading?.status === 'valid' ? `${reading.distance_mm}mm` : '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: Create `frontend/src/components/SensorUnitCard.tsx`**

```tsx
import { useWsStore } from '../lib/wsStore'
import { TofGrid } from './TofGrid'
import { PirBadge } from './PirBadge'
import { ImuBadge } from './ImuBadge'

const PRESENCE_LABELS: Record<string, string> = {
  idle: 'Idle', pending: 'Detecting…', active: 'Person Present', departing: 'Leaving…',
}
const PRESENCE_COLOURS: Record<string, string> = {
  idle: 'bg-gray-700 text-gray-400', pending: 'bg-yellow-600 text-white',
  active: 'bg-green-600 text-white', departing: 'bg-orange-500 text-white',
}

// Default configs used before sensor config is loaded
const DEFAULT_CONFIGS = Array.from({ length: 6 }, (_, i) => ({
  index: i + 1,
  label: ['left-wide','left','center-left','center-right','right','right-wide'][i],
  maxDist: 1000,
}))

type Props = { unitId: string; unitName: string }

export function SensorUnitCard({ unitId, unitName }: Props) {
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
        <span className={`flex items-center gap-1 text-xs ${online ? 'text-green-400' : 'text-gray-500'}`}>
          <span className={`w-2 h-2 rounded-full ${online ? 'bg-green-400' : 'bg-gray-500'}`} />
          {online ? 'Online' : 'Offline'}
        </span>
      </div>

      <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${PRESENCE_COLOURS[presenceState]}`}>
        {PRESENCE_LABELS[presenceState]}
      </span>

      <TofGrid readings={unit?.tof ?? []} configs={DEFAULT_CONFIGS} />

      <div className="flex gap-2 flex-wrap">
        <PirBadge triggered={unit?.pir?.triggered ?? false} />
        <ImuBadge lastEvent={unit?.lastEvent?.event ?? null} />
      </div>
    </div>
  )
}
```

---

## Task 4: Dashboard Page

- [ ] **Step 1: Create `frontend/src/pages/DashboardPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useWsStore } from '../lib/wsStore'
import { SensorUnitCard } from '../components/SensorUnitCard'
import { ConnectionBanner } from '../components/ConnectionBanner'
import { apiFetch } from '../lib/api'
import type { Unit } from '../hooks/useUnits'

export function DashboardPage() {
  useWebSocket()
  const units = useWsStore(s => s.units)
  const [registeredUnits, setRegisteredUnits] = useState<Unit[]>([])

  useEffect(() => {
    apiFetch<{ units: Unit[] }>('/api/units').then(d => setRegisteredUnits(d.units)).catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <ConnectionBanner />
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Live Dashboard</h1>
        {registeredUnits.length === 0 ? (
          <p className="text-gray-400">No units registered. <a href="/setup/units" className="text-blue-400 hover:underline">Register one →</a></p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {registeredUnits.map(u => (
              <SensorUnitCard key={u.id} unitId={u.id} unitName={u.name} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add route in `frontend/src/App.tsx`**

```tsx
import { DashboardPage } from './pages/DashboardPage'
// Inside <Routes> — update the default redirect:
<Route path="/" element={<Navigate to="/dashboard" replace />} />
<Route path="/dashboard" element={<DashboardPage />} />
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck -w frontend
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: add live sensor dashboard with WebSocket updates"
```

---

## Task 5: Smoke Test

- [ ] **Step 1: Start both servers**

```bash
npm run dev
```

- [ ] **Step 2: Open `http://localhost:5174/dashboard`**

Expected: Dashboard loads. Units registered via SETUP-01 appear. Yellow "Reconnecting…" banner disappears once WS connects.

- [ ] **Step 3: POST a sensor reading**

```bash
curl -s -X POST http://localhost:7000/api/sensors/data \
  -H "Content-Type: application/json" \
  -d '{"unit_id":"unit-01","ts":0,"tof":[{"id":1,"distance_mm":800,"status":"valid"},{"id":2,"distance_mm":750,"status":"valid"},{"id":3,"distance_mm":4000,"status":"out_of_range"},{"id":4,"distance_mm":810,"status":"valid"},{"id":5,"distance_mm":4000,"status":"out_of_range"},{"id":6,"distance_mm":4000,"status":"out_of_range"}],"pir":{"triggered":false,"last_trigger_ms":0},"imu":{"accel":{"x":0.02,"y":0.98,"z":0.01},"gyro":{"x":0,"y":0,"z":0},"mag":{"x":0,"y":0,"z":0}}}'
```

Expected: unit-01 card updates within 600ms — 3 green cells and 3 grey cells appear in TofGrid.
