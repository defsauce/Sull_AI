# ADR-0001: Monorepo with Turborepo + pnpm

## Status

Accepted

## Context

Sull AI requires many independently deployable services sharing contracts, auth, telemetry, and event schemas. Multi-repo sprawl would slow contract evolution and CI consistency.

## Decision

Use a single pnpm workspace monorepo orchestrated by Turborepo. Shared libraries live in `packages/`; deployable units live in `services/` and `apps/`.

## Consequences

- Atomic cross-service contract changes
- Shared lint/test/build pipeline
- Requires disciplined package boundaries and CODEOWNERS
