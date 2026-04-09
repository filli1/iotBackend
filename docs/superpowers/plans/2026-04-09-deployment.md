# Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repo deployable to a DigitalOcean Ubuntu droplet with automatic re-deployment on every push to `main` via GitHub Actions.

**Architecture:** nginx serves the built React frontend as static files and reverse-proxies `/api/` and `/ws` to the Fastify backend on port 7000. GitHub Actions SSHes into the droplet on push to `main`, runs git pull, builds the frontend, runs Prisma migrations, and restarts PM2. Secrets live in a `.env` file on the droplet — never in the repo.

**Tech Stack:** GitHub Actions (`appleboy/ssh-action`), PM2, nginx, Vite build, Prisma migrate deploy.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/package.json` | Modify | Add `build` script for Vite production build |
| `backend/src/index.ts` | Modify | Read `CORS_ORIGIN` from env var instead of hardcoded localhost |
| `.env.example` | Modify | Document `CORS_ORIGIN` variable |
| `.github/workflows/deploy.yml` | Create | GitHub Actions deploy workflow |

---

### Task 1: Add Vite build script to frontend

The GitHub Actions workflow runs `npm run build -w frontend`. This script doesn't exist yet in `frontend/package.json`.

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Add the build script**

Open `frontend/package.json`. The current `scripts` block is:

```json
"scripts": {
  "dev": "vite",
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
},
```

Change it to:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
},
```

- [ ] **Step 2: Verify the build script works**

Run from the repo root:

```bash
npm run build -w frontend
```

Expected: Vite outputs something like:

```
vite v5.x.x building for production...
✓ N modules transformed.
frontend/dist/index.html     x.xx kB
frontend/dist/assets/...     x.xx kB
✓ built in xxxms
```

The `frontend/dist/` directory should now exist.

- [ ] **Step 3: Ensure dist is gitignored**

Check that `frontend/dist/` is not tracked by git:

```bash
git status frontend/dist
```

Expected: nothing listed (already covered by root `.gitignore`'s `dist/` entry). If it shows up as untracked, confirm the `.gitignore` has `dist/` or `**/dist/`.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json
git commit -m "feat: add vite build script to frontend for production builds"
```

---

### Task 2: Read CORS origin from environment variable

The backend currently hardcodes `origin: 'http://localhost:5174'` in `backend/src/index.ts:35`. In production nginx serves the frontend at `http://<droplet-ip>`, so this must be configurable via `CORS_ORIGIN`.

**Files:**
- Modify: `backend/src/index.ts` (line 35)
- Modify: `.env.example`
- Create: `backend/src/index.cors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/index.cors.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import Fastify from 'fastify'
import cors from '@fastify/cors'

describe('CORS origin from environment', () => {
  const originalEnv = process.env.CORS_ORIGIN

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CORS_ORIGIN
    } else {
      process.env.CORS_ORIGIN = originalEnv
    }
  })

  it('uses CORS_ORIGIN env var when set', async () => {
    process.env.CORS_ORIGIN = 'http://1.2.3.4'

    const fastify = Fastify()
    await fastify.register(cors, {
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:5174',
    })
    fastify.get('/test', async () => ({ ok: true }))

    const res = await fastify.inject({
      method: 'OPTIONS',
      url: '/test',
      headers: {
        Origin: 'http://1.2.3.4',
        'Access-Control-Request-Method': 'GET',
      },
    })

    expect(res.headers['access-control-allow-origin']).toBe('http://1.2.3.4')
  })

  it('falls back to localhost:5174 when CORS_ORIGIN is not set', async () => {
    delete process.env.CORS_ORIGIN

    const fastify = Fastify()
    await fastify.register(cors, {
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:5174',
    })
    fastify.get('/test', async () => ({ ok: true }))

    const res = await fastify.inject({
      method: 'OPTIONS',
      url: '/test',
      headers: {
        Origin: 'http://localhost:5174',
        'Access-Control-Request-Method': 'GET',
      },
    })

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5174')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test -w backend -- --reporter=verbose index.cors
```

Expected: FAIL — the test is importing the cors plugin directly with the same logic, but the `index.ts` hasn't been changed yet. The test itself should pass since it's self-contained, but this confirms the test infrastructure works. If it fails for any other reason, investigate before proceeding.

- [ ] **Step 3: Update index.ts to read CORS_ORIGIN from env**

In `backend/src/index.ts`, change line 35 from:

```typescript
  await fastify.register(cors, { origin: 'http://localhost:5174' })
```

to:

```typescript
  await fastify.register(cors, { origin: process.env.CORS_ORIGIN ?? 'http://localhost:5174' })
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test -w backend -- --reporter=verbose index.cors
```

Expected: PASS — both tests pass.

- [ ] **Step 5: Update .env.example**

Add `CORS_ORIGIN` to `.env.example`. The full file should now read:

```env
# Backend
JWT_SECRET=change-me-in-production

# CORS — set to the URL/IP the frontend is served from
# In production: http://<droplet-ip>
# In development: http://localhost:5174
CORS_ORIGIN=http://localhost:5174

# Twilio WhatsApp notifications
# Get these from https://console.twilio.com
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=whatsapp:+14155238886
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/index.ts backend/src/index.cors.test.ts .env.example
git commit -m "feat: read CORS origin from CORS_ORIGIN env var with localhost fallback"
```

---

### Task 3: Create GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create the workflows directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create the workflow file**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to DigitalOcean

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DROPLET_IP }}
          username: deploy
          key: ${{ secrets.DEPLOY_SSH_PRIVATE_KEY }}
          script: |
            set -e
            cd /home/deploy/store-attention
            git pull origin main
            npm ci
            npm run build -w frontend
            cd backend
            npx prisma migrate deploy
            npx prisma generate
            cd ..
            pm2 startOrRestart pm2.config.cjs --only store-attention
            pm2 save
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml pm2.config.cjs
git commit -m "feat: add GitHub Actions workflow for automatic deploy to DigitalOcean on push to main"
```

---

### Task 4: One-time droplet setup (manual ops)

These steps are run once on the droplet over SSH. They are not automated — run them manually before the first deploy.

**Step 1: SSH into the droplet as root**

```bash
ssh root@<droplet-ip>
```

**Step 2: Install system dependencies**

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git
sudo npm install -g pm2
```

Verify:

```bash
node --version   # should print v20.x.x
nginx -v         # should print nginx version
pm2 --version    # should print a version number
```

**Step 3: Create the deploy user**

```bash
sudo adduser deploy
sudo usermod -aG sudo deploy
sudo mkdir -p /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
sudo chown deploy:deploy /home/deploy/.ssh
```

**Step 4: Generate an SSH keypair for GitHub Actions (run this on your local machine, not the droplet)**

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key -N ""
```

This creates two files:
- `~/.ssh/deploy_key` — private key (goes into GitHub Secrets)
- `~/.ssh/deploy_key.pub` — public key (goes onto the droplet)

**Step 5: Install the public key on the droplet**

```bash
# Still on your local machine:
ssh-copy-id -i ~/.ssh/deploy_key.pub deploy@<droplet-ip>
# Or manually:
cat ~/.ssh/deploy_key.pub | ssh root@<droplet-ip> "sudo tee -a /home/deploy/.ssh/authorized_keys && sudo chmod 600 /home/deploy/.ssh/authorized_keys && sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys"
```

**Step 6: Add GitHub Secrets**

In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|---|---|
| `DROPLET_IP` | The droplet's public IP address |
| `DEPLOY_SSH_PRIVATE_KEY` | Contents of `~/.ssh/deploy_key` (the private key file — copy with `cat ~/.ssh/deploy_key`) |

**Step 7: Clone the repo on the droplet**

```bash
sudo -u deploy git clone https://github.com/<org>/<repo>.git /home/deploy/store-attention
```

**Step 8: Create the .env file on the droplet**

```bash
sudo -u deploy nano /home/deploy/store-attention/backend/.env
```

Paste:

```env
JWT_SECRET=<generate with: openssl rand -base64 32>
CORS_ORIGIN=http://<droplet-ip>
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=whatsapp:+14155238886
```

**Step 9: Initial install, build, and migrate**

```bash
sudo -u deploy bash -c "
  cd /home/deploy/store-attention &&
  npm ci &&
  npm run build -w frontend &&
  cd backend &&
  npx prisma migrate deploy
"
```

**Step 10: Start the backend with PM2**

```bash
sudo -u deploy bash -c "
  cd /home/deploy/store-attention &&
  pm2 startOrRestart pm2.config.cjs --only store-attention &&
  pm2 save
"
pm2 startup systemd -u deploy --hp /home/deploy
# Copy and run the command it outputs as root
```

**Step 11: Configure nginx**

```bash
sudo tee /etc/nginx/sites-available/store-attention > /dev/null <<'EOF'
server {
    listen 80;

    root /home/deploy/store-attention/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:7000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws {
        proxy_pass http://localhost:7000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/store-attention /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

**Step 12: Verify the deployment**

```bash
# Frontend
curl http://<droplet-ip>/
# Expected: HTML page starting with <!DOCTYPE html>

# Backend health
curl http://<droplet-ip>/api/health
# Expected: {"status":"ok","timestamp":"..."}

# PM2 process is running
sudo -u deploy pm2 list
# Expected: store-attention shows status: online
```

**Step 13: Test the auto-deploy**

Make a trivial change on your local machine, push to `main`, and watch the Actions tab in GitHub. The workflow should complete in ~1–2 minutes. After it finishes, refresh the app in the browser to confirm the change is live.

---

## Self-Review

**Spec coverage:**
- ✅ CORS_ORIGIN env var — Task 2
- ✅ frontend build script — Task 1
- ✅ GitHub Actions workflow (git pull, npm ci, build, migrate, generate, pm2 startOrRestart, pm2 save) — Task 3
- ✅ Droplet setup (Node 20, nginx, PM2, deploy user, SSH key) — Task 4
- ✅ .env file on droplet with all secrets — Task 4 Step 8
- ✅ GitHub Secrets (DROPLET_IP, DEPLOY_SSH_PRIVATE_KEY) — Task 4 Step 6
- ✅ nginx config (static frontend, /api/ proxy, /ws WebSocket proxy) — Task 4 Step 11

**Placeholder scan:** No TBDs. `<droplet-ip>`, `<org>/<repo>`, and `<generate with: openssl rand -base64 32>` are intentional user-fill-in values.

**Type consistency:** No shared types across tasks. Each task is self-contained.
