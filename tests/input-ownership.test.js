import test from "node:test";
import assert from "node:assert/strict";
import { installInput } from "../src/input.js";

test("only the selected source can move, grab, cut or zoom; mouse intent takes over", () => {
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  try {
    const calls = [];
    const lab = {
      tool: "inspect",
      held: null,
      cutOpen: true,
      move: () => calls.push("move"),
      beginGrab: () => calls.push("grab"),
      endGrab: () => calls.push("release"),
      beginCut: () => calls.push("cut"),
      endCut: () => calls.push("cutend"),
      setTool(tool) {
        this.tool = tool;
      },
      cancel: () => {},
      instrumentAt: () => null,
    };
    const canvas = new EventTarget();
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    });
    const bench = {
      renderer: { domElement: canvas },
      host: { focus() {} },
      zoom: () => calls.push("zoom"),
      restTools: () => {},
    };
    const input = installInput(lab, bench);
    const send = (type, source = "webcam", extra = {}) =>
      window.dispatchEvent(
        new CustomEvent(type, { detail: { source, x: 0.5, y: 0.5, ...extra } }),
      );
    send("input:cutstart");
    send("input:pinchstart");
    send("input:zoom", "webcam", { delta: 1 });
    assert.deepEqual(calls, []);
    input.setSource("webcam");
    calls.length = 0;
    send("input:move", "mouse");
    assert.deepEqual(calls, []);
    send("input:cutstart");
    send("input:move");
    send("input:cutend");
    send("input:pinchstart");
    send("input:pinchend");
    send("input:zoom", "webcam", { delta: 1 });
    assert.deepEqual(calls, [
      "cut",
      "move",
      "cutend",
      "grab",
      "release",
      "zoom",
    ]);
    input.onTakeover(() => input.setSource("pointer"));
    lab.tool = "inspect";
    canvas.dispatchEvent(
      Object.assign(new Event("pointerdown"), {
        button: 0,
        clientX: 50,
        clientY: 50,
      }),
    );
    assert.equal(input.source, "pointer");
    calls.length = 0;
    send("input:move");
    send("input:cutstart");
    assert.deepEqual(calls, []);
    send("input:move", "mouse");
    assert.deepEqual(calls, ["move"]);
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
  }
});
