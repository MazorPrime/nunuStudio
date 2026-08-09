/**
 * Wander system: active actors take a small seeded random step on the ground plane
 * every few ticks. This system exists to make determinism *visible* in the viewport —
 * same seed, same path, every run. It consumes RNG in sorted-entity order so outcomes
 * are independent of insertion history.
 */

import type { SimWorld } from "../world.js";

const STEP_EVERY = 5;
const STEP_SIZE = 0.35;
const RANGE = 8;

export function wanderSystem(world: SimWorld): void {
	if (world.tick % STEP_EVERY !== 0) return;
	for (const id of world.entityIds()) {
		const entity = world.entities[id];
		if (!entity) continue;
		const actor = entity.components.actor;
		const transform = entity.components.transform;
		if (!actor?.active || !transform) continue;
		const dx = world.rng.range(-STEP_SIZE, STEP_SIZE);
		const dz = world.rng.range(-STEP_SIZE, STEP_SIZE);
		transform.position[0] = clamp(transform.position[0] + dx, -RANGE, RANGE);
		transform.position[2] = clamp(transform.position[2] + dz, -RANGE, RANGE);
	}
}

function clamp(v: number, min: number, max: number): number {
	return v < min ? min : v > max ? max : v;
}
