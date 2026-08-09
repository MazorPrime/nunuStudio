/**
 * Hierarchy panel — the entity tree. Renders from whatever entity map the editor is
 * currently showing (project doc in Edit, sim world in Play) and reports selection.
 */

import type { EntityId, EntityRecord } from "../../sim/components.js";

const SHAPE_GLYPH: Record<string, string> = {
	box: "▣", sphere: "●", capsule: "◍", cylinder: "◎", plane: "▭"
};

export interface HierarchyPanel {
	el: HTMLElement;
	refresh(
		entities: Record<EntityId, EntityRecord>,
		rootOrder: EntityId[],
		selected: EntityId | null
	): void;
}

export function createHierarchyPanel(onSelect: (id: EntityId | null) => void): HierarchyPanel {
	const el = document.createElement("div");
	el.className = "panel";
	el.id = "hierarchy";

	const title = document.createElement("h2");
	title.textContent = "Hierarchy";
	const list = document.createElement("div");
	el.append(title, list);

	function refresh(
		entities: Record<EntityId, EntityRecord>,
		rootOrder: EntityId[],
		selected: EntityId | null
	): void {
		list.textContent = "";
		const roots = rootOrder.filter((id) => entities[id]);
		if (roots.length === 0) {
			const empty = document.createElement("div");
			empty.className = "tree-empty";
			empty.textContent = "No entities. Add one from the toolbar.";
			list.appendChild(empty);
			return;
		}
		const renderItem = (id: EntityId, depth: number): void => {
			const record = entities[id];
			if (!record) return;
			const item = document.createElement("div");
			item.className = "tree-item" + (id === selected ? " sel" : "");
			item.style.paddingLeft = 6 + depth * 14 + "px";
			item.dataset.id = id;

			const glyph = document.createElement("span");
			glyph.className = "glyph";
			glyph.textContent = record.components.actor
				? "☉"
				: SHAPE_GLYPH[record.components.renderable?.shape ?? ""] ?? "·";
			const name = document.createElement("span");
			name.textContent = record.name;
			item.append(glyph, name);

			if (record.components.actor) {
				const dot = document.createElement("span");
				dot.className = "actor-dot";
				dot.textContent = "actor";
				item.appendChild(dot);
			}
			item.addEventListener("click", () => onSelect(id));
			list.appendChild(item);

			const children = Object.keys(entities)
				.filter((childId) => entities[childId]?.parent === id)
				.sort();
			for (const childId of children) renderItem(childId, depth + 1);
		};
		for (const id of roots) renderItem(id, 0);
	}

	return { el, refresh };
}
