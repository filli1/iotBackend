# INFRA-01: Project Scaffolding — Design Spec

**Date:** 2026-03-29
**Backlog item:** INFRA-01
**Status:** Draft

---

## Goal

Scaffold the monorepo so that both the frontend and backend servers start with a single `npm run dev` command. No application features are built — only the skeleton, a backend health check endpoint, and a frontend hello-world page.

---

## Approach

**npm workspaces + shared tsconfig base**, no shared-types package yet. The base `tsconfig.base.json` sets only the rules that are safe for both consumers (strict mode, target). Each workspace adds its own `module` and `moduleResolution` settings, which differ between Vite (bundler) and Node.js (CommonJS).

---

## Directory Structure

```
iotBackend/
├── .gitignore             # see .gitignore section
├── package.json           # root: workspaces, dev + typecheck scripts
├── tsconfig.base.json     # shared TS rules: strict, ES2022
├── frontend/
│   ├── package.json
│   ├── tsconfig.json      # extends ../tsconfig.base.json + Vite settings
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.js  # CJS syntax (no "type": "module" in frontend pkg)
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx        # "Hello World" page
│       └── index.css      # Tailwind directives
└── backend/
    ├── package.json
    ├── tsconfig.json      # extends ../tsconfig.base.json + Node/CJS settings
    └── src/
        ├── index.ts       # Fastify server entry
        └── routes/
            └── health.ts  # GET /health → { status, timestamp }
```

---

## .gitignore

A single root-level `.gitignore` using glob patterns to cover both workspaces:

```
node_modules/
**/node_modules/
dist/
**/dist/
*.tsbuildinfo
**/*.tsbuildinfo
.env
.env.*
```

---

## Root Package

```json
{
  "name": "store-attention",
  "private": true,
  "workspaces": ["frontend", "backend"],
  "scripts": {
    "dev": "concurrently -n frontend,backend -c cyan,green \"npm run dev -w frontend\" \"npm run dev -w backend\"",
    "typecheck": "npm run typecheck -w frontend && npm run typecheck -w backend"
  },
  "devDependencies": {
    "concurrently": "^8.0.0"
  }
}
```

---

## Shared TypeScript Config

`tsconfig.base.json` contains only settings that are safe and identical for both packages. It deliberately omits `module` and `moduleResolution` — each workspace sets these to suit its runtime.

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

---

## Frontend

### `frontend/package.json`

```json
{
  "name": "frontend",
  "private": true,
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.0.0",
    "postcss": "^8.0.0",
    "tailwindcss": "^3.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}
```

### `frontend/tsconfig.json`

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["src"]
}
```

`lib` includes `"ES2022"` to match the `target` in the base and expose ES2022 built-ins (`Array.at`, `Object.hasOwn`, etc.).

### `vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

### `tailwind.config.ts`

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config
```

### `postcss.config.js`

Uses CommonJS `module.exports` syntax. `frontend/package.json` has no `"type": "module"`, so `.js` files are loaded as CJS. ESM syntax (`export default`) would cause a Node.js parse error here.

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

### `src/App.tsx`

```tsx
export function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
      <h1 className="text-3xl font-bold">Store Attention</h1>
    </div>
  )
}
```

Runs on port `5173` (Vite default).

---

## Backend

### `backend/package.json`

```json
{
  "name": "backend",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@fastify/type-provider-typebox": "^4.0.0",
    "fastify": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

`@fastify/type-provider-typebox` is used instead of a direct `@sinclair/typebox` dependency. It brings in a TypeBox version that is guaranteed to be compatible with Fastify 4's internal copy, avoiding type conflicts.

### `backend/tsconfig.json`

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node10",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

`module: "CommonJS"` + `moduleResolution: "node10"` is the correct pair for `tsx` on Node.js. No `.js` extensions required in imports, no `"type": "module"` needed in `package.json`.

### `src/index.ts`

Uses an async `start()` function to ensure all plugins are fully registered before the server begins listening.

```typescript
import Fastify from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { healthRoutes } from './routes/health'

const start = async () => {
  const fastify = Fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>()
  await fastify.register(healthRoutes)
  await fastify.listen({ port: 3001, host: '0.0.0.0' })
}

start().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
```

Binds to `0.0.0.0` so it is reachable from the local network (required for tablet use). CORS is not configured in INFRA-01 — there are no frontend API calls yet. It will be added in INFRA-03.

### `src/routes/health.ts`

TypeBox response schema + `TypeBoxTypeProvider` wired at the instance level gives full TypeScript inference on handler return types. This is the template pattern for all future routes (per CLAUDE.md).

```typescript
import { Type } from '@fastify/type-provider-typebox'
import type { FastifyPluginAsync } from 'fastify'

const HealthResponse = Type.Object({
  status: Type.Literal('ok'),
  timestamp: Type.String(),
})

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/health',
    { schema: { response: { 200: HealthResponse } } },
    async () => ({ status: 'ok' as const, timestamp: new Date().toISOString() })
  )
}
```

Runs on port `3001`.

---

## Ports

| Service  | Port |
|----------|------|
| Frontend | 5173 |
| Backend  | 3001 |

---

## Acceptance Criteria

- [ ] `npm install` from the repo root installs all workspace dependencies without errors.
- [ ] `npm run dev` from the repo root starts both servers with colour-coded output.
- [ ] `curl http://localhost:3001/health` returns `{"status":"ok","timestamp":"<ISO>"}` with HTTP 200.
- [ ] `http://localhost:5173` renders "Store Attention" in a browser with no console errors.
- [ ] `npm run typecheck` passes with zero errors in both workspaces.

---

## Out of Scope for INFRA-01

- Prisma schema and database (INFRA-02)
- Shared types package (added when needed in INFRA-02)
- Any application feature routes or components
- Authentication
- WebSocket setup
- CORS configuration (no cross-origin calls until INFRA-03)
