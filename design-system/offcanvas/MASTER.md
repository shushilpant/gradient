# OffCanvas design system

The current product direction is an academic notebook: warm paper, dark ink and rust actions. Use [the workspace design guide](../../offcanvas/docs/DESIGN.md) and `offcanvas/extension/ui/palette.ts` as the source of truth. Page rules live in `pages/` beside this file.

## Brand

- Product name: **OffCanvas**, with this exact capitalisation.
- Package, source directory, downloaded files and technical identifiers: `offcanvas`.
- Extension mark: the shared white chart on rust, sourced from `offcanvas/extension/icons/mark.svg`. Generate PNG sizes with `npm run icons` from `offcanvas/`.
- Older names are accepted only by explicit data, configuration and local-replica compatibility paths. New settings, exports, setup instructions and demo seeds use OffCanvas.

## Palette

| Role | Value |
| --- | --- |
| Canvas | `#f8f6f3` |
| Card | `#ffffff` |
| Inset | `#f0eae4` |
| Ink | `#2a1f1a` |
| Secondary text | `#4a3f38` |
| Muted text | `#6b6058` |
| Rule | `#ebe5df` |
| Strong rule | `#ddd3ca` |
| Accent | `#a64b2a` |
| Accent hover | `#873b22` |
| Accent soft | `#f8ede6` |
| Success | `#1d6b45` |
| Warning | `#80510a` |
| Error | `#a32a23` |

Use shared semantic tokens instead of introducing competing palettes. Keep course identity colours stable across views. Status remains distinct from branding.

## Typography and shape

Newsreader for titles and headline figures; Figtree for controls and body copy. Fonts are bundled locally. Use 14px body text, 6px chips, 9px controls, 12px cards and a 16px panel radius. The settings page may retain its system-font fallback.

## Interaction

Keep Canvas visible beside the dock. Support compact, expanded and minimised states. Use plain British English, same-tab course links, visible keyboard focus, SVG line icons, reduced-motion preferences, readable chart alternatives and layouts down to 375px without horizontal overflow. Exports and settings share the workspace palette. Never show synthetic courses as authenticated live coursework.
