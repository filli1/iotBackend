# SETUP-01: Device Registration UI — Design Spec

**Date:** 2026-04-04
**Backlog item:** SETUP-01
**Status:** Draft

---

## Goal

A form to register a new sensor unit: give it a name, location, product association, IP address, and the unit ID that matches what is hardcoded in the Arduino sketch. Registration creates the unit in the database and seeds default configuration.

---

## Approach

A `/setup/units` page lists registered units. A modal form (or `/setup/units/new` page) handles registration. On submit, a `POST /api/units` request creates the `SensorUnit`, `UnitConfiguration`, `AlertRule`, and 6 `TofSensor` rows with defaults — all in one backend transaction.

---

## Route

```
/setup/units          — list of registered units
/setup/units/new      — registration form
```

---

## Registration Form Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Unit ID | text | Yes | Must match `unit_id` in Arduino sketch (e.g. `"unit-01"`). Unique. Validated against existing units. |
| Display Name | text | Yes | Human-readable name (e.g. "Product Stand A") |
| Location | text | Yes | Physical location description (e.g. "Aisle 3, shelf 2") |
| Product Name | text | Yes | Name of the product at this stand |
| Arduino IP Address | text | Yes | The Arduino's local IP (used for display/reference only in prototype) |

Unit ID is used as the primary key in the database. The user must type it to match the sketch. Validation: alphanumeric + hyphens, 3–32 chars.

---

## Backend — REST Endpoints

### Register a unit

```
POST /api/units
```

Request body:
```typescript
{
  id: string          // unit ID from sketch
  name: string
  location: string
  productName: string
  ipAddress: string
}
```

Action (in a Prisma transaction):
1. Create `SensorUnit`
2. Create `UnitConfiguration` with defaults
3. Create `AlertRule` with defaults
4. Create 6 `TofSensor` rows (index 1–6, default labels, minDist: 50, maxDist: 1000)
5. Register unit in the `UnitRegistry` (so it can immediately start receiving data)

Returns the created unit or a `409 Conflict` if the ID already exists.

### List all units

```
GET /api/units
```

Response:
```typescript
{
  units: Array<{
    id: string
    name: string
    location: string
    productName: string
    ipAddress: string
    online: boolean
    lastSeen: string | null
    createdAt: string
  }>
}
```

`online` and `lastSeen` come from the in-memory unit registry.

### Delete a unit

```
DELETE /api/units/:unitId
```

Cascades to all related rows (sessions, events, config, alert rule, ToF sensors) via Prisma's `onDelete: Cascade`.

---

## Unit List Page

```
┌─────────────────────────────────────────────────┐
│  Registered Units                [+ Add Unit]   │
├──────────┬──────────────┬─────────┬─────────────┤
│ ID       │ Name         │ Status  │ Product      │
├──────────┼──────────────┼─────────┼─────────────┤
│ unit-01  │ Stand A      │ ● Online│ Product X    │
│ unit-02  │ Stand B      │ ○ Offline│ Product Y   │
├──────────┴──────────────┴─────────┴─────────────┤
│                              [Configure ▸] [✕]  │
└─────────────────────────────────────────────────┘
```

- "Configure ▸" links to SETUP-02 (sensor configuration).
- "✕" delete button shows a confirmation modal before deleting.
- Status reflects the unit registry's `online` field.

---

## Default ToF Sensor Labels

The 6 default labels seeded on registration:

```
index 1 → "left-wide"
index 2 → "left"
index 3 → "center-left"
index 4 → "center-right"
index 5 → "right"
index 6 → "right-wide"
```

These match the typical physical sensor fan arrangement. The user can rename them in SETUP-02.

---

## File Map

| File | Action |
|------|--------|
| `backend/src/routes/units.ts` | New — POST, GET, DELETE /api/units |
| `backend/src/index.ts` | Modify — register units route |
| `frontend/src/pages/SetupUnitsPage.tsx` | New — list + new unit form |
| `frontend/src/components/UnitRegistrationForm.tsx` | New |
| `frontend/src/components/DeleteConfirmModal.tsx` | New |
| `frontend/src/hooks/useUnits.ts` | New — fetch/mutate units |
| `frontend/src/App.tsx` | Modify — add /setup/units routes |

---

## Acceptance Criteria

- [ ] `POST /api/units` with valid body creates unit + 6 ToF sensors + config + alert rule in one transaction.
- [ ] Duplicate unit ID returns 409.
- [ ] Unit appears in `GET /api/units` immediately after creation.
- [ ] Newly registered unit is added to the unit registry so it can receive ingest data right away.
- [ ] `DELETE /api/units/:unitId` removes the unit and all related rows.
- [ ] Form validates required fields and shows inline errors before submit.
- [ ] Delete shows a confirmation modal with the unit name.

---

## Out of Scope

- Editing unit name/location after registration (could be added as PATCH endpoint later)
- Auto-discovery of Arduino devices on the local network
- Uploading firmware to the Arduino
