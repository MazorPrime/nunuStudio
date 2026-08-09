# ADR-001: Foundation for Mazpon Studio

- **Status**: Accepted
- **Date**: 2026-08-09
- **Deciders**: Lead Engine Architect (this run)

## Context

Mazpon Studio is a browser-first 3D game studio whose differentiating capability is
**systemic simulation**: hundreds-to-thousands of entities with needs, jobs, factions,
injuries, capture/conversion, rooms, hauling — running deterministically, headlessly if
needed, and independently of how (or whether) each entity is rendered.

We inherit the MIT-licensed nunuStudio repository (a Three.js visual editor/engine) and
Deepholm v15 (a 2,400-line deterministic colony-sim prototype that proves the simulation
patterns we want at engine level). The full audit is in `NUNUSTUDIO_AUDIT.md`; the
system-by-system extraction of Deepholm is in `DEEPHOLM_SYSTEM_MAPPING.md`.

Non-negotiable architectural requirements (from the product brief):

1. Renderer visualizes state; it must never *be* the state.
2. Simulation runtime must run headless, fixed-tick, with injectable seeded randomness.
3. Projects are versioned structured data with stable IDs — never serialized live object
   graphs.
4. Human edits, scripts, visual graphs, and AI all operate through one command/transaction
   API on the same project model.
5. Composition/data over inheritance; adding a species/room/item is data, not engine code.

## Options considered

### A. Fork and modernize nunuStudio
Upgrade Three.js 0.119 → current, migrate ES5 → TypeScript, add a simulation layer.

- Three is pinned **and monkey-patched at the prototype level**; ~50 Three releases of
  breaking changes (Geometry removal, color management, WebGPU) land on all ~405 files at
  once. There are zero tests to catch the fallout.
- Even after that cost, the fundamental problem remains: every object extends
  `THREE.Object3D`, so state still lives in the renderer. Requirement 1–3 would demand
  rewriting the object model anyway — the fork buys the *hardest* part of nunuStudio
  (its bespoke untyped UI framework) and forfeits the parts we need to be different.
- Estimated outcome: months of migration to arrive at an architecture we still have to
  replace. **Rejected.**

### B. Reuse selected nunuStudio subsystems inside a new architecture
Lift, e.g., the history/action system, the component widgets, or loaders into new code.

- Every candidate subsystem is written against the live-Object3D model and the ES5 style;
  "lifting" means rewriting the interior while keeping the shape. The shapes (command
  pattern, tab layout) are cheap to re-express natively in TypeScript; the interiors are
  where the work is.
- Loaders are mostly thin wrappers over 2020-era Three loaders; current Three ships better
  ones. **Rejected as code reuse; accepted as design reuse.**

### C. Build a new architecture; use nunuStudio purely as reference — **CHOSEN**
New TypeScript codebase with aggressively separated layers (sim / project-document /
renderer / editor UI), current Three.js, headless-first simulation core, tests from day
one. nunuStudio stays in-repo untouched as a concept catalogue (panel taxonomy, undo
action design, object-type breadth checklist); Deepholm supplies the simulation design
patterns.

### D. Adopt a third-party engine/editor (PlayCanvas engine, Babylon, R3F editor stacks)
- Every candidate embeds the same "scene graph = state" assumption at its core, which is
  the assumption we specifically need to invert. Renderer libraries (Three itself) are the
  right granularity of dependency; engines are not. **Rejected.**

## Decision

**Option C.** Mazpon Studio is a new TypeScript codebase living in `mazpon/` in this
repository. It uses:

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) | Structured-data engine needs types; refactor safety for years of extension |
| Renderer | Three.js (current release, unpatched) | Mature, WebGPU path via WebGPURenderer when ready; treated as a replaceable *view* dependency, imported only by the render/editor layers |
| Simulation core | Hand-rolled ECS-lite (typed components on entity records) | Deepholm proves the shapes; full ECS frameworks (bitecs etc.) optimize for cache-line throughput we don't need yet at the cost of data-model opacity; can adopt later behind the same component schemas |
| Editor UI | Framework-light TypeScript DOM panels for the slice | The project store + command bus is UI-framework-agnostic by construction; React (or Preact/Solid) can be adopted per-panel later without touching engine state — deferring the choice is cheap **because** state ownership is already settled |
| Physics | Deferred; Rapier planned | Not needed for the first slice; adapter seam reserved in the component schema (`collider`, `rigidbody`) |
| Build/test | Vite + Vitest | Fast, standard, testable headlessly in CI; replaces webpack/Babel/yuidoc stack |
| Persistence | Versioned JSON project documents (`schemaVersion` + migration chain), localStorage + file export in the slice; IndexedDB/asset-db later | Deepholm's save-migration philosophy at engine level |

Layering rule (enforced by import direction, checked in review):

```
sim  ←  project  ←  render  ←  editor
 ↑ imports nothing from render/editor; runs in Node and Workers
```

## Consequences

- **Positive**: requirements 1–5 are structural properties of the codebase, not
  aspirations; headless determinism tests run in CI from the first commit; Three.js can
  track upstream releases (and WebGPU) because nothing patches or extends its internals;
  AI authoring gets its transaction API for free because human undo/redo already *is*
  that API.
- **Negative**: we re-implement editor features nunuStudio already has (gizmos, asset
  browser, particle editor…). Mitigated: Three's own examples provide TransformControls,
  OrbitControls, loaders; nunuStudio remains a live map of what "feature-complete" looks
  like.
- **Neutral**: the nunuStudio source tree stays in the repository, unmodified, as
  reference. It is excluded from the Mazpon build entirely. If it is later moved to a
  `reference/` folder or removed, nothing in `mazpon/` changes.
