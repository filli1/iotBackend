# INFRA-02: Prisma Schema & Migrations — Design Spec

**Date:** 2026-04-04
**Backlog item:** INFRA-02
**Status:** Draft

---

## Goal

Define the complete SQLite data model via Prisma, run the initial migration, and expose a single shared Prisma client instance used by all backend services.

---

## Approach

Single `schema.prisma` file in `backend/prisma/`. One shared client in `backend/src/lib/prisma.ts` — imported by routes and services; never instantiated elsewhere. SQLite for prototype, swappable to PostgreSQL by changing one line.

---

## Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model SensorUnit {
  id          String   @id              // matches "unit_id" in Arduino sketch (e.g. "unit-01")
  name        String
  location    String
  productName String
  ipAddress   String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tofSensors    TofSensor[]
  sessions      PresenceSession[]
  alertRule     AlertRule?
  configuration UnitConfiguration?
}

model TofSensor {
  id       String @id @default(cuid())
  unitId   String
  index    Int    // 1–6, matches Arduino tof[].id
  label    String // "left-wide" | "left" | "center-left" | "center-right" | "right" | "right-wide"
  minDist  Int    // mm — readings below this are ignored
  maxDist  Int    // mm — readings above this mean "no presence" in this sensor's zone

  unit SensorUnit @relation(fields: [unitId], references: [id], onDelete: Cascade)

  @@unique([unitId, index])
}

model PresenceSession {
  id              String    @id @default(cuid())
  unitId          String
  startedAt       DateTime
  endedAt         DateTime?
  dwellSeconds    Int       @default(0)
  productPickedUp Boolean   @default(false)
  status          String    @default("active") // "active" | "completed"

  unit   SensorUnit     @relation(fields: [unitId], references: [id], onDelete: Cascade)
  events SessionEvent[]
}

model SessionEvent {
  id        String   @id @default(cuid())
  sessionId String
  type      String   // "person_detected" | "product_picked_up" | "product_put_down" | "session_ended"
  ts        DateTime
  payload   String?  // JSON string for extra event data

  session PresenceSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}

model AlertRule {
  id                    String  @id @default(cuid())
  unitId                String  @unique
  dwellThresholdSeconds Int     @default(30)
  requirePickup         Boolean @default(false)
  enabled               Boolean @default(true)

  unit SensorUnit @relation(fields: [unitId], references: [id], onDelete: Cascade)
}

model UnitConfiguration {
  id                      String  @id @default(cuid())
  unitId                  String  @unique
  minSensorAgreement      Int     @default(2)    // how many of 6 ToF sensors must detect
  departureTimeoutSeconds Int     @default(5)    // seconds absent before session ends
  dwellMinSeconds         Int     @default(3)    // min dwell before session is recorded
  pirEnabled              Boolean @default(true)
  pirCooldownSeconds      Int     @default(10)
  imuPickupThresholdG     Float   @default(1.5)  // g-force to classify as pickup
  imuExaminationEnabled   Boolean @default(true)
  imuDurationThresholdMs  Int     @default(500)  // distinguishes bump from intentional pickup

  unit SensorUnit @relation(fields: [unitId], references: [id], onDelete: Cascade)
}
```

---

## Key Decisions

- `SensorUnit.id` is a user-supplied string (e.g. `"unit-01"`) that matches the `unit_id` hardcoded in the Arduino sketch. This avoids a separate ID-mapping layer.
- `TofSensor` rows are seeded when a unit is registered (SETUP-01) with default labels and thresholds. Configurable via SETUP-02.
- `AlertRule` and `UnitConfiguration` are created automatically with defaults when a `SensorUnit` is registered.
- `SessionEvent.payload` stores JSON as a string — no need for a separate JSONB column in SQLite.
- All foreign keys use `onDelete: Cascade` so deleting a unit removes all related data.

---

## Environment

`DATABASE_URL` must be set in `backend/.env`:

```
DATABASE_URL="file:../data/store-attention.db"
```

The `data/` directory sits at the monorepo root, outside `backend/`, so it is not accidentally wiped by a workspace clean.

Add to root `.gitignore`:
```
data/
```

---

## Shared Client

`backend/src/lib/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()
```

Import this instance in routes and services. Never call `new PrismaClient()` elsewhere.

---

## Commands

```bash
# After schema changes:
npx prisma migrate dev --name <description>
npx prisma generate

# Initial setup:
npx prisma migrate dev --name init
```

---

## Acceptance Criteria

- [ ] `npx prisma migrate dev --name init` runs without errors and creates `data/store-attention.db`.
- [ ] `npx prisma generate` produces a typed client with all models.
- [ ] `prisma.sensorUnit.create(...)` works from a test script with no TypeScript errors.
- [ ] Deleting a `SensorUnit` cascades to all related rows.
- [ ] `data/` directory is in `.gitignore`.

---

## Out of Scope

- Seed data (added in SETUP-01 when registration flow is built)
- Analytics queries (DATA-02 uses `prisma.$queryRaw`)
- PostgreSQL migration (swap `provider` and `url` when needed)
