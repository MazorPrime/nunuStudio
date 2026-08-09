/**
 * Needs system: every active actor's needs decay by their per-tick rate.
 * Thresholds/consequences (hunger → seek food job) arrive with the job system
 * (roadmap Phase 3); the slice proves the data path.
 */

import type { SimWorld } from "../world.js";

export function needsSystem(world: SimWorld): void {
	for (const id of world.entityIds()) {
		const entity = world.entities[id];
		if (!entity) continue;
		const actor = entity.components.actor;
		const needs = entity.components.needs;
		if (!actor?.active || !needs) continue;
		for (const key of Object.keys(needs.entries).sort()) {
			const need = needs.entries[key];
			if (!need) continue;
			need.value = Math.max(need.min, Math.min(need.max, need.value - need.decayPerTick));
		}
	}
}
