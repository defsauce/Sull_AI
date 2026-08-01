# ADR-0004: TypeScript strictness without exactOptionalPropertyTypes

## Status

Accepted

## Context

`exactOptionalPropertyTypes` conflicts with Zod-inferred optional fields and many third-party SDK option bags, creating widespread false-positive assignability errors across services.

## Decision

Keep `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, and `verbatimModuleSyntax`. Do not enable `exactOptionalPropertyTypes` in the shared base tsconfig.

## Consequences

- Faster, maintainable service development
- Optional fields may still be explicitly set to `undefined`; runtime Zod validation remains the contract boundary
