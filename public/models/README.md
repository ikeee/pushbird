# Hair segmentation model

Official MediaPipe hair segmenter; local inference only, frames are not uploaded.
Source: https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/latest/hair_segmenter.tflite
Downloaded 2026-11-17; the local bytes are pinned (not fetched from latest at runtime).
Size: 781618 bytes.
SHA256: 2628cf3ce5f695f604cbea2841e00befcaa3624bf80caf3664bef2656d59bf84
Embedded labels.txt inspected locally: background (0), hair (1).
Runtime: @mediapipe/tasks-vision 0.10.32, Apache-2.0.
Official guide: https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter

The runtime's WASM is copied from node_modules by predev/prebuild, not a CDN.
The model has no guarantee of accurate hair boundaries for every person, hat,
hairstyle, light condition, or occlusion. The UI explicitly labels fallback.

## 2026-11-17: active forehead tracking model

The SCORE card now uses FaceLandmarker, not the hair model above (retained as
an earlier artifact; no longer loaded by the app).
Source: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
Local file: face_landmarker.task, 3758596 bytes.
SHA256: 64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff
Runtime remains @mediapipe/tasks-vision 0.10.32; CPU, one face, VIDEO mode.
Forehead anchor: face-mesh point 151, on the central forehead midline.
Canonical geometry checked against:
https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj
Official API: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js
This is a model-estimated landmark, not a physical marker measurement.
