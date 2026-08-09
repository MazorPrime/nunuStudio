/**
 * The entity/component data model.
 *
 * An entity is a stable string ID plus a bag of typed component records — plain JSON
 * data, closed under structured clone. No class hierarchies: a door and a goblin share
 * only the components they actually carry.
 *
 * This module is the shared vocabulary of the whole studio: the project layer stores
 * these records in documents, the sim layer ticks them, the render layer draws them,
 * and the editor inspects them. It has zero dependencies.
 */

export type EntityId = string;

export type Vec3 = [number, number, number];

export interface TransformComponent {
	position: Vec3;
	/** Euler XYZ, radians. */
	rotation: Vec3;
	scale: Vec3;
}

export type RenderShape = "box" | "sphere" | "capsule" | "cylinder" | "plane";

/**
 * A description of how to draw the entity — never a mesh, never a Three object.
 * Swapping capsule → GLB model → sprite later is a change to this data and to the
 * renderer's factory, not to any simulation logic.
 */
export interface RenderableComponent {
	shape: RenderShape;
	color: string;
	visible: boolean;
}

/** Marks an entity as simulation-driven. */
export interface ActorComponent {
	active: boolean;
}

/** Species is data, and is not a faction and not a controller (Deepholm lesson #3). */
export interface SpeciesComponent {
	id: string;
	label: string;
}

export interface FactionComponent {
	id: string;
	label: string;
}

export interface NeedEntry {
	value: number;
	/** Amount subtracted each simulation tick while in Play. */
	decayPerTick: number;
	min: number;
	max: number;
}

export interface NeedsComponent {
	entries: Record<string, NeedEntry>;
}

export interface ComponentMap {
	transform: TransformComponent;
	renderable: RenderableComponent;
	actor: ActorComponent;
	species: SpeciesComponent;
	faction: FactionComponent;
	needs: NeedsComponent;
	// Reserved for the roadmap (schemas land with their systems):
	// collider, rigidbody, animator, health, body, skills, inventory, equipment,
	// jobs, ai, relationships, navigation, interaction, zone.
}

export type ComponentName = keyof ComponentMap;

export interface EntityRecord {
	id: EntityId;
	name: string;
	parent: EntityId | null;
	components: Partial<ComponentMap>;
}

export function defaultTransform(): TransformComponent {
	return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
}
