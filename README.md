# Sull AI

Enterprise multi-tenant AI operating platform built from `Enterprise_AI_Company_Master_Prompt.md`.

## Architecture

See [docs/architecture/ENTERPRISE_ARCHITECTURE.md](docs/architecture/ENTERPRISE_ARCHITECTURE.md).

## Verified status

- **pnpm + Turborepo monorepo** configured
- **17 microservices** implemented and compiling
- **Shared packages** (`errors`, `logger`, `config`, `otel`, `events`, `auth-sdk`, `db`, `kafka`, `http`, `contracts`, `testing`)
- **Docker Compose** local data plane (Postgres, Redis, Redpanda, Qdrant, OpenSearch, ClickHouse, MinIO, OPA, OTel, Prometheus, Grafana, Tempo, Loki)
- **Kubernetes** base + overlays + Helm umbrella chart
- **Terraform** VPC/EKS/RDS/MSK/S3/ElastiCache modules for dev/staging/prod
- **GitHub Actions** CI (lint/typecheck/test/build/Trivy/terraform) + deploy workflow
- **Console + docs portal** (Next.js)
- **Unit tests**: 38 turbo test tasks passing

## Quick start

```bash
npm install -g pnpm@9.15.0
pnpm install
pnpm build
pnpm test
node scripts/generate-docker-env.mjs
pnpm docker:up
pnpm --filter @sull/console dev
```

See [docs/runbooks/service-ports.md](docs/runbooks/service-ports.md) for the full local port map.

## Service catalog

| Service | Responsibility |
|---------|----------------|
| api-gateway | Edge routing, JWT gate, upstream proxy |
| identity-service | Register/login/refresh, JWKS, sessions |
| tenant-service | Tenants, plans, quotas |
| user-service | Profiles, memberships |
| billing-service | Subscriptions, usage, invoices |
| audit-service | Append-only audit trail |
| notification-service | Email/webhook queue |
| file-service | S3 metadata + signed URLs |
| policy-service | Policy bundles + evaluation |
| event-projector | Kafka → read models |
| agent-orchestrator | Multi-agent run graphs |
| model-gateway | LLM routing + spend caps |
| rag-service | Ingest + hybrid retrieval |
| vector-service | Embedding index + search |
| workflow-engine | Durable workflows / sagas |
| analytics-service | Usage aggregates |
| search-service | Full-text search |

## License

Proprietary — Sull AI. All rights reserved.
