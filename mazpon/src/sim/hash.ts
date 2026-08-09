/**
 * Deterministic hashing of simulation state, used by the determinism test suite and
 * (later) by replay divergence detection.
 */

/** JSON.stringify with recursively sorted object keys, so hashes are stable. */
export function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return "[" + value.map(stableStringify).join(",") + "]";
	}
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

/** FNV-1a 32-bit over a string, hex encoded. */
export function fnv1a(text: string): string {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}

export function hashValue(value: unknown): string {
	return fnv1a(stableStringify(value));
}
