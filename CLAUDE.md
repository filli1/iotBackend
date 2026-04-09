# Store Attention — Retail Presence Sensor Platform

## What This Is

A web application for setting up, managing, and presenting data from IoT retail presence sensors. Hardware: Arduino MKR WiFi 1010 + 6× VL53L1X ToF sensors + PIR sensor + Grove IMU 9DOF. Detects customer presence at product displays, measures dwell time, detects product interaction, and alerts sales staff.

## Architecture

```
Arduino MKR 1010 → (WiFi, HTTP POST every ~500ms) → Backend → (WebSocket, processed events) → Frontend
Frontend → (REST API, configuration) → Backend (applies rules to incoming sensor stream)
```

The Arduino is a dumb sensor-to-WiFi bridge. It POSTs JSON to `POST /api/sensors/data` on the backend. All detection logic (dwell time, engagement scoring, alert rules) lives in the backend. The frontend never talks to the Arduino directly.

**No MQTT.** For this POC we use plain HTTP POST to keep the stack simple (no broker to run). This can be swapped to MQTT later without changing the frontend or detection engine.

## Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Backend**: Node.js (Fastify)
- **Real-time**: WebSocket (via fastify-websocket) for live sensor data
- **Database**: SQLite via Prisma ORM (prototype) — swap to PostgreSQL by changing one line in `schema.prisma`
- **ORM**: Prisma (schema, migrations, typed client for all CRUD). Use `prisma.$queryRaw` for complex analytics queries.
- **Sensor transport**: HTTP POST from Arduino (no MQTT broker needed)
- **Styling**: Tailwind CSS

## Project Structure

```
store-attention/
├── CLAUDE.md
├── BACKLOG.md
├── REQUIREMENTS.md
├── frontend/          # React + Vite app
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── lib/       # API client, WebSocket client, utils
│   │   └── types/
│   └── ...
├── backend/           # Fastify API server
│   ├── prisma/
│   │   └── schema.prisma  # Single source of truth for data model
│   ├── src/
│   │   ├── routes/    # REST API routes (including POST /api/sensors/data ingest)
│   │   ├── services/  # Detection logic, alert engine, session manager
│   │   ├── lib/       # Prisma client instance, raw analytics queries
│   │   └── ws/        # WebSocket broadcaster (pushes to frontend)
│   └── ...
└── arduino/           # Arduino sketch (reference only, not built by this project)
    └── store-attention.ino
```

## Key Domain Concepts

- **Sensor Unit**: One MKR board + its attached sensors, deployed at one product stand
- **Presence Session**: The period from when a person is first detected to when they leave. Has a dwell time, engagement score, and optional product interaction events.
- **Engagement Score**: Weighted composite of dwell time + product pickup + product examination. Weights are configurable per unit.
- **Alert Rule**: Configurable trigger (e.g., "dwell > 30s AND product picked up") that fires a salesperson notification.

## Code Conventions

- TypeScript strict mode, no `any` types
- Use named exports
- Backend: Fastify with schema validation on all routes (use TypeBox)
- Frontend: Functional components with hooks, no class components
- Database: Prisma for all CRUD and relations. Use `prisma.$queryRaw` for complex aggregation/analytics queries only. Never bypass Prisma for basic reads/writes.
- Prisma: keep one shared client instance in `backend/src/lib/prisma.ts`. Always run `npx prisma generate` after schema changes.
- Keep files small: one component/route/service per file, under 200 lines ideally
- Error handling: all async functions must handle errors explicitly, no silent catches

## Git Workflow

- `main` branch is protected — never commit directly
- Work on feature branches: `feature/<backlog-item-id>-<short-name>`
- Commit messages: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)

## Important Constraints

- This is a university/prototype project — keep scope realistic
- Hardware is fixed: MKR WiFi 1010, 6× VL53L1X, PIR, Grove IMU 9DOF
- Privacy-first: no cameras, no personal data. Only presence counts, durations, and interaction events.
- Must work on a wall-mounted tablet (landscape ~10") for in-store use