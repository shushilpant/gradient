# OffCanvas academic workbench

OffCanvas is written for a student who opens Canvas and wants three answers quickly: what is due next, how am I doing, and what should I do about it. Every screen is judged against that reader, not against someone who already knows grade boundaries or weighting rules.

## Direction

A light, calm study notebook. Ink on warm paper, one confident rust for action, and colour reserved for meaning. Big numbers are set in a serif so they read like a printed report; everything that is interacted with uses a quiet sans.

The previous layout layered several stylesheets on top of each other, kept presenter controls permanently on screen, and showed numbers as generic stat tiles. The rework replaces those with a single stylesheet per surface, a **Present** menu that keeps demo controls out of the way, and charts that answer a question in their title.

## System

- **Surfaces:** canvas `#f8f6f3`, white cards, sunken `#f0eae4` for inset areas. Rules `#ebe5df`, stronger edges `#ddd3ca`.
- **Text:** ink `#2a1f1a`, secondary `#4a3f38`, muted `#6b6058`, faint `#a89b91`.
- **Accent:** rust `#a64b2a` (hover `#873b22`, soft `#f8ede6`) for primary actions, the current tab and selected states only.
- **Automation:** the visible cursor, click ring and control overlay share the rust accent. The native pointer is preserved.
- **Meaning:** amber and red signal deadline pressure; green means handed in or done. Each course keeps one identity colour (`--g-c1` to `--g-c6`) across every chart, list and badge.
- **Grade zones:** D or below, C, B and A have their own tints (`--g-band-*`) so a mark can be read as a position, not just a number.
- **Type:** Newsreader for titles and headline figures, Figtree for body and controls, 14 px base. Both are bundled as data URLs in `fontStyles.ts`; no font CDN is used.
- **Shape:** 6 px chips, 9 px controls, 12 px cards, 16 px outer panel.
- **Language:** UK English throughout, including dates (`en-GB`, e.g. "Tuesday 10 November", 24-hour times). Plain words win over Canvas jargon: "marked" rather than "graded", "handed in" rather than "submitted", "lecturer" rather than "instructor".

## Overview

1. A greeting and a two-to-three sentence briefing generated from Canvas data (`plainLanguage.ts`). An optional **Explain this more simply** button asks the local model to reword the same facts.
2. **Next up:** the nearest deadline, a date tile, and one primary action.
3. **Next fortnight:** a 14-day workload chart. Blocks are stacked by points and coloured by course, so heavy days are visible at a glance.
4. **Where you stand:** every course on one 60–100 scale with grade zones, today's mark, and a bracket showing where the final mark can still land.
5. **Term progress:** a single segmented bar for overdue, still to do, handed in and marked work.
6. Course list, upcoming work, changes since last visit and AI rules follow.

In the expanded workspace the cards sit in two columns; in the side panel they stack in reading order.

## Coursework

The grade card leads with the current mark, letter and a plain-language reading ("Excellent · counts marked work only"), then a large zone track. Below it, a written briefing explains the lowest and highest possible final marks and the next thing to do. Filters are **To do**, **Handed in**, **Marked** and **All work**. The what-if slider shows its effect on the final mark immediately.

## Behaviour

Motion is limited to state changes and pending operations, and stops under reduced-motion preferences. Focus rings are always visible, selected states never rely on colour alone, and charts carry text alternatives. Below 600 px the panel goes full-bleed without horizontal overflow.

## Preserved behaviour

Course navigation, Canvas refresh, assignment search, grade tools, resource access, reminders, local model settings, research and exports keep their interaction contracts. Demo controls moved into the **Present** menu but keep their accessible names.
