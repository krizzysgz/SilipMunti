---
name: full-system-audit
description: Review an existing application end to end across frontend UX, code architecture, backend APIs, data flows, security, performance, and maintainability; produce a prioritized evidence-backed improvement plan. Use for system-wide audits and multi-area modernization planning, not routine one-file changes.
---
# Full-System Audit

## Scope
Audit the system holistically without assuming everything needs rewriting. Default to report-first: an audit request is not permission to refactor the whole application.

## Workflow
1. Inventory the repository structure, framework/library versions, routes, key user flows, shared frontend components, backend handlers, data models, tests, and build/deployment setup using files actually present.
2. Map critical flows from page actions to APIs, authorization, persistence, errors, and displayed feedback. State unknowns instead of guessing.
3. Review: UI cohesion and product identity; mobile/tablet/desktop usability; accessibility; empty/loading/error states; type safety; duplication; API contracts; authentication/authorization; validation; data integrity; performance; observability; testing and deployment safety.
4. Distinguish verified defects from hypotheses and preferences. Provide each finding with location/evidence, user/technical impact, severity, confidence, and proposed smallest practical fix.
5. Prioritize by security/data-loss risk, broken user journeys, high-impact UX issues, then maintainability/polish. Flag dependencies and any changes to shared components.
6. Make a phased roadmap: quick safe fixes, structural improvements, optional refinements. Split work into independently reviewable changes with test/rollback strategies.
7. When explicitly asked to implement, improve all affected layers and pages necessary to resolve root causes and preserve system-wide consistency. Organize larger improvements into reviewable phases, validate cross-page/API impact, and never carry out destructive operations without authorization.

## Output format
- System map and areas inspected
- Top findings (severity, location, evidence, recommended action)
- Quick wins vs architectural work
- Risks, compatibility, and test gaps
- Suggested implementation sequence across affected system areas
- Explicit limitations of inspection

## Team coordination
Use `professional-ui-design` principles for appearance, `responsive-ux-accessibility` for usability, and `backend-engineering` for server changes only when relevant to the audit; no cross-skill invocation is required to make a sound report.
