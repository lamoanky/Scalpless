# Hand tracking model

`hand_landmarker.task` is the MediaPipe Hand Landmarker float16 model, version 1,
downloaded from Google's published model distribution:

https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task

Integration and model information: [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js).

The SDK and WASM are bundled from the pinned `@mediapipe/tasks-vision` npm package
(0.10.22-rc.20250304, Apache-2.0), matching the merged gesture branch. The runtime
and model load only after Start camera. Camera frames are processed in the browser.
