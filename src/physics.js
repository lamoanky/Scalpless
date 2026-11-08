import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { PLATFORM } from "./lab-environment.js";

export async function createPhysics() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  world.lengthUnit = 0.1;
  world.integrationParameters.numSolverIterations = 8;
  function fixedBox(x, y, z, hx, hy, hz) {
    const d = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z)
      .setFriction(0.75)
      .setRestitution(0.015);
    world.createCollider(d);
  }
  fixedBox(0, -0.009, 0, 1, 0.006, 1);
  // The flat two-tier platform has the same collision top as its visible cap.
  fixedBox(
    PLATFORM.x,
    0.0095,
    0,
    PLATFORM.halfWidth,
    0.0125,
    PLATFORM.halfDepth,
  );
  const bodies = new Map();
  let specimenKey = "",
    specimenColliders = [];
  function createBody(part, held = false) {
    remove(part.id);
    const positions = [];
    for (const mesh of part.meshes) {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 3)
        positions.push(p.getX(i), p.getY(i), p.getZ(i));
    }
    let collider = RAPIER.ColliderDesc.convexHull(new Float32Array(positions));
    if (!collider) {
      const box = new THREE.Box3().setFromObject(part.group);
      const s = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      collider = RAPIER.ColliderDesc.cuboid(
        Math.max(0.002, s.x),
        Math.max(0.002, s.y),
        Math.max(0.002, s.z),
      );
    }
    collider
      .setDensity(part.id === "section" ? 800 : 240)
      .setFriction(0.8)
      .setRestitution(0.015);
    const desc = (
      held
        ? RAPIER.RigidBodyDesc.kinematicPositionBased()
        : RAPIER.RigidBodyDesc.dynamic()
    )
      .setTranslation(...part.group.position.toArray())
      .setRotation(part.group.quaternion)
      .setLinearDamping(2.5)
      .setAngularDamping(5)
      .setCcdEnabled(true);
    const body = world.createRigidBody(desc);
    if (part.compoundCollider && part.collisionGeometries) {
      for (const geometry of part.collisionGeometries) {
        const points = geometry.attributes.position;
        const vertices = [];
        for (let i = 0; i < points.count; i += 3)
          vertices.push(points.getX(i), points.getY(i), points.getZ(i));
        const component = RAPIER.ColliderDesc.convexHull(
          new Float32Array(vertices),
        );
        if (component)
          world.createCollider(
            component.setDensity(240).setFriction(0.8).setRestitution(0.015),
            body,
          );
      }
    } else if (Number.isInteger(part.layer) && !part.fixed) {
      // Several small convex patches preserve a peeled shell's concavity.
      const p = part.meshes[0].geometry.attributes.position,
        innerOffset = 43 * 49;
      for (let row = 0; row < 42; row += 7)
        for (let col = 0; col < 48; col += 8) {
          const vertices = [];
          for (const side of [0, innerOffset])
            for (const r of [row, row + 3, row + 7])
              for (const c of [col, col + 4, col + 8]) {
                const i = side + r * 49 + c;
                vertices.push(p.getX(i), p.getY(i), p.getZ(i));
              }
          const patch = RAPIER.ColliderDesc.convexHull(
            new Float32Array(vertices),
          );
          if (patch)
            world.createCollider(
              patch.setDensity(240).setFriction(0.85).setRestitution(0),
              body,
            );
        }
    } else world.createCollider(collider, body);
    bodies.set(part.id, { body, part });
    return body;
  }
  function remove(id) {
    const item = bodies.get(id);
    if (item) {
      world.removeRigidBody(item.body);
      bodies.delete(id);
    }
  }
  function hold(part) {
    const item = bodies.get(part.id);
    if (!item) return createBody(part, true);
    item.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    item.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    item.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    return item.body;
  }
  function release(id) {
    const item = bodies.get(id);
    if (!item) return;
    item.body.setTranslation(item.part.group.position, true);
    item.body.setRotation(item.part.group.quaternion, true);
    item.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    item.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    item.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
  function move(id, position, quaternion) {
    const item = bodies.get(id);
    if (!item) return;
    item.body.setNextKinematicTranslation(position);
    item.body.setNextKinematicRotation(quaternion);
  }
  function step() {
    world.step();
    for (const { body, part } of bodies.values()) {
      const p = body.translation(),
        q = body.rotation();
      part.group.position.set(p.x, p.y, p.z);
      part.group.quaternion.set(q.x, q.y, q.z, q.w);
    }
  }
  function syncSpecimen(specimen, states) {
    const attached = specimen.colliderParts(states);
    const key = specimen.id + attached.map((p) => p.id).join();
    if (key === specimenKey) return;
    specimenKey = key;
    for (const collider of specimenColliders)
      world.removeCollider(collider, true);
    specimenColliders = [];
    for (const part of attached) {
      // A hollow body uses one hull per component so its cavity stays open.
      const collisionMeshes =
        part.collisionGeometries?.map((geometry) => ({
          geometry,
          userData: {},
        })) ?? part.meshes;
      const groups = part.compoundCollider
        ? collisionMeshes.map((m) => [m])
        : [collisionMeshes];
      for (const meshes of groups) {
        const vertices = [];
        for (const mesh of meshes) {
          if (mesh.userData.noCollision) continue;
          const rest =
            mesh.geometry.userData.rest ??
            mesh.geometry.attributes.position.array;
          for (let i = 0; i < rest.length; i += 9)
            vertices.push(rest[i], rest[i + 1], rest[i + 2]);
        }
        if (vertices.length < 12) continue;
        const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(vertices));
        if (desc) {
          desc
            .setTranslation(...part.initialPosition.toArray())
            .setFriction(0.75);
          specimenColliders.push(world.createCollider(desc));
        }
      }
    }
  }
  function clear() {
    for (const id of [...bodies.keys()]) remove(id);
  }
  return {
    world,
    bodies,
    createBody,
    remove,
    hold,
    release,
    move,
    step,
    clear,
    syncSpecimen,
  };
}
