/**
 * Editor controller — wires store, viewport, panels, and the Edit/Play mode machine.
 *
 * Mode rules (the architecture's contract, not just UI behavior):
 *  - Edit: the project document is authoritative; the sim does not exist; nothing ticks.
 *  - Play: a SimWorld is built from a deep copy of the document and stepped on a fixed
 *    accumulator; the document is never touched. Stop discards the sim — the editor
 *    state is exactly as you left it.
 */

import type { ComponentName, EntityId, EntityRecord, RenderShape } from "../sim/components.js";
import { SimWorld } from "../sim/world.js";
import { SimLoop } from "../sim/loop.js";
import { needsSystem } from "../sim/systems/needs.js";
import { wanderSystem } from "../sim/systems/wander.js";
import { ProjectStore } from "../project/store.js";
import {
	SCHEMA_VERSION,
	allocateEntityId,
	buildDelverRecord,
	buildPrimitiveRecord
} from "../project/schema.js";
import {
	exportToFile,
	importFromFile,
	loadFromLocalStorage,
	saveToLocalStorage
} from "../project/persist.js";
import { Viewport, type GizmoMode } from "../render/viewport.js";
import { createHierarchyPanel } from "./panels/hierarchy.js";
import { createInspectorPanel } from "./panels/inspector.js";
import { createToolbar } from "./panels/toolbar.js";
import { createStatusBar } from "./panels/statusbar.js";

const app = document.getElementById("app");
if (!app) throw new Error("#app missing");

const store = new ProjectStore(safeLoadAutosave() ?? undefined);
let mode: "edit" | "play" = "edit";
let selection: EntityId | null = null;
let gizmoMode: GizmoMode = "translate";
let sim: SimWorld | null = null;
let loop: SimLoop | null = null;

function safeLoadAutosave() {
	try {
		return loadFromLocalStorage();
	} catch (err) {
		console.warn("Autosave could not be loaded; starting fresh.", err);
		return null;
	}
}

/** The entity map currently being shown: live sim in Play, document in Edit. */
function currentEntities(): Record<EntityId, EntityRecord> {
	return mode === "play" && sim ? sim.entities : store.getDoc().entities;
}

function currentRootOrder(): EntityId[] {
	// Sim entities keep the same IDs, so the document's ordering applies in both modes.
	return store.getDoc().rootOrder;
}

// ── panels ────────────────────────────────────────────────────────────────
const toolbar = createToolbar({
	onAddPrimitive: addPrimitive,
	onAddDelver: addDelver,
	onDeleteSelected: deleteSelected,
	onGizmoMode: (m) => {
		gizmoMode = m;
		viewport.setGizmoMode(m);
		refresh();
	},
	onUndo: () => store.undo(),
	onRedo: () => store.redo(),
	onSave: () => saveToLocalStorage(store.getDoc()),
	onLoad: () => {
		const doc = safeLoadAutosave();
		if (doc) {
			selection = null;
			store.replaceDoc(doc);
		}
	},
	onExport: () => exportToFile(store.getDoc()),
	onImport: () => {
		importFromFile()
			.then((doc) => {
				if (doc) {
					selection = null;
					store.replaceDoc(doc);
				}
			})
			.catch((err) => console.error("Import failed:", err));
	},
	onTogglePlay: togglePlay
});

const hierarchy = createHierarchyPanel((id) => {
	selection = id;
	refresh();
});

const inspector = createInspectorPanel({
	onSetComponent: (id, component, value) => {
		if (mode !== "edit") return;
		store.dispatch({ kind: "setComponent", id, component, value }, `edit ${component}`);
	},
	onRename: (id, name) => {
		if (mode !== "edit") return;
		store.dispatch({ kind: "renameEntity", id, name }, "rename");
	}
});

const statusbar = createStatusBar((seed) => {
	if (mode !== "edit") return;
	store.dispatch({ kind: "setProjectMeta", patch: { seed } }, "set seed");
});

const viewportWrap = document.createElement("div");
viewportWrap.id = "viewport-wrap";
app.append(toolbar.el, hierarchy.el, viewportWrap, inspector.el, statusbar.el);

const viewport = new Viewport(viewportWrap, {
	onSelect: (id) => {
		selection = id;
		refresh();
	},
	onTransformCommit: (id, transform) => {
		if (mode !== "edit") return;
		store.dispatch(
			{ kind: "setComponent", id, component: "transform", value: transform },
			"gizmo transform"
		);
	}
});
viewport.setGizmoMode(gizmoMode);

// ── actions ───────────────────────────────────────────────────────────────
function addPrimitive(shape: RenderShape & ("box" | "sphere" | "cylinder" | "plane")): void {
	if (mode !== "edit") return;
	const doc = store.getDoc();
	const id = allocateEntityId(doc);
	const total = Object.keys(doc.entities).length;
	const sameShape = Object.values(doc.entities).filter(
		(e) => e.components.renderable?.shape === shape
	).length;
	const record = buildPrimitiveRecord(id, shape, `${cap(shape)} ${sameShape + 1}`);
	record.components.transform!.position = spawnSpot(total);
	store.dispatch({ kind: "createEntity", entity: record }, `create ${shape}`);
	selection = id;
	refresh();
}

function addDelver(): void {
	if (mode !== "edit") return;
	const doc = store.getDoc();
	const id = allocateEntityId(doc);
	const record = buildDelverRecord(id);
	const delvers = Object.values(doc.entities).filter((e) => e.components.actor).length;
	if (delvers > 0) record.name = `Delver ${delvers + 1}`;
	record.components.transform!.position = [spawnSpot(delvers)[0], 0.8, 2];
	store.dispatch({ kind: "createEntity", entity: record }, "create delver");
	selection = id;
	refresh();
}

function spawnSpot(count: number): [number, number, number] {
	return [((count % 5) - 2) * 2, 0.5, Math.floor(count / 5) * 2 - 2];
}

function deleteSelected(): void {
	if (mode !== "edit" || selection === null) return;
	const id = selection;
	selection = null;
	store.dispatch({ kind: "deleteEntity", id }, "delete entity");
}

function togglePlay(): void {
	if (mode === "edit") {
		const doc = store.getDoc();
		sim = new SimWorld(doc.entities, doc.seed);
		sim.addSystem(needsSystem);
		sim.addSystem(wanderSystem);
		loop = new SimLoop(sim);
		mode = "play";
		viewport.setEditable(false);
	} else {
		sim = null;
		loop = null;
		mode = "edit";
		viewport.setEditable(true);
	}
	refresh();
}

function cap(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── refresh: panels re-render only when meaning changes ──────────────────
function refresh(): void {
	const doc = store.getDoc();
	const entities = currentEntities();
	hierarchy.refresh(entities, currentRootOrder(), selection);
	const selectedRecord = selection !== null ? entities[selection] ?? null : null;
	inspector.refresh(selectedRecord, mode === "edit");
	toolbar.refresh({
		mode,
		gizmoMode,
		canUndo: store.canUndo(),
		canRedo: store.canRedo(),
		hasSelection: selection !== null
	});
	statusbar.refresh({
		mode,
		tick: sim?.tick ?? 0,
		seed: doc.seed,
		selection: selectedRecord ? selectedRecord.name : null,
		schemaVersion: SCHEMA_VERSION
	});
	viewport.sync(entities, selection);
}

store.subscribe(refresh);

window.addEventListener("keydown", (event) => {
	const inField = event.target instanceof HTMLElement &&
		(event.target.tagName === "INPUT" || event.target.tagName === "SELECT");
	if (inField) return;
	if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
		event.preventDefault();
		if (event.shiftKey) store.redo();
		else store.undo();
	} else if (event.key === "Delete" || event.key === "Backspace") {
		deleteSelected();
	} else if (event.key === "Escape") {
		selection = null;
		refresh();
	} else if (event.key === "1") toolbar.el.querySelector<HTMLButtonElement>("[data-id=gizmo-translate]")?.click();
	else if (event.key === "2") toolbar.el.querySelector<HTMLButtonElement>("[data-id=gizmo-rotate]")?.click();
	else if (event.key === "3") toolbar.el.querySelector<HTMLButtonElement>("[data-id=gizmo-scale]")?.click();
});

// ── frame loop: rendering never advances the simulation; SimLoop does ────
function frame(now: number): void {
	if (mode === "play" && sim && loop) {
		const stepped = loop.frame(now);
		if (stepped > 0) refresh();
	}
	viewport.renderFrame();
	requestAnimationFrame(frame);
}

refresh();
requestAnimationFrame(frame);

// Exposed for the smoke test only — not an API.
declare global {
	interface Window { __mazpon?: { store: ProjectStore; getSim: () => SimWorld | null } }
}
window.__mazpon = { store, getSim: () => sim };
