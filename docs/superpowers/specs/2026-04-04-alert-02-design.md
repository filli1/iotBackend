# ALERT-02: System Health Alerts — Design Spec

**Date:** 2026-04-04
**Backlog item:** ALERT-02
**Status:** Draft

---

## Goal

Detect and surface system health problems: a sensor unit going offline, a ToF sensor producing stuck/anomalous readings, and IMU drift. Display these as non-blocking warnings on the dashboard.

---

## Approach

Health checks run in the backend on timers and on each ingest. Results are broadcast over WebSocket. The frontend displays a health warning bar per affected unit below the unit card header — distinct from the salesperson alert (ALERT-01) which is urgent and full-screen.

---

## Health Conditions

### 1 — Unit Offline

**Detection:** Unit Registry (INFRA-03) marks a unit `online = false` when no reading is received for >60 seconds. The registry's 30-second background timer broadcasts a `unit_status` WS message on state change.

**Frontend display:** Unit card shows a red "Offline" badge and a "Last seen Xs ago" timestamp. This is already covered by DASH-01's `unit_status` message handling — no additional backend work needed.

---

### 2 — Stuck Sensor Reading

**Detection:** For each ToF sensor, the backend tracks the last N readings. If a sensor reports the same `distance_mm` (within ±5mm tolerance) for 10 consecutive readings (≈5 seconds at 2 Hz), it is flagged as "stuck".

Implemented in a new `HealthMonitor` service that runs per ingest call (after the detection engine):

```typescript
class HealthMonitor {
  process(unitId: string, reading: SensorReading): void
  // Emits health_alert WS message when anomaly detected or clears
}
```

**Clears when:** The sensor produces a reading that differs by >5mm from the stuck value, or the sensor goes `out_of_range` (which may mean the obstruction was removed).

---

### 3 — IMU Drift Warning

**Detection:** The IMU baseline is the average accel magnitude (`√(x²+y²+z²)`) during IDLE state (no session active). If the IDLE-state accel magnitude drifts more than `0.3g` from the initial baseline over a rolling 60-second window, the unit is flagged for IMU drift.

Baseline is computed from the first 10 IDLE readings after startup and updated slowly (exponential moving average, α=0.01) while in IDLE state. A sudden shift suggests the sensor unit was physically moved.

---

## WebSocket Message

```typescript
{
  type: "health_alert"
  unitId: string
  condition: "stuck_sensor" | "imu_drift"
  sensorIndex?: number   // for stuck_sensor: which sensor (1–6)
  message: string        // human-readable description
  ts: string
}

// Cleared when resolved:
{
  type: "health_alert_cleared"
  unitId: string
  condition: "stuck_sensor" | "imu_drift"
  sensorIndex?: number
  ts: string
}
```

---

## Frontend Display

Health warnings appear as a collapsible warning row inside `SensorUnitCard`, below the status header:

```
┌─────────────────────────────────────────┐
│  unit-01  Product Stand A  [online ●]   │
│  ⚠ Sensor 3 may be stuck (823mm × 12)  │
│  ⚠ IMU baseline drift detected         │
├─────────────────────────────────────────┤
│  [TofGrid]  [PirBadge]  [ImuBadge]     │
└─────────────────────────────────────────┘
```

Warnings are dismissible per-session (a dismissed warning reappears if the condition is re-triggered after clearing).

Health warnings are stored in the Zustand store as a map:

```typescript
type HealthWarning = {
  condition: string
  sensorIndex?: number
  message: string
  ts: string
}

// In WsStore per unit:
healthWarnings: HealthWarning[]
```

---

## File Map

| File | Action |
|------|--------|
| `backend/src/services/healthMonitor.ts` | New — HealthMonitor class |
| `backend/src/routes/sensors.ts` | Modify — call `healthMonitor.process()` after detection engine |
| `backend/src/index.ts` | Modify — instantiate HealthMonitor |
| `frontend/src/components/HealthWarningBar.tsx` | New |
| `frontend/src/components/SensorUnitCard.tsx` | Modify — render HealthWarningBar |
| `frontend/src/lib/wsStore.ts` | Modify — add `healthWarnings` per unit |

---

## Acceptance Criteria

- [ ] A unit that stops posting for >60s shows "Offline" on the dashboard (covered by DASH-01 + INFRA-03 unit registry).
- [ ] A sensor reporting the same value (±5mm) for 10 consecutive readings triggers a `health_alert` WS message with `condition: "stuck_sensor"`.
- [ ] The stuck sensor warning clears when the reading changes.
- [ ] IMU drift >0.3g from baseline triggers a `health_alert` WS message with `condition: "imu_drift"`.
- [ ] Health warnings appear in the unit card without blocking the sensor grid.
- [ ] Dismissing a warning hides it until the condition clears and re-triggers.

---

## Out of Scope

- Email / SMS / webhook health notifications (prototype is in-app only)
- Alerting on packet loss rate (no packet loss tracking in HTTP POST model)
- Hardware diagnostics beyond the sensor readings already available
