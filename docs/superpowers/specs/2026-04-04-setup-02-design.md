# SETUP-02: Sensor Configuration UI — Design Spec

**Date:** 2026-04-04
**Backlog item:** SETUP-02
**Status:** Draft

---

## Goal

A configuration page per sensor unit where the user can adjust: ToF distance thresholds and labels, detection logic parameters (dwell time, sensor agreement, departure timeout), PIR settings, and IMU settings.

---

## Approach

A `/setup/units/:unitId/configure` page that loads the unit's current `UnitConfiguration` and `TofSensor` rows via REST, presents a form, and saves changes via PATCH. Changes are applied to the in-memory detection engine immediately (no restart required).

---

## Route

```
/setup/units/:unitId/configure
```

Linked from the unit list page (SETUP-01) via the "Configure ▸" button.

---

## Page Sections

### Section 1 — ToF Sensors

A table with one row per sensor (6 rows):

| Index | Label | Min Distance (mm) | Max Distance (mm) | [Test] |
|-------|-------|-------------------|--------------------|--------|

- **Label**: editable text input (e.g. "left-wide")
- **Min Distance**: numeric input, 10–500mm
- **Max Distance**: numeric input, 100–4000mm
- **[Test]**: link to `/calibrate/:unitId` (calibration mode) — opens in a new tab for use during installation

Validation: minDist must be < maxDist.

---

### Section 2 — Detection Logic

| Setting | Control | Range | Default |
|---------|---------|-------|---------|
| Min sensor agreement | Number input | 1–6 | 2 |
| Dwell minimum (before session opens) | Number input (seconds) | 1–30 | 3 |
| Departure timeout (before session closes) | Number input (seconds) | 1–30 | 5 |

---

### Section 3 — PIR

| Setting | Control | Default |
|---------|---------|---------|
| PIR enabled | Toggle | On |
| PIR cooldown | Number input (seconds) | 10 |

---

### Section 4 — IMU

| Setting | Control | Default |
|---------|---------|---------|
| Pickup threshold (g-force) | Decimal input | 1.5 |
| Examination detection enabled | Toggle | On |
| Bump vs pickup duration threshold | Number input (ms) | 500 |

---

### Section 5 — Alert Rule

| Setting | Control | Default |
|---------|---------|---------|
| Alert enabled | Toggle | On |
| Dwell threshold to trigger alert | Number input (seconds) | 30 |
| Also require product pickup | Toggle | Off |

---

## Backend — REST Endpoints

### Get configuration

```
GET /api/units/:unitId/config
```

Response:
```typescript
{
  configuration: UnitConfiguration
  sensors: TofSensor[]
  alertRule: AlertRule
}
```

### Update configuration

```
PATCH /api/units/:unitId/config
```

Request body (partial — only send changed fields):
```typescript
{
  configuration?: Partial<UnitConfiguration>
  sensors?: Array<{ index: number; label?: string; minDist?: number; maxDist?: number }>
  alertRule?: Partial<AlertRule>
}
```

Action:
1. Validate incoming values (TypeBox schema)
2. Update `UnitConfiguration`, `TofSensor` rows, `AlertRule` in a Prisma transaction
3. Call `detectionEngine.updateConfig(unitId, newConfig)` to apply changes in memory
4. Return the updated configuration

---

## Save Behaviour

- A single "Save changes" button at the bottom of the page submits all sections at once.
- On success: show a "Saved" toast notification.
- On validation error: scroll to the first failing field and highlight it.
- Changes are not applied until saved (no auto-save).

---

## File Map

| File | Action |
|------|--------|
| `backend/src/routes/units.ts` | Modify — add GET + PATCH /api/units/:unitId/config |
| `backend/src/services/detectionEngine.ts` | Modify — add `updateConfig(unitId, config)` method |
| `frontend/src/pages/ConfigurePage.tsx` | New |
| `frontend/src/components/TofSensorTable.tsx` | New |
| `frontend/src/components/DetectionConfigForm.tsx` | New |
| `frontend/src/components/AlertRuleForm.tsx` | New |
| `frontend/src/hooks/useUnitConfig.ts` | New — fetch + PATCH config |
| `frontend/src/App.tsx` | Modify — add /setup/units/:unitId/configure route |

---

## Acceptance Criteria

- [ ] Configuration page loads current values for all sections.
- [ ] Saving updated values persists them to the database (verified by reloading the page).
- [ ] Detection engine uses the updated config for the next ingest payload (no restart needed).
- [ ] Validation prevents `minDist >= maxDist` and other out-of-range values.
- [ ] Alert rule changes take effect on the next session event.
- [ ] Navigating to `/calibrate/:unitId` opens calibration in a new tab (links should not discard unsaved config changes).

---

## Out of Scope

- Live preview of threshold changes on the calibration view (the calibration page reloads its config independently)
- Factory reset to defaults (can be done by re-registering the unit)
- Per-sensor IMU configuration (all sensors share unit-level IMU settings)
