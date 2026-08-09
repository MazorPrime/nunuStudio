/**
 * Seeded RNG for the simulation layer.
 *
 * Every random draw in the simulation goes through an Rng instance owned by the
 * SimWorld. Math.random() is banned in src/sim (enforced by tests/simguards.test.ts).
 * That one rule is what makes a run reproducible.
 *
 * mulberry32 — same generator Deepholm proved out. State is a single uint32, which
 * makes snapshotting/restoring the stream trivial.
 */

export function hashSeed(text: string): number {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

export class Rng {
	private state: number;

	constructor(seed: string | number) {
		this.state = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
	}

	/** Uniform float in [0, 1). */
	next(): number {
		this.state = (this.state + 0x6d2b79f5) | 0;
		let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	/** Uniform float in [min, max). */
	range(min: number, max: number): number {
		return min + this.next() * (max - min);
	}

	/** Serializable stream position. */
	getState(): number {
		return this.state >>> 0;
	}

	setState(state: number): void {
		this.state = state >>> 0;
	}
}
