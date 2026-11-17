import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const source = new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url);
const target = new URL('../public/vision/wasm/', import.meta.url);
await mkdir(target, { recursive: true });
for (const name of await readdir(source)) if (/\.(js|wasm)$/.test(name)) await copyFile(new URL(name, source), new URL(name, target));
// MediaPipe's classic WASM loader uses importScripts, unavailable in module workers.
// Bundle our own worker as a classic IIFE instead of patching third-party WASM JS.
await build({ entryPoints: [fileURLToPath(new URL('../src/face-worker.js', import.meta.url))],
  outfile: fileURLToPath(new URL('../public/vision/face-worker.js', import.meta.url)),
  bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true });
console.log('Prepared pinned local MediaPipe runtime and classic face worker.');
