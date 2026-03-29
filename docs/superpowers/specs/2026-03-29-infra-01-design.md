# INFRA-01: Project Scaffolding — Design Spec

**Date:** 2026-03-29
**Backlog item:** INFRA-01
**Status:** Approved

---

## Goal

Scaffold the monorepo so that both the frontend and backend servers start with a single `npm run dev` command. No features are built in this step — only the skeleton, health check, and hello-world page.

---

## Approach

Option B was chosen: **npm workspaces + shared tsconfig base**, no shared-types package yet.

---

## Directory Structure

```
iotBackend/
├── package.json           # root: workspaces, dev script via concurrently
├── tsconfig.base.json     # shared TS config: strict, ES2022, no `any`
├── frontend/
│   ├── package.json
│   ├── tsconfig.json      # extends ../tsconfig.base.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx        # "Hello World" page
│       └── index.css      # Tailwind directives
└── backend/
    ├── package.json
    ├── tsconfig.json      # extends ../tsconfig.base.json
    └── src/
        ├── index.ts       # Fastify server entry
        └── routes/
            └── health.ts  # GET /health → { status, timestamp }
```

---

## Root Package

`package.json` declares `"workspaces": ["frontend", "backend"]` and a `dev` script that runs both servers concurrently using the `concurrently` package.

```json
{
  "name": "store-attention",
  "private": true,
  "workspaces": ["frontend", "backend"],
  "scripts": {
    "dev": "concurrently -n frontend,backend -c cyan,green \"npm run dev -w frontend\" \"npm run dev -w backend\""
  },
  "devDependencies": {
    "concurrently": "^8.x"
  }
}
```

---

## Shared TypeScript Config

`tsconfig.base.json` enforces project-wide TypeScript rules:

- `strict: true` (includes `noImplicitAny`, `strictNullChecks`, etc.)
- `target: "ES2022"`
- `moduleResolution: "bundler"` (Vite-compatible; backend overrides to `"node16"`)
- Both `frontend/tsconfig.json` and `backend/tsconfig.json` extend this file.

---

## Frontend

**Stack:** React 18, Vite, TypeScript, Tailwind CSS v3

- Runs on port `5173` (Vite default).
- `App.tsx` renders a minimal "Store Attention" hello-world page styled with Tailwind.
- `index.css` contains the three Tailwind directives.
- `tsconfig.json` adds `"lib": ["DOM", "DOM.Iterable"]` and `"jsx": "react-jsx"` on top of the base.

---

## Backend

**Stack:** Fastify, TypeScript, `tsx` for dev execution

- Runs on port `3001`.
- `tsx --watch src/index.ts` is the dev command — runs TypeScript directly, no build step during development.
- `src/index.ts` creates the Fastify instance, registers all routes, and starts listening.
- `src/routes/health.ts` registers `GET /health` and returns:

```json
{ "status": "ok", "timestamp": "2026-03-29T12:00:00.000Z" }
```

- TypeBox schema validation is wired up on the health route as a pattern for all future routes.

---

## Ports

| Service  | Port |
|----------|------|
| Frontend | 5173 |
| Backend  | 3001 |

---

## Out of Scope for INFRA-01

- Prisma schema and database (INFRA-02)
- Shared types package (added when needed in INFRA-02)
- Any application feature routes or components
- Authentication
- WebSocket setup
