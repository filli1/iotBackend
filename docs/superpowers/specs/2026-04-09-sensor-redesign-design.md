# Sensor Redesign — Design Spec
Date: 2026-04-09

## Overview

Four changes to reflect updated hardware mounting and real-world constraints:

1. **Remove PIR from sensor reading payload** — PIR stays on-device only
2. **IMU replaced with vibration intensity** — sensor is fixed-mount; raw axes replaced by a single RMS scalar; IMU is optional per unit
3. **Variable ToF sensor count** — units can have 1–6 ToF sensors, not always 6
4. **Explicit ping endpoint** — lightweight heartbeat separate from sensor data
5. **`productPickedUp` → `productInteracted`** — rename throughout to match new detection semantics

---

## Section 1 — Sensor Reading Payload

### POST `/api/sensors/data` body

```json
{
  "unit_id": "unit-01",
  "ts": 1711612800000,
  "tof": [
    { "id": 1, "distance_mm": 823, "status": "valid" },
    { "id": 2, "distance_mm": 790, "status": "valid" }
  ],
  "imu": {
    "vibration_intensity": 0.04
  }
}
```

- `pir` field removed entirely. `pir_trigger` removed from `HardwareEventType`.
- `tof` accepts 1–6 entries. No longer validated as exactly 6.
- `imu` is optional. When absent the backend treats the unit as having no IMU installed/enabled.
- `vibration_intensity` is a float in g RMS, computed by the Arduino by sampling the accelerometer internally at the highest available ODR ≤ 200 Hz over the 500 ms window, applying the hardware high-pass filter (or subtracting gravity in software), and computing RMS magnitude.

### IMU enabled flag

`UnitConfiguration` gains `imuEnabled: Boolean` (default `true`). When `false`:
- Backend ignores any `imu` field in the payload
- Vibration-based interaction detection is skipped
- IMU section is hidden on the Configure page and unit card

---

## Section 2 — Hardware Events

### Updated `HardwareEventType`

| Event | Trigger | `value` fields |
|---|---|---|
| `imu_vibration` | Vibration intensity spike above threshold, sustained > 150 ms | `{ "intensity": 0.42 }` |
| `imu_shock` | Single-sample acceleration spike above a higher threshold | `{ "peak_g": 1.82, "axis": "x"\|"y"\|"z" }` |

Removed: `imu_pickup`, `imu_rotation`, `pir_trigger`.

`imu_vibration` during an active presence session sets `productInteracted = true` on that session.

### `UnitConfiguration` field renames

| Old | New | Default |
|---|---|---|
| `imuPickupThresholdG` | `imuVibrationThreshold` | `0.08` (g RMS) |
| `imuExaminationEnabled` | `imuEnabled` | `true` |
| `imuDurationThresholdMs` | unchanged | `150` |

---

## Section 3 — Variable ToF Sensors

### Backend

- Remove hardcoded "exactly 6 entries" validation from ingest route schema.
- Accept any non-empty array where each `id` matches a sensor configured for the unit.
- Detection engine `minSensorAgreement` already operates on a count — no logic change needed.

### Frontend

- `TofGrid` on `SensorUnitCard`: render one cell per sensor in `unit.tofSensors`, using `sensor.label` as the cell header. Remove fixed 6-cell layout.
- Calibration page sensor list: render dynamically.
- Configure page: already maps over `tofSensors` from API. Add "Add sensor" / "Remove sensor" buttons if missing, allowing 1–6 slots. Each slot: index (auto-assigned), label, minDist, maxDist.

### No DB change

`TofSensor` model already has a per-unit relation with a `[unitId, index]` unique constraint. Supports 1–6 naturally.

---

## Section 4 — Online/Offline Ping

### New endpoint: `POST /api/sensors/ping`

- Auth: `X-Api-Key` header (same as sensor data)
- Body: `{ "unit_id": "unit-01" }`
- Response: `204 No Content`
- Effect: updates the `unitRegistry` last-seen timestamp for the unit (identical to receiving sensor data)
- On `401`: Arduino logs "Invalid API key" and halts (same behaviour as sensor data endpoint)

### Arduino behaviour

- Calls `/api/sensors/ping` every **30 seconds** as a fallback heartbeat
- During normal operation the 500 ms sensor data posts keep the unit online
- Ping only matters during idle/error states where no sensor data is flowing

### No DB change

`unitRegistry` is in-memory. The existing 60-second offline threshold and 30-second check interval are unchanged.

---

## Section 5 — Renamed Fields

### `productPickedUp` → `productInteracted`

All occurrences renamed throughout the stack:

| Location | Old | New |
|---|---|---|
| `PresenceSession` (Prisma) | `productPickedUp: Boolean` | `productInteracted: Boolean` |
| `AlertRule` (Prisma) | `requirePickup: Boolean` | `requireInteraction: Boolean` |
| `types/sensor.ts` | `HardwareEventType`, `DetectionEvent` | updated |
| `routes/sensors.ts` | ingest schema | updated |
| `routes/sessions.ts` | filter param `productPickedUp` | `productInteracted` |
| `routes/analytics.ts` | `pickupRate` in summary | `interactionRate` |
| `services/detectionEngine.ts` | event names, threshold fields | updated |
| `services/sessionManager.ts` | DB writes, alert condition | updated |
| `wsStore.ts` | `UnitLiveState` type, message handlers | updated |
| `HistoryPage` | filter label, column, CSV header | updated |
| `AnalyticsPage` | summary card label | updated |
| `SensorUnitCard` | IMU badge states | Vibration / Shock / Idle |
| `ConfigurePage` | IMU section labels, `imuEnabled` toggle | updated |

### DB migration

A Prisma migration covers all column renames and new columns:
```sql
-- PresenceSession
ALTER TABLE "PresenceSession" RENAME COLUMN "productPickedUp" TO "productInteracted";

-- AlertRule
ALTER TABLE "AlertRule" RENAME COLUMN "requirePickup" TO "requireInteraction";

-- UnitConfiguration
ALTER TABLE "UnitConfiguration" RENAME COLUMN "imuPickupThresholdG" TO "imuVibrationThreshold";
ALTER TABLE "UnitConfiguration" RENAME COLUMN "imuExaminationEnabled" TO "imuEnabled";
```

---

## Out of Scope

- Changing the WebSocket protocol or adding new message types
- Changing the presence detection state machine logic
- Any OTA or MQTT work
- Filtering or processing vibration frequency content on the backend
