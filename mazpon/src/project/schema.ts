/**
 * The project document — the unit of persistence.
 *
 * A project is versioned structured data with stable IDs. It is never a serialized
 * live object graph: every reference between records is an ID, so documents survive
 * engine upgrades via the migration chain (see migrate.ts).
 */

import type { EntityId, EntityRecord, RenderShape } from "../sim/components.js";
import { defaultTransform } from "../sim/components.js";

export const SCHEMA_VERSION = 2;

export interface ProjectDoc {
	schemaVersion: number;
	name: string;
	/** Simulation seed. Visible in the editor status bar; drives every Play run. */
	seed: string;
	/** Stable-ID allocator state: IDs are never reused, even after deletes. */
	nextEntityOrdinal: number;
	entities: Record<EntityId, EntityRecord>;
	/** Sibling ordering of root entities (parent === null). */
	rootOrder: EntityId[];
}

export function createEmptyProject(name = "Untitled", seed = "mazpon"): ProjectDoc {
	return {
		schemaVersion: SCHEMA_VERSION,
		name,
		seed,
		nextEntityOrdinal: 1,
		entities: {},
		rootOrder: []
	};
}

export function allocateEntityId(doc: ProjectDoc): EntityId {
	const id = "e" + doc.nextEntityOrdinal;
	doc.nextEntityOrdinal++;
	return id;
}

/** A primitive: transform + renderable, nothing else. A door is not a goblin. */
export function buildPrimitiveRecord(id: EntityId, shape: RenderShape, name: string): EntityRecord {
	return {
		id,
		name,
		parent: null,
		components: {
			transform: defaultTransform(),
			renderable: { shape, color: "#7c9862", visible: true }
		}
	};
}

/**
 * The slice's example actor: a capsule named "Delver" whose hunger decays on fixed
 * simulation ticks during Play. Species, faction and needs are data — adding another
 * species is another record, not another class.
 */
export function buildDelverRecord(id: EntityId): EntityRecord {
	return {
		id,
		name: "Delver",
		parent: null,
		components: {
			transform: defaultTransform(),
			renderable: { shape: "capsule", color: "#e6ddc7", visible: true },
			actor: { active: true },
			species: { id: "delver", label: "Delver" },
			faction: { id: "hold", label: "The Hold" },
			needs: {
				entries: {
					hunger: { value: 100, decayPerTick: 0.05, min: 0, max: 100 }
				}
			}
		}
	};
}
