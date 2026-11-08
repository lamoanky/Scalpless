import test from "node:test";
import assert from "node:assert/strict";
import { HandCameraSession } from "../src/hand-camera-session.js";
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
function fixture(overrides = {}) {
  const records = {
    resets: 0,
    updates: 0,
    closed: 0,
    stops: 0,
    status: [],
    active: [],
    requests: [],
  };
  const track = {
    readyState: "live",
    stop() {
      this.readyState = "ended";
      records.stops++;
    },
    addEventListener(type, fn) {
      this[type] = fn;
    },
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const video = {
    srcObject: null,
    readyState: 2,
    currentTime: 1,
    videoWidth: 640,
    videoHeight: 480,
    play: async () => {},
  };
  const model = {
    detectForVideo: () => ({ landmarks: [] }),
    close: () => records.closed++,
  };
  const session = new HandCameraSession({
    video,
    input: {
      reset() {
        records.resets++;
        return { hands: 0 };
      },
      update() {
        records.updates++;
        return { hands: 0 };
      },
    },
    loadModel: async () => model,
    requestCamera: async (c) => {
      records.requests.push(c);
      return stream;
    },
    schedule: () => 1,
    unschedule: () => {},
    now: () => 0,
    onStatus: (...s) => records.status.push(s),
    onActive: (a) => records.active.push(a),
    ...overrides,
  });
  return { session, records, track, stream, video, model };
}
test("camera starts explicitly, never requests audio, and stop releases every resource", async () => {
  const f = fixture();
  assert.equal(f.records.requests.length, 0);
  await f.session.start("usb-camera");
  assert(f.session.running);
  assert.equal(f.records.requests[0].audio, false);
  assert.deepEqual(f.records.requests[0].video.deviceId, {
    exact: "usb-camera",
  });
  f.session.stop();
  assert.equal(f.track.readyState, "ended");
  assert.equal(f.video.srcObject, null);
  assert(!f.session.running);
  assert.equal(f.records.active.at(-1), false);
  f.session.dispose();
  assert.equal(f.records.closed, 1);
});
test("cancel during model loading never requests or starts a camera", async () => {
  const d = deferred();
  let requests = 0;
  const f = fixture({
    loadModel: () => d.promise,
    requestCamera: () => {
      requests++;
    },
  });
  const start = f.session.start();
  f.session.stop();
  d.resolve(f.model);
  await start;
  assert.equal(requests, 0);
  assert(!f.session.pending);
  assert(!f.session.running);
});
test("late camera permission after cancellation stops the returned track", async () => {
  const d = deferred();
  const f = fixture({ requestCamera: () => d.promise });
  const start = f.session.start();
  await Promise.resolve();
  await Promise.resolve();
  f.session.stop();
  d.resolve(f.stream);
  await start;
  assert.equal(f.track.readyState, "ended");
  assert.equal(f.video.srcObject, null);
  assert(!f.session.running);
});
test("permission denial offers retry and never takes input ownership", async () => {
  const f = fixture({
    requestCamera: async () => {
      throw new DOMException("no", "NotAllowedError");
    },
  });
  await f.session.start();
  assert(!f.session.running);
  assert(!f.session.pending);
  assert.equal(f.records.status.at(-1)[1], "error");
  assert.match(f.records.status.at(-1)[0], /permission denied/);
  assert(!f.records.active.includes(true));
  f.session.requestCamera = async () => f.stream;
  await f.session.start();
  assert(f.session.running);
  f.session.stop();
});
test("stalled frames clear gestures and disconnect stops camera ownership", async () => {
  const f = fixture();
  await f.session.start();
  f.session.tick(50);
  assert.equal(f.records.updates, 1);
  const resets = f.records.resets;
  f.session.tick(500);
  assert(f.records.resets > resets);
  f.track.ended();
  assert(!f.session.running);
  assert.equal(f.records.active.at(-1), false);
});
test("dispose while loading closes the late model without activating it", async () => {
  const d = deferred();
  const f = fixture({ loadModel: () => d.promise });
  const start = f.session.start();
  f.session.dispose();
  d.resolve(f.model);
  await start;
  assert.equal(f.records.closed, 1);
  assert(!f.session.running);
});

test("a failed cancelled model load does not poison the next retry", async () => {
  let reject,
    attempts = 0;
  const loading = new Promise((_, fail) => {
    reject = fail;
  });
  const f = fixture({
    loadModel: () => (++attempts === 1 ? loading : Promise.resolve(f.model)),
  });
  const start = f.session.start();
  f.session.stop();
  reject(new Error("interrupted model load"));
  await start;
  await f.session.start();
  assert.equal(attempts, 2);
  assert(f.session.running);
  f.session.stop();
});
