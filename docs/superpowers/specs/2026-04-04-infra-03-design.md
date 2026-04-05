# INFRA-03: Sensor Data Ingest Endpoint — Design Spec

**Date:** 2026-04-04
**Backlog item:** INFRA-03
**Status:** Draft

---

## Goal

Accept raw sensor payloads from the Arduino over HTTP POST, validate them, mark the unit as online, and forward the data to the detection engine. No MQTT — plain HTTP POST for POC simplicity.

---

## Approach

Single Fastify route `POST /api/sensors/data` that handles two payload shapes (sensor reading and hardware event). Both are validated with TypeBox schemas. After validation, readings are forwarded to `DetectionEngine` and the unit's last-seen timestamp is updated in memory (not in DB — avoids write-per-request).

---

## Endpoint

```
POST /api/sensors/data
Content-Type: application/json
Port: 7000
```

### Payload Shape 1 — Sensor Reading (sent every ~500ms)

```typescript
{
  unit_id: string            // e.g. "unit-01"
  ts: number                 // Unix ms timestamp
  tof: Array<{
    id: number               // 1–6
    distance_mm: number
    status: "valid" | "out_of_range" | "error"
  }>
  pir: {
    triggered: boolean
    last_trigger_ms: number
  }
  imu: {
    accel: { x: number; y: number; z: number }
    gyro:  { x: number; y: number; z: number }
    mag:   { x: number; y: number; z: number }
  }
}
```

### Payload Shape 2 — Hardware Event (sent on discrete sensor events)

```typescript
{
  unit_id: string
  ts: number
  event: "pir_trigger" | "imu_shock" | "imu_pickup" | "imu_rotation"
  value: Record<string, unknown>
}
```

The route discriminates between shapes by checking for the presence of `tof` vs `event` field.

---

## Route Implementation

```
backend/src/routes/sensors.ts
```

Responsibilities:
1. Validate payload with TypeBox (reject malformed payloads with 400)
2. Look up the unit in memory cache (see Unit Registry below)
3. If unit is unknown, return 404 — the unit must be registered via SETUP-01 before it can post data
4. Update the unit's `lastSeen` timestamp in the registry
5. If payload is a sensor reading → call `detectionEngine.process(unitId, reading)`
6. If payload is a hardware event → call `detectionEngine.processEvent(unitId, event)`
7. Return `{ ok: true }` with 200

Error responses:
- `400` — TypeBox validation failure (Fastify handles automatically via schema)
- `404` — unit_id not registered
- `500` — unexpected error (logged, generic message returned)

---

## Unit Registry

A lightweight in-memory map maintained in `backend/src/lib/unitRegistry.ts`:

```typescript
type UnitStatus = {
  lastSeen: Date
  online: boolean
}

const registry = new Map<string, UnitStatus>()
```

- Populated at startup by reading all `SensorUnit` rows from the database.
- Updated on every ingest request (`lastSeen = now`, `online = true`).
- A background timer runs every 30 seconds: units not seen for > 60 seconds are marked `online = false` and a `unit_offline` WebSocket message is broadcast (used by ALERT-02).
- The registry is the source of truth for online/offline status — not the database.

---

## CORS

CORS is configured on the Fastify instance in `backend/src/index.ts` (added in this item). Arduino does not need CORS (it is not a browser), but the frontend does for REST calls.

```typescript
import cors from '@fastify/cors'
await fastify.register(cors, { origin: 'http://localhost:5173' })
```

---

## File Map

| File | Action |
|------|--------|
| `backend/src/routes/sensors.ts` | New — POST /api/sensors/data route |
| `backend/src/lib/unitRegistry.ts` | New — in-memory online/offline tracker |
| `backend/src/index.ts` | Modify — register CORS + sensors route |

---

## Acceptance Criteria

- [ ] `POST /api/sensors/data` with a valid sensor reading payload returns `{ ok: true }` with 200.
- [ ] `POST /api/sensors/data` with a valid hardware event payload returns `{ ok: true }` with 200.
- [ ] Malformed payload (missing `tof`, wrong types) returns 400.
- [ ] Unknown `unit_id` returns 404.
- [ ] The unit's `lastSeen` is updated in the registry on every valid request.
- [ ] TypeScript strict mode passes with no errors on the route file.

---

## Out of Scope

- Persisting raw sensor readings to the database (only processed events are stored)
- MQTT transport (future swap, no broker required for POC)
- Rate limiting (acceptable for prototype)
- Authentication on the ingest endpoint (Arduino cannot easily send auth headers in POC)
