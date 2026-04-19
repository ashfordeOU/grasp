# Grasp Self-Hosted Deployment

## Prerequisites
- Docker + Docker Compose v2
- A valid Grasp Enterprise license key

## Steps
1. `cp .env.example .env && nano .env` — fill in your credentials
2. `docker compose up -d`
3. Visit `http://localhost:3001/api/health` — should return `{"status":"ok"}`
4. Open `index.html` in your browser — set the API URL to `http://localhost:3001`

## Updating
```
docker compose pull && docker compose up -d
```

## Services
| Service | Port | Description |
|---------|------|-------------|
| grasp-saas | 3001 | Analysis API + badge endpoint |
| grasp-github-app | 3000 | GitHub App webhook handler |
| redis | 6379 | Cache + job queue |
