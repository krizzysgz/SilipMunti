---
name: responsive-ux-accessibility
description: Audit and fix responsive frontend layouts and user experience on mobile, tablet, and desktop, including overflow, alignment, navigation, forms, long scroll, keyboard access, and accessible interaction states. Not for wholesale visual rebranding or backend redesign.
---
# Responsive UX and Accessibility

## Workflow
1. Identify the requested route/component and inspect its container layout, breakpoints, shared shells, and interactive states before editing.
2. Check a range of viewport widths rather than assuming device-specific breakpoints: narrow mobile (~320-390px), larger mobile (~430px), tablet (~768px), laptop (~1024-1440px), and wide desktop when tools permit.
3. Find root causes of horizontal overflow, brittle fixed widths, misalignment with global page containers, unintended wrapping, excessive vertical gaps, overlarge type, and awkward density.
4. Fix content hierarchy and interaction: tap target sizes, labels, errors, loading, empty and success states, navigation, keyboard tab order, visible focus, and screen-reader naming.
5. Prefer fluid widths, max-width alignment, grid/flex with minmax and sensible wrapping, and shared spacing tokens. Avoid adding many one-off media queries to mask structural issues.
6. Keep existing behavior and page identity. Do not alter sibling routes or shared navigation unless the requested problem requires it; examine dependent pages before shared changes.
7. Where browser/preview is available, test the changed page at representative widths and inspect visual regressions. Otherwise run relevant static checks and disclose missing visual validation.

## Quality checklist
- No unintended horizontal scrolling.
- Content and header align with the same intended shell.
- Key actions remain visible and usable without oversized decorative sections.
- No text clipping, overlapping, or cramped controls.
- No color-only communication; contrast and focus remain usable.
- Lists, favorites, grids, and detail pages work with real/long/empty content.
- Reduced-motion preferences respected for nonessential animation.

## Output
List the specific root causes, targeted fixes, viewports actually tested, and any unverified behavior.
