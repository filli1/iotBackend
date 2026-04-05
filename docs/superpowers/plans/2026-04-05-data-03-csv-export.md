# DATA-03: CSV Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `GET /api/sessions/export.csv` endpoint that streams all matching sessions as a downloadable CSV file, respecting the same filters as the session history table.

**Architecture:** The export handler reuses `buildWhere` from the sessions route. It fetches all matching rows (no pagination), builds a CSV string, and replies with `Content-Disposition: attachment`. The frontend export button constructs the URL from current filter params and opens it in a new tab.

**Tech Stack:** Fastify, Prisma, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/src/routes/sessions.ts` | Modify | Add GET /api/sessions/export.csv handler |
| `backend/src/routes/sessions.test.ts` | Modify | Add export endpoint tests |
| `frontend/src/pages/HistoryPage.tsx` | Already has export button | Wire is already in DATA-01 plan — verify it works |

---

## Task 1: Export Endpoint (TDD)

- [ ] **Step 1: Add tests to `backend/src/routes/sessions.test.ts`**

Add inside the existing `describe('GET /api/sessions', ...)` block:

```typescript
it('GET /api/sessions/export.csv returns a CSV with header row', async () => {
  const app = await buildApp()
  const res = await app.inject({ method: 'GET', url: '/api/sessions/export.csv' })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toContain('text/csv')
  expect(res.headers['content-disposition']).toContain('attachment')
  const lines = res.body.split('\n')
  expect(lines[0]).toBe('id,unitId,unitName,startedAt,endedAt,dwellSeconds,productPickedUp')
})

it('GET /api/sessions/export.csv returns data rows for matching sessions', async () => {
  const app = await buildApp()
  const res = await app.inject({ method: 'GET', url: `/api/sessions/export.csv?unitId=${UNIT_ID}` })
  const lines = res.body.trim().split('\n')
  // header + at least 2 completed sessions
  expect(lines.length).toBeGreaterThanOrEqual(3)
})

it('GET /api/sessions/export.csv returns header only when no sessions match', async () => {
  const app = await buildApp()
  const res = await app.inject({ method: 'GET', url: '/api/sessions/export.csv?unitId=no-such-unit' })
  expect(res.statusCode).toBe(200)
  expect(res.body.trim()).toBe('id,unitId,unitName,startedAt,endedAt,dwellSeconds,productPickedUp')
})
```

- [ ] **Step 2: Run — expect to fail**

```bash
cd backend && npm run test -- sessions
```

Expected: the 3 new tests FAIL (route not yet added), existing tests still pass.

- [ ] **Step 3: Add export handler to `backend/src/routes/sessions.ts`**

Add this route inside `sessionRoutes`, before or after the existing `GET /api/sessions` handler. The `ExportQuerySchema` reuses the same filter params but omits pagination:

```typescript
const ExportQuerySchema = Type.Object({
  unitId: Type.Optional(Type.String()),
  dateFrom: Type.Optional(Type.String()),
  dateTo: Type.Optional(Type.String()),
  minDwellSeconds: Type.Optional(Type.Integer({ minimum: 0 })),
  productPickedUp: Type.Optional(Type.Boolean()),
})

fastify.get(
  '/api/sessions/export.csv',
  { schema: { querystring: ExportQuerySchema } },
  async (request, reply) => {
    const q = request.query as Record<string, unknown>
    const where = buildWhere(q)

    const rows = await prisma.presenceSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      include: { unit: { select: { name: true } } },
    })

    const header = 'id,unitId,unitName,startedAt,endedAt,dwellSeconds,productPickedUp'
    const body = rows
      .map(r =>
        [
          `"${r.id}"`,
          `"${r.unitId}"`,
          `"${r.unit.name}"`,
          `"${r.startedAt.toISOString()}"`,
          `"${r.endedAt?.toISOString() ?? ''}"`,
          r.dwellSeconds,
          r.productPickedUp,
        ].join(',')
      )
      .join('\n')

    const date = new Date().toISOString().slice(0, 10)

    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="sessions-${date}.csv"`)
      .send(rows.length > 0 ? `${header}\n${body}` : header)
  }
)
```

- [ ] **Step 4: Run — expect all tests to pass**

```bash
npm run test -- sessions
```

Expected: all 7 tests pass (4 original + 3 new).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/sessions.ts backend/src/routes/sessions.test.ts
git commit -m "feat: add CSV export endpoint for session history"
```

---

## Task 2: Verify Frontend Export Button

The export button was already added in DATA-01's `HistoryPage`. Verify it works end-to-end.

- [ ] **Step 1: Start both servers**

```bash
npm run dev
```

- [ ] **Step 2: Open `http://localhost:5174/history`**

- [ ] **Step 3: Click "Export CSV ↓"**

Expected: browser downloads a file named `sessions-YYYY-MM-DD.csv`. Opening it in a spreadsheet application shows a header row and one data row per completed session.

- [ ] **Step 4: Apply filters then export**

Set a date range or pickup filter, then click Export CSV again.

Expected: the exported file contains only sessions matching the active filters.
