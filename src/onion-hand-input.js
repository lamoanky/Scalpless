import { GestureTracker } from "../gestures.js";
import { assignHands, rotateCameraResult } from "../hand-pose.js";
import { assessHand, VisibilityGuard } from "../tracking-quality.js";

const clamp = (n) => Math.max(0, Math.min(1, n));

// Keep the branch's recognizer, but target the onion canvas, not the sandbox's
// differently scaled world. Ray contact and tissue constraints stay in the lab.
export class OnionHandInput {
  constructor(emit) {
    this.emit = emit;
    this.movementSensitivity = 1.5;
    this.rotation = 0;
    this.visibility = new VisibilityGuard();
    this.previous = {};
    this.lastSeen = -Infinity;
    this.tracker = new GestureTracker((type, detail) =>
      this.emit(type, this.mapDetail(detail)),
    );
  }
  mapDetail(detail) {
    const mapped = { ...detail, source: "webcam" };
    if (Number.isFinite(detail.x))
      mapped.x = clamp(0.5 + (detail.x - 0.5) * this.movementSensitivity);
    if (Number.isFinite(detail.y))
      mapped.y = clamp(0.5 + (detail.y - 0.5) * this.movementSensitivity);
    return mapped;
  }
  reset() {
    const state = this.tracker.reset();
    this.visibility.reset();
    this.previous = {};
    this.lastSeen = -Infinity;
    return state;
  }
  update(result, now, aspect = 4 / 3) {
    const rotated = rotateCameraResult(result, this.rotation);
    const entries = (rotated.landmarks || [])
      .map((points, i) => ({
        points,
        world: rotated.worldLandmarks?.[i],
        label: rotated.handedness?.[i]?.[0]?.categoryName,
      }))
      .filter(
        ({ points }) =>
          points.length === 21 &&
          points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      );
    if (!entries.length) return this.reset();
    if (now - this.lastSeen > 300) this.previous = {};
    const hands = entries.map((h) => h.points);
    const labels = assignHands(
      hands,
      entries.map((h) => h.label),
      this.previous,
    );
    const imageAspect = this.rotation % 2 ? 1 / aspect : aspect;
    const held = hands.map((hand, i) =>
      this.visibility.update(labels[i], assessHand(hand, imageAspect), now),
    );
    labels.forEach((label, i) => {
      this.previous[label] = { ...hands[i][0] };
    });
    this.lastSeen = now;
    const state = this.tracker.update(
      hands,
      now,
      labels,
      held,
      [],
      entries.map((h) => h.world),
      imageAspect,
    );
    return {
      ...state,
      point: state.point ? this.mapDetail(state.point) : null,
    };
  }
}
