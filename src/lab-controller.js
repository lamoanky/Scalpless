import * as THREE from "three";
import { PLATFORM } from "./lab-environment.js";
import { CutCoverage, OperationHistory } from "./domain.js";

export class LabController {
  constructor(bench, onion, physics) {
    this.bench = bench;
    this.onion = onion;
    this.physics = physics;
    this.coverage = new CutCoverage();
    this.history = new OperationHistory();
    this.tool = "inspect";
    this.hints = false;
    this.selected = "section";
    this.held = null;
    this.cutting = false;
    this.autoCut = false;
    this.listeners = new Set();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hover = null;
    this.settling = new Map();
    this.states = {};
    for (const part of onion.parts.values())
      this.states[part.id] = {
        detached: false,
        separation: 0,
        bend: 0,
        direction: [1, 0, 0.2],
      };
    this.initial = this.snapshot();
    this.message = "";
    this.membraneReady = false;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(message) {
    if (message) this.message = message;
    for (const listener of this.listeners) listener(this.getState(), message);
    window.dispatchEvent(
      new CustomEvent("lab:statechange", {
        detail: structuredClone(this.getState()),
      }),
    );
  }
  getState() {
    return {
      tool: this.tool,
      hints: this.hints,
      cut: this.coverage.fraction,
      cutOpen: this.coverage.complete,
      held: this.held?.id ?? null,
      selected: this.selected,
      undo: this.history.size,
      available: this.available().map((p) => ({
        id: p.id,
        label: p.label,
        detached: this.states[p.id].detached,
      })),
      pieces: structuredClone(this.states),
    };
  }
  get cutOpen() {
    return this.coverage.complete;
  }
  get sectionMoved() {
    const part = this.onion.parts.get("section");
    return (
      this.states.section.detached &&
      part.group.position.distanceTo(this.onion.origin) > 0.025
    );
  }
  available() {
    if (!this.cutOpen) return [];
    const result = [this.onion.parts.get("section")];
    if (this.sectionMoved) {
      for (let i = 0; i < 8; i++) {
        const p = this.onion.parts.get(`layer-${i}`);
        result.push(p);
        if (!this.states[p.id].detached) break;
      }
    }
    if (this.states["layer-1"].detached)
      result.push(this.onion.parts.get("epidermis"));
    return result;
  }
  snapshot() {
    return {
      bins: this.coverage.snapshot(),
      selected: this.selected,
      states: structuredClone(this.states),
      transforms: [...this.onion.parts.values()].map((p) => ({
        id: p.id,
        position: p.group.position.toArray(),
        quaternion: p.group.quaternion.toArray(),
        visible: p.group.visible,
      })),
    };
  }
  restore(snapshot) {
    this.physics.clear();
    this.held = null;
    this.cutting = false;
    this.autoCut = false;
    this.settling.clear();
    this.hover = null;
    this.coverage.restore(snapshot.bins);
    this.states = structuredClone(snapshot.states);
    this.selected = snapshot.selected;
    this.membraneReady = false;
    this.onion.prepareMembrane(
      this.states["layer-1"].bend,
      new THREE.Vector3(...this.states["layer-1"].direction),
    );
    for (const t of snapshot.transforms) {
      const part = this.onion.parts.get(t.id);
      part.group.position.fromArray(t.position);
      part.group.quaternion.fromArray(t.quaternion);
      part.group.visible = t.visible;
      this.onion.deform(
        part,
        this.states[t.id].bend,
        new THREE.Vector3(...this.states[t.id].direction),
      );
    }
    for (const part of this.onion.parts.values())
      if (this.states[part.id].detached) this.physics.createBody(part);
    this.physics.syncSpecimen(this.onion.parts, this.states);
    this.onion.updateCut(this.coverage.bins);
    this.bench.controls.enabled = true;
    this.bench.host.classList.remove("is-holding");
    this.bench.restTools();
    this.emit();
  }
  setTool(tool) {
    if (!["inspect", "scalpel", "hand"].includes(tool)) return;
    if (this.held || this.cutting) this.cancel();
    this.tool = tool;
    this.bench.setTool(tool);
    this.emit();
  }
  toggleHints() {
    this.hints = !this.hints;
    this.emit(this.hints ? "Incision and grasp hints on." : "Hints off.");
  }
  select(id) {
    if (this.held) this.cancel();
    if (this.available().some((p) => p.id === id)) {
      this.selected = id;
      this.emit();
    }
  }
  pointerRay(detail) {
    if (
      !Number.isFinite(detail.x) ||
      !Number.isFinite(detail.y) ||
      detail.x < 0 ||
      detail.x > 1 ||
      detail.y < 0 ||
      detail.y > 1
    )
      return false;
    this.pointer.set(detail.x * 2 - 1, 1 - detail.y * 2);
    this.bench.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.bench.camera);
    return true;
  }
  pick(detail) {
    if (!this.pointerRay(detail)) return null;
    const objects = [...this.onion.parts.values()]
      .filter((p) => p.group.visible)
      .flatMap((p) => p.meshes);
    const hit = this.raycaster.intersectObjects(objects, false)[0];
    if (hit) {
      hit.part = this.onion.parts.get(hit.object.userData.partId);
      hit.normal = hit.face.normal
        .clone()
        .transformDirection(hit.object.matrixWorld);
    }
    return hit ?? null;
  }
  instrumentAt(detail) {
    if (!this.pointerRay(detail)) return null;
    const hit = this.raycaster.intersectObjects(
      Object.values(this.bench.tools),
      true,
    )[0];
    return hit?.object.userData.instrument ?? null;
  }
  contact(detail){
    const hit=this.pick(detail);
    if(detail.source!=='webcam' || this.tool!=='scalpel' || this.cutOpen)return hit;
    const width=this.bench.host.clientWidth,height=this.bench.host.clientHeight;
    let nearest=null,best=32;
    this.onion.guidePoints.forEach(point=>{
      const p=this.project(point),distance=Math.hypot((p.x-detail.x)*width,(p.y-detail.y)*height);
      if(distance<best){best=distance;nearest=point;}
    });
    if(nearest){
      const normal=nearest.clone().sub(this.onion.origin).normalize();
      return {point:nearest.clone(),normal,part:this.onion.parts.get('section'),assisted:true};
    }
    return hit;
  }
  grabContact(detail){
    const hit=this.pick(detail);
    if(detail.source!=='webcam')return hit;
    let closest=null,best=40;
    for(const part of this.available()){
      const point=this.graspPoint(part),p=this.project(point);
      const distance=Math.hypot((p.x-detail.x)*this.bench.host.clientWidth,(p.y-detail.y)*this.bench.host.clientHeight);
      if(distance<best){best=distance;closest={part,point,normal:new THREE.Vector3(0,1,0),assisted:true};}
    }
    return closest||hit;
  }
  move(detail) {
    this.lastInput=detail;
    if(this.gesturePinchHeld && !this.held && this.cutOpen)this.beginGrab(detail);
    if (this.held) {
      this.drag(detail);
      return;
    }
    const hit = this.contact(detail);
    this.hover = hit;
    if (this.cutting) {
      this.recordCut(hit);
      return;
    }
    if (this.tool !== "inspect" && hit)
      this.bench.toolAt(this.tool, hit.point, hit.normal, false);
    else this.bench.restTools();
  }
  beginCut(detail) {
    if (this.cutOpen || this.autoCut || this.held || this.cutting) return;
    this.operationBefore = this.snapshot();
    this.cutting = true;
    this.cutDirty = false;
    this.coverage.endStroke();
    this.bench.controls.enabled = false;
    this.recordCut(this.contact(detail));
  }
  recordCut(hit) {
    if (!hit || this.states[hit.part.id].detached) {
      this.coverage.add(0, false);
      return;
    }
    let best = Infinity,
      index = 0;
    this.onion.guidePoints.forEach((point, i) => {
      const d = point.distanceToSquared(hit.point);
      if (d < best) {
        best = d;
        index = i;
      }
    });
    const valid = best < 0.0042 * 0.0042;
    if (this.coverage.add(index / 96, valid)) {
      this.cutDirty = true;
      this.onion.updateCut(this.coverage.bins);
      this.emit();
    }
    this.bench.toolAt("scalpel", hit.point, hit.normal);
  }
  endCut() {
    if (!this.cutting) return;
    this.cutting = false;
    this.coverage.endStroke();
    this.bench.controls.enabled = true;
    if (this.cutDirty) this.history.push(this.operationBefore);
    this.emit(
      this.cutOpen
        ? "Incision complete. Use forceps to lift the cut section."
        : this.cutDirty
          ? `${Math.round(this.coverage.fraction * 100)}% of the seam cut. Continue where you left off.`
          : "No cut made. Turn on hints to see the supported incision.",
    );
  }
  async traceSeam() {
    if (this.autoCut || this.cutOpen) return;
    this.setTool("scalpel");
    this.bench.home();
    this.autoCut = true;
    this.operationBefore = this.snapshot();
    this.cutting = true;
    this.cutDirty = false;
    this.bench.controls.enabled = false;
    let i = 0;
    await new Promise((resolve) => {
      const next = () => {
        if (!this.autoCut) {
          resolve();
          return;
        }
        for (let n = 0; n < 3 && i <= 96; n++, i++) {
          const point = this.onion.guidePoints[i];
          this.coverage.add(i / 96);
          this.cutDirty = true;
          this.bench.toolAt(
            "scalpel",
            point,
            new THREE.Vector3(0, 0.35, 1).normalize(),
          );
        }
        this.onion.updateCut(this.coverage.bins);
        this.emit();
        if (i <= 96 && !this.coverage.complete) requestAnimationFrame(next);
        else {
          this.autoCut = false;
          this.endCut();
          resolve();
        }
      };
      requestAnimationFrame(next);
    });
  }
  graspPoint(part) {
    part.group.updateMatrixWorld(true);
    if (this.held?.id === part.id && this.held.vertex !== undefined) {
      return new THREE.Vector3()
        .fromBufferAttribute(
          part.meshes[0].geometry.attributes.position,
          this.held.vertex,
        )
        .applyMatrix4(part.group.matrixWorld);
    }
    if (part.id === "section") {
      return new THREE.Vector3(0.017, 0.059, 0.019).applyMatrix4(
        part.group.matrixWorld,
      );
    }
    const mesh = part.meshes[0],
      p = mesh.geometry.attributes.position;
    const index =
      part.id === "epidermis"
        ? Math.min(p.count - 1, Math.floor(p.count * 0.75))
        : Math.min(p.count - 1, Math.floor(42 * 0.74) * 49 + 48);
    return new THREE.Vector3()
      .fromBufferAttribute(p, index)
      .applyMatrix4(mesh.matrixWorld);
  }
  beginGrab(detail, forcedId = null) {
    if (this.held || this.autoCut) return;
    if (!this.cutOpen) {
      this.emit("Use the scalpel to open the supported seam first.");
      return;
    }
    const hit = forcedId ? null : this.grabContact(detail),
      id = forcedId ?? hit?.part.id;
    const part = this.available().find((p) => p.id === id);
    if (!part) {
      this.emit(
        this.sectionMoved
          ? "Grasp an exposed outer edge with the forceps."
          : "Lift the cut section to expose the layers beneath it.",
      );
      return;
    }
    this.selected = id;
    this.operationBefore = this.snapshot();
    this.settling.delete(id);
    let vertex;
    let point = hit?.point ?? this.graspPoint(part);
    if (
      hit &&
      !this.states[id].detached &&
      id !== "section" &&
      id !== "epidermis"
    ) {
      const p = part.meshes[0].geometry.attributes.position;
      let best = Infinity;
      for (let row = 5; row <= 41; row++)
        for (const col of [0, 48]) {
          const index = row * 49 + col,
            v = new THREE.Vector3()
              .fromBufferAttribute(p, index)
              .applyMatrix4(part.group.matrixWorld),
            distance = v.distanceTo(hit.point);
          if (distance < best) {
            best = distance;
            vertex = index;
            point = v;
          }
        }
      if (best > 0.018) {
        this.emit(
          "Grasp the exposed edge of this layer. Hints mark a starting point.",
        );
        return;
      }
    }
    const normal = this.bench.camera.getWorldDirection(new THREE.Vector3());
    this.held = {
      id,
      part,
      vertex,
      anchorLocal: part.group.worldToLocal(point.clone()),
      point: point.clone(),
      grabStart: point.clone(),
      offset: point.clone().sub(part.group.position),
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point),
      axis: null,
      startBend: this.states[id].bend,
      keyboard: Boolean(forcedId),
      inputHeight: Number.isFinite(detail?.z)?detail.z:.5,
    };
    this.bench.controls.enabled = false;
    this.bench.host.classList.add("is-holding");
    if (id === "section" || this.states[id].detached) {
      this.states[id].detached = true;
      this.physics.hold(part);
    }
    this.bench.toolAt(
      "hand",
      point,
      new THREE.Vector3(0.2, 1, 0.2).normalize(),
      true,
    );
    this.emit();
  }
  drag(detail) {
    const held = this.held;
    if (!held || !this.pointerRay(detail)) return;
    const target = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(held.plane, target)) return;
    if(detail.source==='webcam' && Number.isFinite(detail.z))target.y+=(detail.z-held.inputHeight)*.16;
    const state = this.states[held.id];
    if (state.detached) {
      this.moveHeldTo(target.sub(held.offset));
      return;
    }
    const delta = target.clone().sub(held.grabStart);
    if (!held.axis && delta.length() > 0.002)
      held.axis = delta.clone().normalize();
    if (held.axis) {
      const progress = THREE.MathUtils.clamp(
        held.startBend + delta.dot(held.axis) / 0.072,
        0,
        1,
      );
      const direction = held.axis.clone();
      direction.y = 0;
      if (direction.length() < 0.05) direction.set(1, 0, 0.25);
      direction.x = -Math.max(0.65, Math.abs(direction.x));
      direction.normalize();
      this.peel(held.part, progress, direction);
    }
  }
  peel(part, bend, direction) {
    const state = this.states[part.id];
    state.bend = bend;
    state.separation = Math.max(state.separation, bend);
    state.direction = direction.toArray();
    this.onion.deform(part, bend, direction);
    const point = this.graspPoint(part);
    this.bench.toolAt(
      "hand",
      point,
      new THREE.Vector3(0.2, 1, 0.2).normalize(),
      true,
    );
    if (state.separation >= 0.985 && !state.detached) {
      state.detached = true;
      state.bend = 1;
      this.onion.deform(part, 1, direction);
      this.physics.createBody(part, true);
      if (this.held) {
        this.held.point.copy(this.graspPoint(part));
        this.held.offset.copy(this.held.point).sub(part.group.position);
        this.held.anchorLocal.copy(
          part.group.worldToLocal(this.held.point.clone()),
        );
        this.held.plane.setFromNormalAndCoplanarPoint(
          this.bench.camera.getWorldDirection(new THREE.Vector3()),
          this.held.point,
        );
      }
      this.emit(`${part.label} separated. Move it to the tray and release.`);
    } else this.emit();
  }
  moveHeldTo(position) {
    const held = this.held;
    if (!held) return;
    position.x = THREE.MathUtils.clamp(position.x, -0.34, 0.35);
    position.z = THREE.MathUtils.clamp(position.z, -0.23, 0.23);
    position.y = THREE.MathUtils.clamp(position.y, 0.022, 0.24);
    held.part.group.position.copy(position);
    held.part.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(held.part.group);
    const floor =
      Math.abs(position.x - PLATFORM.x) < PLATFORM.halfWidth &&
      Math.abs(position.z) < PLATFORM.halfDepth
        ? PLATFORM.top + 0.002
        : 0;
    if (box.min.y < floor) held.part.group.position.y += floor - box.min.y;
    this.physics.move(
      held.id,
      held.part.group.position,
      held.part.group.quaternion,
    );
    held.part.group.updateMatrixWorld(true);
    held.point.copy(held.part.group.localToWorld(held.anchorLocal.clone()));
    held.offset.copy(held.point).sub(held.part.group.position);
    this.bench.toolAt(
      "hand",
      held.point,
      new THREE.Vector3(0.2, 1, 0.2).normalize(),
      true,
    );
  }
  moveHeld(dx, dy, dz) {
    if (!this.held) return;
    if (!this.states[this.held.id].detached) {
      this.peel(
        this.held.part,
        THREE.MathUtils.clamp(
          this.states[this.held.id].bend + (dx + dy - dz) * 0.12,
          0,
          1,
        ),
        new THREE.Vector3(-1, 0, 0.2),
      );
      return;
    }
    this.moveHeldTo(
      this.held.part.group.position
        .clone()
        .add(new THREE.Vector3(dx, dy, dz).multiplyScalar(0.009)),
    );
  }
  rotateHeld(direction) {
    if (!this.held) return;
    if (!this.states[this.held.id].detached) return;
    this.held.part.group.rotateY((direction * Math.PI) / 12);
    this.moveHeldTo(this.held.part.group.position.clone());
  }
  endGrab() {
    const held = this.held;
    if (!held) return;
    const state = this.states[held.id];
    if (state.detached) this.physics.release(held.id);
    else this.settling.set(held.id, state.separation * 0.45);
    this.held = null;
    this.bench.controls.enabled = true;
    this.bench.host.classList.remove("is-holding");
    this.bench.restTools();
    this.history.push(this.operationBefore);
    if (held.id === "section" && this.sectionMoved)
      this.selected =
        this.available().find((p) => !this.states[p.id].detached)?.id ??
        "section";
    this.emit(
      state.detached
        ? `${held.part.label} placed.`
        : "The layer is still attached. Grasp its edge to continue peeling.",
    );
  }
  primaryAction() {
    if (this.tool === "scalpel") {
      if (this.cutOpen) this.setTool("hand");
      else this.traceSeam();
      return;
    }
    if (this.tool !== "hand") return;
    if (this.held) {
      if (this.states[this.held.id].detached) this.endGrab();
      else
        this.peel(
          this.held.part,
          Math.min(1, this.states[this.held.id].bend + 0.28),
          new THREE.Vector3(-1, 0, 0.2),
        );
      return;
    }
    const id = this.available().some((p) => p.id === this.selected)
      ? this.selected
      : this.available()[0]?.id;
    if (!id) return;
    this.beginGrab(null, id);
    if (!this.held) return;
    if (this.states[id].detached) this.moveHeld(0, 3, 0);
    else
      this.peel(
        this.held.part,
        Math.min(1, this.states[id].bend + 0.28),
        new THREE.Vector3(-1, 0, 0.2),
      );
  }
  placeInTray() {
    if (!this.held || !this.states[this.held.id].detached) return;
    const placed = [...this.physics.bodies.keys()].length - 1;
    const center = new THREE.Box3()
      .setFromObject(this.held.part.group)
      .getCenter(new THREE.Vector3());
    const offset = center.sub(this.held.part.group.position);
    // Keep the collection area visible to the left of the smaller platform,
    // clear of the resting instruments. Bent pieces have different local centers.
    const target = new THREE.Vector3(
      -0.23 - (placed % 2) * 0.025,
      0.08,
      -0.025 + Math.floor(placed / 2) * 0.03,
    ).sub(offset);
    this.moveHeldTo(target);
    this.endGrab();
  }
  cancel() {
    if (this.held || this.cutting || this.autoCut) {
      this.restore(this.operationBefore);
      this.emit("Operation cancelled.");
    }
  }
  undo() {
    if (this.held || this.cutting || this.autoCut) {
      this.cancel();
      return;
    }
    const old = this.history.pop();
    if (old) {
      this.restore(old);
      this.emit("Last operation undone.");
    }
  }
  reset() {
    this.gesturePinchHeld=false;
    this.restore(this.initial);
    this.history.clear();
    this.hints = false;
    this.tool = "inspect";
    this.bench.setTool("inspect");
    this.bench.home();
    this.emit("Bench reset.");
  }
  update(dt) {
    this.physics.syncSpecimen(this.onion.parts, this.states);
    for (const [id, target] of this.settling) {
      const state = this.states[id];
      state.bend = matchMedia("(prefers-reduced-motion: reduce)").matches
        ? target
        : THREE.MathUtils.damp(state.bend, target, 11, dt);
      this.onion.deform(
        this.onion.parts.get(id),
        state.bend,
        new THREE.Vector3(...state.direction),
      );
      if (Math.abs(state.bend - target) < 0.001) this.settling.delete(id);
    }
    // The epidermis follows its carrier until it is itself peeled free.
    if (this.states["layer-1"].detached && !this.states.epidermis.detached) {
      const e = this.onion.parts.get("epidermis"),
        carrier = this.onion.parts.get("layer-1");
      e.group.visible = true;
      if (!this.membraneReady) {
        this.onion.prepareMembrane(
          this.states["layer-1"].bend,
          new THREE.Vector3(...this.states["layer-1"].direction),
        );
        this.onion.deform(
          e,
          this.states.epidermis.bend,
          new THREE.Vector3(...this.states.epidermis.direction),
        );
        this.membraneReady = true;
      }
      e.group.position.copy(carrier.group.position);
      e.group.quaternion.copy(carrier.group.quaternion);
    }
    this.onion.cutLine.visible = !this.sectionMoved;
    this.onion.guide.visible =
      !this.cutOpen &&
      (this.hints ||
        this.cutting ||
        (this.tool === "scalpel" && Boolean(this.hover)));
    const available = this.available(),
      part =
        this.hover && available.includes(this.hover.part)
          ? this.hover.part
          : available.find((p) => p.id === this.selected);
    const marker = this.onion.graspMarker;
    marker.visible =
      this.tool === "hand" &&
      !this.held &&
      Boolean(part) &&
      (this.hints || Boolean(this.hover));
    if (marker.visible) {
      marker.position.copy(this.graspPoint(part));
      marker.lookAt(this.bench.camera.position);
    }
  }
  project(point) {
    const p = point.clone().project(this.bench.camera);
    return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
  }
  getDebug() {
    this.bench.camera.updateMatrixWorld(true);
    return {
      state: this.getState(),
      seam: this.onion.guidePoints.map((p) => this.project(p)),
      graspPoints: Object.fromEntries(
        this.available().map((p) => [p.id, this.project(this.graspPoint(p))]),
      ),
      positions: Object.fromEntries(
        [...this.onion.parts].map(([id, p]) => [
          id,
          p.group.position.toArray(),
        ]),
      ),
      bounds: Object.fromEntries([...this.onion.parts].map(([id,part])=>{
        const box=new THREE.Box3().setFromObject(part.group,true);
        return [id,{min:box.min.toArray(),max:box.max.toArray()}];
      })),
      drawCalls: this.bench.renderer.info.render.calls,
      triangles: this.bench.renderer.info.render.triangles,
    };
  }
}
