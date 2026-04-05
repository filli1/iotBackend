# INFRA-02: Prisma Schema & Migrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up Prisma with SQLite, define all six data models, run the initial migration, and expose a single shared client instance.

**Architecture:** Prisma lives in `backend/prisma/`. A singleton client is exported from `backend/src/lib/prisma.ts`. The `data/` directory at the monorepo root holds the SQLite file and is git-ignored.

**Tech Stack:** Prisma 5, SQLite, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/prisma/schema.prisma` | Create | All six models |
| `backend/.env` | Create | `DATABASE_URL` pointing to `../../data/store-attention.db` |
| `backend/src/lib/prisma.ts` | Create | Singleton PrismaClient export |
| `backend/src/lib/prisma.test.ts` | Create | Smoke test: connect + create + delete a SensorUnit |
| `.gitignore` | Modify | Add `data/` |
| `backend/package.json` | Modify | Add `prisma`, `@prisma/client` deps; add `db:migrate` and `db:generate` scripts |

---

## Task 1: Install Prisma

- [ ] **Step 1: Add dependencies to `backend/package.json`**

Open `backend/package.json`. Add to `dependencies`:
```json
"@prisma/client": "^5.0.0"
```
Add to `devDependencies`:
```json
"prisma": "^5.0.0"
```
Add to `scripts`:
```json
"db:generate": "prisma generate",
"db:migrate": "prisma migrate dev"
```

- [ ] **Step 2: Install**

```bash
npm install
```

Expected: no errors, `@prisma/client` and `prisma` appear in `backend/node_modules`.

---

## Task 2: Create `.env` and gitignore `data/`

- [ ] **Step 1: Create `backend/.env`**

```
DATABASE_URL="file:../../data/store-attention.db"
```

The path is relative to the `prisma/` directory inside `backend/`, so `../../data/` resolves to the monorepo root's `data/` folder.

- [ ] **Step 2: Add `data/` to root `.gitignore`**

Open the root `.gitignore` and append:
```
data/
backend/.env
```

- [ ] **Step 3: Create the `data/` directory**

```bash
mkdir -p data
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore backend/package.json
git commit -m "chore: add prisma dependency and data directory"
```

---

## Task 3: Write the Prisma Schema

- [ ] **Step 1: Create `backend/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model SensorUnit {
  id          String   @id
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
  id      String @id @default(cuid())
  unitId  String
  index   Int
  label   String
  minDist Int
  maxDist Int

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
  status          String    @default("active")

  unit   SensorUnit     @relation(fields: [unitId], references: [id], onDelete: Cascade)
  events SessionEvent[]
}

model SessionEvent {
  id        String   @id @default(cuid())
  sessionId String
  type      String
  ts        DateTime
  payload   String?

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
  minSensorAgreement      Int     @default(2)
  departureTimeoutSeconds Int     @default(5)
  dwellMinSeconds         Int     @default(3)
  pirEnabled              Boolean @default(true)
  pirCooldownSeconds      Int     @default(10)
  imuPickupThresholdG     Float   @default(1.5)
  imuExaminationEnabled   Boolean @default(true)
  imuDurationThresholdMs  Int     @default(500)

  unit SensorUnit @relation(fields: [unitId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 2: Run the initial migration**

```bash
cd backend && npx prisma migrate dev --name init
```

Expected: Prisma creates `backend/prisma/migrations/` and `data/store-attention.db` with all tables.

- [ ] **Step 3: Generate the client**

```bash
npx prisma generate
```

Expected: `@prisma/client` is updated with typed methods for all models.

- [ ] **Step 4: Commit**

```bash
cd ..
git add backend/prisma/ backend/package.json
git commit -m "feat: add prisma schema with all six models"
```

---

## Task 4: Shared Prisma Client

- [ ] **Step 1: Create `backend/src/lib/prisma.ts`**

```typescript
import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()
```

- [ ] **Step 2: Write the smoke test — `backend/src/lib/prisma.test.ts`**

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from './prisma'

describe('prisma client', () => {
  afterEach(async () => {
    await prisma.sensorUnit.deleteMany({ where: { id: 'test-unit' } })
  })

  it('can create and read a SensorUnit', async () => {
    const unit = await prisma.sensorUnit.create({
      data: {
        id: 'test-unit',
        name: 'Test',
        location: 'Lab',
        productName: 'Widget',
        ipAddress: '192.168.1.1',
      },
    })

    expect(unit.id).toBe('test-unit')
    expect(unit.name).toBe('Test')

    const found = await prisma.sensorUnit.findUnique({ where: { id: 'test-unit' } })
    expect(found).not.toBeNull()
  })

  it('cascades delete to related TofSensor rows', async () => {
    await prisma.sensorUnit.create({
      data: {
        id: 'test-unit',
        name: 'Test',
        location: 'Lab',
        productName: 'Widget',
        ipAddress: '192.168.1.1',
        tofSensors: {
          create: { index: 1, label: 'left', minDist: 50, maxDist: 1000 },
        },
      },
    })

    await prisma.sensorUnit.delete({ where: { id: 'test-unit' } })

    const sensors = await prisma.tofSensor.findMany({ where: { unitId: 'test-unit' } })
    expect(sensors).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run the test — expect it to pass**

```bash
cd backend && npm run test
```

Expected: both tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/
git commit -m "feat: add shared prisma client with smoke tests"
```

---

## Task 5: Typecheck

- [ ] **Step 1: Run typecheck on backend**

```bash
npm run typecheck -w backend
```

Expected: zero errors. If Prisma types are not found, re-run `npx prisma generate` from inside `backend/`.
