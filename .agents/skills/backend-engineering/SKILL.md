---
name: backend-engineering
description: Investigate, fix, refactor, test, and secure existing backend APIs, services, database access, authentication, authorization, validation, and performance. Use for backend implementation and bugs; do not perform unrelated UI redesign or destructive database changes.
---
# Backend Engineering

## Principles
Prioritize correctness, security, maintainability, compatibility, and measurable improvements over unnecessary rewrites. The repository's conventions and technology stack are the source of truth.

## Workflow
1. Trace the requested behavior end-to-end: route -> middleware/auth -> controller/handler -> service -> database or external dependency -> response -> frontend consumer when relevant.
2. Reproduce the bug or characterize the risk with evidence before changing code. Check existing tests, schema, env-example, logs provided in the repo, API contract and error behavior.
3. Implement the smallest coherent fix. Keep responsibilities clear, validate input at trust boundaries, avoid leaking secrets or internals in errors, and make authorization checks server-side for each protected resource.
4. Use parameterized queries/ORM safe patterns and transactions when writes must be atomic. Handle race conditions, idempotency, pagination, timeouts, retry safety, and consistent status codes as appropriate.
5. Preserve existing API response shapes and database contracts unless a breaking change is explicitly requested. If change is necessary, explain migration and frontend impact.
6. For schema migrations or data changes: inspect actual state; provide a reversible or safe forward plan, backup considerations, and explicit risks. Never drop tables, reset production data, run destructive migrations, or manipulate production credentials without explicit authorization.
7. Add or update focused tests including success, validation, unauthorized/forbidden, missing-resource, and relevant failure paths. Run available checks; if they cannot run, say why.

## Security boundaries
- Never hardcode or print credentials, tokens, database URIs, or user-sensitive records.
- Do not assume authentication implies authorization.
- Apply least privilege and avoid insecure defaults.
- Do not quietly disable security controls to make tests pass.
- Do not invent backend schema/endpoint behavior; inspect implementation.

## Output
Report root cause, files changed, API/database compatibility considerations, tests and results, unverified items, and deployment/migration cautions.
