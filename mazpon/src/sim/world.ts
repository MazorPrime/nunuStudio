/**
 * SimWorld — the headless simulation runtime.
 *
 * Constructed from a snapshot of entity records (deep-copied; the source document is
 * never touched), advanced one fixed tick at a time by step(). No DOM, no Three.js,
 * no timers: runs identically in the browser, in a Web Worker, and in Node tests.
 * Pause = don't call step. Speed = call it more often.
 */

import type { EntityId, EntityRecord } from "./components.js";
import { Rng } from "./rng.js";
import { hashValue } from "./hash.js";

export type System = (world: SimWorld) => void;

export interface SimSnapshot {
	tick: number;
	seed: string;
	rngState: number;
	entities: Record<EntityId, EntityRecord>;
}

export class SimWorld {
	readonly seed: string;
	readonly rng: Rng;
	tick = 0;
	entities: Record<EntityId, EntityRecord>;
	private readonly systems: System[] = [];

	constructor(entities: Record<EntityId, EntityRecord>, seed: string) {
		this.seed = seed;
		this.rng = new Rng(seed);
		this.entities = structuredClone(entities);
	}

	addSystem(system: System): void {
		this.systems.push(system);
	}

	/** Advance exactly one simulation tick. */
	step(): void {
		this.tick++;
		for (const system of this.systems) {
			system(this);
		}
	}

	/**
	 * Entity IDs in sorted order. Systems iterate in this order so results never
	 * depend on object-key insertion history.
	 */
	entityIds(): EntityId[] {
		return Object.keys(this.entities).sort();
	}

	get(id: EntityId): EntityRecord | undefined {
		return this.entities[id];
	}

	/** Serializable snapshot of the full simulation state, including RNG position. */
	snapshot(): SimSnapshot {
		return {
			tick: this.tick,
			seed: this.seed,
			rngState: this.rng.getState(),
			entities: structuredClone(this.entities)
		};
	}

	static fromSnapshot(snap: SimSnapshot): SimWorld {
		const world = new SimWorld(snap.entities, snap.seed);
		world.tick = snap.tick;
		world.rng.setState(snap.rngState);
		return world;
	}

	/** Deterministic hash of the current state — the determinism contract's currency. */
	stateHash(): string {
		return hashValue({
			tick: this.tick,
			rngState: this.rng.getState(),
			entities: this.entities
		});
	}
}
