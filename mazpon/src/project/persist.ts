/**
 * Persistence: localStorage autosave slot + JSON file export/import.
 * Everything read from outside runs through the migration chain — a document is never
 * trusted to be current-schema just because it parsed.
 */

import type { ProjectDoc } from "./schema.js";
import { migrateProject } from "./migrate.js";

const STORAGE_KEY = "mazpon.project.autosave";

export function serializeProject(doc: ProjectDoc): string {
	return JSON.stringify(doc, null, "\t");
}

export function parseProject(json: string): ProjectDoc {
	return migrateProject(JSON.parse(json));
}

export function saveToLocalStorage(doc: ProjectDoc): void {
	localStorage.setItem(STORAGE_KEY, serializeProject(doc));
}

export function loadFromLocalStorage(): ProjectDoc | null {
	const json = localStorage.getItem(STORAGE_KEY);
	if (json === null) return null;
	return parseProject(json);
}

export function exportToFile(doc: ProjectDoc): void {
	const blob = new Blob([serializeProject(doc)], { type: "application/json" });
	const anchor = document.createElement("a");
	anchor.href = URL.createObjectURL(blob);
	anchor.download = `${doc.name.replace(/[^\w-]+/g, "_") || "project"}.mazpon.json`;
	anchor.click();
	URL.revokeObjectURL(anchor.href);
}

export function importFromFile(): Promise<ProjectDoc | null> {
	return new Promise((resolve, reject) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json,.mazpon.json,application/json";
		input.onchange = () => {
			const file = input.files?.[0];
			if (!file) return resolve(null);
			const reader = new FileReader();
			reader.onload = () => {
				try {
					resolve(parseProject(String(reader.result)));
				} catch (err) {
					reject(err instanceof Error ? err : new Error(String(err)));
				}
			};
			reader.onerror = () => reject(new Error("Could not read file"));
			reader.readAsText(file);
		};
		input.click();
	});
}
