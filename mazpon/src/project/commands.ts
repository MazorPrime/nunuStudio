/**
 * Commands — the single write path to a project document.
 *
 * Nothing mutates a ProjectDoc except applyCommand. Human editor actions, future
 * visual scripting, future TypeScript APIs and future AI authoring all emit the same
 * serializable command objects, which is what makes every edit inspectable, undoable,
 * diffable and serializable regardless of who authored it.
 *
 * applyCommand returns the *inverse* command, so undo/redo is structural: the store
 * keeps stacks of commands and replays them. No per-feature undo code, ever.
 */

import type { ComponentName, EntityId, EntityRecord } from "../sim/components.js";
import type { ProjectDoc } from "./schema.js";

export type Command =
	| { kind: "createEntity"; entity: EntityRecord; index?: number }
	| { kind: "deleteEntity"; id: EntityId }
	| { kind: "restoreEntities"; entities: EntityRecord[]; rootPlacements: [EntityId, number][] }
	| { kind: "renameEntity"; id: EntityId; name: string }
	| { kind: "setComponent"; id: EntityId; component: ComponentName; value: unknown }
	| { kind: "removeComponent"; id: EntityId; component: ComponentName }
	| { kind: "setParent"; id: EntityId; parent: EntityId | null; index?: number }
	| { kind: "setProjectMeta"; patch: { name?: string; seed?: string } };

export function applyCommand(doc: ProjectDoc, cmd: Command): Command {
	switch (cmd.kind) {
		case "createEntity": {
			const entity = structuredClone(cmd.entity);
			if (doc.entities[entity.id]) {
				throw new Error(`Entity ${entity.id} already exists`);
			}
			doc.entities[entity.id] = entity;
			if (entity.parent === null) {
				const index = cmd.index ?? doc.rootOrder.length;
				doc.rootOrder.splice(index, 0, entity.id);
			}
			return { kind: "deleteEntity", id: entity.id };
		}

		case "deleteEntity": {
			const ids = collectSubtree(doc, cmd.id);
			const entities = ids
				.map((id) => doc.entities[id])
				.filter((e): e is EntityRecord => e !== undefined)
				.map((e) => structuredClone(e));
			const rootPlacements: [EntityId, number][] = [];
			for (const id of ids) {
				const rootIndex = doc.rootOrder.indexOf(id);
				if (rootIndex >= 0) {
					rootPlacements.push([id, rootIndex]);
					doc.rootOrder.splice(rootIndex, 1);
				}
				delete doc.entities[id];
			}
			return { kind: "restoreEntities", entities, rootPlacements };
		}

		case "restoreEntities": {
			for (const entity of cmd.entities) {
				doc.entities[entity.id] = structuredClone(entity);
			}
			const placements = [...cmd.rootPlacements].sort((a, b) => a[1] - b[1]);
			for (const [id, index] of placements) {
				doc.rootOrder.splice(index, 0, id);
			}
			// Inverse: deleting the subtree root removes the whole restored set.
			const first = cmd.entities[0];
			if (!first) throw new Error("restoreEntities: empty entity list");
			return { kind: "deleteEntity", id: first.id };
		}

		case "renameEntity": {
			const entity = mustGet(doc, cmd.id);
			const previous = entity.name;
			entity.name = cmd.name;
			return { kind: "renameEntity", id: cmd.id, name: previous };
		}

		case "setComponent": {
			const entity = mustGet(doc, cmd.id);
			const components = entity.components as Record<string, unknown>;
			const had = cmd.component in components;
			const previous = had ? structuredClone(components[cmd.component]) : undefined;
			components[cmd.component] = structuredClone(cmd.value);
			return had
				? { kind: "setComponent", id: cmd.id, component: cmd.component, value: previous }
				: { kind: "removeComponent", id: cmd.id, component: cmd.component };
		}

		case "removeComponent": {
			const entity = mustGet(doc, cmd.id);
			const components = entity.components as Record<string, unknown>;
			const previous = structuredClone(components[cmd.component]);
			delete components[cmd.component];
			return { kind: "setComponent", id: cmd.id, component: cmd.component, value: previous };
		}

		case "setParent": {
			const entity = mustGet(doc, cmd.id);
			const prevParent = entity.parent;
			const prevRootIndex = doc.rootOrder.indexOf(cmd.id);
			if (prevRootIndex >= 0) doc.rootOrder.splice(prevRootIndex, 1);
			entity.parent = cmd.parent;
			if (cmd.parent === null) {
				doc.rootOrder.splice(cmd.index ?? doc.rootOrder.length, 0, cmd.id);
			}
			return {
				kind: "setParent",
				id: cmd.id,
				parent: prevParent,
				index: prevRootIndex >= 0 ? prevRootIndex : undefined
			};
		}

		case "setProjectMeta": {
			const previous: { name?: string; seed?: string } = {};
			if (cmd.patch.name !== undefined) {
				previous.name = doc.name;
				doc.name = cmd.patch.name;
			}
			if (cmd.patch.seed !== undefined) {
				previous.seed = doc.seed;
				doc.seed = cmd.patch.seed;
			}
			return { kind: "setProjectMeta", patch: previous };
		}
	}
}

function mustGet(doc: ProjectDoc, id: EntityId): EntityRecord {
	const entity = doc.entities[id];
	if (!entity) throw new Error(`No entity ${id}`);
	return entity;
}

/** The entity plus all descendants, root first, in stable (sorted-ID) order per level. */
function collectSubtree(doc: ProjectDoc, rootId: EntityId): EntityId[] {
	const out: EntityId[] = [];
	const queue: EntityId[] = [rootId];
	while (queue.length > 0) {
		const id = queue.shift() as EntityId;
		if (!doc.entities[id]) continue;
		out.push(id);
		const children = Object.keys(doc.entities)
			.filter((childId) => doc.entities[childId]?.parent === id)
			.sort();
		queue.push(...children);
	}
	return out;
}
