import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { getForeheadCenter } from './forehead.js';

let detector;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const fileset = await FilesetResolver.forVisionTasks(data.wasmPath);
      detector = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: data.modelPath, delegate: 'CPU' },
        runningMode: 'VIDEO', numFaces: 1,
        outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
        canvas: new OffscreenCanvas(320, 320),
      });
      self.postMessage({ type: 'ready' });
    } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
    return;
  }
  if (data.type !== 'frame') return;
  try {
    if (!detector) throw new Error('Face model not ready');
    const result = detector.detectForVideo(data.image, data.timestamp);
    self.postMessage({ type: 'result', anchor: getForeheadCenter(result.faceLandmarks[0]) });
  } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
  finally { data.image.close(); }
};
