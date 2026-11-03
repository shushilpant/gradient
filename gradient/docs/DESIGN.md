# GRADIENT academic workbench

Reading this as a student study workspace with the precision of a research notebook. The redesign uses UI/UX Pro Max for accessible dashboard behavior and the audit/aesthetic guidance from design-taste-frontend. The latter excludes dense product UI, so its marketing-page rules are not applied here.

## Audit and direction

The previous interface used blue SaaS cards, repeated aspirational headlines, a cyan/navy assistant theme later recolored blue, and decorative chart-shaped bars. Typography was inherited from system Inter. The result made the assistant feel attached to, rather than part of, the workspace.

The new direction is an academic instrument. It keeps Canvas data and controls legible, makes the work itself the focus, and replaces decorative visual claims with actual evidence and generated figures.

Design settings: variance 6, motion 2, density 5. Styling is bespoke native CSS in the existing Preact Shadow DOM, not an imitation of a named component system.

## System

- Canvas: cool off-white `#f3f5f2`; white working surfaces.
- Text: graphite `#202824`; secondary text `#5c6962`.
- Accent: forest `#175b4c`, used for actions, current navigation, selected modes, and completion.
- Rules: `#d8e0d9`; stronger edges `#cbd5ce`.
- Amber and rust indicate deadlines or incomplete evidence; they are not decorative accent colors.
- Manrope 400/600/800 provides body and display type. IBM Plex Mono 400 distinguishes dates, counts, methods, citations, and progress metadata.
- Fonts are installed through `@fontsource`, bundled as WOFF2 data URLs in `fontStyles.ts`, and included in standalone HTML exports. No runtime font CDN is used.
- Controls use a 6 px radius; content groups 8–9 px; the outer desktop workspace 14 px. Grade rings remain circular because their shape conveys a quantity.

## Information hierarchy

The shell has a forest registration rule and underlined navigation. Overview numbers sit on a ruled strip rather than colored tiles. Course rows are a flat indexed list. Assignment context and autopilot have a left-edge rule, so the selected work and scope remain visible without decorative badges everywhere.

Autopilot has explicit homework scope, a six-stage progress ledger, requirement evidence, coverage states, and Python-rendered figure provenance. Completed work remains a document with a clear title and readable text, rather than a chat bubble.

Motion is reserved for actual pending operations. Reduced-motion preferences stop loaders and transitions. Focus rings are explicit, selected states include borders or text, and forms use persistent labels. Compact/mobile layouts preserve the navigation and stack controls without horizontal overflow.

## Preserved behavior

Existing course navigation, Canvas refresh, assignment search, grading tools, resource access, reminder controls, local model settings, browser research, and exports retain their original selectors and interaction contracts. No primary navigation labels or brand wordmark were renamed.
