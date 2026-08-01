# Security baseline

## Controls

1. TLS everywhere at the edge; mTLS between workloads via Istio.
2. Short-lived JWTs (15m) with rotating refresh tokens hashed at rest.
3. Secrets only via Secrets Manager / External Secrets — never in images.
4. Default-deny NetworkPolicies in `sull-ai` namespace.
5. Pod Security Standards: restricted.
6. OPA ABAC for authorization decisions.
7. Append-only audit trail for privileged actions.
8. Container scanning (Trivy) gates CI.
9. Dependency updates via Dependabot / Renovate (enable in org settings).
10. PII redaction in structured logs (`@sull/logger`).

## Threat model (summary)

| Threat | Mitigation |
|--------|------------|
| Credential stuffing | Argon2id, MFA hooks, rate limits |
| Cross-tenant data leak | Tenant claim checks, OPA, DB RLS where applicable |
| Supply chain | Lockfiles, image digests, Trivy |
| Insider abuse | Audit events, least privilege IAM |
| Prompt injection / tool abuse | Policy-checked tools, grounded RAG lineage |
