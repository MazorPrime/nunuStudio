# Deepholm → Mazpon System Mapping

Deepholm v15 (`deepholm-v15.html`, ~2,400 lines) is the conceptual proving ground for
Mazpon's systemic-simulation architecture. This document extracts each design lesson it
demonstrates and maps it to the *generic* engine primitive that will carry it — so that
Deepholm can eventually be rebuilt as a Mazpon **project template** (data + behaviors)
with zero engine conditionals, and re-skinned from 2D canvas to full 3D without touching
its simulation logic.

Legend for "Slice": ✅ implemented in the first vertical slice, 🏗 architecture reserved
(schema/seam exists), 📋 roadmap.

| # | Deepholm mechanism (where) | Design lesson | Mazpon engine primitive | Slice |
|---|---|---|---|---|
| 1 | `mulberry32` + `hashSeed`; "Math.random() is banned below this line" | One seeded stream, injected — reproducibility is a *rule*, not a feature | `Rng` service owned by `SimWorld`; systems receive it, never import randomness. Named sub-streams later so unrelated systems don't perturb each other (the v14→v15 "rats consume RNG and shift the stream" lesson) | ✅ |
| 2 | `step()` driven by accumulator at `DEFS.tickMs`; speed 0/1/2/6/16× | Fixed tick decoupled from render FPS; pause & time-scale are trivial when the tick is the unit | `SimLoop` with accumulator; `step()` callable directly for headless runs; speed multiplier | ✅ (tick + pause; speeds 📋) |
| 3 | `actors[]` — ONE container; `faction` says whose side, `ai` says who drives; `pawns`/`rats` are cached views | Unify entities; species ≠ faction ≠ controller. Conversion = field change, not delete/recreate | Single entity store; `species`, `faction`, `ai` are separate components. Cached queries = component-index views | ✅ (entity store + components) |
| 4 | `SPECIES` table: body plan, work priorities, move/dig/melee multipliers, `tamesTo`, attraction requirements | Adding a species costs one data row, zero engine edits (the goblin test) | **Definition assets** (`defs/`): species/items/recipes are project data referenced by ID from components | 🏗 (component schemas are data; def-asset layer 📋) |
| 5 | `BODY_PLAN` / `RAT_PLAN`; `caps()` summing part shares; prosthetics slot into the sum | Capabilities derived from data-defined body parts; downstream systems read *capacities*, never count limbs | `body` component (plan-instantiated parts) + derived-stat pipeline | 📋 |
| 6 | `sever()`, persistent `gone` parts, prosthetic recipes | Injury is persistent state on the entity; conversion preserves scars | Part state lives in the `body` component and serializes with the entity | 📋 |
| 7 | Skills: xp, level curve, multipliers into every rate function | Flat skill data; derived multipliers | `skills` component + stat modifiers | 📋 |
| 8 | `pickJob()`: candidate jobs scored; emergencies on a fixed scale above work; priority `(5-p)*100 + tiebreak`; `-1` = species can't | Utility-scored job selection; player priorities as primary sort; absence-of-priority as capability gate | `jobs` system: job providers emit candidates, scorer ranks, debugger records *rejected candidates + reasons* | 🏗 (needs tick is the first "system"; job market 📋) |
| 9 | Claims: `digClaim`, `item.claim`, `rescuer`, `feeder`, `tamer` + `release(p)` | Reservation prevents N workers converging on one task; releases must be centralized | Generic reservation table keyed by (entity, target, kind) | 📋 |
| 10 | Needs: food/rest/morale decay per tick; consequences (walk-out) not just numbers | Needs are data with thresholds and *consequences* | `needs` component: named needs with decay/thresholds; consequence hooks | ✅ (decay on tick; thresholds 📋) |
| 11 | Hauling: physical items on tiles, stack merging, carry capacity from `manip`, gather-radius sweep | Resources are physical entities moved by actors, not abstract counters | `inventory`/`carry` components + item entities | 📋 |
| 12 | `roomTile` + `roomsOf(type)` flood-fill; lair tile = bed = population ceiling; pens with modes | Rooms are typed connected regions with capacity/effects — content, not classes | Generic **zone system**: typed tile/volume sets, owner, capacity, contained objects; room *types* are defs | 📋 |
| 13 | Region flood-fill + BFS pathing, dirty-flag rebuilds; depth field rides the same flag | Spatial indices rebuilt lazily on invalidation | `space` module: pluggable grid/navmesh providers with dirty-region invalidation | 📋 |
| 14 | Light propagation, `darkSens` per work type × species `darkVision` | Environmental fields multiply into capability, per-activity, per-species — all data | Environment field layers sampled by stat pipeline | 📋 |
| 15 | Downed ≠ dead; `cowed` timer; carry/rescue; capture to pen; tame → `convertToHold()` keeps body | Defeat states, physical capture, allegiance change as data mutation | State flags + faction reassignment; no entity recreation anywhere | 🏗 (stable IDs make this structural) |
| 16 | Rift + `attractCheck()`: recruitment gated on what the colony has built | World-event director reading colony state | Event director system reading queries | 📋 |
| 17 | Bills: player-queued crafting as data (`recipe, mode, target, paused`) | Production orders are documents, not imperative calls | Order/bill entities referencing recipe defs | 📋 |
| 18 | `saveState()`/`loadState()`: v:1 schema, ID references only ("a serialised job holds a number, not a pointer"), stepwise migration of old saves | Versioned saves; stable IDs; migrations as first-class code | Project + save documents with `schemaVersion` and a migration chain; **engine-level** | ✅ |
| 19 | RNG re-seeded `hashSeed(seed)+tick` on load — "continue, don't replay" | Save/restore of RNG position matters; document the choice | `Rng` state serializes with the sim snapshot | ✅ (rng state in snapshot) |
| 20 | 13-test regression sweep; goblin-as-data test; v14 vs v15 endpoint comparison | Headless scenario tests over seeds are how systemic games stay shippable | Vitest headless suite from day one; multi-seed batch runner | ✅ (determinism suite; batch runner 📋) |
| 21 | Log with tick-stamped, colored causes; Inspector showing caps/pain/light/dark-mult "here" | Debuggability = showing *derived* values and *why* | Simulation Debugger: per-actor decision log, job-rejection reasons, derived stats | 🏗 (seed/tick surfaced; decision log 📋) |
| 22 | Render reads state each frame; render error cannot kill the sim (`fail()` wrapper) | Renderer is a consumer; sim survives renderer failure | Renderer mirrors sim state via snapshot reads; sim runs even if the view throws | ✅ (mirror pattern) |
| 23 | UI panels rebuild only when a content signature changes; one delegated listener survives rebuilds | Don't let 60fps redraws eat input; diff on meaning, not on time | Editor panels subscribe to store revisions; re-render on change only | ✅ |

## The test Deepholm sets for the engine

Deepholm's own v15 milestone was: *"I added a goblin — new species, new body plan, new
faction — using only data, touching zero engine code."* Mazpon's equivalent acceptance
test, once defs land (Phase 4 of the roadmap): **add a second species to the Systemic
Colony template by editing only project data in the editor, and watch it eat, work,
fight, be captured, and convert — with the simulation debugger explaining every choice.**
