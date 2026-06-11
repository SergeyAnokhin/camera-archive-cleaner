# Technical Specification — Camera Snapshots Archive Manager

This directory contains the functional specification of the system, written so
that the product could be **rebuilt from scratch on any technology stack** by a
team (or an AI) that has never seen the existing code.

## How to read this spec

- **Parts 01–09 are implementation-agnostic.** They describe *what* the system
  does and *how it must behave* — features, data semantics, user flows,
  algorithms, and quality requirements. They deliberately avoid naming
  languages, frameworks, libraries, class names, file names, ports, or storage
  engines. A new team is free to design its own architecture that satisfies
  these parts.
- **Part 10 is the architecture reference and it is optional.** It documents
  how the *current* implementation is built (stack, processes, API routes,
  database schema, cache layout, deployment). It exists for context only.
  **If you want a clean-room rebuild, delete `10-architecture-reference.md`
  and hand over parts 01–09 only.**

Where exact values appear in parts 01–09 (defaults, ranges, thresholds,
formulas, matching windows), they are **requirements** — they define observable
behaviour and must be reproduced for the rebuilt system to behave the same.

## Contents

| Part | File | Covers |
|------|------|--------|
| 01 | [01-overview.md](01-overview.md) | Purpose, users, feature summary, glossary, general requirements |
| 02 | [02-cameras-and-indexing.md](02-cameras-and-indexing.md) | Camera registry, file storage, scanning, the file index |
| 03 | [03-heatmap-navigation.md](03-heatmap-navigation.md) | Heatmap drill-down (Year→Month→Day→Hour), cells, selection, keyboard, viewed status |
| 04 | [04-hour-viewer.md](04-hour-viewer.md) | Browsing one hour: media grid, view modes, lightbox, video playback, distribution chart |
| 05 | [05-ai-and-motion-analysis.md](05-ai-and-motion-analysis.md) | Motion visualization algorithms, cloud AI analysis, local object detection, icon display |
| 06 | [06-deletion-and-maintenance.md](06-deletion-and-maintenance.md) | Safe deletion (with photo↔video pairing), range deletion, maintenance operations |
| 07 | [07-background-tasks.md](07-background-tasks.md) | Persistent task queue: AI/preview batch jobs, video conversion, file organizing |
| 08 | [08-model-tuning.md](08-model-tuning.md) | Detection-model tuning: ground truth, golden-section confidence search, recommendation |
| 09 | [09-settings.md](09-settings.md) | All user settings, persistence rules, YAML export/import |
| 10 | [10-architecture-reference.md](10-architecture-reference.md) | **Optional / removable** — how the current system is actually implemented |
