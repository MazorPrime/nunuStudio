/**
 * Status bar — mode, fixed-tick counter, simulation seed, selection.
 * The seed being permanently visible is deliberate: determinism is a headline
 * feature, so its inputs are headline UI.
 */

export interface StatusState {
	mode: "edit" | "play";
	tick: number;
	seed: string;
	selection: string | null;
	schemaVersion: number;
}

export interface StatusBar {
	el: HTMLElement;
	refresh(state: StatusState): void;
}

export function createStatusBar(onSeedChange: (seed: string) => void): StatusBar {
	const el = document.createElement("div");
	el.className = "statusbar";

	const mode = document.createElement("span");
	const tick = document.createElement("span");
	const seedWrap = document.createElement("span");
	const seedLabel = document.createElement("span");
	seedLabel.textContent = "seed ";
	const seedInput = document.createElement("input");
	seedInput.type = "text";
	seedInput.id = "seed-input";
	seedInput.style.width = "110px";
	seedInput.addEventListener("change", () => onSeedChange(seedInput.value));
	seedWrap.append(seedLabel, seedInput);
	const selection = document.createElement("span");
	const schema = document.createElement("span");
	el.append(mode, tick, seedWrap, selection, schema);

	function refresh(state: StatusState): void {
		mode.innerHTML = `mode <b class="${state.mode === "play" ? "mode-play" : ""}">${state.mode.toUpperCase()}</b>`;
		tick.innerHTML = `tick <b id="tick-value">${state.tick}</b>`;
		if (document.activeElement !== seedInput && seedInput.value !== state.seed) {
			seedInput.value = state.seed;
		}
		seedInput.disabled = state.mode === "play";
		selection.innerHTML = `selected <b>${state.selection ?? "—"}</b>`;
		schema.innerHTML = `schema <b>v${state.schemaVersion}</b>`;
	}

	return { el, refresh };
}
