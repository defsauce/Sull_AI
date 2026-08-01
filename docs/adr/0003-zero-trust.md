# ADR-0003: Zero Trust with Istio mTLS and OPA

## Status

Accepted

## Context

Enterprise customers require strong workload identity, least privilege, and policy-as-code.

## Decision

Enforce Istio STRICT mTLS in-cluster. Authenticate humans and API keys via identity-service JWTs. Authorize with OPA Rego at gateway and service edges. Default-deny NetworkPolicies.

## Consequences

- Higher operational complexity
- Uniform security baseline across services
- Policy changes ship as versioned bundles
