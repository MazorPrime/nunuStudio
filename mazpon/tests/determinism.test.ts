/**
 * The determinism contract: same project + same seed ⇒ identical state at every tick,
 * with no renderer involved. These tests are the CI form of Deepholm's regression
 * philosophy — if they go red, a systemic game built on Mazpon just lost replays,
 * save-compat testing, and debuggability.
 */

import { describe, expect, it } from "vitest";
import { SimWorld } from "../src/sim/world.js";
import { needsSystem } from "../src/sim/systems/needs.js";
import { wanderSystem } from "../src/sim/systems/wander.js";
import { createEmptyProject, allocateEntityId, buildDelverRecord, buildPrimitiveRecord } from "../src/project/schema.js";
import { applyCommand } from "../src/project/commands.js";
import type { ProjectDoc } from "../src/project/schema.js";

function sampleProject(seed = "deepholm"): ProjectDoc {
	const doc = createEmptyProject("Sample", seed);
	for (let i = 0; i < 3; i++) {
		const delver = buildDelverRecord(allocateEntityId(doc));
		applyCommand(doc, { kind: "createEntity", entity: delver });
	}
	const box = buildPrimitiveRecord(allocateEntityId(doc), "box", "Box 1");
	applyCommand(doc, { kind: "createEntity", entity: box });
	return doc;
}

function makeWorld(doc: ProjectDoc): SimWorld {
	const world = new SimWorld(doc.entities, doc.seed);
	world.addSystem(needsSystem);
	world.addSystem(wanderSystem);
	return world;
}

function run(world: SimWorld, ticks: number): string[] {
	const hashes: string[] = [];
	for (let i = 0; i < ticks; i++) {
		world.step();
		hashes.push(world.stateHash());
	}
	return hashes;
}

describe("deterministic simulation", () => {
	it("same seed reproduces identical state hashes at every tick", () => {
		const doc = sampleProject();
		const a = run(makeWorld(doc), 500);
		const b = run(makeWorld(doc), 500);
		expect(a).toEqual(b);
	});

	it("different seeds diverge", () => {
		const a = run(makeWorld(sampleProject("alpha")), 100);
		const b = run(makeWorld(sampleProject("beta")), 100);
		expect(a[99]).not.toEqual(b[99]);
	});

	it("hunger decays on fixed ticks for active actors only", () => {
		const doc = sampleProject();
		const world = makeWorld(doc);
		const ids = world.entityIds().filter((id) => world.get(id)?.components.needs);
		expect(ids.length).toBe(3);
		const before = ids.map((id) => world.get(id)!.components.needs!.entries.hunger!.value);
		for (let i = 0; i < 100; i++) world.step();
		for (let i = 0; i < ids.length; i++) {
			const after = world.get(ids[i]!)!.components.needs!.entries.hunger!.value;
			expect(after).toBeCloseTo(before[i]! - 100 * 0.05, 6);
		}
		// The box has no needs and no actor; it must be byte-identical to its record.
		const box = world.entityIds().find((id) => !world.get(id)?.components.actor)!;
		expect(world.get(box)).toEqual(doc.entities[box]);
	});

	it("the project document is never mutated by Play (edit/play isolation)", () => {
		const doc = sampleProject();
		const frozen = JSON.stringify(doc);
		const world = makeWorld(doc);
		for (let i = 0; i < 250; i++) world.step();
		expect(JSON.stringify(doc)).toEqual(frozen);
	});

	it("not stepping means nothing changes (Edit mode semantics)", () => {
		const world = makeWorld(sampleProject());
		const h = world.stateHash();
		// no step() calls — Edit mode is exactly the absence of ticks
		expect(world.stateHash()).toEqual(h);
		expect(world.tick).toBe(0);
	});

	it("snapshot restore continues the same trajectory (RNG state included)", () => {
		const doc = sampleProject();
		const full = makeWorld(doc);
		for (let i = 0; i < 300; i++) full.step();

		const half = makeWorld(doc);
		for (let i = 0; i < 150; i++) half.step();
		const resumed = SimWorld.fromSnapshot(half.snapshot());
		resumed.addSystem(needsSystem);
		resumed.addSystem(wanderSystem);
		for (let i = 0; i < 150; i++) resumed.step();

		expect(resumed.stateHash()).toEqual(full.stateHash());
	});

	it("100 seeds: every run is self-reproducible and no hunger goes negative", () => {
		for (let s = 0; s < 100; s++) {
			const doc = sampleProject("seed-" + s);
			const world = makeWorld(doc);
			for (let i = 0; i < 60; i++) world.step();
			const world2 = makeWorld(doc);
			for (let i = 0; i < 60; i++) world2.step();
			expect(world2.stateHash()).toEqual(world.stateHash());
			for (const id of world.entityIds()) {
				const needs = world.get(id)?.components.needs;
				if (!needs) continue;
				for (const entry of Object.values(needs.entries)) {
					expect(entry.value).toBeGreaterThanOrEqual(entry.min);
				}
			}
		}
	});
});
