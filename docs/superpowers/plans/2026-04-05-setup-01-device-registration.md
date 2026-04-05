# SETUP-01: Device Registration UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** REST endpoints to register/list/delete sensor units, plus a frontend page to manage them.

**Architecture:** `POST /api/units` creates a unit with all defaults (config, alert rule, 6 ToF sensors) in one Prisma transaction and registers it in the `UnitRegistry`. The frontend `/setup/units` page lists units and hosts a registration form. React Router is added in this task.

**Tech Stack:** Fastify, Prisma, React Router, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/src/routes/units.ts` | Create | POST, GET, DELETE /api/units |
| `backend/src/routes/units.test.ts` | Create | Route tests |
| `backend/src/index.ts` | Modify | Register units route; expose registry to routes |
| `frontend/src/pages/SetupUnitsPage.tsx` | Create | Unit list + registration form |
| `frontend/src/components/UnitRegistrationForm.tsx` | Create | Controlled form with validation |
| `frontend/src/components/DeleteConfirmModal.tsx` | Create | Confirmation dialog |
| `frontend/src/hooks/useUnits.ts` | Create | fetch/create/delete units |
| `frontend/src/lib/api.ts` | Create | Base fetch wrapper |
| `frontend/src/App.tsx` | Modify | Add React Router + routes |
| `frontend/package.json` | Modify | Add `react-router-dom`, `zustand` |

---

## Task 1: Frontend Dependencies

- [ ] **Step 1: Add to `frontend/package.json` dependencies**

```json
"react-router-dom": "^6.0.0",
"zustand": "^4.0.0"
```

- [ ] **Step 2: Install**

```bash
npm install
```

---

## Task 2: Backend — Units Route (TDD)

- [ ] **Step 1: Write failing tests — `backend/src/routes/units.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { unitRoutes } from './units'
import { UnitRegistry } from '../lib/unitRegistry'
import { prisma } from '../lib/prisma'

function buildApp(registry: UnitRegistry) {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>()
  app.register(unitRoutes, { registry })
  return app
}

describe('/api/units', () => {
  let registry: UnitRegistry

  beforeEach(() => {
    registry = new UnitRegistry()
  })

  afterEach(async () => {
    registry.stop()
    await prisma.sensorUnit.deleteMany({ where: { id: { in: ['reg-test-01', 'reg-test-02'] } } })
  })

  it('POST creates a unit and returns 201', async () => {
    const app = buildApp(registry)
    const res = await app.inject({
      method: 'POST',
      url: '/api/units',
      payload: { id: 'reg-test-01', name: 'Stand A', location: 'Aisle 1', productName: 'Widget', ipAddress: '192.168.1.10' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.id).toBe('reg-test-01')
  })

  it('POST returns 409 for duplicate id', async () => {
    const app = buildApp(registry)
    await app.inject({
      method: 'POST',
      url: '/api/units',
      payload: { id: 'reg-test-02', name: 'Stand B', location: 'Aisle 2', productName: 'Gadget', ipAddress: '192.168.1.11' },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/units',
      payload: { id: 'reg-test-02', name: 'Stand B', location: 'Aisle 2', productName: 'Gadget', ipAddress: '192.168.1.11' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('GET returns list of units', async () => {
    const app = buildApp(registry)
    await app.inject({
      method: 'POST',
      url: '/api/units',
      payload: { id: 'reg-test-01', name: 'Stand A', location: 'Aisle 1', productName: 'Widget', ipAddress: '192.168.1.10' },
    })
    const res = await app.inject({ method: 'GET', url: '/api/units' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.units.some((u: { id: string }) => u.id === 'reg-test-01')).toBe(true)
  })

  it('DELETE removes the unit', async () => {
    const app = buildApp(registry)
    await app.inject({
      method: 'POST',
      url: '/api/units',
      payload: { id: 'reg-test-01', name: 'Stand A', location: 'Aisle 1', productName: 'Widget', ipAddress: '192.168.1.10' },
    })
    const res = await app.inject({ method: 'DELETE', url: '/api/units/reg-test-01' })
    expect(res.statusCode).toBe(200)
    const found = await prisma.sensorUnit.findUnique({ where: { id: 'reg-test-01' } })
    expect(found).toBeNull()
  })
})
```

- [ ] **Step 2: Run — expect to fail**

```bash
cd backend && npm run test -- units
```

Expected: FAIL — `Cannot find module './units'`

- [ ] **Step 3: Create `backend/src/routes/units.ts`**

```typescript
import { Type } from '@fastify/type-provider-typebox'
import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma'
import type { UnitRegistry } from '../lib/unitRegistry'

const DEFAULT_TOF_LABELS = ['left-wide', 'left', 'center-left', 'center-right', 'right', 'right-wide']

const CreateUnitBody = Type.Object({
  id: Type.String({ minLength: 3, maxLength: 32 }),
  name: Type.String({ minLength: 1 }),
  location: Type.String({ minLength: 1 }),
  productName: Type.String({ minLength: 1 }),
  ipAddress: Type.String({ minLength: 1 }),
})

type PluginOptions = { registry: UnitRegistry }

export const unitRoutes: FastifyPluginAsync<PluginOptions> = async (fastify, opts) => {
  fastify.post(
    '/api/units',
    { schema: { body: CreateUnitBody } },
    async (request, reply) => {
      const { id, name, location, productName, ipAddress } = request.body

      const existing = await prisma.sensorUnit.findUnique({ where: { id } })
      if (existing) return reply.status(409).send({ error: 'Unit ID already exists' })

      const unit = await prisma.sensorUnit.create({
        data: {
          id, name, location, productName, ipAddress,
          configuration: {
            create: {},
          },
          alertRule: {
            create: {},
          },
          tofSensors: {
            create: DEFAULT_TOF_LABELS.map((label, i) => ({
              index: i + 1,
              label,
              minDist: 50,
              maxDist: 1000,
            })),
          },
        },
      })

      opts.registry.register(unit.id)
      return reply.status(201).send(unit)
    }
  )

  fastify.get('/api/units', async () => {
    const units = await prisma.sensorUnit.findMany({ orderBy: { createdAt: 'asc' } })
    return {
      units: units.map(u => ({
        ...u,
        online: opts.registry.getStatus(u.id)?.online ?? false,
        lastSeen: opts.registry.getStatus(u.id)?.lastSeen ?? null,
      })),
    }
  })

  fastify.delete('/api/units/:unitId', async (request, reply) => {
    const { unitId } = request.params as { unitId: string }
    await prisma.sensorUnit.delete({ where: { id: unitId } })
    return { ok: true }
  })
}
```

- [ ] **Step 4: Run — expect to pass**

```bash
npm run test -- units
```

Expected: all 4 tests pass.

- [ ] **Step 5: Register route in `backend/src/index.ts`**

Add after the cors registration:
```typescript
import { unitRoutes } from './routes/units'
// ...
await fastify.register(unitRoutes, { registry })
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/units.ts backend/src/routes/units.test.ts backend/src/index.ts
git commit -m "feat: add unit registration REST endpoints"
```

---

## Task 3: Frontend API Client

- [ ] **Step 1: Create `frontend/src/lib/api.ts`**

```typescript
const BASE = 'http://localhost:7000'

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}
```

---

## Task 4: Frontend — `useUnits` Hook

- [ ] **Step 1: Create `frontend/src/hooks/useUnits.ts`**

```typescript
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'

export type Unit = {
  id: string
  name: string
  location: string
  productName: string
  ipAddress: string
  online: boolean
  lastSeen: string | null
  createdAt: string
}

export function useUnits() {
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ units: Unit[] }>('/api/units')
      setUnits(data.units)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const createUnit = async (body: Omit<Unit, 'online' | 'lastSeen' | 'createdAt'>) => {
    await apiFetch('/api/units', { method: 'POST', body: JSON.stringify(body) })
    await load()
  }

  const deleteUnit = async (unitId: string) => {
    await apiFetch(`/api/units/${unitId}`, { method: 'DELETE' })
    await load()
  }

  return { units, loading, error, createUnit, deleteUnit, reload: load }
}
```

---

## Task 5: Frontend — Components and Page

- [ ] **Step 1: Create `frontend/src/components/DeleteConfirmModal.tsx`**

```tsx
type Props = {
  unitName: string
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteConfirmModal({ unitName, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold text-white mb-2">Delete unit?</h2>
        <p className="text-gray-300 mb-6">
          This will permanently delete <strong>{unitName}</strong> and all its session history.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded bg-gray-600 text-white hover:bg-gray-500">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-500">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `frontend/src/components/UnitRegistrationForm.tsx`**

```tsx
import { useState } from 'react'
import type { Unit } from '../hooks/useUnits'

type FormData = Omit<Unit, 'online' | 'lastSeen' | 'createdAt'>

type Props = {
  onSubmit: (data: FormData) => Promise<void>
  onCancel: () => void
}

export function UnitRegistrationForm({ onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<FormData>({ id: '', name: '', location: '', productName: '', ipAddress: '' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSubmit(form)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {(
        [
          { field: 'id', label: 'Unit ID', placeholder: 'unit-01' },
          { field: 'name', label: 'Display Name', placeholder: 'Product Stand A' },
          { field: 'location', label: 'Location', placeholder: 'Aisle 3, shelf 2' },
          { field: 'productName', label: 'Product Name', placeholder: 'Widget X' },
          { field: 'ipAddress', label: 'Arduino IP Address', placeholder: '192.168.1.10' },
        ] as { field: keyof FormData; label: string; placeholder: string }[]
      ).map(({ field, label, placeholder }) => (
        <div key={field}>
          <label className="block text-sm text-gray-300 mb-1">{label}</label>
          <input
            required
            value={form[field]}
            onChange={set(field)}
            placeholder={placeholder}
            className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      ))}
      <div className="flex gap-3 justify-end pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded bg-gray-600 text-white hover:bg-gray-500 text-sm">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 text-sm disabled:opacity-50">
          {saving ? 'Saving…' : 'Register Unit'}
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Create `frontend/src/pages/SetupUnitsPage.tsx`**

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useUnits } from '../hooks/useUnits'
import { UnitRegistrationForm } from '../components/UnitRegistrationForm'
import { DeleteConfirmModal } from '../components/DeleteConfirmModal'

export function SetupUnitsPage() {
  const { units, loading, createUnit, deleteUnit } = useUnits()
  const [showForm, setShowForm] = useState(false)
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null)

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Registered Units</h1>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm"
          >
            + Add Unit
          </button>
        </div>

        {showForm && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Register New Unit</h2>
            <UnitRegistrationForm
              onSubmit={async data => { await createUnit(data); setShowForm(false) }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {loading ? (
          <p className="text-gray-400">Loading…</p>
        ) : units.length === 0 ? (
          <p className="text-gray-400">No units registered yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-700">
                <th className="pb-2 pr-4">ID</th>
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Product</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {units.map(unit => (
                <tr key={unit.id} className="border-b border-gray-800">
                  <td className="py-3 pr-4 font-mono text-gray-300">{unit.id}</td>
                  <td className="py-3 pr-4">{unit.name}</td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex items-center gap-1 text-xs ${unit.online ? 'text-green-400' : 'text-gray-500'}`}>
                      <span className={`w-2 h-2 rounded-full ${unit.online ? 'bg-green-400' : 'bg-gray-500'}`} />
                      {unit.online ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-gray-300">{unit.productName}</td>
                  <td className="py-3 flex gap-3 justify-end">
                    <Link to={`/setup/units/${unit.id}/configure`} className="text-blue-400 hover:text-blue-300 text-xs">
                      Configure ▸
                    </Link>
                    <button
                      onClick={() => setDeleting({ id: unit.id, name: unit.name })}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {deleting && (
        <DeleteConfirmModal
          unitName={deleting.name}
          onConfirm={async () => { await deleteUnit(deleting.id); setDeleting(null) }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Update `frontend/src/App.tsx` to use React Router**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SetupUnitsPage } from './pages/SetupUnitsPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/setup/units" replace />} />
        <Route path="/setup/units" element={<SetupUnitsPage />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck -w frontend
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ frontend/package.json
git commit -m "feat: add device registration page and REST endpoints"
```

---

## Task 6: Manual Smoke Test

- [ ] **Step 1: Start both servers**

```bash
npm run dev
```

- [ ] **Step 2: Open `http://localhost:5174/setup/units`**

Expected: "Registered Units" page with "No units registered yet."

- [ ] **Step 3: Register a unit**

Fill in the form: ID `unit-01`, Name `Stand A`, Location `Aisle 1`, Product `Widget`, IP `192.168.1.1`. Click "Register Unit".

Expected: Unit appears in the table with "Offline" status.

- [ ] **Step 4: Verify in database**

```bash
cd backend && npx prisma studio
```

Check that `SensorUnit`, `UnitConfiguration`, `AlertRule`, and 6 `TofSensor` rows were created.
