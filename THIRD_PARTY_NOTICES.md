# Third-party notices and asset provenance

The project has no project-wide license declaration yet. The items below retain
their upstream terms; public repository visibility does not relicense them.

## Runtime and tools

- MediaPipe Tasks Vision 0.10.32: Apache-2.0, https://github.com/google-ai-edge/mediapipe
- MediaPipe Pose browser runtime: loaded on demand from the official npm package
  through jsDelivr, https://www.npmjs.com/package/@mediapipe/pose
- Vite 5.4.10: MIT, https://github.com/vitejs/vite
- esbuild 0.21.5: MIT, https://github.com/evanw/esbuild
- Playwright 1.64.1: Apache-2.0, https://github.com/microsoft/playwright

Dependency license texts are supplied by the installed packages and their
upstream repositories. Their versions are recorded in package-lock.json.

## Models

The active FaceLandmarker model is downloaded from the official MediaPipe host
by scripts/setup-models.mjs; it is not committed to this repository.
Source URLs, byte lengths, SHA256 hashes and the previous inactive hair model
are documented in public/models/README.md.

- FaceLandmarker documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker
- Canonical face geometry used to inspect landmark 151:
  https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj

## Fonts

Press Start 2P and ZCOOL KuaiLe are requested from Google Fonts at runtime.
Font licenses and project records are available from their upstream directories:

- https://github.com/google/fonts/tree/main/ofl/pressstart2p
- https://github.com/google/fonts/tree/main/ofl/zcoolkuaile

## Music and graphics

public/audio/pushbird-breeze.mp3 is a procedural instrumental created for this
project, with no downloaded recordings or third-party audio samples. The
arrangement is in scripts/make_music.py. The synthesis primitives in
scripts/audio_lib.py were reused from the code-motion-video skill; provenance
is retained in the file and public/audio/README.md without assigning an
additional license to those primitives.

The bird and pipes are drawn using Canvas primitives. The local project mark
is public/pushbird-mark.svg. No private session-hosted logo, camera frames,
portrait fixtures or test screenshots are part of this release.
