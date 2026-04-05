# SETUP-02: Sensor Configuration UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A configuration page per unit where staff can update ToF thresholds, detection logic, PIR, IMU, and alert rule settings. Changes are persisted to the database and applied to the running detection engine without a restart.

**Architecture:** `GET /api/units/:unitId/config` returns all config in one response. `PATCH /api/units/:unitId/config` applies partial updates in a Prisma transaction then calls `engine.updateConfig()`. The frontend renders five grouped form sections and submits all at once.

**Tech Stack:** Fastify, Prisma, React, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/src/routes/units.ts` | Modify | Add GET + PATCH /api/units/:unitId/config and GET /api/units/:unitId/sensors |
| `backend/src/routes/units.test.ts` | Modify | Tests for new endpoints |
| `backend/src/services/detectionEngine.ts` | Modify | Add `updateConfig()` method |
| `backend/src/index.ts` | Modify | Pass engine reference to unit routes |
| `frontend/src/pages/ConfigurePage.tsx` | Create | Full configuration form |
| `frontend/src/hooks/useUnitConfig.ts` | Create | Fetch + PATCH config |
| `frontend/src/App.tsx` | Modify | Add /setup/units/:unitId/configure route |

---

## Task 1: `updateConfig` on DetectionEngine

- [ ] **Step 1: Add `updateConfig` to `backend/src/services/detectionEngine.ts`**

Add this method to the `DetectionEngine` class (after the existing `processEvent` method):

```typescript
updateConfig(unitId: string, config: UnitConfig, tofConfig: TofConfig[]): void {
  const unit = this.units.get(unitId)
  if (unit) {
    unit.config = config
    unit.tofConfig = tofConfig
  }
}
```

- [ ] **Step 2: Run existing tests — expect no regressions**

```bash
cd backend && npm run test -- detectionEngine
```

Expected: all tests still pass.

---

## Task 2: Backend Config Endpoints (TDD)

- [ ] **Step 1: Add tests to `backend/src/routes/units.test.ts`**

Add these test cases inside the existing `describe('/api/units', ...)` block, after the existing tests. First add an `afterEach` cleanup for `config-unit-01`:

```typescript
afterEach(async () => {
  await prisma.sensorUnit.deleteMany({ where: { id: { in: ['reg-test-01', 'reg-test-02', 'config-unit-01'] } } })
})
```

Then add the new tests:

```typescript
it('GET /api/units/:unitId/config returns config, sensors, and alertRule', async () => {
  const app = buildApp(registry)
  // Create unit first
  await app.inject({
    method: 'POST', url: '/api/units',
    payload: { id: 'config-unit-01', name: 'C', location: 'L', productName: 'P', ipAddress: '1.1.1.1' },
  })
  const res = await app.inject({ method: 'GET', url: '/api/units/config-unit-01/config' })
  expect(res.statusCode).toBe(200)
  const body = JSON.parse(res.body)
  expect(body.configuration).toBeDefined()
  expect(body.sensors).toHaveLength(6)
  expect(body.alertRule).toBeDefined()
})

it('PATCH /api/units/:unitId/config updates dwellMinSeconds', async () => {
  const app = buildApp(registry)
  await app.inject({
    method: 'POST', url: '/api/units',
    payload: { id: 'config-unit-01', name: 'C', location: 'L', productName: 'P', ipAddress: '1.1.1.1' },
  })
  const res = await app.inject({
    method: 'PATCH', url: '/api/units/config-unit-01/config',
    payload: { configuration: { dwellMinSeconds: 10 } },
  })
  expect(res.statusCode).toBe(200)
  const cfg = await prisma.unitConfiguration.findUnique({ where: { unitId: 'config-unit-01' } })
  expect(cfg?.dwellMinSeconds).toBe(10)
})
```

- [ ] **Step 2: Run — expect to fail**

```bash
npm run test -- units
```

Expected: FAIL on the new config tests.

- [ ] **Step 3: Add endpoints to `backend/src/routes/units.ts`**

Add a `engine` option to `PluginOptions`:

```typescript
import type { DetectionEngine } from '../services/detectionEngine'

type PluginOptions = { registry: UnitRegistry; engine: DetectionEngine }
```

Then add these routes inside `unitRoutes`:

```typescript
fastify.get('/api/units/:unitId/config', async (request, reply) => {
  const { unitId } = request.params as { unitId: string }
  const [configuration, sensors, alertRule] = await Promise.all([
    prisma.unitConfiguration.findUnique({ where: { unitId } }),
    prisma.tofSensor.findMany({ where: { unitId }, orderBy: { index: 'asc' } }),
    prisma.alertRule.findUnique({ where: { unitId } }),
  ])
  if (!configuration) return reply.status(404).send({ error: 'Unit not found' })
  return { configuration, sensors, alertRule }
})

fastify.get('/api/units/:unitId/sensors', async (request, reply) => {
  const { unitId } = request.params as { unitId: string }
  const sensors = await prisma.tofSensor.findMany({ where: { unitId }, orderBy: { index: 'asc' } })
  if (!sensors.length) return reply.status(404).send({ error: 'Unit not found' })
  return { sensors }
})

const PatchConfigBody = Type.Object({
  configuration: Type.Optional(Type.Partial(Type.Object({
    minSensorAgreement: Type.Number({ minimum: 1, maximum: 6 }),
    departureTimeoutSeconds: Type.Number({ minimum: 1, maximum: 30 }),
    dwellMinSeconds: Type.Number({ minimum: 1, maximum: 30 }),
    pirEnabled: Type.Boolean(),
    pirCooldownSeconds: Type.Number({ minimum: 1, maximum: 60 }),
    imuPickupThresholdG: Type.Number({ minimum: 0.5, maximum: 5 }),
    imuExaminationEnabled: Type.Boolean(),
    imuDurationThresholdMs: Type.Number({ minimum: 100, maximum: 2000 }),
  }))),
  sensors: Type.Optional(Type.Array(Type.Object({
    index: Type.Number(),
    label: Type.Optional(Type.String()),
    minDist: Type.Optional(Type.Number({ minimum: 10, maximum: 500 })),
    maxDist: Type.Optional(Type.Number({ minimum: 100, maximum: 4000 })),
  }))),
  alertRule: Type.Optional(Type.Partial(Type.Object({
    dwellThresholdSeconds: Type.Number({ minimum: 1 }),
    requirePickup: Type.Boolean(),
    enabled: Type.Boolean(),
  }))),
})

fastify.patch(
  '/api/units/:unitId/config',
  { schema: { body: PatchConfigBody } },
  async (request, reply) => {
    const { unitId } = request.params as { unitId: string }
    const body = request.body

    await prisma.$transaction(async tx => {
      if (body.configuration) {
        await tx.unitConfiguration.update({ where: { unitId }, data: body.configuration })
      }
      if (body.sensors) {
        for (const s of body.sensors) {
          await tx.tofSensor.updateMany({
            where: { unitId, index: s.index },
            data: { ...(s.label && { label: s.label }), ...(s.minDist && { minDist: s.minDist }), ...(s.maxDist && { maxDist: s.maxDist }) },
          })
        }
      }
      if (body.alertRule) {
        await tx.alertRule.update({ where: { unitId }, data: body.alertRule })
      }
    })

    // Apply to running engine immediately
    const [cfg, sensors] = await Promise.all([
      prisma.unitConfiguration.findUnique({ where: { unitId } }),
      prisma.tofSensor.findMany({ where: { unitId } }),
    ])
    if (cfg) opts.engine.updateConfig(unitId, cfg, sensors)

    return { ok: true }
  }
)
```

- [ ] **Step 4: Update `index.ts` to pass `engine` to `unitRoutes`**

```typescript
await fastify.register(unitRoutes, { registry, engine })
```

- [ ] **Step 5: Run — expect to pass**

```bash
npm run test -- units
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/units.ts backend/src/routes/units.test.ts backend/src/services/detectionEngine.ts backend/src/index.ts
git commit -m "feat: add sensor configuration REST endpoints"
```

---

## Task 3: Frontend — `useUnitConfig` Hook

- [ ] **Step 1: Create `frontend/src/hooks/useUnitConfig.ts`**

```typescript
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'

export type TofSensorConfig = {
  id: string; index: number; label: string; minDist: number; maxDist: number
}
export type UnitConfig = {
  id: string; minSensorAgreement: number; departureTimeoutSeconds: number
  dwellMinSeconds: number; pirEnabled: boolean; pirCooldownSeconds: number
  imuPickupThresholdG: number; imuExaminationEnabled: boolean; imuDurationThresholdMs: number
}
export type AlertRuleConfig = {
  id: string; dwellThresholdSeconds: number; requirePickup: boolean; enabled: boolean
}

export type FullConfig = { configuration: UnitConfig; sensors: TofSensorConfig[]; alertRule: AlertRuleConfig }

export function useUnitConfig(unitId: string) {
  const [config, setConfig] = useState<FullConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<FullConfig>(`/api/units/${unitId}/config`)
      setConfig(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [unitId])

  useEffect(() => { load() }, [load])

  const save = async (patch: Parameters<typeof apiFetch>[1] extends { body?: infer B } ? B : never) => {
    setSaving(true)
    setSaved(false)
    try {
      await apiFetch(`/api/units/${unitId}/config`, { method: 'PATCH', body: JSON.stringify(patch) })
      await load()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return { config, loading, error, saving, saved, save }
}
```

---

## Task 4: Frontend — ConfigurePage

- [ ] **Step 1: Create `frontend/src/pages/ConfigurePage.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useUnitConfig } from '../hooks/useUnitConfig'
import type { FullConfig } from '../hooks/useUnitConfig'

export function ConfigurePage() {
  const { unitId } = useParams<{ unitId: string }>()
  const { config, loading, saving, saved, error, save } = useUnitConfig(unitId!)
  const [draft, setDraft] = useState<FullConfig | null>(null)

  useEffect(() => { if (config) setDraft(config) }, [config])

  if (loading || !draft) return <div className="min-h-screen bg-gray-950 text-white p-6">Loading…</div>
  if (error) return <div className="min-h-screen bg-gray-950 text-red-400 p-6">{error}</div>

  const setConfig = (field: keyof FullConfig['configuration'], value: number | boolean) =>
    setDraft(d => d ? { ...d, configuration: { ...d.configuration, [field]: value } } : d)

  const setAlert = (field: keyof FullConfig['alertRule'], value: number | boolean) =>
    setDraft(d => d ? { ...d, alertRule: { ...d.alertRule, [field]: value } } : d)

  const setSensor = (index: number, field: 'label' | 'minDist' | 'maxDist', value: string | number) =>
    setDraft(d => d ? {
      ...d,
      sensors: d.sensors.map(s => s.index === index ? { ...s, [field]: value } : s),
    } : d)

  const handleSave = async () => {
    if (!draft) return
    await save({
      configuration: draft.configuration,
      sensors: draft.sensors.map(s => ({ index: s.index, label: s.label, minDist: s.minDist, maxDist: s.maxDist })),
      alertRule: draft.alertRule,
    })
  }

  const numInput = (value: number, onChange: (v: number) => void, min: number, max: number) => (
    <input
      type="number" min={min} max={max} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-24 bg-gray-700 text-white rounded px-2 py-1 text-sm"
    />
  )

  const toggle = (checked: boolean, onChange: (v: boolean) => void) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-600'}`}
    >
      <span className={`block w-4 h-4 bg-white rounded-full mx-1 transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Link to="/setup/units" className="text-gray-400 hover:text-white text-sm">← Units</Link>
          <h1 className="text-2xl font-bold">Configure {unitId}</h1>
        </div>

        {/* ToF Sensors */}
        <section>
          <h2 className="text-lg font-semibold mb-3">ToF Sensors</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-gray-400 text-left"><th className="pb-2">Index</th><th className="pb-2">Label</th><th className="pb-2">Min (mm)</th><th className="pb-2">Max (mm)</th></tr></thead>
            <tbody>
              {draft.sensors.map(s => (
                <tr key={s.index} className="border-t border-gray-800">
                  <td className="py-2 pr-4 text-gray-400">{s.index}</td>
                  <td className="py-2 pr-4"><input value={s.label} onChange={e => setSensor(s.index, 'label', e.target.value)} className="bg-gray-700 text-white rounded px-2 py-1 text-sm w-36" /></td>
                  <td className="py-2 pr-4">{numInput(s.minDist, v => setSensor(s.index, 'minDist', v), 10, 500)}</td>
                  <td className="py-2">{numInput(s.maxDist, v => setSensor(s.index, 'maxDist', v), 100, 4000)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link to={`/calibrate/${unitId}`} target="_blank" className="text-blue-400 text-xs mt-2 inline-block hover:text-blue-300">Open Calibration Mode ↗</Link>
        </section>

        {/* Detection Logic */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Detection Logic</h2>
          <div className="space-y-3">
            {([
              ['Min sensor agreement', 'minSensorAgreement', 1, 6],
              ['Dwell minimum (s)', 'dwellMinSeconds', 1, 30],
              ['Departure timeout (s)', 'departureTimeoutSeconds', 1, 30],
            ] as [string, keyof FullConfig['configuration'], number, number][]).map(([label, field, min, max]) => (
              <div key={field} className="flex items-center justify-between">
                <span className="text-gray-300 text-sm">{label}</span>
                {numInput(draft.configuration[field] as number, v => setConfig(field, v), min, max)}
              </div>
            ))}
          </div>
        </section>

        {/* PIR */}
        <section>
          <h2 className="text-lg font-semibold mb-3">PIR</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">PIR enabled</span>{toggle(draft.configuration.pirEnabled, v => setConfig('pirEnabled', v))}</div>
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Cooldown (s)</span>{numInput(draft.configuration.pirCooldownSeconds, v => setConfig('pirCooldownSeconds', v), 1, 60)}</div>
          </div>
        </section>

        {/* IMU */}
        <section>
          <h2 className="text-lg font-semibold mb-3">IMU</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Pickup threshold (g)</span>{numInput(draft.configuration.imuPickupThresholdG, v => setConfig('imuPickupThresholdG', v), 0.5, 5)}</div>
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Examination enabled</span>{toggle(draft.configuration.imuExaminationEnabled, v => setConfig('imuExaminationEnabled', v))}</div>
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Duration threshold (ms)</span>{numInput(draft.configuration.imuDurationThresholdMs, v => setConfig('imuDurationThresholdMs', v), 100, 2000)}</div>
          </div>
        </section>

        {/* Alert Rule */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Alert Rule</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Alert enabled</span>{toggle(draft.alertRule.enabled, v => setAlert('enabled', v))}</div>
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Dwell threshold (s)</span>{numInput(draft.alertRule.dwellThresholdSeconds, v => setAlert('dwellThresholdSeconds', v), 1, 300)}</div>
            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Require pickup</span>{toggle(draft.alertRule.requirePickup, v => setAlert('requirePickup', v))}</div>
          </div>
        </section>

        <div className="flex items-center gap-4 pt-2">
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {saved && <span className="text-green-400 text-sm">Saved ✓</span>}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add route to `frontend/src/App.tsx`**

```tsx
import { ConfigurePage } from './pages/ConfigurePage'
// Inside <Routes>:
<Route path="/setup/units/:unitId/configure" element={<ConfigurePage />} />
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck -w frontend
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/ backend/src/
git commit -m "feat: add sensor configuration page"
```
