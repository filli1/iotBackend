# ALERT-01: Salesperson Alert — Design Spec

**Date:** 2026-04-04
**Backlog item:** ALERT-01
**Status:** Draft

---

## Goal

When a configurable alert rule is triggered (dwell threshold and/or product pickup), display a prominent in-app visual notification on the dashboard so a salesperson knows to approach the customer. Includes acknowledge and snooze.

---

## Approach

The backend (CORE-02 SessionManager) already broadcasts an `alert_fired` WebSocket message when rule conditions are met. This item adds:
1. Alert state management in the frontend Zustand store
2. An `AlertBanner` overlay component on the dashboard
3. Acknowledge and snooze actions (frontend-only — no acknowledgement persisted to DB in prototype)

---

## Trigger Conditions (set in AlertRule per unit)

| Field | Meaning |
|-------|---------|
| `dwellThresholdSeconds` | Session must have been active for at least this many seconds |
| `requirePickup` | If true, product must also have been picked up |
| `enabled` | Rule is active |

The backend checks these conditions on `product_picked_up` events AND periodically (~every 5s) while a session is active, to catch the dwell threshold being crossed without a pickup.

The alert fires **once per session** — after firing, it is not re-fired for the same session even if dwell continues to grow.

---

## WebSocket Message (from backend — already specced in CORE-02)

```typescript
{
  type: "alert_fired"
  unitId: string
  sessionId: string
  reason: "dwell_threshold" | "pickup" | "dwell_and_pickup"
  ts: string
}
```

---

## Frontend Alert State

Added to the Zustand store:

```typescript
type ActiveAlert = {
  id: string          // sessionId
  unitId: string
  unitName: string
  reason: string
  ts: string
  snoozedUntil?: number  // Date.now() ms — if set, hide until this time
}

// In WsStore:
activeAlerts: ActiveAlert[]
```

- New `alert_fired` messages are appended.
- Acknowledging removes the alert from the list.
- Snoozing sets `snoozedUntil = Date.now() + snoozeMs` and hides the alert temporarily.
- Alerts are not persisted to the database (prototype scope).

---

## AlertBanner Component

A fixed overlay at the top of the dashboard page. Appears when `activeAlerts` contains at least one non-snoozed alert.

```
┌──────────────────────────────────────────────────────────┐
│  🔔 Salesperson needed — unit-01                         │
│     Customer present for 47s · Product picked up         │
│                      [Snooze 2min]   [Acknowledge ✓]     │
└──────────────────────────────────────────────────────────┘
```

- If multiple alerts are active, show a stack (most recent on top) with a "3 active" count.
- Colour: amber background for dwell-only, red for pickup included.
- On mobile: full-width bottom sheet instead of top banner.

### Snooze Options

Fixed durations: 2 min, 5 min, 10 min. Snooze is per-alert, per-session.

---

## Backend — Periodic Dwell Check

The SessionManager adds a 5-second interval per active session that checks if the dwell threshold has been crossed and the alert has not yet fired for this session. Tracked with a per-session flag:

```typescript
type ActiveSession = {
  // ... existing fields
  alertFired: boolean
}
```

Once `alertFired = true`, the interval check is skipped for that session.

---

## File Map

| File | Action |
|------|--------|
| `backend/src/services/sessionManager.ts` | Modify — add 5s dwell-check interval, `alertFired` flag |
| `frontend/src/components/AlertBanner.tsx` | New |
| `frontend/src/lib/wsStore.ts` | Modify — add `activeAlerts` slice |
| `frontend/src/pages/DashboardPage.tsx` | Modify — render `<AlertBanner />` |

---

## Acceptance Criteria

- [ ] When a session exceeds `dwellThresholdSeconds`, an `alert_fired` WS message is sent and the banner appears.
- [ ] When `requirePickup = true`, alert fires only after both conditions are met.
- [ ] The same session does not trigger multiple alerts.
- [ ] Acknowledge removes the alert from the banner.
- [ ] Snooze hides the alert for the selected duration; it reappears if not acknowledged after snooze expires.
- [ ] If a snoozed alert's session ends before snooze expires, the alert is auto-dismissed.
- [ ] Alert banner is visible on a 1280×800 tablet without obscuring the unit cards.

---

## Out of Scope

- Sound / audio notification (browser audio API — deferred)
- Push notifications (PWA — deferred)
- Webhook delivery to Slack/Teams (ALERT-03, Nice to Have)
- Persisting acknowledgements to DB
- Per-unit per-staff snooze state across browser sessions
