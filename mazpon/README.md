# Mazpon Studio

Browser-first 3D game studio specialized for **systemic simulation games** — colony
sims, dungeon sims, faction/management games whose worlds keep running through
autonomous rules whether or not anything is rendered.

This workspace is the first vertical slice. The surrounding repository is
[tentone/nunuStudio](https://github.com/tentone/nunuStudio), kept intact as a reference
implementation only (see `../docs/ADR-001-FOUNDATION.md` for why it is not the
foundation). All project documentation lives in `../docs/`:

- `MAZPON_STUDIO_ARCHITECTURE.md` — the layered architecture and its rules
- `NUNUSTUDIO_AUDIT.md` — the audit behind the foundation decision
- `DEEPHOLM_SYSTEM_MAPPING.md` — Deepholm v15 lessons → engine primitives
- `ROADMAP.md` — phased plan
- `ADR-001-FOUNDATION.md` — the decision record

## Quickstart

```bash
cd mazpon
npm install
npm run dev        # editor at the printed URL
npm test           # headless simulation/command/serialization suite (vitest)
npm run build      # type-check + production build
npm run smoke      # end-to-end: drives the built editor in headless Chromium
```

## What the slice does

Open editor → 3D viewport (orbit camera, grid) → create primitives and a **Delver**
actor (capsule with `transform / renderable / actor / species / faction / needs`) →
select in viewport or hierarchy → transform via gizmos (move/rotate/scale) or the
Inspector → every edit is an undoable command → save/load (localStorage) and
export/import (JSON, `schemaVersion` + migration chain) → **Play** builds a deterministic
fixed-tick simulation from the document (hunger decays, actors wander on a seeded RNG;
the document is never touched) → **Stop** discards the sim. Seed and tick are always
visible in the status bar.

## Layout

```
src/sim/       headless simulation: rng, entity/component model, world, systems, loop
src/project/   document schema, migrations, commands (single write path), store, persistence
src/render/    Three.js viewport — a mirror of entity state, never its owner
src/editor/    panels (hierarchy, inspector, toolbar, statusbar) + controller
tests/         determinism, commands/undo, serialization/migration, architecture guards
scripts/       smoke.mjs — Playwright end-to-end against the production build
```

Layering law (mechanically enforced by `tests/simguards.test.ts`): `src/sim` imports
nothing from Three.js, the DOM, or upper layers, and never calls `Math.random`.
