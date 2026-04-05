# INFRA-01: Project Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a monorepo with a React + Vite + Tailwind frontend and a Fastify backend that both start with `npm run dev` from the repo root.

**Architecture:** npm workspaces with two packages (`frontend`, `backend`) sharing a root `tsconfig.base.json` for strict TypeScript settings. Each package manages its own `module`/`moduleResolution` settings. Backend uses `tsx watch` for zero-build dev execution.

**Tech Stack:** React 18, Vite 5, Tailwind CSS 3, TypeScript 5, Fastify 4, `@fastify/type-provider-typebox`, `tsx`, `vitest`, `@testing-library/react`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `.gitignore` | Create | Excludes `node_modules`, `dist`, `*.tsbuildinfo`, `.env` across all workspaces |
| `package.json` | Create | Root: workspace declarations, `dev` + `typecheck` + `test` scripts, `concurrently` dep |
| `tsconfig.base.json` | Create | Shared TS rules: `strict`, `ES2022`, `esModuleInterop` — no `module`/`moduleResolution` |
| `backend/package.json` | Create | Backend deps: `fastify`, `@fastify/type-provider-typebox`, `tsx`, `vitest`, `@types/node` |
| `backend/tsconfig.json` | Create | Extends base, adds `module: CommonJS`, `moduleResolution: node10` |
| `backend/src/routes/health.test.ts` | Create | Vitest test for `GET /health` using Fastify inject (no real server) |
| `backend/src/routes/health.ts` | Create | Registers `GET /health`, returns `{ status, timestamp }` with TypeBox schema |
| `backend/src/index.ts` | Create | Fastify instance, registers routes, async `start()`, listens on port 7000 |
| `frontend/package.json` | Create | Frontend deps: React 18, Vite, Tailwind, vitest, `@testing-library/react`, jsdom |
| `frontend/tsconfig.json` | Create | Extends base, adds `module: ESNext`, `moduleResolution: bundler`, DOM lib, jsx |
| `frontend/vite.config.ts` | Create | Vite plugin-react + vitest jsdom environment config |
| `frontend/src/test-setup.ts` | Create | Imports `@testing-library/jest-dom` matchers |
| `frontend/tailwind.config.ts` | Create | Content paths pointing to `index.html` and `src/**/*.{ts,tsx}` |
| `frontend/postcss.config.js` | Create | CJS `module.exports` with tailwindcss + autoprefixer plugins |
| `frontend/index.html` | Create | Vite HTML entry, mounts `#root`, loads `src/main.tsx` |
| `frontend/src/App.test.tsx` | Create | Renders `<App />`, asserts "Store Attention" heading is present |
| `frontend/src/App.tsx` | Create | Hello-world page: dark background, centred "Store Attention" heading |
| `frontend/src/main.tsx` | Create | React DOM entry, strict mode, mounts `<App />` into `#root` |
| `frontend/src/index.css` | Create | Three Tailwind directives (`@tailwind base/components/utilities`) |

---

## Task 1: Root Scaffold

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Create `.gitignore`**

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

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "store-attention",
  "private": true,
  "workspaces": ["frontend", "backend"],
  "scripts": {
    "dev": "concurrently -n frontend,backend -c cyan,green \"npm run dev -w frontend\" \"npm run dev -w backend\"",
    "typecheck": "npm run typecheck -w frontend && npm run typecheck -w backend",
    "test": "npm run test -w frontend && npm run test -w backend"
  },
  "devDependencies": {
    "concurrently": "^8.0.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.base.json`**

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

- [ ] **Step 4: Commit**

```bash
git add .gitignore package.json tsconfig.base.json
git commit -m "chore: add root workspace scaffold"
```

---

## Task 2: Backend Package Files

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`

- [ ] **Step 1: Create `backend/package.json`**

```json
{
  "name": "backend",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@fastify/type-provider-typebox": "^4.0.0",
    "fastify": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `backend/tsconfig.json`**

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

- [ ] **Step 3: Commit**

```bash
git add backend/
git commit -m "chore: add backend package scaffold"
```

---

## Task 3: Frontend Package Files

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/src/test-setup.ts`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/postcss.config.js`
- Create: `frontend/index.html`

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "frontend",
  "private": true,
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.0.0",
    "jsdom": "^25.0.0",
    "postcss": "^8.0.0",
    "tailwindcss": "^3.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `frontend/tsconfig.json`**

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

- [ ] **Step 3: Create `frontend/vite.config.ts`**

Vitest's `environment: 'jsdom'` and `setupFiles` are configured here alongside the Vite plugin so there is only one config file.

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

- [ ] **Step 4: Create `frontend/src/test-setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Create `frontend/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config
```

- [ ] **Step 6: Create `frontend/postcss.config.js`**

Uses CJS `module.exports` — `frontend/package.json` has no `"type": "module"`, so `.js` files are CommonJS by default.

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 7: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Store Attention</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "chore: add frontend package scaffold"
```

---

## Task 4: Install All Dependencies

- [ ] **Step 1: Run install from repo root**

```bash
npm install
```

Expected: npm resolves all workspace dependencies and creates a single root `node_modules/`. No errors. A `package-lock.json` is created at the root.

- [ ] **Step 2: Verify workspace symlinks**

```bash
ls node_modules | grep -E "frontend|backend"
```

Expected: `frontend` and `backend` appear (npm symlinks workspace packages).

- [ ] **Step 3: Commit lockfile**

```bash
git add package-lock.json
git commit -m "chore: add package-lock.json after initial install"
```

---

## Task 5: Backend Health Route (TDD)

**Files:**
- Create: `backend/src/routes/health.test.ts`
- Create: `backend/src/routes/health.ts`
- Create: `backend/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/routes/health.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { healthRoutes } from './health'

describe('GET /health', () => {
  it('returns 200 with status ok and an ISO timestamp', async () => {
    const fastify = Fastify().withTypeProvider<TypeBoxTypeProvider>()
    await fastify.register(healthRoutes)

    const response = await fastify.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body) as { status: string; timestamp: string }
    expect(body.status).toBe('ok')
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })
})
```

- [ ] **Step 2: Run the test — expect it to fail**

```bash
npm run test -w backend
```

Expected: FAIL — `Cannot find module './health'`

- [ ] **Step 3: Create `backend/src/routes/health.ts`**

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

- [ ] **Step 4: Run the test — expect it to pass**

```bash
npm run test -w backend
```

Expected: PASS — `GET /health > returns 200 with status ok and an ISO timestamp`

- [ ] **Step 5: Create `backend/src/index.ts`**

```typescript
import Fastify from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { healthRoutes } from './routes/health'

const start = async () => {
  const fastify = Fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>()
  await fastify.register(healthRoutes)
  await fastify.listen({ port: 7000, host: '0.0.0.0' })
}

start().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 6: Run typecheck on backend**

```bash
npm run typecheck -w backend
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/
git commit -m "feat: add backend health check endpoint"
```

---

## Task 6: Frontend Hello World (TDD)

**Files:**
- Create: `frontend/src/App.test.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/index.css`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { App } from './App'

test('renders Store Attention heading', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Store Attention' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test — expect it to fail**

```bash
npm run test -w frontend
```

Expected: FAIL — `Cannot find module './App'`

- [ ] **Step 3: Create `frontend/src/App.tsx`**

```tsx
export function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
      <h1 className="text-3xl font-bold">Store Attention</h1>
    </div>
  )
}
```

- [ ] **Step 4: Run the test — expect it to pass**

```bash
npm run test -w frontend
```

Expected: PASS — `renders Store Attention heading`

- [ ] **Step 5: Create `frontend/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: Create `frontend/src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 7: Run typecheck on frontend**

```bash
npm run typecheck -w frontend
```

Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/
git commit -m "feat: add frontend hello world page"
```

---

## Task 7: Integration Verification

- [ ] **Step 1: Run all tests from root**

```bash
npm test
```

Expected: all tests pass across both workspaces.

- [ ] **Step 2: Run full typecheck from root**

```bash
npm run typecheck
```

Expected: zero errors in both workspaces.

- [ ] **Step 3: Start both servers**

```bash
npm run dev
```

Expected: two labelled log streams appear — `[frontend]` in cyan (Vite on port 5173) and `[backend]` in green (Fastify on port 7000). No errors.

- [ ] **Step 4: Verify backend health endpoint**

In a second terminal:

```bash
curl -s http://localhost:7000/health | python3 -m json.tool
```

Expected output:
```json
{
    "status": "ok",
    "timestamp": "2026-03-29T..."
}
```

- [ ] **Step 5: Verify frontend**

Open `http://localhost:5173` in a browser.

Expected: dark page with centred white "Store Attention" heading. No console errors.

- [ ] **Step 6: Stop the servers and commit**

Press `Ctrl+C` to stop `npm run dev`.

```bash
git add -A
git status
```

If there are no uncommitted files (all were committed in earlier tasks), skip the commit. Otherwise:

```bash
git commit -m "chore: integration verified — INFRA-01 complete"
```
