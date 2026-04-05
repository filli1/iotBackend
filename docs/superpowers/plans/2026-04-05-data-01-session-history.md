# DATA-01: Session History Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A paginated, filterable, sortable `/history` page showing all completed presence sessions with date range, unit, dwell, and pickup filters that persist in the URL.

**Architecture:** `GET /api/sessions` runs a server-side Prisma query with `where`, `orderBy`, `skip`, `take`. The frontend uses URL search params for filter state so the page is bookmarkable. CSV export is added in DATA-03.

**Tech Stack:** Fastify, Prisma, React Router, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/src/routes/sessions.ts` | Create | GET /api/sessions |
| `backend/src/routes/sessions.test.ts` | Create | Route tests |
| `backend/src/index.ts` | Modify | Register sessions route |
| `frontend/src/pages/HistoryPage.tsx` | Create | Table + filters |
| `frontend/src/components/SessionTable.tsx` | Create | Sortable table |
| `frontend/src/components/SessionFilters.tsx` | Create | Filter controls |
| `frontend/src/hooks/useSessions.ts` | Create | Fetch with URL param sync |
| `frontend/src/App.tsx` | Modify | Add /history route |

---

## Task 1: Backend Sessions Endpoint (TDD)

- [ ] **Step 1: Write failing tests — `backend/src/routes/sessions.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { sessionRoutes } from './sessions'
import { prisma } from '../lib/prisma'

async function buildApp() {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>()
  await app.register(sessionRoutes)
  return app
}

const UNIT_ID = 'sessions-test-unit'

beforeAll(async () => {
  await prisma.sensorUnit.create({
    data: { id: UNIT_ID, name: 'Test', location: 'L', productName: 'P', ipAddress: '1.1.1.1' },
  })
  const now = new Date()
  await prisma.presenceSession.createMany({
    data: [
      { unitId: UNIT_ID, startedAt: new Date(now.getTime() - 60000), endedAt: now, dwellSeconds: 45, productPickedUp: true, status: 'completed' },
      { unitId: UNIT_ID, startedAt: new Date(now.getTime() - 30000), endedAt: now, dwellSeconds: 10, productPickedUp: false, status: 'completed' },
      { unitId: UNIT_ID, startedAt: now, status: 'active' },
    ],
  })
})

afterAll(async () => {
  await prisma.sensorUnit.delete({ where: { id: UNIT_ID } })
})

describe('GET /api/sessions', () => {
  it('returns only completed sessions by default', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/sessions' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.every((s: { status: string }) => s.status === 'completed')).toBe(true)
  })

  it('filters by productPickedUp', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/sessions?productPickedUp=true' })
    const body = JSON.parse(res.body)
    expect(body.data.every((s: { productPickedUp: boolean }) => s.productPickedUp === true)).toBe(true)
  })

  it('filters by minDwellSeconds', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/sessions?minDwellSeconds=20' })
    const body = JSON.parse(res.body)
    expect(body.data.every((s: { dwellSeconds: number }) => s.dwellSeconds >= 20)).toBe(true)
  })

  it('returns correct pagination fields', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/sessions?pageSize=1' })
    const body = JSON.parse(res.body)
    expect(body.data).toHaveLength(1)
    expect(body.pageCount).toBeGreaterThan(1)
    expect(body.total).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 2: Run — expect to fail**

```bash
cd backend && npm run test -- sessions
```

Expected: FAIL — `Cannot find module './sessions'`

- [ ] **Step 3: Create `backend/src/routes/sessions.ts`**

```typescript
import { Type } from '@fastify/type-provider-typebox'
import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma'
import type { Prisma } from '@prisma/client'

const QuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
  sortBy: Type.Optional(Type.String({ default: 'startedAt' })),
  sortDir: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')], { default: 'desc' })),
  unitId: Type.Optional(Type.String()),
  dateFrom: Type.Optional(Type.String()),
  dateTo: Type.Optional(Type.String()),
  minDwellSeconds: Type.Optional(Type.Integer({ minimum: 0 })),
  productPickedUp: Type.Optional(Type.Boolean()),
})

function buildWhere(q: Record<string, unknown>): Prisma.PresenceSessionWhereInput {
  const where: Prisma.PresenceSessionWhereInput = { status: 'completed' }
  if (q.unitId) where.unitId = q.unitId as string
  if (q.dateFrom || q.dateTo) {
    where.startedAt = {}
    if (q.dateFrom) where.startedAt.gte = new Date(q.dateFrom as string)
    if (q.dateTo) where.startedAt.lt = new Date(q.dateTo as string)
  }
  if (q.minDwellSeconds !== undefined) where.dwellSeconds = { gte: q.minDwellSeconds as number }
  if (q.productPickedUp !== undefined) where.productPickedUp = q.productPickedUp as boolean
  return where
}

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/sessions',
    { schema: { querystring: QuerySchema } },
    async (request) => {
      const q = request.query as Record<string, unknown>
      const page = (q.page as number) ?? 1
      const pageSize = (q.pageSize as number) ?? 25
      const sortBy = (q.sortBy as string) ?? 'startedAt'
      const sortDir = (q.sortDir as 'asc' | 'desc') ?? 'desc'
      const where = buildWhere(q)

      const [total, rows] = await Promise.all([
        prisma.presenceSession.count({ where }),
        prisma.presenceSession.findMany({
          where,
          orderBy: { [sortBy]: sortDir },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { unit: { select: { name: true } } },
        }),
      ])

      return {
        data: rows.map(r => ({
          id: r.id,
          unitId: r.unitId,
          unitName: r.unit.name,
          startedAt: r.startedAt.toISOString(),
          endedAt: r.endedAt?.toISOString() ?? null,
          dwellSeconds: r.dwellSeconds,
          productPickedUp: r.productPickedUp,
          status: r.status,
        })),
        total,
        page,
        pageSize,
        pageCount: Math.ceil(total / pageSize),
      }
    }
  )
}
```

- [ ] **Step 4: Run — expect to pass**

```bash
npm run test -- sessions
```

Expected: all 4 tests pass.

- [ ] **Step 5: Register route in `backend/src/index.ts`**

```typescript
import { sessionRoutes } from './routes/sessions'
// ...
await fastify.register(sessionRoutes)
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/sessions.ts backend/src/routes/sessions.test.ts backend/src/index.ts
git commit -m "feat: add session history REST endpoint"
```

---

## Task 2: Frontend

- [ ] **Step 1: Create `frontend/src/hooks/useSessions.ts`**

```typescript
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'

export type Session = {
  id: string; unitId: string; unitName: string; startedAt: string
  endedAt: string | null; dwellSeconds: number; productPickedUp: boolean
}

type SessionsResponse = {
  data: Session[]; total: number; page: number; pageSize: number; pageCount: number
}

export function useSessions() {
  const [params, setParams] = useSearchParams()
  const [result, setResult] = useState<SessionsResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<SessionsResponse>(`/api/sessions?${params.toString()}`)
      setResult(res)
    } finally {
      setLoading(false)
    }
  }, [params])

  useEffect(() => { fetch() }, [fetch])

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    next.set('page', '1')
    setParams(next)
  }

  const setPage = (page: number) => {
    const next = new URLSearchParams(params)
    next.set('page', String(page))
    setParams(next)
  }

  return { result, loading, params, setFilter, setPage }
}
```

- [ ] **Step 2: Create `frontend/src/components/SessionFilters.tsx`**

```tsx
type Props = {
  params: URLSearchParams
  onFilter: (key: string, value: string | null) => void
}

export function SessionFilters({ params, onFilter }: Props) {
  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <input
        type="date"
        value={params.get('dateFrom') ?? ''}
        onChange={e => onFilter('dateFrom', e.target.value || null)}
        className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
        placeholder="From"
      />
      <input
        type="date"
        value={params.get('dateTo') ?? ''}
        onChange={e => onFilter('dateTo', e.target.value || null)}
        className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
        placeholder="To"
      />
      <input
        type="number"
        min={0}
        value={params.get('minDwellSeconds') ?? ''}
        onChange={e => onFilter('minDwellSeconds', e.target.value || null)}
        placeholder="Min dwell (s)"
        className="bg-gray-700 text-white rounded px-2 py-1 text-sm w-32"
      />
      <select
        value={params.get('productPickedUp') ?? ''}
        onChange={e => onFilter('productPickedUp', e.target.value || null)}
        className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
      >
        <option value="">Pickup: All</option>
        <option value="true">Pickup: Yes</option>
        <option value="false">Pickup: No</option>
      </select>
    </div>
  )
}
```

- [ ] **Step 3: Create `frontend/src/components/SessionTable.tsx`**

```tsx
import type { Session } from '../hooks/useSessions'

function formatDwell(s: number) {
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

type Props = { sessions: Session[]; sortBy: string; sortDir: string; onSort: (col: string) => void }

export function SessionTable({ sessions, sortBy, sortDir, onSort }: Props) {
  const arrow = (col: string) => sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-400 border-b border-gray-700">
          {[['unitName','Unit'],['startedAt','Started'],['dwellSeconds','Dwell'],['productPickedUp','Pickup']].map(([col, label]) => (
            <th
              key={col}
              onClick={() => onSort(col)}
              className="pb-2 pr-4 cursor-pointer hover:text-white select-none"
            >
              {label}{arrow(col)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sessions.map(s => (
          <tr key={s.id} className="border-b border-gray-800">
            <td className="py-2 pr-4">{s.unitName}</td>
            <td className="py-2 pr-4 text-gray-300 tabular-nums">{new Date(s.startedAt).toLocaleString()}</td>
            <td className="py-2 pr-4 tabular-nums">{formatDwell(s.dwellSeconds)}</td>
            <td className={`py-2 ${s.productPickedUp ? 'text-green-400' : 'text-gray-500'}`}>
              {s.productPickedUp ? 'Yes' : 'No'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Create `frontend/src/pages/HistoryPage.tsx`**

```tsx
import { useSessions } from '../hooks/useSessions'
import { SessionTable } from '../components/SessionTable'
import { SessionFilters } from '../components/SessionFilters'

export function HistoryPage() {
  const { result, loading, params, setFilter, setPage } = useSessions()

  const sortBy = params.get('sortBy') ?? 'startedAt'
  const sortDir = params.get('sortDir') ?? 'desc'

  const handleSort = (col: string) => {
    if (col === sortBy) {
      setFilter('sortDir', sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setFilter('sortBy', col)
      setFilter('sortDir', 'desc')
    }
  }

  const handleExport = () => {
    const p = new URLSearchParams(params)
    window.open(`http://localhost:7000/api/sessions/export.csv?${p.toString()}`, '_blank')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Session History</h1>
          <button onClick={handleExport} className="text-sm text-blue-400 hover:text-blue-300">
            Export CSV ↓
          </button>
        </div>

        <SessionFilters params={params} onFilter={setFilter} />

        {loading ? (
          <p className="text-gray-400">Loading…</p>
        ) : !result || result.data.length === 0 ? (
          <p className="text-gray-400">No sessions found.</p>
        ) : (
          <>
            <SessionTable sessions={result.data} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
              <button disabled={result.page <= 1} onClick={() => setPage(result.page - 1)} className="px-3 py-1 rounded bg-gray-700 disabled:opacity-40">← Prev</button>
              <span>Page {result.page} of {result.pageCount} ({result.total} sessions)</span>
              <button disabled={result.page >= result.pageCount} onClick={() => setPage(result.page + 1)} className="px-3 py-1 rounded bg-gray-700 disabled:opacity-40">Next →</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Add route to `frontend/src/App.tsx`**

```tsx
import { HistoryPage } from './pages/HistoryPage'
// Inside <Routes>:
<Route path="/history" element={<HistoryPage />} />
```

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck -w frontend
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/ backend/src/
git commit -m "feat: add session history page with filters and pagination"
```
