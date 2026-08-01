# Local development runbook

## Prerequisites

- Node.js 22+
- pnpm 9.15+
- Docker Desktop with Compose v2
- Optional: kubectl, terraform, helm

## Bootstrap

```bash
pnpm install
pnpm build
pnpm test
node scripts/generate-docker-env.mjs
pnpm docker:up
```

## Service ports

| Component | URL |
|-----------|-----|
| API Gateway | http://localhost:8080 |
| Identity | http://localhost:8081 |
| Tenant | http://localhost:8082 |
| Console | http://localhost:3000 |
| Grafana | http://localhost:3001 |
| Docs portal | http://localhost:3002 |
| Prometheus | http://localhost:9090 |
| Redpanda Kafka | localhost:19092 |

## Smoke test

```bash
curl -s http://localhost:8081/healthz
curl -s -X POST http://localhost:8081/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"ops@example.com","displayName":"Ops","password":"correct-horse-battery"}'
```
