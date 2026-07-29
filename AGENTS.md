# AGENTS.md

**The guidelines for this repo live in [`CLAUDE.md`](CLAUDE.md). Read that file — it
applies to every agent, not just Claude.**

This file used to be a verbatim copy of `CLAUDE.md`. It was reduced to a pointer
because the copy had already drifted (it was missing the mandatory-testing
section), and two files stating the rules means one of them is always wrong.

Quick orientation while you fetch `CLAUDE.md`:

| Need | Go to |
|---|---|
| Behavioural rules (scope discipline, simplicity, docs & testing duties) | [`CLAUDE.md`](CLAUDE.md) |
| Which file owns what | [`docs/code-map.md`](docs/code-map.md) |
| Which files to touch for a cross-cutting change | [`docs/recipes.md`](docs/recipes.md) |
| Everything else | the Documentation table in [`README.md`](README.md) |

Two rules are worth repeating here because skipping them costs the most:

- **Run `npm test` from the repo root after every change.** A task is not
  complete while a test fails.
- **Update [`docs/code-map.md`](docs/code-map.md) in the same change whenever you
  add, delete, rename, or move a source file.** A stale code-map sends every
  future search to a dead end.
