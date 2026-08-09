# Mazpon Studio — Architecture

Mazpon Studio is a browser-first 3D game studio specialized for **systemic games**:
colony sims, dungeon sims, settlement/faction/management games — worlds that keep
operating through autonomous rules whether or not anything is rendered.

This document describes the architecture established by the first vertical slice (in
`mazpon/`) and the seams reserved for everything after it. Companion documents:
`ADR-001-FOUNDATION.md` (why this and not a nunuStudio fork),
`NUNUSTUDIO_AUDIT.md`, `DEEPHOLM_SYSTEM_MAPPING.md`, `ROADMAP.md`.

## 1. The one rule everything follows

> **The renderer visualizes state. It never owns it.**

A creature is a record in the simulation — the *same* record whether it is drawn as a
debug capsule, an animated GLB, an isometric sprite, or nothing at all because it is
three levels underground and off-screen. Every other decision below is downstream of
this rule.

## 2. Layers

```
┌────────────────────────────────────────────────────────────┐
│ EDITOR UI        panels, viewport chrome, tools            │  imports ↓
├────────────────────────────────────────────────────────────┤
│ RENDER           Three.js mirror of project/sim state      │  imports ↓
├────────────────────────────────────────────────────────────┤
│ PROJECT          document model, commands, undo, schema    │  imports ↓
│                  versioning + migrations, persistence      │
├────────────────────────────────────────────────────────────┤
│ SIM              entities, components, systems, fixed tick,│  imports NOTHING above;
│                  seeded RNG — runs in Node, Workers, tests │  no DOM, no Three
└────────────────────────────────────────────────────────────┘
```

Import direction is law: `sim` has zero dependencies on Three, the DOM, or the editor.
`vitest` runs the entire simulation headlessly in Node; the same code runs in a Web
Worker later without modification.

Directory layout (first slice):

```
mazpon/
  src/sim/        rng.ts, world.ts, systems/, loop.ts
  src/project/    schema.ts, doc.ts, commands.ts, store.ts, migrate.ts, persist.ts
  src/render/     viewport.ts (Three scene mirror, selection, gizmos)
  src/editor/     main.ts, panels/ (hierarchy, inspector, toolbar, statusbar)
  tests/          determinism, serialization, commands/undo, migration
```

## 3. Entity / component / data model

No inheritance trees. An **entity** is a stable string ID plus a bag of typed component
records — plain JSON data, closed under structured clone:

```ts
type EntityId = string;                  // "e7" — stable for the entity's lifetime
interface EntityRecord {
  id: EntityId;
  name: string;
  parent: EntityId | null;               // hierarchy for editing/transforms
  components: Partial<ComponentMap>;     // only what this entity actually has
}
```

Component schemas in the slice: `transform`, `renderable` (shape/color/visible — a
*description* of how to draw, not a mesh), `actor`, `species`, `faction`, `needs`.
Reserved names in the schema for the roadmap: `collider`, `rigidbody`, `animator`,
`health`, `body`, `skills`, `inventory`, `equipment`, `jobs`, `ai`, `relationships`,
`navigation`, `interaction`, `zone`.

A door and a goblin share only the components they actually need. Game content —
species definitions, room types, recipes, factions — will live as **definition assets**
(data documents referenced by ID from components), so adding a species never edits
engine code (Deepholm's goblin test, mapping table row 4).

## 4. Project document and persistence

The unit of persistence is a **document**, never a live object graph:

```ts
interface ProjectDoc {
  schemaVersion: number;        // migration chain runs any older doc forward
  name: string;
  seed: string;                 // simulation seed, visible in the editor status bar
  nextEntityOrdinal: number;    // stable-ID allocator state
  entities: Record<EntityId, EntityRecord>;
  rootOrder: EntityId[];        // sibling ordering at the root
}
```

- All references between records are **IDs** ("a serialised job holds a number, not a
  pointer" — Deepholm).
- `migrateProject(doc)` walks version-by-version migration steps; loading a v1 document
  in a v3 engine is a supported, tested path. Saves (simulation snapshots) follow the
  same discipline separately from projects.
- Slice persistence: localStorage autosave slot + JSON file export/import. Roadmap:
  IndexedDB project store, asset database, optional cloud sync.

## 5. Commands: the single write path

**Nothing mutates a project except a command.** Human UI, future visual scripting,
future TypeScript API, and future AI authoring all emit the same serializable command
objects into one bus:

```ts
type Command =
  | { kind: "createEntity"; entity: EntityRecord; index?: number }
  | { kind: "deleteEntity"; id: EntityId }
  | { kind: "renameEntity"; id: EntityId; name: string }
  | { kind: "setComponent"; id: EntityId; component: string; value: unknown }
  | { kind: "removeComponent"; id: EntityId; component: string }
  | { kind: "setParent"; id: EntityId; parent: EntityId | null; index?: number }
  | { kind: "setProjectMeta"; patch: { name?: string; seed?: string } };
```

The store applies a command, records its **inverse** for undo, bumps a revision counter,
and notifies subscribers. Because commands are data:

- undo/redo is structural (inverse replay), not per-feature;
- AI edits are *inspectable, undoable, diffable, serializable* by construction — an AI
  prompt session is just a labeled batch of commands, reviewable before/after apply;
- collaboration and macro-recording become transport problems, not architecture problems.

This is nunuStudio's `history/action` idea, re-founded on a document model.

## 6. Simulation runtime

- **Fixed tick.** `SimWorld.step()` advances exactly one tick. The browser loop uses an
  accumulator (render FPS never changes outcomes); headless tests call `step()` in a
  loop. Pause = don't call step. Speed = call it more often.
- **Seeded RNG.** `Rng` (mulberry32) is owned by the world and passed to systems.
  `Math.random` is forbidden in `src/sim/` (enforced by a test that greps the source).
  RNG state serializes with the snapshot. Named sub-streams are the planned fix for
  Deepholm's "new species shifted every die roll" coupling.
- **Systems** are pure-ish functions `(world) => void` run in a fixed registered order
  each tick. The slice ships `needsSystem` (hunger decay) and `wanderSystem`
  (seeded random walk — exists to make determinism *visible* in the viewport).
- **Edit vs Play.** Entering Play instantiates a `SimWorld` **from the project document**
  (deep-copied); the document is never touched during Play. Leaving Play discards the
  sim world — the editor state is exactly as you left it. (Later: "keep changes" merges
  become explicit commands, and long-running saves serialize the sim snapshot.)
- **Determinism contract**: same project + same seed ⇒ identical state hash at every
  tick. This is a CI test, not a hope.

## 7. Renderer

`src/render/` maintains a Three.js scene as a **mirror**: each tick/edit bumps a
revision; the mirror reconciles renderable entities → meshes (create/update/dispose by
entity ID). Selection is raycast → entity ID; gizmos are Three's `TransformControls`
whose drag-end commits a single undoable `setComponent("transform")` command.

Consequences of the mirror pattern:

- swapping capsule → GLB model → sprite is a change to the `renderable` component and
  the mirror's factory, never to simulation code;
- instancing/batching for actor crowds is a mirror optimization, invisible to the sim;
- WebGPU adoption is a renderer concern (Three's WebGPURenderer) with zero sim impact;
- a render error cannot corrupt simulation state (Deepholm's `fail()` lesson).

## 8. Editor UI

Framework-light TypeScript DOM panels subscribing to store revisions (re-render on
change, Deepholm's signature-diff lesson). Panels in the slice: Hierarchy, Inspector,
Viewport toolbar (add primitive/actor, gizmo modes, Play/Edit, save/load/export/import,
undo/redo), status bar (mode, tick, **seed**, selection). The store/command API is
deliberately UI-framework-agnostic so React/Solid can be adopted per-panel when panel
complexity earns it (see ADR-001) — the editor never becomes the owner of game state
either way.

## 9. Simulation debugger (flagship feature, staged)

Slice: seed + tick in the status bar; selecting an actor during Play shows its live
needs in the Inspector.
Next stages (roadmap phases 3–5): pause/step-one-tick controls, per-actor decision log
(chosen job, scored candidates, **rejected candidates with reasons**), path display,
deterministic replay from (project, seed, command log).

## 10. AI authoring layer (future, but shaped now)

AI sits **on top of the editor**: prompts compile to command batches against the same
store humans use — visible in the Inspector, undoable as a unit, diffable as data.
No AI regeneration of opaque source. The command vocabulary *is* the AI tool API; each
roadmap phase that adds a command adds an AI capability for free.

## 11. Asset pipeline (future, but shaped now)

Priority order: GLB/GLTF, textures, materials, audio, animations, prefabs. Assets get
stable IDs in an asset database; `renderable` components reference asset IDs. Generators
(text→image→3D→rig→animation, 3D→spritesheet) plug in as **providers** that emit normal
editable assets into the same database — generation is an import path, not a special
world.

## 12. Zones/rooms (future, but shaped now)

A generic zone system: typed connected tile/volume sets with owner, capacity,
workstations, occupants, effects, requirements. Room *types* (Lair, Treasury, Prison,
Hospital…) are definition assets, never engine classes. See mapping table row 12.

## 13. Performance posture

Deliberate order of operations: correctness → determinism → then scale. The seams that
make scale reachable without rework: sim runs off-DOM (worker-ready), renderer mirrors
by ID (instancing-ready), entities are plain records (fidelity tiers / off-screen
simulation are a scheduling policy, not a data-model change), spatial indices are
dirty-flag rebuilt (Deepholm rows 13). No MMO infrastructure until a game needs it.
