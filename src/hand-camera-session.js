// Camera lifetime is separate from recognition and the lab controller. A late
// permission/model promise cannot revive a stopped session or retain a stream.
export class HandCameraSession {
  constructor({
    video,
    input,
    loadModel,
    requestCamera,
    onFrame = () => {},
    onStatus = () => {},
    onActive = () => {},
    schedule = (fn) => requestAnimationFrame(fn),
    unschedule = (id) => cancelAnimationFrame(id),
    now = () => performance.now(),
  }) {
    Object.assign(this, {
      video,
      input,
      loadModel,
      requestCamera,
      onFrame,
      onStatus,
      onActive,
      schedule,
      unschedule,
      now,
    });
    this.running = false;
    this.pending = false;
    this.generation = 0;
    this.model = null;
    this.stream = null;
    this.frame = null;
    this.lastVideoTime = -1;
    this.lastInference = -Infinity;
    this.disposed = false;
  }
  async start(deviceId = "") {
    if (this.pending || this.running || this.disposed) return;
    const generation = ++this.generation;
    this.pending = true;
    this.onStatus("Loading hand tracking…", "loading");
    try {
      if (!this.model) {
        this.modelPromise ??= this.loadModel().catch((error) => {
          // A cancelled load may fail after stop(); don't cache that rejection
          // and make the next explicit retry fail without attempting a load.
          this.modelPromise = null;
          throw error;
        });
        const model = await this.modelPromise;
        if (this.disposed) {
          model.close();
          return;
        }
        this.model = model;
      }
      if (generation !== this.generation) return;
      this.onStatus("Allow camera access to use hand controls.", "permission");
      const stream = await this.requestCamera({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          ...(deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: "user" }),
        },
        audio: false,
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      if (generation !== this.generation) return;
      stream.getVideoTracks().forEach((track) =>
        track.addEventListener("ended", () => {
          if (this.stream === stream)
            this.stop("Camera disconnected. Choose a camera and retry.");
        }),
      );
      this.input.reset();
      this.running = true;
      this.lastVideoTime = -1;
      this.lastInference = this.lastNewFrame = this.now();
      this.onActive(true);
      this.onStatus("Camera on · hold a hand in view.", "running");
      this.frame = this.schedule((now) => this.tick(now));
    } catch (error) {
      if (generation !== this.generation) return;
      this.modelPromise = null;
      this.stop();
      const messages = {
        NotAllowedError:
          "Camera permission denied. Allow camera access in your browser and retry.",
        NotFoundError: "No camera found. Connect a webcam and retry.",
        NotReadableError: "Camera is busy. Close other camera apps and retry.",
        OverconstrainedError:
          "This camera is unavailable. Choose another camera.",
        SecurityError: "Camera access needs localhost or HTTPS.",
      };
      this.onStatus(
        messages[error.name] ||
          "Hand tracking could not start. Retry or use the mouse.",
        "error",
      );
    } finally {
      if (generation === this.generation) this.pending = false;
    }
  }
  tick(now) {
    if (!this.running) return;
    try {
      // Bound inference to 24 Hz so the 3D bench keeps its own render budget.
      if (
        this.video.readyState >= 2 &&
        this.video.currentTime !== this.lastVideoTime &&
        now - this.lastInference >= 1000 / 24
      ) {
        this.lastVideoTime = this.video.currentTime;
        this.lastInference = this.lastNewFrame = now;
        const result = this.model.detectForVideo(this.video, now);
        const state = this.input.update(
          result,
          now,
          this.video.videoWidth / this.video.videoHeight,
        );
        this.onFrame(state, result);
      } else if (now - this.lastNewFrame > 400) {
        this.onFrame(this.input.reset(), { landmarks: [] });
        this.lastNewFrame = now;
      }
      this.frame = this.schedule((time) => this.tick(time));
    } catch {
      this.stop("Hand tracking stopped. Retry or continue with the mouse.");
    }
  }
  stop(message = "Camera off · mouse and keyboard ready.") {
    ++this.generation;
    this.pending = false;
    this.running = false;
    this.unschedule(this.frame);
    this.input.reset();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.onFrame({ mode: "idle", hands: 0 }, { landmarks: [] });
    this.onActive(false);
    this.onStatus(message, "off");
  }
  dispose() {
    this.disposed = true;
    this.stop();
    this.model?.close();
    this.model = null;
  }
}
