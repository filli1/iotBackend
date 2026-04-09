# Deployment — Design Spec

**Date:** 2026-04-09
**Status:** Approved

---

## Goal

Deploy the store-attention monorepo to a DigitalOcean droplet with automatic re-deployment triggered by every merge to the `main` branch via GitHub Actions.

---

## Approach

SSH + git pull + PM2. GitHub Actions SSHes into the droplet on every push to `main`, pulls the latest code, builds the frontend, runs Prisma migrations, and restarts the backend process. nginx serves the built frontend as static files and reverse-proxies API and WebSocket traffic to the Fastify backend.

---

## Architecture

```
GitHub (main branch)
    │  push/merge
    ▼
GitHub Actions workflow
    │  SSH into droplet
    ▼
DigitalOcean Droplet (Ubuntu 24.04 LTS, 512MB RAM, 10GB disk)
    ├── nginx (port 80)
    │     ├── /            → serves frontend/dist/ (static files)
    │     ├── /api/*       → reverse proxy → localhost:7000
    │     └── /ws          → reverse proxy (WebSocket) → localhost:7000
    ├── PM2
    │     └── store-attention (Node.js backend, port 7000)
    └── SQLite database file (persists on disk, untouched by deploys)
```

**Deploy sequence (runs on every push to main):**
1. `git pull origin main`
2. `npm ci`
3. `npm run build -w frontend` (Vite → `frontend/dist/`)
4. `cd backend && npx prisma migrate deploy`
5. `pm2 restart store-attention`

---

## One-Time Droplet Setup

### System dependencies

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git
sudo npm install -g pm2
```

### Deploy user

```bash
sudo adduser deploy
sudo usermod -aG sudo deploy
sudo mkdir -p /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
```

Generate an SSH keypair locally (or in GitHub Actions setup):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key -N ""
# deploy_key.pub → paste into /home/deploy/.ssh/authorized_keys on the droplet
# deploy_key     → paste as DEPLOY_SSH_PRIVATE_KEY in GitHub Secrets
```

```bash
sudo sh -c 'cat /path/to/deploy_key.pub >> /home/deploy/.ssh/authorized_keys'
sudo chmod 600 /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh
```

### Clone repo

```bash
sudo -u deploy git clone https://github.com/<org>/<repo>.git /home/deploy/store-attention
```

### Environment file

Create `/home/deploy/store-attention/backend/.env` manually (never committed, never touched by deploy):

```env
JWT_SECRET=<strong-random-secret>
CORS_ORIGIN=http://<droplet-ip>
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=whatsapp:+14155238886
```

### Initial PM2 setup

```bash
cd /home/deploy/store-attention
npm ci
cd backend && npx prisma migrate deploy && cd ..
pm2 start --name store-attention --interpreter tsx backend/src/index.ts
pm2 save
pm2 startup  # copy and run the generated command as root
```

### nginx config

`/etc/nginx/sites-available/store-attention`:

```nginx
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
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/store-attention /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## GitHub Actions Workflow

`.github/workflows/deploy.yml`:

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
            cd ..
            pm2 restart store-attention
```

### GitHub Secrets to configure

Navigate to: **Settings → Secrets and variables → Actions**

| Secret name | Value |
|---|---|
| `DROPLET_IP` | The droplet's public IP address |
| `DEPLOY_SSH_PRIVATE_KEY` | Private key matching the public key in `/home/deploy/.ssh/authorized_keys` |

---

## Backend Code Change Required

The backend currently hardcodes `origin: 'http://localhost:5174'` for CORS. In production, the frontend is served from `http://<droplet-ip>` via nginx. This must be driven by the `CORS_ORIGIN` env var:

```typescript
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:5174',
})
```

---

## Secrets Summary

| Secret | Where stored | Managed by |
|---|---|---|
| `JWT_SECRET` | `backend/.env` on droplet | Manual, set once |
| `CORS_ORIGIN` | `backend/.env` on droplet | Manual, set once |
| `TWILIO_ACCOUNT_SID` | `backend/.env` on droplet | Manual, set once |
| `TWILIO_AUTH_TOKEN` | `backend/.env` on droplet | Manual, set once |
| `TWILIO_FROM_NUMBER` | `backend/.env` on droplet | Manual, set once |
| `DROPLET_IP` | GitHub Secrets | Manual, set once |
| `DEPLOY_SSH_PRIVATE_KEY` | GitHub Secrets | Manual, set once |

---

## Out of Scope

- SSL/HTTPS (no domain name — IP-only access)
- Docker / containerisation
- Zero-downtime rolling deploys (PM2 restart causes ~1–2s gap)
- Health checks or rollback on failed deploy
- Log shipping or centralised monitoring
