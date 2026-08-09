# Mazpon Studio — Roadmap

Phases are ordered so each is independently testable and shippable; every phase ends
with headless tests green plus a scripted editor smoke check. Scope discipline: no AI
generators, multiplayer, marketplace, or full terrain tools until the bones exist.

## Phase 0 — Foundation decision & docs ✅ (this run)
Audit nunuStudio, extract Deepholm lessons, ADR-001, architecture + roadmap docs.

## Phase 1 — First vertical slice ✅ (this run)
**Goal:** the architecture demonstrated end-to-end, not faked.

Editor opens → 3D viewport (grid, lights, orbit camera) → create primitives and a
"Delver" actor (capsule with `transform/renderable/actor/species/faction/needs`) →
select in viewport or hierarchy → transform via gizmos or inspector → components
visible/editable in Inspector → save/reload (localStorage + JSON file, schemaVersion +
migration chain) → undo/redo (command inverses) → Play mode runs deterministic
fixed-tick sim (hunger decays, seeded wander) → Edit mode restores the document
untouched. Seed and tick visible in the status bar.

**Tests:** determinism across seeds (state-hash equality), serialization round-trip,
migration, command undo/redo, edit-mode-does-not-tick, no-Math.random-in-sim.

## Phase 2 — Editor depth
Multi-select, duplicate, grouping, snapping, world/local gizmo toggle, camera bookmarks,
prefab-as-subtree (create/instantiate/apply), asset browser panel backed by an asset
database (stable asset IDs), GLB/GLTF + texture import, materials on `renderable`,
console panel with sim log. **Test:** prefab round-trip; asset reference integrity on
save/load; import smoke tests.

## Phase 3 — Simulation kernel
Definition assets (`defs/`: species, items, recipes, factions as data documents),
job system (providers → scored candidates → reservations → execution), needs with
thresholds/consequences, skills, items + hauling + stockpiles, grid spatial index +
pathfinding with dirty-region invalidation, named RNG sub-streams, time controls
(pause/step/speed). **Test:** multi-seed batch runner ("did anyone starve? deadlock?
unreachable jobs?"), job-scoring unit tests, path invalidation tests.

## Phase 4 — Systemic depth (the Deepholm set)
Body plans/injuries/capabilities, combat with downed states, capture/containment,
conversion/allegiance change, zones/rooms (typed regions, capacity, effects; room types
as defs), environment fields (light), research/bills, event director (rift-style
recruitment, raids). **Acceptance test (from DEEPHOLM_SYSTEM_MAPPING.md):** add a second
species purely as data; it works, fights, is captured and converted — engine untouched.

## Phase 5 — Simulation debugger (flagship)
Per-actor decision log with rejected-jobs-and-reasons, live need/skill/faction/relations
panels, path visualization, step-one-tick, deterministic replay from (project, seed,
command log), divergence detection between two runs. **Test:** replay reproduces
identical hashes; debugger output snapshot tests.

## Phase 6 — Behavior authoring
Command API exposed as a typed scripting surface; TypeScript user scripts sandboxed in
a worker against the sim API; visual behavior graph compiling to the same event/command
model; trigger volumes. **Test:** script + graph authoring produce identical command
streams for the same behavior.

## Phase 7 — AI authoring layer
Prompt → command-batch compiler over the same store (inspectable, undoable, diffable);
AI-visible schema catalogue derived from component/def schemas. **Test:** golden
prompt→commands fixtures; every AI batch is undoable to a byte-identical document.

## Phase 8 — Runtime & export
Standalone runtime package (sim+render, no editor), project export to hosted web build,
sim in a Web Worker, instanced crowd rendering, off-screen fidelity tiers.
**Test:** exported build boots headless CI + Playwright; 1,000-actor benchmark scene.

## Phase 9 — Templates & content
Project templates: Blank, First/Third person, Top-Down RPG, and the flagship
**Systemic Dungeon/Colony** template — Deepholm rebuilt as pure project data on Phases
3–5 systems, in 3D. Physics (Rapier adapter), terrain/voxel-friendly world tools, audio,
particles as they become template-driven needs.

## Deferred deliberately
AI image/3D generation providers, collaboration/multiplayer, cloud backend, asset
marketplace, complex combat animation. The asset-provider and command-transport seams
they need already exist from Phases 2/5/7.
