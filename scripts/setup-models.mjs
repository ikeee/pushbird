import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';

const directory = new URL('../public/models/', import.meta.url);
const target = new URL('face_landmarker.task', directory);
const expected = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
const source = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(directory, { recursive: true });
let present;
try { present = await readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (present) {
  if (digest(present) !== expected) throw new Error('Existing face model checksum differs; original file preserved.');
  console.log('Face model is present and SHA256 verified.');
} else {
  console.log('Downloading the pinned face model from the official MediaPipe host...');
  const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Face model download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== expected) throw new Error('Downloaded face model checksum differs; file not installed.');
  const temporary = new URL(`face_landmarker.task.download-${randomUUID()}`, directory);
  try { await writeFile(temporary, bytes, { flag: 'wx' }); await rename(temporary, target); }
  finally { await rm(temporary, { force: true }); }
  console.log(`Face model installed and SHA256 verified (${bytes.length} bytes).`);
}
