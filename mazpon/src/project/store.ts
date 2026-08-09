/**
 * ProjectStore — owns the document, the command history, and change notification.
 *
 * Panels subscribe and re-render when the revision changes (never on a timer —
 * Deepholm's signature-diff lesson). Undo/redo replays command inverses recorded by
 * applyCommand, so history works identically for edits from the UI, scripts, or AI.
 */

import type { ProjectDoc } from "./schema.js";
import { createEmptyProject } from "./schema.js";
import type { Command } from "./commands.js";
import { applyCommand } from "./commands.js";

export type Unsubscribe = () => void;

interface HistoryEntry {
	/** Replaying this undoes the original command… */
	inverse: Command;
	/** …and replaying this redoes it. */
	forward: Command;
	label: string;
}

export class ProjectStore {
	private doc: ProjectDoc;
	private revisionCounter = 0;
	private undoStack: HistoryEntry[] = [];
	private redoStack: HistoryEntry[] = [];
	private listeners = new Set<() => void>();

	constructor(doc?: ProjectDoc) {
		this.doc = doc ?? createEmptyProject();
	}

	/** Read-only access. Mutating the returned document is a bug; use dispatch. */
	getDoc(): ProjectDoc {
		return this.doc;
	}

	get revision(): number {
		return this.revisionCounter;
	}

	subscribe(listener: () => void): Unsubscribe {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	dispatch(cmd: Command, label?: string): void {
		const inverse = applyCommand(this.doc, cmd);
		this.undoStack.push({ inverse, forward: structuredClone(cmd), label: label ?? cmd.kind });
		this.redoStack = [];
		this.bump();
	}

	canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	undo(): void {
		const entry = this.undoStack.pop();
		if (!entry) return;
		const redoInverse = applyCommand(this.doc, entry.inverse);
		this.redoStack.push({ inverse: redoInverse, forward: entry.inverse, label: entry.label });
		this.bump();
	}

	redo(): void {
		const entry = this.redoStack.pop();
		if (!entry) return;
		const undoInverse = applyCommand(this.doc, entry.inverse);
		this.undoStack.push({ inverse: undoInverse, forward: entry.inverse, label: entry.label });
		this.bump();
	}

	/** Replace the whole document (load/import). Clears history. */
	replaceDoc(doc: ProjectDoc): void {
		this.doc = doc;
		this.undoStack = [];
		this.redoStack = [];
		this.bump();
	}

	private bump(): void {
		this.revisionCounter++;
		for (const listener of this.listeners) listener();
	}
}
