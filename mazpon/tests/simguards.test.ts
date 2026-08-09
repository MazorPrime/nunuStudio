/**
 * Architecture guards, enforced mechanically:
 *  1. Math.random is banned in src/sim — randomness must flow through the seeded Rng.
 *  2. src/sim imports nothing from render/editor/project and never touches Three.js
 *     or the DOM — the simulation must stay headless-capable forever.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIM_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "sim");

function simFiles(dir = SIM_DIR): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) out.push(...simFiles(path));
		else if (name.endsWith(".ts")) out.push(path);
	}
	return out;
}

/** Strip comments so prose about the rules doesn't trip the rules. */
function code(file: string): string {
	return readFileSync(file, "utf8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");
}

describe("sim layer guards", () => {
	it("never calls Math.random", () => {
		for (const file of simFiles()) {
			expect(code(file).includes("Math.random"), `${file} uses Math.random`).toBe(false);
		}
	});

	it("imports nothing from three, the DOM, or upper layers", () => {
		const banned = [/from\s+["']three/, /from\s+["'].*\/(render|editor|project)\//, /\bdocument\./, /\bwindow\./];
		for (const file of simFiles()) {
			const source = code(file);
			for (const pattern of banned) {
				expect(pattern.test(source), `${file} matches ${pattern}`).toBe(false);
			}
		}
	});
});
