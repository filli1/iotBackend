# DATA-02: Aggregate Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An `/analytics` page with summary stat cards, a daily bar chart, a peak-hours heatmap, and a dwell trend line chart. Period and unit filters persist in the URL.

**Architecture:** Four backend endpoints compute aggregations with `prisma.$queryRaw` SQL. The frontend uses Recharts for bar and line charts and a CSS Grid heatmap. All filters are URL params.

**Tech Stack:** Fastify, Prisma raw SQL, Recharts, React, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/src/lib/analyticsQueries.ts` | Create | Raw SQL query functions |
| `backend/src/routes/analytics.ts` | Create | 4 GET endpoints |
| `backend/src/index.ts` | Modify | Register analytics route |
| `frontend/src/hooks/useAnalytics.ts` | Create | Fetch all 4 analytics endpoints |
| `frontend/src/components/SummaryCards.tsx` | Create | 4 stat cards |
| `frontend/src/components/DailyBarChart.tsx` | Create | Recharts BarChart |
| `frontend/src/components/HeatmapGrid.tsx` | Create | CSS Grid 7×24 heatmap |
| `frontend/src/components/DwellTrendChart.tsx` | Create | Recharts LineChart |
| `frontend/src/pages/AnalyticsPage.tsx` | Create | Full page with period/unit filter |
| `frontend/src/App.tsx` | Modify | Add /analytics route |
| `frontend/package.json` | Modify | Add `recharts` |

---

## Task 1: Install Recharts

- [ ] **Step 1: Add to `frontend/package.json` dependencies**

```json
"recharts": "^2.0.0"
```

- [ ] **Step 2: Install**

```bash
npm install
```

---

## Task 2: Analytics SQL Queries

- [ ] **Step 1: Create `backend/src/lib/analyticsQueries.ts`**

```typescript
import { prisma } from './prisma'

type WhereParams = { unitId?: string; from?: string; to?: string }

function dateCondition(alias: string, p: WhereParams): string {
  const parts: string[] = [`${alias}.status = 'completed'`]
  if (p.unitId) parts.push(`${alias}."unitId" = '${p.unitId.replace(/'/g, "''")}'`)
  if (p.from) parts.push(`${alias}."startedAt" >= '${p.from}'`)
  if (p.to) parts.push(`${alias}."startedAt" < '${p.to}'`)
  return parts.join(' AND ')
}

export async function getSummary(p: WhereParams) {
  const where = dateCondition('s', p)
  const rows = await prisma.$queryRawUnsafe<{
    totalSessions: bigint
    avgDwellSeconds: number | null
    pickupCount: bigint
    avgDwellWithPickup: number | null
  }[]>(`
    SELECT
      COUNT(*) as "totalSessions",
      AVG("dwellSeconds") as "avgDwellSeconds",
      SUM(CASE WHEN "productPickedUp" = 1 THEN 1 ELSE 0 END) as "pickupCount",
      AVG(CASE WHEN "productPickedUp" = 1 THEN "dwellSeconds" END) as "avgDwellWithPickup"
    FROM "PresenceSession" s
    WHERE ${where}
  `)
  const r = rows[0]
  const total = Number(r.totalSessions)
  return {
    totalSessions: total,
    avgDwellSeconds: r.avgDwellSeconds ? Math.round(r.avgDwellSeconds) : 0,
    pickupRate: total > 0 ? Number(r.pickupCount) / total : 0,
    avgDwellWithPickup: r.avgDwellWithPickup ? Math.round(r.avgDwellWithPickup) : 0,
  }
}

export async function getDailyStats(p: WhereParams) {
  const where = dateCondition('s', p)
  const rows = await prisma.$queryRawUnsafe<{ date: string; sessions: bigint; pickups: bigint }[]>(`
    SELECT
      date("startedAt") as date,
      COUNT(*) as sessions,
      SUM(CASE WHEN "productPickedUp" = 1 THEN 1 ELSE 0 END) as pickups
    FROM "PresenceSession" s
    WHERE ${where}
    GROUP BY date("startedAt")
    ORDER BY date("startedAt") ASC
  `)
  return rows.map(r => ({ date: r.date, sessions: Number(r.sessions), pickups: Number(r.pickups) }))
}

export async function getHeatmap(p: WhereParams) {
  const where = dateCondition('s', p)
  const rows = await prisma.$queryRawUnsafe<{ dow: string; hour: string; sessions: bigint }[]>(`
    SELECT
      strftime('%w', "startedAt") as dow,
      strftime('%H', "startedAt") as hour,
      COUNT(*) as sessions
    FROM "PresenceSession" s
    WHERE ${where}
    GROUP BY dow, hour
  `)
  return rows.map(r => ({ dayOfWeek: Number(r.dow), hour: Number(r.hour), sessions: Number(r.sessions) }))
}

export async function getDwellTrend(p: WhereParams) {
  const where = dateCondition('s', p)
  const rows = await prisma.$queryRawUnsafe<{ date: string; avgDwell: number }[]>(`
    SELECT
      date("startedAt") as date,
      AVG("dwellSeconds") as "avgDwell"
    FROM "PresenceSession" s
    WHERE ${where}
    GROUP BY date("startedAt")
    ORDER BY date("startedAt") ASC
  `)
  return rows.map(r => ({ date: r.date, avgDwellSeconds: Math.round(r.avgDwell) }))
}
```

---

## Task 3: Analytics Route

- [ ] **Step 1: Create `backend/src/routes/analytics.ts`**

```typescript
import { Type } from '@fastify/type-provider-typebox'
import type { FastifyPluginAsync } from 'fastify'
import { getSummary, getDailyStats, getHeatmap, getDwellTrend } from '../lib/analyticsQueries'

const AnalyticsQuery = Type.Object({
  unitId: Type.Optional(Type.String()),
  from: Type.Optional(Type.String()),
  to: Type.Optional(Type.String()),
})

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/analytics/summary', { schema: { querystring: AnalyticsQuery } }, async (req) => {
    return getSummary(req.query as Record<string, string>)
  })

  fastify.get('/api/analytics/daily', { schema: { querystring: AnalyticsQuery } }, async (req) => {
    return { data: await getDailyStats(req.query as Record<string, string>) }
  })

  fastify.get('/api/analytics/heatmap', { schema: { querystring: AnalyticsQuery } }, async (req) => {
    return { data: await getHeatmap(req.query as Record<string, string>) }
  })

  fastify.get('/api/analytics/dwell-trend', { schema: { querystring: AnalyticsQuery } }, async (req) => {
    return { data: await getDwellTrend(req.query as Record<string, string>) }
  })
}
```

- [ ] **Step 2: Register in `backend/src/index.ts`**

```typescript
import { analyticsRoutes } from './routes/analytics'
// ...
await fastify.register(analyticsRoutes)
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck -w backend
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/analyticsQueries.ts backend/src/routes/analytics.ts backend/src/index.ts
git commit -m "feat: add analytics REST endpoints"
```

---

## Task 4: Frontend Hook

- [ ] **Step 1: Create `frontend/src/hooks/useAnalytics.ts`**

```typescript
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'

type Summary = { totalSessions: number; avgDwellSeconds: number; pickupRate: number; avgDwellWithPickup: number }
type DailyEntry = { date: string; sessions: number; pickups: number }
type HeatmapEntry = { dayOfWeek: number; hour: number; sessions: number }
type DwellEntry = { date: string; avgDwellSeconds: number }

export type AnalyticsData = {
  summary: Summary | null
  daily: DailyEntry[]
  heatmap: HeatmapEntry[]
  dwellTrend: DwellEntry[]
  loading: boolean
}

export function useAnalytics(): AnalyticsData {
  const [params] = useSearchParams()
  const [data, setData] = useState<Omit<AnalyticsData, 'loading'>>({ summary: null, daily: [], heatmap: [], dwellTrend: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = params.toString()
    setLoading(true)
    Promise.all([
      apiFetch<Summary>(`/api/analytics/summary?${q}`),
      apiFetch<{ data: DailyEntry[] }>(`/api/analytics/daily?${q}`),
      apiFetch<{ data: HeatmapEntry[] }>(`/api/analytics/heatmap?${q}`),
      apiFetch<{ data: DwellEntry[] }>(`/api/analytics/dwell-trend?${q}`),
    ]).then(([summary, daily, heatmap, dwell]) => {
      setData({ summary, daily: daily.data, heatmap: heatmap.data, dwellTrend: dwell.data })
    }).catch(console.error).finally(() => setLoading(false))
  }, [params])

  return { ...data, loading }
}
```

---

## Task 5: Frontend Components

- [ ] **Step 1: Create `frontend/src/components/SummaryCards.tsx`**

```tsx
function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="text-gray-400 text-xs mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )
}

type Props = { totalSessions: number; avgDwellSeconds: number; pickupRate: number; avgDwellWithPickup: number }

function fmt(s: number) { return s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s` }

export function SummaryCards({ totalSessions, avgDwellSeconds, pickupRate, avgDwellWithPickup }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card label="Total Visitors" value={String(totalSessions)} />
      <Card label="Avg Dwell" value={fmt(avgDwellSeconds)} />
      <Card label="Pickup Rate" value={`${(pickupRate * 100).toFixed(1)}%`} />
      <Card label="Avg Dwell w/ Pickup" value={fmt(avgDwellWithPickup)} />
    </div>
  )
}
```

- [ ] **Step 2: Create `frontend/src/components/DailyBarChart.tsx`**

```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

type Props = { data: { date: string; sessions: number; pickups: number }[] }

export function DailyBarChart({ data }: Props) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Visitors per Day</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
          <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
          <Tooltip contentStyle={{ background: '#1f2937', border: 'none', color: '#fff' }} />
          <Bar dataKey="sessions" fill="#3b82f6" name="Visitors" />
          <Bar dataKey="pickups" fill="#10b981" name="Pickups" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: Create `frontend/src/components/HeatmapGrid.tsx`**

```tsx
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

type Props = { data: { dayOfWeek: number; hour: number; sessions: number }[] }

export function HeatmapGrid({ data }: Props) {
  const map = new Map(data.map(d => [`${d.dayOfWeek}-${d.hour}`, d.sessions]))
  const max = Math.max(...data.map(d => d.sessions), 1)

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Peak Hours</h3>
      <div className="overflow-x-auto">
        <div className="flex gap-1 mb-1 ml-10">
          {HOURS.map(h => <div key={h} className="w-5 text-center text-gray-500 text-xs">{h}</div>)}
        </div>
        {DAYS.map((day, dow) => (
          <div key={dow} className="flex items-center gap-1 mb-1">
            <div className="w-8 text-xs text-gray-400 text-right pr-2">{day}</div>
            {HOURS.map(h => {
              const v = map.get(`${dow}-${h}`) ?? 0
              const opacity = max > 0 ? v / max : 0
              return (
                <div
                  key={h}
                  title={`${day} ${h}:00 — ${v} sessions`}
                  className="w-5 h-5 rounded-sm"
                  style={{ backgroundColor: `rgba(59,130,246,${opacity})`, border: '1px solid #374151' }}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `frontend/src/components/DwellTrendChart.tsx`**

```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

type Props = { data: { date: string; avgDwellSeconds: number }[] }

export function DwellTrendChart({ data }: Props) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Avg Dwell Over Time (s)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
          <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
          <Tooltip contentStyle={{ background: '#1f2937', border: 'none', color: '#fff' }} />
          <Line type="monotone" dataKey="avgDwellSeconds" stroke="#a855f7" strokeWidth={2} dot={false} name="Avg Dwell (s)" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

---

## Task 6: Analytics Page

- [ ] **Step 1: Create `frontend/src/pages/AnalyticsPage.tsx`**

```tsx
import { useSearchParams } from 'react-router-dom'
import { useAnalytics } from '../hooks/useAnalytics'
import { SummaryCards } from '../components/SummaryCards'
import { DailyBarChart } from '../components/DailyBarChart'
import { HeatmapGrid } from '../components/HeatmapGrid'
import { DwellTrendChart } from '../components/DwellTrendChart'

const PERIODS = [
  { label: 'Today', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
]

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams()
  const { summary, daily, heatmap, dwellTrend, loading } = useAnalytics()

  const setPeriod = (days: number) => {
    const to = new Date()
    const from = new Date(to.getTime() - days * 86400_000)
    const p = new URLSearchParams(params)
    p.set('from', from.toISOString())
    p.set('to', to.toISOString())
    setParams(p)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Analytics</h1>
          <div className="flex gap-2">
            {PERIODS.map(p => (
              <button
                key={p.days}
                onClick={() => setPeriod(p.days)}
                className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading…</p>
        ) : (
          <>
            {summary && <SummaryCards {...summary} />}
            <DailyBarChart data={daily} />
            <HeatmapGrid data={heatmap} />
            <DwellTrendChart data={dwellTrend} />
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add route to `frontend/src/App.tsx`**

```tsx
import { AnalyticsPage } from './pages/AnalyticsPage'
// Inside <Routes>:
<Route path="/analytics" element={<AnalyticsPage />} />
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck -w frontend
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/ backend/src/ frontend/package.json
git commit -m "feat: add analytics dashboard with charts and heatmap"
```
