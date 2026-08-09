/**
 * Projects are versioned structured data. Round-trips must be exact; old schemas must
 * migrate forward; future schemas must refuse loudly; and a reloaded project must
 * reproduce the same deterministic run — the whole point of saving structured data.
 */

import { describe, expect, it } from "vitest";
import { parseProject, serializeProject } from "../src/project/persist.js";
import { migrateProject } from "../src/project/migrate.js";
import { SCHEMA_VERSION, allocateEntityId, buildDelverRecord, createEmptyProject } from "../src/project/schema.js";
import { applyCommand } from "../src/project/commands.js";
import { SimWorld } from "../src/sim/world.js";
import { needsSystem } from "../src/sim/systems/needs.js";
import { wanderSystem } from "../src/sim/systems/wander.js";

function sampleDoc() {
	const doc = createEmptyProject("RoundTrip", "rt-seed");
	for (let i = 0; i < 2; i++) {
		applyCommand(doc, { kind: "createEntity", entity: buildDelverRecord(allocateEntityId(doc)) });
	}
	return doc;
}

describe("serialization", () => {
	it("save → load round-trips byte-identically", () => {
		const doc = sampleDoc();
		const reloaded = parseProject(serializeProject(doc));
		expect(reloaded).toEqual(doc);
		expect(serializeProject(reloaded)).toEqual(serializeProject(doc));
	});

	it("a reloaded project reproduces the same deterministic run", () => {
		const doc = sampleDoc();
		const reloaded = parseProject(serializeProject(doc));

		const a = new SimWorld(doc.entities, doc.seed);
		const b = new SimWorld(reloaded.entities, reloaded.seed);
		for (const world of [a, b]) {
			world.addSystem(needsSystem);
			world.addSystem(wanderSystem);
			for (let i = 0; i < 200; i++) world.step();
		}
		expect(a.stateHash()).toEqual(b.stateHash());
	});

	it("migrates a v1 document (no seed, no allocator) to the current schema", () => {
		const v1 = {
			schemaVersion: 1,
			name: "Old Project",
			entities: {
				e4: { id: "e4", name: "Box", parent: null, components: {} }
			},
			rootOrder: ["e4"]
		};
		const doc = migrateProject(v1);
		expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
		expect(doc.seed).toBe("mazpon");
		expect(doc.nextEntityOrdinal).toBe(5); // derived past the highest existing ID
		expect(doc.entities.e4).toBeDefined();
	});

	it("refuses documents from a newer schema instead of silently corrupting", () => {
		expect(() => migrateProject({ schemaVersion: SCHEMA_VERSION + 1, name: "x" }))
			.toThrow(/newer than this editor/);
	});

	it("refuses non-document input", () => {
		expect(() => migrateProject("nonsense")).toThrow();
		expect(() => migrateProject(null)).toThrow();
	});
});
