# Sull AI — Enterprise Platform Architecture

## Mission

Sull AI is a multi-tenant, zero-trust, event-driven enterprise AI operating platform. It provides identity, tenancy, policy, multi-agent orchestration, RAG, model routing, billing, audit, and observability as first-class production subsystems.

## Architectural Principles

1. **Scalability over simplicity** — every service is independently deployable, horizontally scalable, and bounded by a clear domain.
2. **Maintainability over shortcuts** — shared contracts, typed events, enforced lint/test gates, and ADR-driven change.
3. **Security over convenience** — zero-trust mTLS, short-lived JWTs, ABAC via OPA, secrets never in images, audit on every mutation.
4. **Automation everywhere** — Terraform, Helm, GitHub Actions, migrations, codegen, and progressive delivery.

## Topology

```
                    ┌─────────────────────────┐
                    │   Edge (Cloudflare/ALB) │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │  API Gateway (Envoy)    │
                    │  JWT, rate limit, WAF   │
                    └───────────┬─────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
┌────────▼────────┐   ┌─────────▼────────┐   ┌────────▼────────┐
│ Identity        │   │ Domain Services  │   │ AI Plane        │
│ Policy (OPA)    │   │ Tenant/User/...  │   │ Agents/Models   │
└────────┬────────┘   └─────────┬────────┘   └────────┬────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │  Event Bus (Kafka/MSK)  │
                    │  CQRS + Outbox + ES     │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
       ┌──────▼──────┐  ┌───────▼──────┐  ┌───────▼──────┐
       │ Projectors  │  │ Analytics    │  │ Audit / SIEM │
       └─────────────┘  └──────────────┘  └──────────────┘
```

## Bounded Contexts

| Service | Responsibility | Write Model | Read Model |
|---------|----------------|-------------|------------|
| identity-service | AuthN, OIDC, MFA, sessions, API keys | Postgres + Redis | Redis session cache |
| tenant-service | Orgs, workspaces, plans, quotas | Postgres | Materialized views |
| user-service | Profiles, memberships, RBAC bindings | Postgres | Elastic search index |
| policy-service | ABAC policies, OPA bundles | Git + Postgres | OPA sidecar cache |
| billing-service | Subscriptions, invoices, usage | Postgres | ClickHouse aggregates |
| audit-service | Immutable audit trail | Append-only Postgres | OpenSearch |
| notification-service | Email, webhook, in-app | Postgres | Redis queues |
| file-service | Object storage metadata, virus scan | Postgres + S3 | CDN signed URLs |
| agent-orchestrator | Multi-agent graphs, tool calls | Postgres + Redis | Event projections |
| model-gateway | LLM provider routing, spend caps | Postgres + Redis | Prometheus metrics |
| rag-service | Ingestion, chunking, retrieval | Postgres | Vector + BM25 |
| vector-service | Embedding index management | Qdrant/pgvector | Qdrant |
| workflow-engine | Durable workflows, sagas | Postgres | Temporal-style state |
| analytics-service | Product & AI usage analytics | Kafka → ClickHouse | ClickHouse |
| search-service | Cross-entity search | OpenSearch | OpenSearch |
| event-projector | CQRS read-model builders | Kafka consumer | Per-domain stores |
| api-gateway | Edge routing, authz hinting | Stateless | Redis rate limits |

## Event-Driven CQRS / Event Sourcing

- **Write path**: Aggregate mutates → domain event → transactional outbox (same DB txn) → outbox relay publishes to Kafka.
- **Event store**: Kafka compacted + chronologically partitioned topics per bounded context (`sull.<ctx>.events.v1`).
- **Read path**: `event-projector` builds denormalized views for APIs and search.
- **Schemas**: JSON Schema + Avro dual-publish via `@sull/events`; breaking changes require new topic version.
- **Idempotency**: Every consumer uses `(aggregate_id, event_id)` dedupe keys in Redis or DB unique constraints.

## Multi-Agent AI Plane

- `agent-orchestrator` owns agent graphs (planner → researcher → critic → executor).
- Tools are registered services with typed OpenAPI contracts and policy-checked invocation.
- `model-gateway` abstracts OpenAI, Anthropic, Azure OpenAI, Bedrock, and self-hosted vLLM with retry, circuit breakers, and token accounting.
- `rag-service` + `vector-service` supply grounded context; every generation emits lineage events for audit.

## Zero Trust

- Service mesh: Istio with STRICT mTLS.
- SPIFFE IDs per workload; no long-lived shared secrets between services.
- Human auth: OIDC (authorization code + PKCE); machine auth: workload identity + short-lived JWT.
- Authorization: OPA/Rego policies evaluated at gateway and service middleware.
- Network: Kubernetes NetworkPolicies default-deny; egress via explicit allow lists.
- Secrets: AWS Secrets Manager / External Secrets Operator; never baked into images.

## Observability

- OpenTelemetry SDK in every service (`@sull/otel`).
- Traces → Tempo, metrics → Prometheus, logs → Loki (structured JSON via `@sull/logger`).
- SLOs defined per service; burn-rate alerts in Prometheus rules.
- Continuous profiling optional via Pyroscope in staging/prod.

## Data Stores

| Store | Use |
|-------|-----|
| PostgreSQL 16 | System of record per service (DB-per-service) |
| Redis 7 | Sessions, rate limits, idempotency, caches |
| Kafka (MSK / Redpanda local) | Event bus |
| Qdrant | Vector indexes |
| OpenSearch | Search + audit query |
| ClickHouse | Analytics |
| S3 | Files, model artifacts, OPA bundles |
| Temporal-compatible Postgres | Workflow durable state |

## Deployment

- **Local**: Docker Compose (Redpanda, Postgres, Redis, Qdrant, OTel collector, services).
- **Cloud**: AWS EKS, Terraform modules, Helm umbrella chart `sull-platform`.
- **CI/CD**: GitHub Actions — lint, typecheck, unit, integration, container scan (Trivy), terraform plan, progressive Helm deploy.
- **Environments**: `dev`, `staging`, `prod` with identical topology and different scale/HA.

## Repository Layout

```
apps/           — Console (Next.js), docs portal
services/       — Domain microservices
packages/       — Shared libraries and contracts
infra/          — Terraform, Kubernetes, Helm, Docker, mesh, monitoring
.github/        — Workflows and reusable actions
tests/          — e2e, integration, load, security
scripts/        — Developer and ops automation
docs/           — Architecture, ADRs, runbooks, security
```

## Non-Goals (Phase 1)

- No multi-cloud active-active in v1 (AWS primary; abstraction kept for later).
- No customer VPC peering until enterprise tier contracts land.
- No custom silicon / on-prem appliance packaging in Phase 1.
