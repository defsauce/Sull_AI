# ADR-0002: Event-driven CQRS with transactional outbox

## Status

Accepted

## Context

Cross-service consistency cannot rely on distributed transactions. Dual writes to DB and Kafka create lost events under failure.

## Decision

Each service owns its Postgres database. Domain mutations and CloudEvents are written in one transaction to an `outbox_events` table. A relay publishes to Kafka. Projectors build read models asynchronously.

## Consequences

- At-least-once delivery; consumers must be idempotent
- Slight read lag acceptable for non-critical paths
- Clear audit lineage through event IDs
