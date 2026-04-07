# WhatsApp Notifications — Design Spec

**Date:** 2026-04-07  
**Feature:** Twilio WhatsApp alerts for salesperson notifications (ALERT-01)

---

## Overview

When an alert rule fires mid-session (dwell threshold met, optionally with product pickup), send a WhatsApp message via Twilio to all users subscribed to that sensor unit. Users subscribe via a bell icon on the dashboard; admins can also manage subscriptions from the unit configure page.

---

## Data Model

New join table `UnitSubscription`:

| Field       | Type     | Notes                          |
|-------------|----------|--------------------------------|
| `id`        | String   | cuid, primary key              |
| `userId`    | String   | FK → User                      |
| `unitId`    | String   | FK → SensorUnit (cascade delete) |
| `createdAt` | DateTime | default now()                  |

Unique constraint: `(userId, unitId)`.

`AlertRule` and `User.phoneNumber` are unchanged. A subscription is independent of alert rule configuration — a unit can have subscribers without an active rule, and vice versa.

---

## Architecture

### Backend

**`backend/src/services/twilioNotifier.ts`**  
Thin Twilio SDK wrapper. Reads `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` from `process.env`. Exports a `sendWhatsApp(to: string, body: string): Promise<void>` function. Errors are thrown so callers can handle them.

**`SessionManager.checkAlertRule`**  
After firing the WebSocket broadcast, queries `UnitSubscription` joined with `User` for the unit, filters to subscribers who have a `phoneNumber`, and calls `sendWhatsApp` per subscriber inside a `Promise.all`. The whole block is wrapped in a fire-and-forget try/catch — a Twilio failure logs to stderr but does not throw or affect the session.

Message format:
```
Alert: Customer at [Unit Name] — [N]s dwell[, product picked up]
```

**`backend/src/routes/subscriptions.ts`** — new route file:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/units/:unitId/subscriptions` | required | List all subscribers (admin configure page) |
| `POST` | `/api/units/:unitId/subscriptions` | required | Subscribe current user (bell click) |
| `DELETE` | `/api/units/:unitId/subscriptions` | required | Unsubscribe current user (bell click) |
| `GET` | `/api/me/subscriptions` | required | Unit IDs current user is subscribed to (bell state) |
| `POST` | `/api/units/:unitId/subscriptions/:userId` | required | Admin subscribes a specific user |
| `DELETE` | `/api/units/:unitId/subscriptions/:userId` | required | Admin removes a specific user's subscription |

### Frontend

**`SensorUnitCard`** — bell icon in the card header. Filled/active when the current user is subscribed. Clicking toggles subscription via POST/DELETE. Subscription state comes from a new `useSubscriptions` hook (fetches `/api/me/subscriptions` once, updates optimistically on toggle).

**Configure page** — new "Notifications" panel listing current subscribers (name + phone number). Admin can add a user by selecting from a dropdown of all users, or remove an existing subscriber.

---

## Error Handling

- Twilio errors: caught, logged to `console.error`, never propagate to session logic.
- Subscriber with no phone number: filtered out before sending, no error.
- Duplicate subscription: unique constraint on DB; API returns 409, frontend ignores if already subscribed.

---

## Environment Variables

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=whatsapp:+14155238886
```

Added to `.env.example`. Never committed to git.

---

## Out of Scope

- Per-subscription notification preferences (e.g., only notify on pickup)
- Message delivery status tracking
- Unsubscribe via WhatsApp reply
