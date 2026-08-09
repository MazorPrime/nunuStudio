/**
 * Fixed-tick accumulator loop for driving a SimWorld in the browser.
 *
 * Render FPS never changes simulation outcomes: elapsed wall time accumulates and the
 * world steps in whole ticks of TICK_MS. A frame stall runs catch-up ticks (capped);
 * headless code skips this entirely and calls world.step() directly.
 */

import type { SimWorld } from "./world.js";

export const TICK_MS = 100;
const MAX_CATCHUP_TICKS = 30;

export class SimLoop {
	private accumulator = 0;
	private lastTime: number | null = null;

	constructor(private readonly world: SimWorld) {}

	/** Feed a requestAnimationFrame timestamp; returns number of ticks stepped. */
	frame(nowMs: number): number {
		if (this.lastTime === null) {
			this.lastTime = nowMs;
			return 0;
		}
		this.accumulator += nowMs - this.lastTime;
		this.lastTime = nowMs;
		let stepped = 0;
		while (this.accumulator >= TICK_MS && stepped < MAX_CATCHUP_TICKS) {
			this.accumulator -= TICK_MS;
			this.world.step();
			stepped++;
		}
		if (stepped === MAX_CATCHUP_TICKS) {
			this.accumulator = 0; // dropped a long stall instead of spiraling
		}
		return stepped;
	}
}
