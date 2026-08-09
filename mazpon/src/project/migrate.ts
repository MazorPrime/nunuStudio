/**
 * Schema migrations. Loading any older document runs it forward one version at a
 * time — Deepholm's save-migration philosophy promoted to an engine guarantee.
 *
 * Rules:
 *  - migrations are append-only; never edit a shipped step;
 *  - each step owns exactly one version bump and is individually testable;
 *  - unknown future versions are an explicit error, not a silent best-effort load.
 */

import type { ProjectDoc } from "./schema.js";
import { SCHEMA_VERSION } from "./schema.js";

type MigrationStep = (doc: Record<string, unknown>) => void;

/** Step at index N migrates a document from version N+1 to N+2. */
const STEPS: MigrationStep[] = [
	// v1 → v2: v1 documents predate deterministic Play and had no seed field and no
	// stable-ID allocator; derive the allocator from the highest existing ordinal.
	(doc) => {
		if (typeof doc.seed !== "string") doc.seed = "mazpon";
		if (typeof doc.nextEntityOrdinal !== "number") {
			let max = 0;
			const entities = (doc.entities ?? {}) as Record<string, unknown>;
			for (const id of Object.keys(entities)) {
				const n = Number(id.replace(/^e/, ""));
				if (Number.isFinite(n) && n > max) max = n;
			}
			doc.nextEntityOrdinal = max + 1;
		}
	}
];

export function migrateProject(raw: unknown): ProjectDoc {
	if (raw === null || typeof raw !== "object") {
		throw new Error("Not a Mazpon project document");
	}
	const doc = structuredClone(raw) as Record<string, unknown>;
	let version = typeof doc.schemaVersion === "number" ? doc.schemaVersion : 1;
	if (version > SCHEMA_VERSION) {
		throw new Error(
			`Project schema v${version} is newer than this editor (v${SCHEMA_VERSION}). Update Mazpon Studio.`
		);
	}
	while (version < SCHEMA_VERSION) {
		const step = STEPS[version - 1];
		if (!step) throw new Error(`No migration step from schema v${version}`);
		step(doc);
		version++;
		doc.schemaVersion = version;
	}
	return doc as unknown as ProjectDoc;
}
