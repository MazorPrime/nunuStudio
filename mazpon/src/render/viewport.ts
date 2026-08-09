/**
 * Viewport — the Three.js mirror of entity state.
 *
 * This is the only place in Mazpon where Three.js objects are created from entities,
 * and it is strictly a *view*: it reconciles a map of EntityRecords (from the project
 * document in Edit mode, from the SimWorld in Play mode) into meshes keyed by entity
 * ID. It never stores authoritative state; deleting every mesh and re-syncing loses
 * nothing. Edits made through the gizmo are reported back as component values for the
 * caller to dispatch as commands — the document stays the single source of truth.
 */

import {
	AmbientLight,
	BoxGeometry,
	BufferGeometry,
	CapsuleGeometry,
	Color,
	CylinderGeometry,
	DirectionalLight,
	GridHelper,
	Mesh,
	MeshStandardMaterial,
	PerspectiveCamera,
	PlaneGeometry,
	Raycaster,
	Scene,
	SphereGeometry,
	Vector2,
	WebGLRenderer
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type {
	EntityId,
	EntityRecord,
	RenderShape,
	TransformComponent
} from "../sim/components.js";

export type GizmoMode = "translate" | "rotate" | "scale";

export interface ViewportCallbacks {
	onSelect: (id: EntityId | null) => void;
	onTransformCommit: (id: EntityId, transform: TransformComponent) => void;
}

function buildGeometry(shape: RenderShape): BufferGeometry {
	switch (shape) {
		case "box": return new BoxGeometry(1, 1, 1);
		case "sphere": return new SphereGeometry(0.5, 24, 16);
		case "capsule": return new CapsuleGeometry(0.35, 0.9, 6, 16);
		case "cylinder": return new CylinderGeometry(0.5, 0.5, 1, 24);
		case "plane": return new PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
	}
}

export class Viewport {
	private readonly renderer: WebGLRenderer;
	private readonly scene = new Scene();
	private readonly camera: PerspectiveCamera;
	private readonly orbit: OrbitControls;
	private readonly gizmo: TransformControls;
	private readonly raycaster = new Raycaster();
	private readonly meshes = new Map<EntityId, Mesh>();
	private selected: EntityId | null = null;
	private editable = true;
	private pointerDownAt: { x: number; y: number } | null = null;

	constructor(
		private readonly container: HTMLElement,
		private readonly callbacks: ViewportCallbacks
	) {
		this.renderer = new WebGLRenderer({ antialias: true });
		this.renderer.setPixelRatio(window.devicePixelRatio);
		container.appendChild(this.renderer.domElement);

		this.scene.background = new Color("#0b1213");
		this.camera = new PerspectiveCamera(55, 1, 0.1, 500);
		this.camera.position.set(8, 7, 10);

		const grid = new GridHelper(20, 20, 0x213436, 0x16211f);
		this.scene.add(grid);
		this.scene.add(new AmbientLight(0xffffff, 0.55));
		const sun = new DirectionalLight(0xfff2d8, 1.6);
		sun.position.set(6, 12, 4);
		this.scene.add(sun);

		this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
		this.orbit.enableDamping = true;

		this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
		this.scene.add(this.gizmo.getHelper());
		this.gizmo.addEventListener("dragging-changed", (event) => {
			this.orbit.enabled = !event.value;
			if (event.value === false && this.selected !== null) {
				const mesh = this.meshes.get(this.selected);
				if (mesh) {
					this.callbacks.onTransformCommit(this.selected, {
						position: [mesh.position.x, mesh.position.y, mesh.position.z],
						rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
						scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z]
					});
				}
			}
		});

		this.renderer.domElement.addEventListener("pointerdown", (event) => {
			this.pointerDownAt = { x: event.clientX, y: event.clientY };
		});
		this.renderer.domElement.addEventListener("pointerup", (event) => {
			const down = this.pointerDownAt;
			this.pointerDownAt = null;
			if (!down) return;
			const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
			if (moved > 4) return; // that was an orbit drag, not a click
			if (this.gizmo.dragging || this.gizmo.axis !== null) return; // gizmo interaction
			this.callbacks.onSelect(this.pick(event));
		});

		const resize = () => {
			const width = container.clientWidth;
			const height = container.clientHeight;
			if (width === 0 || height === 0) return;
			this.renderer.setSize(width, height, false);
			this.camera.aspect = width / height;
			this.camera.updateProjectionMatrix();
		};
		new ResizeObserver(resize).observe(container);
		resize();
	}

	setGizmoMode(mode: GizmoMode): void {
		this.gizmo.setMode(mode);
	}

	/** Play mode disables editing: the gizmo detaches, selection still works. */
	setEditable(editable: boolean): void {
		this.editable = editable;
		if (!editable) this.gizmo.detach();
		this.gizmo.enabled = editable;
	}

	/** Reconcile entity records → meshes. Call whenever state may have changed. */
	sync(entities: Record<EntityId, EntityRecord>, selected: EntityId | null): void {
		this.selected = selected;

		for (const [id, mesh] of this.meshes) {
			if (!entities[id]?.components.renderable) {
				if (this.gizmo.object === mesh) this.gizmo.detach();
				this.scene.remove(mesh);
				mesh.geometry.dispose();
				(mesh.material as MeshStandardMaterial).dispose();
				this.meshes.delete(id);
			}
		}

		for (const id of Object.keys(entities)) {
			const record = entities[id];
			if (!record) continue;
			const renderable = record.components.renderable;
			const transform = record.components.transform;
			if (!renderable || !transform) continue;

			let mesh = this.meshes.get(id);
			if (mesh && mesh.userData.shape !== renderable.shape) {
				if (this.gizmo.object === mesh) this.gizmo.detach();
				this.scene.remove(mesh);
				mesh.geometry.dispose();
				(mesh.material as MeshStandardMaterial).dispose();
				this.meshes.delete(id);
				mesh = undefined;
			}
			if (!mesh) {
				mesh = new Mesh(
					buildGeometry(renderable.shape),
					new MeshStandardMaterial({ color: renderable.color })
				);
				mesh.userData.shape = renderable.shape;
				mesh.userData.entityId = id;
				this.scene.add(mesh);
				this.meshes.set(id, mesh);
			}

			const material = mesh.material as MeshStandardMaterial;
			material.color.set(renderable.color);
			material.emissive.set(id === selected ? "#d9a441" : "#000000");
			material.emissiveIntensity = id === selected ? 0.35 : 0;
			mesh.visible = renderable.visible;

			// Never fight the user's hand mid-drag.
			if (!(this.gizmo.dragging && this.gizmo.object === mesh)) {
				mesh.position.set(...transform.position);
				mesh.rotation.set(...transform.rotation);
				mesh.scale.set(...transform.scale);
			}
		}

		const selectedMesh = selected !== null ? this.meshes.get(selected) : undefined;
		if (this.editable && selectedMesh) {
			if (this.gizmo.object !== selectedMesh) this.gizmo.attach(selectedMesh);
		} else {
			this.gizmo.detach();
		}
	}

	renderFrame(): void {
		this.orbit.update();
		this.renderer.render(this.scene, this.camera);
	}

	private pick(event: PointerEvent): EntityId | null {
		const rect = this.renderer.domElement.getBoundingClientRect();
		const ndc = new Vector2(
			((event.clientX - rect.left) / rect.width) * 2 - 1,
			-((event.clientY - rect.top) / rect.height) * 2 + 1
		);
		this.raycaster.setFromCamera(ndc, this.camera);
		const hits = this.raycaster.intersectObjects([...this.meshes.values()], false);
		const first = hits[0];
		return first ? (first.object.userData.entityId as EntityId) : null;
	}
}
