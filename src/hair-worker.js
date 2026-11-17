import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { findHairCrown } from './hair-anchor.js';

let segmenter;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const fileset = await FilesetResolver.forVisionTasks(data.wasmPath);
      segmenter = await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: data.modelPath, delegate: 'CPU' },
        runningMode: 'VIDEO', outputCategoryMask: true, outputConfidenceMasks: false,
        canvas: new OffscreenCanvas(256, 256),
      });
      self.postMessage({ type: 'ready' });
    } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
    return;
  }
  if (data.type !== 'frame') return;
  let result;
  try {
    if (!segmenter) throw new Error('Hair model not ready');
    result = segmenter.segmentForVideo(data.image, data.timestamp);
    const mask = result.categoryMask;
    const anchor = mask ? findHairCrown(mask.getAsUint8Array(), mask.width, mask.height, data.nose) : null;
    self.postMessage({ type: 'result', anchor });
  } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
  finally { result?.close(); data.image.close(); }
};
