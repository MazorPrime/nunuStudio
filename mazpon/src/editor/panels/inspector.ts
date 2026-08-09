/**
 * Inspector panel — shows the selected entity's components.
 *
 * In Edit mode fields are editable; every change is dispatched as a single
 * setComponent command (so it lands in undo history like any other edit).
 * In Play mode the same panel renders the *live simulation* values read-only —
 * watching a Delver's hunger tick down is the slice's simulation-debugger seed.
 */

import type {
	ComponentName,
	EntityRecord,
	NeedsComponent,
	RenderableComponent,
	TransformComponent,
	Vec3
} from "../../sim/components.js";

export interface InspectorCallbacks {
	onSetComponent: (id: string, component: ComponentName, value: unknown) => void;
	onRename: (id: string, name: string) => void;
}

export interface InspectorPanel {
	el: HTMLElement;
	refresh(record: EntityRecord | null, editable: boolean): void;
}

export function createInspectorPanel(callbacks: InspectorCallbacks): InspectorPanel {
	const el = document.createElement("div");
	el.className = "panel";
	el.id = "inspector";

	const title = document.createElement("h2");
	title.textContent = "Inspector";
	const body = document.createElement("div");
	el.append(title, body);

	function refresh(record: EntityRecord | null, editable: boolean): void {
		body.textContent = "";
		if (!record) {
			const empty = document.createElement("div");
			empty.className = "inspector-empty";
			empty.textContent = "Nothing selected. Click an entity in the viewport or hierarchy.";
			body.appendChild(empty);
			return;
		}

		const name = document.createElement("input");
		name.type = "text";
		name.className = "inspector-name";
		name.value = record.name;
		name.disabled = !editable;
		name.addEventListener("change", () => callbacks.onRename(record.id, name.value));
		const idLine = document.createElement("div");
		idLine.className = "inspector-id";
		idLine.textContent = `id ${record.id}`;
		body.append(name, idLine);

		const c = record.components;
		if (c.transform) body.appendChild(transformSection(record.id, c.transform, editable));
		if (c.renderable) body.appendChild(renderableSection(record.id, c.renderable, editable));
		if (c.actor) {
			body.appendChild(
				section("Actor", [checkboxField("active", c.actor.active, editable, (value) =>
					callbacks.onSetComponent(record.id, "actor", { active: value })
				)])
			);
		}
		if (c.species) body.appendChild(section("Species", [readonlyField("id", c.species.id), readonlyField("label", c.species.label)]));
		if (c.faction) body.appendChild(section("Faction", [readonlyField("id", c.faction.id), readonlyField("label", c.faction.label)]));
		if (c.needs) body.appendChild(needsSection(record.id, c.needs, editable));
	}

	function transformSection(id: string, transform: TransformComponent, editable: boolean): HTMLElement {
		const commit = (patch: Partial<TransformComponent>) =>
			callbacks.onSetComponent(id, "transform", { ...structuredClone(transform), ...patch });
		return section("Transform", [
			vec3Field("position", transform.position, editable, (v) => commit({ position: v })),
			vec3Field("rotation", transform.rotation, editable, (v) => commit({ rotation: v })),
			vec3Field("scale", transform.scale, editable, (v) => commit({ scale: v }))
		]);
	}

	function renderableSection(id: string, renderable: RenderableComponent, editable: boolean): HTMLElement {
		const commit = (patch: Partial<RenderableComponent>) =>
			callbacks.onSetComponent(id, "renderable", { ...structuredClone(renderable), ...patch });

		const shapeRow = fieldRow("shape");
		const select = document.createElement("select");
		for (const shape of ["box", "sphere", "capsule", "cylinder", "plane"]) {
			const option = document.createElement("option");
			option.value = shape;
			option.textContent = shape;
			option.selected = shape === renderable.shape;
			select.appendChild(option);
		}
		select.disabled = !editable;
		select.addEventListener("change", () =>
			commit({ shape: select.value as RenderableComponent["shape"] })
		);
		shapeRow.appendChild(select);

		const colorRow = fieldRow("color");
		const color = document.createElement("input");
		color.type = "color";
		color.value = renderable.color;
		color.disabled = !editable;
		color.addEventListener("change", () => commit({ color: color.value }));
		colorRow.appendChild(color);

		return section("Renderable", [
			shapeRow,
			colorRow,
			checkboxField("visible", renderable.visible, editable, (value) => commit({ visible: value }))
		]);
	}

	function needsSection(id: string, needs: NeedsComponent, editable: boolean): HTMLElement {
		const rows: HTMLElement[] = [];
		for (const key of Object.keys(needs.entries).sort()) {
			const need = needs.entries[key];
			if (!need) continue;
			const row = document.createElement("div");
			row.className = "need-row";
			const label = document.createElement("span");
			label.textContent = key;
			const bar = document.createElement("div");
			bar.className = "bar";
			const fill = document.createElement("i");
			const frac = (need.value - need.min) / (need.max - need.min || 1);
			fill.style.width = Math.round(frac * 100) + "%";
			fill.style.background = frac < 0.25 ? "var(--rust)" : frac < 0.5 ? "var(--amber)" : "var(--sage)";
			bar.appendChild(fill);
			const value = document.createElement("b");
			value.textContent = need.value.toFixed(1);
			row.append(label, bar, value);
			rows.push(row);

			const decayRow = fieldRow("decay/tick");
			const input = document.createElement("input");
			input.type = "number";
			input.step = "0.01";
			input.value = String(need.decayPerTick);
			input.disabled = !editable;
			input.addEventListener("change", () => {
				const next = structuredClone(needs);
				const entry = next.entries[key];
				if (entry) entry.decayPerTick = Number(input.value) || 0;
				callbacks.onSetComponent(id, "needs", next);
			});
			decayRow.appendChild(input);
			rows.push(decayRow);
		}
		return section("Needs", rows);
	}

	function section(name: string, rows: HTMLElement[]): HTMLElement {
		const box = document.createElement("div");
		box.className = "comp";
		const head = document.createElement("div");
		head.className = "comp-head";
		head.textContent = name;
		const rowsBox = document.createElement("div");
		rowsBox.className = "rows";
		rowsBox.append(...rows);
		box.append(head, rowsBox);
		return box;
	}

	function fieldRow(labelText: string): HTMLElement {
		const row = document.createElement("div");
		row.className = "field";
		const label = document.createElement("label");
		label.textContent = labelText;
		row.appendChild(label);
		return row;
	}

	function vec3Field(labelText: string, value: Vec3, editable: boolean, onChange: (v: Vec3) => void): HTMLElement {
		const row = fieldRow(labelText);
		const wrap = document.createElement("div");
		wrap.className = "vec";
		const inputs = value.map((component, i) => {
			const input = document.createElement("input");
			input.type = "number";
			input.step = "0.1";
			input.value = String(Number(component.toFixed(3)));
			input.disabled = !editable;
			input.addEventListener("change", () => {
				const next: Vec3 = [
					Number(inputs[0]!.value) || 0,
					Number(inputs[1]!.value) || 0,
					Number(inputs[2]!.value) || 0
				];
				onChange(next);
			});
			void i;
			return input;
		});
		wrap.append(...inputs);
		row.appendChild(wrap);
		return row;
	}

	function checkboxField(labelText: string, value: boolean, editable: boolean, onChange: (v: boolean) => void): HTMLElement {
		const row = fieldRow(labelText);
		const input = document.createElement("input");
		input.type = "checkbox";
		input.checked = value;
		input.disabled = !editable;
		input.addEventListener("change", () => onChange(input.checked));
		row.appendChild(input);
		return row;
	}

	function readonlyField(labelText: string, value: string): HTMLElement {
		const row = fieldRow(labelText);
		const span = document.createElement("span");
		span.textContent = value;
		row.appendChild(span);
		return row;
	}

	return { el, refresh };
}
