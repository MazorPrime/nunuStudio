/**
 * Commands + undo/redo. Because undo replays inverses recorded by applyCommand,
 * these tests are also the correctness proof for AI/scripted edits — they use the
 * same path.
 */

import { describe, expect, it } from "vitest";
import { ProjectStore } from "../src/project/store.js";
import { allocateEntityId, buildDelverRecord, buildPrimitiveRecord, createEmptyProject } from "../src/project/schema.js";

function snapshot(store: ProjectStore): string {
	return JSON.stringify(store.getDoc());
}

describe("command store", () => {
	it("create → undo → redo round-trips the document exactly", () => {
		const store = new ProjectStore(createEmptyProject());
		const empty = snapshot(store);

		const id = allocateEntityId(store.getDoc());
		store.dispatch({ kind: "createEntity", entity: buildPrimitiveRecord(id, "box", "Box 1") });
		const withBox = snapshot(store);
		expect(store.getDoc().entities[id]).toBeDefined();
		expect(store.getDoc().rootOrder).toEqual([id]);

		store.undo();
		// allocateEntityId bumped the ordinal before the command; compare structure sans allocator
		const undone = store.getDoc();
		expect(undone.entities).toEqual({});
		expect(undone.rootOrder).toEqual([]);
		expect(JSON.parse(empty).name).toEqual(undone.name);

		store.redo();
		expect(snapshot(store)).toEqual(withBox);
	});

	it("setComponent records inverse values; undo restores them", () => {
		const store = new ProjectStore(createEmptyProject());
		const id = allocateEntityId(store.getDoc());
		store.dispatch({ kind: "createEntity", entity: buildPrimitiveRecord(id, "sphere", "S") });

		const before = structuredClone(store.getDoc().entities[id]!.components.transform);
		store.dispatch({
			kind: "setComponent",
			id,
			component: "transform",
			value: { position: [1, 2, 3], rotation: [0, 0, 0], scale: [2, 2, 2] }
		});
		expect(store.getDoc().entities[id]!.components.transform!.position).toEqual([1, 2, 3]);

		store.undo();
		expect(store.getDoc().entities[id]!.components.transform).toEqual(before);
	});

	it("deleting an entity with children restores the whole subtree on undo", () => {
		const store = new ProjectStore(createEmptyProject());
		const parent = allocateEntityId(store.getDoc());
		store.dispatch({ kind: "createEntity", entity: buildPrimitiveRecord(parent, "box", "Parent") });
		const child = allocateEntityId(store.getDoc());
		const childRecord = buildPrimitiveRecord(child, "sphere", "Child");
		childRecord.parent = parent;
		store.dispatch({ kind: "createEntity", entity: childRecord });

		const before = snapshot(store);
		store.dispatch({ kind: "deleteEntity", id: parent });
		expect(store.getDoc().entities[parent]).toBeUndefined();
		expect(store.getDoc().entities[child]).toBeUndefined();
		expect(store.getDoc().rootOrder).toEqual([]);

		store.undo();
		expect(snapshot(store)).toEqual(before);
	});

	it("rename and project meta are undoable", () => {
		const store = new ProjectStore(createEmptyProject("P", "seed-a"));
		const id = allocateEntityId(store.getDoc());
		store.dispatch({ kind: "createEntity", entity: buildDelverRecord(id) });
		store.dispatch({ kind: "renameEntity", id, name: "Bryn" });
		store.dispatch({ kind: "setProjectMeta", patch: { seed: "seed-b" } });

		expect(store.getDoc().entities[id]!.name).toBe("Bryn");
		expect(store.getDoc().seed).toBe("seed-b");
		store.undo();
		expect(store.getDoc().seed).toBe("seed-a");
		store.undo();
		expect(store.getDoc().entities[id]!.name).toBe("Delver");
	});

	it("a new dispatch clears the redo stack", () => {
		const store = new ProjectStore(createEmptyProject());
		const a = allocateEntityId(store.getDoc());
		store.dispatch({ kind: "createEntity", entity: buildPrimitiveRecord(a, "box", "A") });
		store.undo();
		expect(store.canRedo()).toBe(true);
		const b = allocateEntityId(store.getDoc());
		store.dispatch({ kind: "createEntity", entity: buildPrimitiveRecord(b, "box", "B") });
		expect(store.canRedo()).toBe(false);
	});

	it("subscribers are notified once per dispatch", () => {
		const store = new ProjectStore(createEmptyProject());
		let calls = 0;
		store.subscribe(() => calls++);
		const id = allocateEntityId(store.getDoc());
		store.dispatch({ kind: "createEntity", entity: buildPrimitiveRecord(id, "box", "A") });
		expect(calls).toBe(1);
		store.undo();
		expect(calls).toBe(2);
	});
});
