# DASH-02: Live Calibration Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-optimised `/calibrate/:unitId` page showing live raw distances from all 6 ToF sensors with bar indicators, so an installer can verify sensor placement during physical setup.

**Architecture:** The page reuses the existing Zustand store and WebSocket hook. It fetches sensor threshold config once on mount from `GET /api/units/:unitId/sensors` (already added in SETUP-02). Bar colours are derived from distance vs `maxDist` threshold.

**Tech Stack:** React, React Router, Zustand, Tailwind, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/components/TofSensorRow.tsx` | Create | Single sensor row: label, distance, bar |
| `frontend/src/pages/CalibrationPage.tsx` | Create | Full calibration view |
| `frontend/src/App.tsx` | Modify | Add /calibrate/:unitId route |

Note: `GET /api/units/:unitId/sensors` was already added in SETUP-02. No backend changes needed.

---

## Task 1: TofSensorRow Component

- [ ] **Step 1: Create `frontend/src/components/TofSensorRow.tsx`**

```tsx
type Props = {
  label: string
  distanceMm: number | null
  valid: boolean
  maxDist: number
}

export function TofSensorRow({ label, distanceMm, valid, maxDist }: Props) {
  const pct = valid && distanceMm !== null ? Math.min((distanceMm / maxDist) * 100, 100) : 0

  const barColour =
    !valid || distanceMm === null ? 'bg-gray-600' :
    distanceMm <= maxDist * 0.75 ? 'bg-green-500' :
    distanceMm <= maxDist ? 'bg-orange-400' :
    'bg-gray-600'

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-800">
      <div className="w-32 text-sm font-mono text-gray-300 uppercase tracking-wide">{label}</div>
      <div className="w-24 text-right text-xl font-bold tabular-nums">
        {valid && distanceMm !== null ? `${distanceMm}` : '—'}
        {valid && distanceMm !== null && <span className="text-sm font-normal text-gray-400 ml-1">mm</span>}
      </div>
      <div className="flex-1 bg-gray-700 rounded-full h-3">
        <div
          className={`h-3 rounded-full transition-all ${barColour}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
```

---

## Task 2: Calibration Page

- [ ] **Step 1: Create `frontend/src/pages/CalibrationPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useWebSocket } from '../hooks/useWebSocket'
import { useWsStore } from '../lib/wsStore'
import { TofSensorRow } from '../components/TofSensorRow'
import { apiFetch } from '../lib/api'

type SensorConfig = { index: number; label: string; minDist: number; maxDist: number }

export function CalibrationPage() {
  useWebSocket()
  const { unitId } = useParams<{ unitId: string }>()
  const unitState = useWsStore(s => s.units[unitId!])
  const [sensors, setSensors] = useState<SensorConfig[]>([])
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    apiFetch<{ sensors: SensorConfig[] }>(`/api/units/${unitId}/sensors`)
      .then(d => setSensors(d.sensors))
      .catch(() => setNotFound(true))
  }, [unitId])

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-6">
        <p className="text-red-400">Unit "{unitId}" not found.</p>
        <Link to="/setup/units" className="text-blue-400 text-sm hover:underline">← Back to Units</Link>
      </div>
    )
  }

  const online = unitState?.status === 'online'

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold">Calibration</h1>
          <p className="text-gray-400 text-sm">{unitId}</p>
        </div>
        <span className={`flex items-center gap-1 text-sm ${online ? 'text-green-400' : 'text-gray-500'}`}>
          <span className={`w-2 h-2 rounded-full ${online ? 'bg-green-400' : 'bg-gray-500'}`} />
          {online ? 'Online' : 'Offline'}
        </span>
      </div>

      <div>
        {sensors.length === 0 ? (
          <p className="text-gray-400 text-sm">Loading sensors…</p>
        ) : (
          sensors.map(cfg => {
            const reading = unitState?.tof?.find(r => r.id === cfg.index)
            return (
              <TofSensorRow
                key={cfg.index}
                label={cfg.label}
                distanceMm={reading?.distance_mm ?? null}
                valid={reading?.status === 'valid'}
                maxDist={cfg.maxDist}
              />
            )
          })
        )}
      </div>

      <div className="mt-6 space-y-2 text-sm text-gray-400 border-t border-gray-800 pt-4">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500" /> Within range
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-orange-400" /> Near threshold
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-gray-600" /> Out of range
        </div>
      </div>

      <Link to="/dashboard" className="mt-6 inline-block text-blue-400 text-sm hover:text-blue-300">
        ← Back to Dashboard
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: Add route to `frontend/src/App.tsx`**

```tsx
import { CalibrationPage } from './pages/CalibrationPage'
// Inside <Routes>:
<Route path="/calibrate/:unitId" element={<CalibrationPage />} />
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck -w frontend
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CalibrationPage.tsx frontend/src/components/TofSensorRow.tsx frontend/src/App.tsx
git commit -m "feat: add live calibration mode page"
```

---

## Task 3: Smoke Test

- [ ] **Step 1: Open `http://localhost:5174/calibrate/unit-01` on a phone or narrow browser window**

Expected: 6 sensor rows with labels, dashes for distance (no data yet). Colour legend at bottom.

- [ ] **Step 2: POST a sensor reading with mixed distances**

```bash
curl -s -X POST http://localhost:7000/api/sensors/data \
  -H "Content-Type: application/json" \
  -d '{"unit_id":"unit-01","ts":0,"tof":[{"id":1,"distance_mm":400,"status":"valid"},{"id":2,"distance_mm":900,"status":"valid"},{"id":3,"distance_mm":4000,"status":"out_of_range"},{"id":4,"distance_mm":600,"status":"valid"},{"id":5,"distance_mm":4000,"status":"out_of_range"},{"id":6,"distance_mm":4000,"status":"out_of_range"}],"pir":{"triggered":false,"last_trigger_ms":0},"imu":{"accel":{"x":0,"y":0,"z":0},"gyro":{"x":0,"y":0,"z":0},"mag":{"x":0,"y":0,"z":0}}}'
```

Expected: sensor 1 shows green bar (400mm, well within 1000mm), sensor 2 shows orange (900mm, near threshold), sensors 3/5/6 show grey dashes.
