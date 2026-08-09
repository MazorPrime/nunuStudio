# nunuStudio Audit

Audit of the nunuStudio codebase (v0.98.47, ~405 JS files under `source/`) performed to
decide the foundation for Mazpon Studio. See `ADR-001-FOUNDATION.md` for the decision this
audit feeds.

## Summary verdict

nunuStudio is a genuinely impressive one-developer achievement and a rich catalogue of
*proven editor concepts*, but its architecture is structurally incompatible with Mazpon
Studio's core requirement — a renderer-independent, headless-capable, deterministic
simulation runtime — and its technology base (ES5 by policy, Three.js 0.119 pinned with
monkey-patches, zero tests) makes modernization more expensive than rebuilding.

**Use it as a reference implementation and concept catalogue. Do not fork it. Do not
import its code.**

## Findings by area

### Language and code style
- `CODESTYLE.md` explicitly mandates **ECMAScript 5** style: prototype-based classes,
  `Function.call(this)` constructor inheritance, no TypeScript, no classes.
- No static types anywhere. For a data-driven engine whose main artifact is structured
  project data, the absence of types is a continuous tax on correctness.

### Scene graph and object model
- Every engine object (`Program`, `Scene`, `Script`, meshes, lights, physics objects)
  **extends `THREE.Object3D`**. The Three.js scene graph *is* the data model.
- `source/core/three/` monkey-patches Three.js prototypes directly
  (`THREE.Object3D.prototype.folded`, `.locked`, custom `BufferAttribute` patches, etc.).
- Consequence: the renderer **owns** the state. An entity cannot exist without a rendered
  object. This is the single largest conflict with Mazpon's requirement that a creature can
  exist as a debug capsule, a sprite, or an off-screen simulated actor without changing its
  logic.

### Runtime/editor separation
- Better than nothing: there is a `core/` (runtime) vs `editor/` split, and an exported
  app runs from the runtime bundle alone.
- But the runtime is the renderer. There is no headless mode; `Program.update()` is driven
  by the render loop. Deterministic fixed-tick simulation independent of render FPS does
  not exist and cannot be added without restructuring the object model.

### Serialization / project format
- Serialization is Three's `toJSON()`/`ObjectLoader` pattern applied to the **live object
  graph**, extended per class. Loading `eval`-constructs the same graph.
- There is no schema version on the project document, no migration mechanism, and
  references are by array index / UUID inside a Three-shaped JSON tree.
- Mazpon's brief explicitly requires the opposite: stable IDs, structured data references,
  versioned schemas with migrations (the Deepholm philosophy).

### Scripting
- `Script` **extends `Group`** (a renderable node!) and holds a JavaScript source string
  that is evaluated at runtime with `scene`, `program`, `self` in scope.
- Game logic is therefore opaque code, invisible to tooling — the precise "important game
  exists only as opaque source code" failure mode the Mazpon brief forbids. There is no
  component/data model for behavior.

### Physics
- cannon-es 0.9.1 (2020). Functional but no longer the strongest web physics option;
  Rapier (Rust→WASM) is faster, actively maintained, and deterministic-friendly.

### Asset pipeline
- Broad import support (GLTF/FBX/OBJ/Collada/many more) via Three loaders of that era,
  plus resources (Image, Video, Audio, Font, TextFile) managed by a `ResourceManager`
  that is — again — part of the Object3D-derived `Program`.
- Assets serialize embedded into the project JSON (base64), which is simple but does not
  scale and has no notion of an asset database with stable IDs.

### Editor UI architecture
- A complete bespoke DOM component framework (`editor/components/`: ~30 widget classes)
  with manual layout (`updateInterface()` calls, absolute positioning).
- No virtual DOM, no data binding; panels poll or are manually refreshed.
- **Worth mining**: the tab system (`gui/tab/`: scene-editor, inspector, asset browser,
  console, code editor, particle editor, material editor, profiling), the undo/redo
  **action system** (`editor/history/`: `Action`, `ChangeAction`, `AddAction`,
  `RemoveAction`, `ActionBundle`) — conceptually exactly the command pattern Mazpon needs,
  though implemented against live objects instead of a document model.

### Dependency age (package.json)
- `three` **0.119.0** (July 2020; current Three is ~50+ releases ahead: Geometry removal,
  color-management overhaul, WebGPURenderer, node materials — all missed).
- Monkey-patching Three internals means a Three upgrade breaks the whole engine at once.
- webpack 5 + Babel build; `brython` (Python-in-browser!), `codemirror` 5, `tern` (dead),
  nw.js desktop packaging. Heavy, aged surface area.

### Tests
- **Zero test files** in the repository. No unit tests, no integration tests, no CI config.
  Every regression must be caught by hand in the editor. Nothing to preserve.

### Ability to support the systemic simulation architecture
- Needs/jobs/factions/rooms/hauling per Deepholm require: fixed ticks, seeded RNG,
  ID-referenced flat data, headless execution, save migration. nunuStudio provides none of
  these and its object model actively obstructs them (state lives in renderable nodes,
  randomness is uncontrolled, references are live pointers).

## What Mazpon should take from nunuStudio

| Concept | Where in nunuStudio | How Mazpon uses it |
|---|---|---|
| Undo/redo as explicit action objects | `editor/history/action/*` | Reborn as serializable **commands** on the project document (also the AI/scripting API) |
| Tabbed dockable editor shell | `editor/gui/tab/*` | Same panel taxonomy (viewport, hierarchy, inspector, assets, console) on a modern UI layer |
| Breadth checklist of object types | `core/objects/*` (lights, cameras, particles, audio, text, sprites) | Component taxonomy roadmap |
| Editor/runtime bundle split | `webpack.runtime.js` vs `webpack.prod.js` | Package split: `@mazpon/sim` + `@mazpon/render` usable without the editor |
| Locale system, keyboard/mouse input abstraction | `editor/locale/`, `core/input/` | Pattern reference |

## What Mazpon must not inherit

- Renderer-owned state (Object3D inheritance as the data model)
- Live-object-graph serialization without schema versions
- Code-string scripting as the only behavior model
- Pinned + patched Three.js
- ES5-by-policy and the bespoke untyped UI framework
- The zero-test culture
