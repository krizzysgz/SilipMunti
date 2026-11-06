---
name: professional-ui-design
description: Improve existing frontend visual design, components, typography, spacing, visual hierarchy, consistency, and polished product aesthetics. Use for page redesign, design system updates, or visual UI cleanup; not for unrelated backend changes.
---
# Professional UI Design

## Objective
Deliver a distinctive, trustworthy, cohesive interface that feels designed for this product and its users—not a generic generated template. Work from the actual codebase, product purpose, existing brand, and page content. Do not assume a fixed visual style.

## Workflow
1. Inspect the requested pages or entire application as appropriate, including shared components, design tokens, styles, routes, and screenshots if available. Identify its product context, primary action, and relation to neighboring pages.
2. Diagnose concrete issues before editing: typography hierarchy, spacing rhythm, density, alignment, content widths, contrast, icon quality, state consistency, and visual noise.
3. Reuse existing design tokens and components unless they are the source of the problem. Propose minimal new tokens where necessary; avoid parallel competing component variants.
4. Choose layout and information hierarchy based on content and user tasks. Prefer intentionally composed sections, legible type, disciplined whitespace, consistent radii, restrained color, and realistic content density.
5. Avoid common template clichés unless genuinely appropriate: excessive gradients/glows, arbitrary purple-blue palettes, oversized hero copy, gratuitous glassmorphism, floating decorative blobs, emoji as UI icons, identical cards everywhere, empty whitespace that increases scrolling, and needless animations.
6. Preserve existing functionality, data bindings, routes, keyboard interactions, and responsive behavior. Make coordinated changes across pages, shared components, and styling where needed for system-wide coherence; do not limit fixes artificially to one page.
7. Validate against existing lint/type/build/test commands when feasible. Review desktop and mobile states if preview tools are available. Never claim visual inspection that was not performed.

## Decision rules
- Do not introduce a new color palette or font without an explicit reason grounded in the brand or user request.
- Not all content should be a card. Use dividers, typography, grouping, tables, and compact detail grids when appropriate.
- Use semantic elements and accessible contrast and focus states.
- For real estate/property details, prioritize scan-friendly groups and avoid one-property-per-line layouts when a responsive grid is appropriate; do not force dense grids on narrow screens.
- Update shared global styles and other pages when necessary for consistency, but first analyze downstream impact and verify affected routes to prevent regressions.

## Output
Summarize what looked wrong, what changed, files touched, how it affects responsive states, tests run, and any remaining concerns. If only reviewing, provide prioritized actionable findings rather than unrequested modifications.
