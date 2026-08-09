/**
 * Toolbar — entity creation, gizmo modes, undo/redo, persistence, Play/Edit.
 * Pure chrome: every action delegates to the editor controller.
 */

import type { GizmoMode } from "../../render/viewport.js";

export interface ToolbarCallbacks {
	onAddPrimitive: (shape: "box" | "sphere" | "cylinder" | "plane") => void;
	onAddDelver: () => void;
	onDeleteSelected: () => void;
	onGizmoMode: (mode: GizmoMode) => void;
	onUndo: () => void;
	onRedo: () => void;
	onSave: () => void;
	onLoad: () => void;
	onExport: () => void;
	onImport: () => void;
	onTogglePlay: () => void;
}

export interface ToolbarState {
	mode: "edit" | "play";
	gizmoMode: GizmoMode;
	canUndo: boolean;
	canRedo: boolean;
	hasSelection: boolean;
}

export interface ToolbarPanel {
	el: HTMLElement;
	refresh(state: ToolbarState): void;
}

export function createToolbar(callbacks: ToolbarCallbacks): ToolbarPanel {
	const el = document.createElement("div");
	el.className = "toolbar";

	const button = (label: string, onClick: () => void, id?: string): HTMLButtonElement => {
		const b = document.createElement("button");
		b.textContent = label;
		if (id) b.dataset.id = id;
		b.addEventListener("click", onClick);
		el.appendChild(b);
		return b;
	};
	const sep = (): void => {
		const s = document.createElement("div");
		s.className = "sep";
		el.appendChild(s);
	};

	const brand = document.createElement("b");
	brand.textContent = "MAZPON";
	brand.style.color = "var(--amber)";
	brand.style.letterSpacing = "0.14em";
	brand.style.marginRight = "6px";
	el.appendChild(brand);

	const addBox = button("+ Box", () => callbacks.onAddPrimitive("box"), "add-box");
	const addSphere = button("+ Sphere", () => callbacks.onAddPrimitive("sphere"), "add-sphere");
	const addDelver = button("+ Delver", () => callbacks.onAddDelver(), "add-delver");
	const del = button("Delete", () => callbacks.onDeleteSelected(), "delete");
	sep();
	const move = button("Move", () => callbacks.onGizmoMode("translate"), "gizmo-translate");
	const rotate = button("Rotate", () => callbacks.onGizmoMode("rotate"), "gizmo-rotate");
	const scale = button("Scale", () => callbacks.onGizmoMode("scale"), "gizmo-scale");
	sep();
	const undo = button("Undo", () => callbacks.onUndo(), "undo");
	const redo = button("Redo", () => callbacks.onRedo(), "redo");
	sep();
	const save = button("Save", () => callbacks.onSave(), "save");
	const load = button("Load", () => callbacks.onLoad(), "load");
	const exportBtn = button("Export", () => callbacks.onExport(), "export");
	const importBtn = button("Import", () => callbacks.onImport(), "import");

	const spacer = document.createElement("div");
	spacer.className = "spacer";
	el.appendChild(spacer);

	const play = button("▶ Play", () => callbacks.onTogglePlay(), "play");
	play.classList.add("play");

	function refresh(state: ToolbarState): void {
		const editing = state.mode === "edit";
		for (const b of [addBox, addSphere, addDelver, save, load, exportBtn, importBtn]) {
			b.disabled = !editing;
		}
		del.disabled = !editing || !state.hasSelection;
		undo.disabled = !editing || !state.canUndo;
		redo.disabled = !editing || !state.canRedo;
		move.classList.toggle("on", state.gizmoMode === "translate");
		rotate.classList.toggle("on", state.gizmoMode === "rotate");
		scale.classList.toggle("on", state.gizmoMode === "scale");
		play.textContent = editing ? "▶ Play" : "■ Stop";
		play.classList.toggle("on", !editing);
	}

	return { el, refresh };
}
