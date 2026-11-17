import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifactDir = process.env.PUSHBIRD_TEST_ARTIFACTS;
let browser;
let server;
let origin;
let serverLog = '';

before(async () => {
  const portProbe = createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const { port } = portProbe.address();
  await new Promise(resolve => portProbe.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { serverLog += chunk; });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Vite exited: ${serverLog}`);
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (attempt === 99) throw new Error(`Vite startup timed out: ${serverLog}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.PUSHBIRD_CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  if (artifactDir) await mkdir(artifactDir, { recursive: true });
});

after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }
});

async function openGame(t, { pose = 'missing', camera = 'denied', viewport = { width: 1280, height: 800 }, touch = false, sdkDelay = 0, clock = false } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: touch });
  t.after(() => context.close());
  const page = await context.newPage();
  if (clock) await page.clock.install();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no uncaught application errors'));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.route('https://cdn.jsdelivr.net/**', async route => {
    if (sdkDelay) await new Promise(resolve => setTimeout(resolve, sdkDelay));
    await route.fulfill({ body: '', contentType: 'text/javascript' }).catch(() => {});
  });
  await page.addInitScript(({ pose, camera }) => {
    window.__fixture = { requests: 0, instances: 0, sends: 0, closed: 0, onResults: null, stream: null };
    // Replace only the expensive face-landmark inference boundary, not HUD positioning.
    window.Worker = class {
      constructor() { window.__fixture.faceWorker = this; }
      postMessage(message) {
        if (message.type === 'init') queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }));
        if (message.type === 'frame') { message.image.close(); window.__fixture.faceFrames = (window.__fixture.faceFrames || 0) + 1; }
      }
      terminate() { window.__fixture.faceStopped = true; }
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      window.__fixture.requests++;
      if (camera === 'denied') throw new DOMException('Permission denied', 'NotAllowedError');
      if (camera === 'pending') await new Promise(resolve => { window.__fixture.resolveCamera = resolve; });
      const source = document.createElement('canvas');
      source.width = 320; source.height = 240;
      source.getContext('2d').fillRect(0, 0, 320, 240);
      window.__fixture.source = source;
      window.__fixture.stream = source.captureStream(10);
      return window.__fixture.stream;
    } } });
    if (pose !== 'missing') window.Pose = class {
      constructor() { window.__fixture.instances++; if (pose === 'constructor-error') throw new Error('Model unavailable'); }
      setOptions() { if (pose === 'options-error') return Promise.reject(new Error('Options failed')); }
      onResults(callback) { window.__fixture.onResults = callback; }
      async send() {
        window.__fixture.sends++;
        if (pose === 'send-error') throw new Error('Inference failed');
      }
      close() { window.__fixture.closed++; return Promise.resolve(); }
    };
  }, { pose, camera });
  await page.goto(origin, { waitUntil: sdkDelay ? 'commit' : 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#camera-status')?.textContent === '准备摄像头', { timeout: 2000 });
  return page;
}

async function start(page) {
  await page.locator('#sound-button').click();
  await page.locator('#start-button').click();
  await page.locator('#countdown-panel').waitFor({ state: 'hidden' });
}

async function birdPosition(page) {
  return page.locator('#game-canvas').evaluate(canvas => {
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    const width = canvas.width;
    const pixels = canvas.getContext('2d').getImageData(0, 0, width, canvas.height).data;
    let totalX = 0, totalY = 0, count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] === 255 && pixels[i + 1] === 212 && pixels[i + 2] === 81) {
        totalX += (i / 4) % width; totalY += Math.floor(i / 4 / width); count++;
      }
    }
    if (!count) throw new Error('Bird pixels not found');
    return { x: totalX / count / scale, y: totalY / count / scale };
  });
}
async function birdY(page) { return (await birdPosition(page)).y; }

async function startGuide(page) {
  await page.locator('#sound-button').click();
  await page.locator('#guide-button').click();
  await page.locator('#countdown-panel').waitFor({ state: 'hidden' });
  await page.clock.pauseAt(new Date(Date.now() + 100));
}

test('guided tempo shows three proportional phases and counts guide cycles without collision death', async t => {
  const page = await openGame(t, { clock: true });
  await startGuide(page);
  assert.equal(await page.locator('#tempo-panel').getAttribute('data-phase'), 'down');
  assert.match(await page.locator('#tempo-phase').innerText(), /慢下/);
  const widths = await page.locator('.tempo-segment').evaluateAll(segments => segments.map(s => s.getBoundingClientRect().width));
  assert.ok(Math.abs(widths[0] / widths[1] - 2) < .1);
  await page.clock.runFor(2100);
  assert.equal(await page.locator('#tempo-panel').getAttribute('data-phase'), 'hold');
  await page.clock.runFor(1000);
  assert.equal(await page.locator('#tempo-panel').getAttribute('data-phase'), 'up');
  await page.mouse.click(850, 112);
  await page.clock.runFor(2000);
  assert.equal(await page.locator('#side-score').innerText(), '01');
  assert.match(await page.locator('.score-caption').innerText(), /引导周期/);
  assert.match(await page.locator('#tempo-disclaimer').innerText(), /不代表.*俯卧撑/);
  assert.equal(await page.locator('#gameover-panel').isVisible(), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('pushbird.bestScore')), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('pushbird.tempoBest.2-1-2')), '1');
  if (artifactDir) await page.screenshot({ path: path.join(artifactDir, 'tempo-desktop.png') });
});

test('guide pause resume retry and finish preserve honest separate records', async t => {
  const page = await openGame(t, { clock: true });
  await page.evaluate(() => localStorage.setItem('pushbird.bestScore', '12'));
  await startGuide(page);
  await page.clock.runFor(5300);
  await page.locator('#tempo-pause').click();
  assert.equal(await page.locator('#tempo-panel').getAttribute('data-status'), 'paused');
  await page.clock.runFor(20000);
  assert.equal(await page.locator('#side-score').innerText(), '01');
  await page.locator('#tempo-pause').click();
  await page.clock.runFor(2400);
  assert.equal(await page.locator('#tempo-panel').getAttribute('data-phase'), 'down');
  assert.equal(await page.locator('#side-score').innerText(), '01');
  await page.locator('#tempo-retry').click();
  await page.clock.runFor(2400);
  assert.equal(await page.locator('#side-score').innerText(), '00');
  await page.locator('#tempo-finish').click();
  assert.equal(await page.locator('#gameover-panel h2').innerText(), '训练结束');
  assert.match(await page.locator('#gameover-message').innerText(), /引导周期/);
  await page.locator('#home-button').click();
  assert.equal(await page.locator('#intro-panel').isVisible(), true);
  await page.locator('#start-button').click();
  await page.clock.runFor(2400);
  assert.equal(await page.locator('.score-caption').innerText(), 'SCORE');
  assert.match(await page.locator('#personal-best').innerText(), /12/);
  assert.equal(await page.locator('#tempo-panel').isVisible(), false);
});

test('custom tempo rejects invalid durations and skips a zero pause on mobile', async t => {
  const page = await openGame(t, { clock: true, viewport: { width: 390, height: 844 }, touch: true });
  await page.locator('#tempo-setup summary').click();
  await page.locator('#tempo-preset').selectOption('custom');
  await page.locator('#tempo-down').fill('0');
  await page.locator('#guide-button').click();
  assert.equal(await page.locator('#countdown-panel').isVisible(), false);
  await page.locator('#tempo-down').fill('2');
  await page.locator('#tempo-hold').fill('0');
  await startGuide(page);
  await page.clock.runFor(2100);
  assert.equal(await page.locator('#tempo-panel').getAttribute('data-phase'), 'up');
  assert.equal(await page.locator('.tempo-segment[data-segment="hold"]').isVisible(), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  for (const selector of ['#tempo-pause', '#tempo-retry', '#tempo-finish']) {
    const box = await page.locator(selector).boundingBox();
    const layout = await page.evaluate(() => ({ x: scrollX, y: scrollY, stage: document.querySelector('.game-stage').getBoundingClientRect().toJSON(), shell: document.querySelector('.app-shell').scrollLeft }));
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 391 && box.y + box.height <= 844, `${selector}: ${JSON.stringify({box, layout})}`);
  }
  if (artifactDir) await page.screenshot({ path: path.join(artifactDir, 'tempo-mobile.png') });
});

test('opening notes and hiding the page pause the guide without catch-up cycles', async t => {
  const page = await openGame(t, { clock: true });
  await startGuide(page);
  await page.clock.runFor(1200);
  await page.locator('#tutorial-button').click();
  assert.equal(await page.locator('#tempo-panel').getAttribute('data-status'), 'paused');
  await page.locator('#close-tutorial').click();
  await page.clock.runFor(16000);
  assert.equal(await page.locator('#side-score').innerText(), '00');
  await page.locator('#tempo-pause').click();
  await page.clock.runFor(2400);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(30000);
  assert.equal(await page.locator('#tempo-panel').getAttribute('data-status'), 'paused');
  assert.equal(await page.locator('#side-score').innerText(), '00');
  assert.equal(await page.locator('#background-music').evaluate(a => a.paused), true);
});

test('tracking loss pauses an active camera guide and does not resume on a recovered point', async t => {
  const page = await openGame(t, { clock: true, pose: 'waiting', camera: 'available' });
  await startGuide(page);
  await page.evaluate(() => window.__fixture.onResults({ poseLandmarks: [{ x: .5, y: .5, visibility: 1 }] }));
  await page.clock.runFor(1500);
  assert.equal(await page.locator('#tempo-panel').getAttribute('data-status'), 'paused');
  assert.match(await page.locator('#tempo-phase').innerText(), /看不清/);
  await page.evaluate(() => window.__fixture.onResults({ poseLandmarks: [{ x: .5, y: .5, visibility: 1 }] }));
  await page.clock.runFor(400);
  assert.equal(await page.locator('#tempo-panel').getAttribute('data-status'), 'paused');
});

test('optional guide voice cues are not queued and muting cancels speech and restores music gain', async t => {
  const page = await openGame(t, { clock: true });
  await page.evaluate(() => {
    window.__voice = { spoken: [], canceled: 0 };
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speak(utterance) { window.__voice.spoken.push(utterance.text); },
      cancel() { window.__voice.canceled++; },
    } });
  });
  await page.locator('#tempo-setup summary').click();
  await page.locator('#tempo-voice').check();
  await page.locator('#guide-button').click();
  await page.locator('#countdown-panel').waitFor({ state: 'hidden' });
  await page.clock.pauseAt(new Date(Date.now() + 100));
  assert.equal(await page.evaluate(() => window.__voice.spoken.length), 1);
  assert.equal(await page.locator('#background-music').evaluate(a => a.volume), .08);
  await page.locator('#sound-button').click();
  assert.ok(await page.evaluate(() => window.__voice.canceled > 0));
  assert.equal(await page.locator('#background-music').evaluate(a => a.volume), .24);
  await page.clock.runFor(5200);
  assert.equal(await page.evaluate(() => window.__voice.spoken.length), 1);
});

test('interrupting guide preparation cancels its countdown and returning needs explicit preparation', async t => {
  const page = await openGame(t, { clock: true });
  await page.locator('#sound-button').click();
  await page.locator('#guide-button').click();
  await page.clock.pauseAt(new Date(Date.now() + 100));
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(12000);
  assert.equal(await page.locator('#countdown-panel').isVisible(), false);
  assert.equal(await page.locator('#tempo-panel').getAttribute('data-status'), 'paused');
  assert.equal(await page.locator('#side-score').innerText(), '00');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.locator('#tempo-panel').getAttribute('data-status'), 'paused');
  await page.locator('#tempo-pause').click();
  await page.clock.runFor(2400);
  assert.equal(await page.locator('#tempo-panel').getAttribute('data-phase'), 'down');
});

test('guide controls fit a short phone and preparation fields cannot start the game with Space', async t => {
  const page = await openGame(t, { clock: true, viewport: { width: 320, height: 568 }, touch: true });
  assert.equal(await page.title(), 'PushBird — 俯卧撑飞行挑战');
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  await page.locator('#tempo-setup summary').click();
  await page.locator('#tempo-voice').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#countdown-panel').isVisible(), false);
  await page.locator('#tempo-voice').uncheck();
  if (artifactDir) await page.screenshot({ path: path.join(artifactDir, 'tempo-setup-320.png') });
  await startGuide(page);
  for (const selector of ['#tempo-panel', '#tempo-pause', '#tempo-retry', '#tempo-finish']) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 321 && box.y + box.height <= 568, JSON.stringify(box));
  }
  const card = await page.locator('.score-hud').boundingBox();
  const guidePanel = await page.locator('#tempo-panel').boundingBox();
  assert.ok(card.y + card.height + 4 <= guidePanel.y, 'short-phone fallback score does not overlap guide controls');
  if (artifactDir) await page.screenshot({ path: path.join(artifactDir, 'tempo-guide-320.png') });
});

async function expectMovement(page, action, direction) {
  const before = await birdY(page);
  await action();
  await page.waitForTimeout(260);
  const after = await birdY(page);
  assert.ok(direction === 'up' ? after < before - 12 : after > before + 12, `bird moves ${direction}: ${before.toFixed(1)} -> ${after.toFixed(1)}`);
}

test('speed number supports mouse drag, accessible keys, bounded buttons and reset', async t => {
  const page = await openGame(t);
  await start(page);
  const slider = page.locator('#pipe-speed');
  const box = await slider.boundingBox();
  await page.mouse.move(box.x + box.width * .8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .8 - 64, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  assert.equal(await slider.innerText(), '198.0');
  assert.equal(await slider.getAttribute('aria-valuenow'), '120');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await slider.innerText(), '181.5');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await slider.innerText(), '198.0');
  await page.locator('#speed-reset').click();
  assert.equal(await slider.innerText(), '165.0');
  for (let i = 0; i < 10; i++) await page.locator('#speed-increase').click();
  assert.equal(await slider.getAttribute('aria-valuenow'), '200');
  assert.equal(await page.locator('#speed-increase').isDisabled(), true);
  assert.equal(await page.locator('#speed-increase').evaluate(e => e.getBoundingClientRect().height >= 44), true);
});

test('tablet touch swipes change speed without moving the bird or scrolling the stage', async t => {
  const page = await openGame(t, { viewport: { width: 1024, height: 768 }, touch: true });
  await start(page);
  const before = await birdPosition(page);
  const slider = page.locator('#pipe-speed');
  const box = await slider.boundingBox();
  const client = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  for (const delta of [-64, 64]) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + delta, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await slider.getAttribute('aria-valuenow'), delta < 0 ? '120' : '100');
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 4, y: y + 64 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.equal(await slider.getAttribute('aria-valuenow'), '100', 'vertical swipe does not change speed');
  const after = await birdPosition(page);
  assert.ok(Math.abs(after.y - before.y) < 2);
  assert.equal(await page.locator('.app-shell').evaluate(e => e.scrollLeft), 0);
  await page.locator('#speed-controls').waitFor({ state: 'visible' });
  if (artifactDir) await page.screenshot({ path: path.join(artifactDir, 'speed-tablet.png') });
});

test('guide speed changes real time continuously and stays adjustable while paused', async t => {
  const page = await openGame(t, { clock: true });
  await startGuide(page);
  await page.clock.runFor(500);
  await page.locator('#pipe-speed').click();
  await page.locator('#speed-increase').click();
  assert.equal(await page.locator('#pipe-speed').getAttribute('aria-valuenow'), '110');
  assert.equal(await page.locator('#side-score').innerText(), '00');
  await page.clock.runFor(4200);
  assert.equal(await page.locator('#side-score').innerText(), '01');
  await page.locator('#tempo-pause').click();
  await page.locator('#pipe-speed').click();
  await page.locator('#speed-decrease').click();
  assert.equal(await page.locator('#pipe-speed').getAttribute('aria-valuenow'), '100');
  assert.equal(await page.locator('#tempo-panel').getAttribute('data-status'), 'paused');
});

test('camera denial preserves real pointer and keyboard control', async t => {
  const page = await openGame(t);
  await start(page);
  await expectMovement(page, () => page.mouse.click(850, 200), 'up');
  await expectMovement(page, () => page.keyboard.press('ArrowDown'), 'down');
  assert.match(await page.locator('#control-mode').innerText(), /键盘|点击/);
  if (artifactDir) await page.screenshot({ path: path.join(artifactDir, 'desktop-manual.png') });
});

test('mobile tap reaches the canvas without horizontal overflow', async t => {
  const page = await openGame(t, { viewport: { width: 390, height: 844 }, touch: true });
  await start(page);
  await expectMovement(page, () => page.touchscreen.tap(285, 230), 'up');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (artifactDir) await page.screenshot({ path: path.join(artifactDir, 'mobile-manual.png') });
});

test('initializing pose does not disable manual control before a valid result', async t => {
  const page = await openGame(t, { pose: 'waiting', camera: 'available' });
  await start(page);
  await page.waitForFunction(() => window.__fixture.sends > 0);
  await expectMovement(page, () => page.keyboard.press('ArrowUp'), 'up');
  assert.doesNotMatch(await page.locator('#control-mode').innerText(), /^头部跟随控制$/);
});

test('rejected inference falls back instead of freezing manual control', async t => {
  const page = await openGame(t, { pose: 'send-error', camera: 'available' });
  await start(page);
  await expectMovement(page, () => page.keyboard.press('ArrowUp'), 'up');
  assert.match(await page.locator('#camera-status').innerText(), /失败|手动|不可用/);
});

test('lost landmarks restore keyboard control and valid landmarks recover tracking', async t => {
  const page = await openGame(t, { pose: 'waiting', camera: 'available' });
  await start(page);
  await page.evaluate(() => window.__fixture.onResults({ poseLandmarks: [{ x: .5, y: .25, z: 0, visibility: 1 }] }));
  await page.waitForTimeout(260);
  await expectMovement(page, () => page.evaluate(() => window.__fixture.onResults({ poseLandmarks: [{ x: .5, y: .7, z: 0, visibility: 1 }] })), 'down');
  await page.evaluate(() => window.__fixture.onResults({}));
  await expectMovement(page, () => page.keyboard.press('ArrowUp'), 'up');
  assert.match(await page.locator('#control-mode').innerText(), /键盘|点击/);
  await page.evaluate(() => window.__fixture.onResults({ poseLandmarks: [{ x: .5, y: .3, z: 0, visibility: 1 }] }));
  assert.match(await page.locator('#control-mode').innerText(), /头部/);
});

test('pose initialization failure retains the connected camera and manual mode', async t => {
  const page = await openGame(t, { pose: 'constructor-error', camera: 'available' });
  await start(page);
  assert.equal(await page.locator('#camera-feed').evaluate(video => video.srcObject?.getVideoTracks()[0].readyState), 'live');
  assert.doesNotMatch(await page.locator('#camera-status').innerText(), /未授权/);
  await expectMovement(page, () => page.keyboard.press('ArrowUp'), 'up');
});

test('page departure releases the camera stream', async t => {
  const page = await openGame(t, { camera: 'available' });
  await start(page);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  assert.equal(await page.evaluate(() => window.__fixture.stream.getTracks().every(track => track.readyState === 'ended')), true);
});

test('the first three gates are protected and gate four ends immediately on contact', async t => {
  const page = await openGame(t, { clock: true });
  await start(page);
  await page.locator('#sound-button').click();
  await page.waitForFunction(() => !document.querySelector('#background-music').paused);
  await page.clock.pauseAt(new Date(Date.now() + 100));
  assert.equal(await page.locator('.training-hud').count(), 0);
  // Hold still for an easy first success, then deliberately miss every later gate.
  await page.clock.runFor(8000);
  assert.notEqual(await page.locator('#side-score').innerText(), '00');
  assert.equal(await page.locator('#center-score').count(), 0);
  await page.mouse.click(850, 112);
  await page.clock.runFor(5000);
  assert.equal(await page.locator('#gameover-panel').isVisible(), false);
  await page.clock.runFor(2400);
  assert.equal(await page.locator('#gameover-panel').isVisible(), true);
  assert.equal(await page.locator('#final-score').innerText(), await page.locator('#side-score').innerText());
  assert.equal(await page.locator('#gameover-panel h2').innerText(), 'Game Over');
  assert.equal(await page.locator('#background-music').evaluate(audio => audio.paused), true);
  await page.locator('#restart-button').click();
  assert.equal(await page.locator('#side-score').innerText(), '00');
  assert.equal(await page.locator('.mega-label').count(), 0);
  assert.equal(await page.locator('.training-hud').count(), 0);
  assert.equal(await page.locator('#gameover-panel').isVisible(), false);
  await page.waitForFunction(() => !document.querySelector('#background-music').paused);
});

test('HUD displays the actual pipe speed on desktop and phone', async t => {
  for (const fixture of [{ width: 1280, height: 800, want: '165.0' }, { width: 390, height: 844, want: '52.7' }]) {
    const page = await openGame(t, { viewport: { width: fixture.width, height: fixture.height } });
    await start(page);
    assert.equal(await page.locator('#pipe-speed').innerText(), fixture.want);
    assert.match(await page.locator('.speed-lockup').innerText(), /PX\/S/);
  }
});

test('local background music plays, loops and obeys the sound toggle and page departure', async t => {
  const page = await openGame(t);
  await page.locator('#start-button').click();
  await page.waitForFunction(() => {
    const audio = document.querySelector('#background-music');
    return audio && !audio.paused && audio.currentTime > .1;
  }, undefined, { timeout: 8000 });
  const properties = await page.locator('#background-music').evaluate(audio => ({ loop: audio.loop, volume: audio.volume, duration: audio.duration }));
  assert.equal(properties.loop, true);
  assert.ok(properties.volume > 0 && properties.volume < .5);
  assert.ok(properties.duration > 20 && properties.duration < 60);
  await page.locator('#sound-button').click();
  assert.equal(await page.locator('#background-music').evaluate(audio => audio.paused), true);
  await page.locator('#sound-button').click();
  await page.waitForFunction(() => !document.querySelector('#background-music').paused);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  assert.equal(await page.locator('#background-music').evaluate(audio => audio.paused), true);
});

test('forehead score center stays exactly 200 CSS pixels above the mapped forehead', async t => {
  const page = await openGame(t, { pose: 'waiting', camera: 'available', viewport: { width: 390, height: 844 } });
  await start(page);
  await page.evaluate(() => window.__fixture.faceWorker.onmessage({ data: { type: 'result', anchor: { x: .5, y: .75 } } }));
  await page.waitForTimeout(350);
  const card = await page.locator('.score-hud').boundingBox();
  assert.ok(Math.abs(card.x + card.width / 2 - 195) < 1);
  assert.ok(Math.abs(card.y + card.height / 2 - (633 - 200)) < 1, 'uses card center, not top or bottom');
  assert.equal(await page.locator('.score-hud').getAttribute('data-anchor'), 'forehead');
  await page.evaluate(() => window.__fixture.faceWorker.onmessage({ data: { type: 'result', anchor: { x: .66, y: .1 } } }));
  await page.waitForTimeout(350);
  const edge = await page.locator('.score-hud').boundingBox();
  assert.ok(edge.x >= 0 && edge.y >= 0 && edge.x + edge.width <= 390);
  assert.ok(edge.x < 20 && edge.y < 20);
  if (artifactDir) await page.screenshot({ path: path.join(artifactDir, 'forehead-edge-mobile.png') });
});

test('SCORE card and typography are doubled on desktop and phone', async t => {
  for (const fixture of [{ width: 1280, height: 800, card: 264, number: 68, caption: 16, padding: 24 }, { width: 390, height: 844, card: 208, number: 52, caption: 14, padding: 20 }]) {
    const page = await openGame(t, { viewport: { width: fixture.width, height: fixture.height } });
    const dimensions = await page.locator('.score-hud').evaluate(card => ({
      width: card.getBoundingClientRect().width,
      number: parseFloat(getComputedStyle(card.querySelector('#side-score')).fontSize),
      caption: parseFloat(getComputedStyle(card.querySelector('.score-caption')).fontSize),
      padding: parseFloat(getComputedStyle(card).paddingTop),
      border: parseFloat(getComputedStyle(card).borderTopWidth),
    }));
    assert.deepEqual(dimensions, { width: fixture.card, number: fixture.number, caption: fixture.caption, padding: fixture.padding, border: 4 });
    assert.equal(await page.locator('#score-tracking').count(), 0);
    if (artifactDir) await page.screenshot({ path: path.join(artifactDir, `score-2x-${fixture.width}.png`) });
  }
});

test('forehead SCORE moves independently of the nose and releases the face worker', async t => {
  const page = await openGame(t, { pose: 'waiting', camera: 'available', viewport: { width: 390, height: 844 } });
  await start(page);
  await page.waitForFunction(() => !!window.__fixture.faceWorker);
  await page.evaluate(() => {
    window.__fixture.onResults({ poseLandmarks: [{ x: .5, y: .6, z: 0, visibility: 1 }] });
    window.__fixture.faceWorker.onmessage({ data: { type: 'result', anchor: { x: .5, y: .65 } } });
  });
  await page.waitForTimeout(350);
  const first = await page.locator('.score-hud').boundingBox();
  assert.equal(await page.locator('.score-hud').getAttribute('data-anchor'), 'forehead');
  assert.equal(await page.locator('#center-score').count(), 0);
  assert.equal(await page.locator('.mega-label').count(), 0);
  await page.evaluate(() => window.__fixture.faceWorker.onmessage({ data: { type: 'result', anchor: { x: .58, y: .75 } } }));
  await page.waitForTimeout(350);
  const hairMoved = await page.locator('.score-hud').boundingBox();
  assert.ok(hairMoved.x < first.x - 65 && hairMoved.y > first.y + 45, 'card follows the forehead although the nose did not move');
  await page.evaluate(() => window.__fixture.onResults({ poseLandmarks: [{ x: .52, y: .75, z: 0, visibility: 1 }] }));
  await page.waitForTimeout(250);
  const birdMoved = await page.locator('.score-hud').boundingBox();
  assert.ok(Math.abs(birdMoved.x - hairMoved.x) < 8 && Math.abs(birdMoved.y - hairMoved.y) < 8, 'nose/bird movement cannot move a forehead-anchored card');
  if (artifactDir) await page.screenshot({ path: path.join(artifactDir, 'forehead-score-mobile.png') });
  await page.evaluate(() => window.__fixture.faceWorker.onmessage({ data: { type: 'result', anchor: null } }));
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.score-hud').getAttribute('data-anchor'), 'none');
  assert.equal(await page.locator('#score-tracking').count(), 0);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  assert.equal(await page.evaluate(() => window.__fixture.faceStopped), true);
  assert.equal(await page.locator('#side-score').isVisible(), true);
});

test('beating a saved record flashes the SCORE card once and keeps the new best across reload', async t => {
  const page = await openGame(t, { clock: true });
  await page.evaluate(() => {
    localStorage.setItem('pushbird.bestScore', '1');
    window.__recordFlashes = 0;
    const card = document.querySelector('.score-hud');
    let active = false;
    new MutationObserver(() => {
      const next = card.classList.contains('is-record-breaking');
      if (next && !active) window.__recordFlashes++;
      active = next;
    }).observe(card, { attributes: true, attributeFilter: ['class'] });
  });
  await start(page);
  await page.clock.pauseAt(new Date(Date.now() + 100));
  await page.clock.runFor(8000);
  assert.equal(await page.locator('#side-score').innerText(), '01');
  assert.equal(await page.evaluate(() => window.__recordFlashes), 0, 'tying a record does not flash');
  for (let i = 0; i < 16; i++) {
    if (await page.locator('#side-score').innerText() === '02') break;
    await page.clock.runFor(500);
  }
  assert.equal(await page.locator('#side-score').innerText(), '02');
  assert.match(await page.locator('.score-hud').getAttribute('class'), /is-record-breaking/);
  assert.equal(await page.evaluate(() => localStorage.getItem('pushbird.bestScore')), '2');
  assert.equal(await page.evaluate(() => window.__recordFlashes), 1);
  assert.equal(await page.locator('#record-celebration').isVisible(), true);
  assert.match(await page.locator('#record-celebration').innerText(), /新纪录|突破/);
  assert.ok(await page.locator('#record-confetti .confetti-piece').count() >= 20);
  assert.equal(await page.locator('#record-confetti').evaluate(layer => getComputedStyle(layer).pointerEvents), 'none');
  await page.locator('.score-hud').evaluate(card => {
    const animation = card.getAnimations().find(item => item.animationName === 'record-flash');
    if (!animation) throw new Error('record flash animation is missing');
    animation.pause(); animation.currentTime = 300;
  });
  assert.equal(await page.locator('.score-hud').evaluate(card => getComputedStyle(card).backgroundColor), 'rgb(214, 51, 65)');
  if (artifactDir) await page.screenshot({ path: path.join(artifactDir, 'record-flash-red.png') });
  await page.clock.runFor(2500);
  assert.doesNotMatch(await page.locator('.score-hud').getAttribute('class'), /is-record-breaking/);
  assert.equal(await page.locator('#record-celebration').isVisible(), false);
  assert.equal(await page.locator('#record-confetti .confetti-piece').count(), 0);
  assert.equal(await page.evaluate(() => window.__recordFlashes), 1);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => localStorage.getItem('pushbird.bestScore')), '2');
  assert.equal(await page.locator('#side-score').innerText(), '00');
});

test('a fresh browser celebrates the first score honestly instead of suppressing all encouragement', async t => {
  const page = await openGame(t, { clock: true });
  await start(page);
  await page.clock.pauseAt(new Date(Date.now() + 100));
  await page.clock.runFor(8000);
  assert.equal(await page.evaluate(() => localStorage.getItem('pushbird.bestScore')), '1');
  assert.equal(await page.locator('#record-celebration').isVisible(), true);
  assert.match(await page.locator('#record-celebration').innerText(), /首次得分/);
  assert.doesNotMatch(await page.locator('#record-celebration').innerText(), /突破 0|超过.*最高/);
  assert.ok(await page.locator('#record-confetti .confetti-piece').count() >= 20);
  assert.match(await page.locator('#personal-best').innerText(), /1/);
  if (artifactDir) await page.screenshot({ path: path.join(artifactDir, 'first-score-encouragement.png') });
  await page.clock.runFor(3000);
  assert.equal(await page.locator('#record-celebration').isVisible(), false);
  for (let i = 0; i < 12; i++) {
    if (await page.locator('#side-score').innerText() === '02') break;
    await page.clock.runFor(500);
  }
  assert.equal(await page.locator('#side-score').innerText(), '02');
  assert.equal(await page.locator('#record-celebration').isVisible(), false, 'first-score encouragement does not repeat on every point');
});

test('a saved best is visible and an ordinary lower score cannot claim a new record', async t => {
  const page = await openGame(t, { clock: true });
  await page.evaluate(() => localStorage.setItem('pushbird.bestScore', '8'));
  await start(page);
  await page.clock.pauseAt(new Date(Date.now() + 100));
  assert.match(await page.locator('#personal-best').innerText(), /8/);
  await page.clock.runFor(8000);
  assert.equal(await page.locator('#side-score').innerText(), '01');
  assert.equal(await page.locator('#record-celebration').isVisible(), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('pushbird.bestScore')), '8');
});

test('unavailable browser storage does not break scoring', async t => {
  const page = await openGame(t, { clock: true });
  await page.evaluate(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage unavailable', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError'); };
  });
  await start(page);
  await page.clock.pauseAt(new Date(Date.now() + 100));
  await page.clock.runFor(8000);
  assert.equal(await page.locator('#side-score').innerText(), '01');
  assert.equal(await page.locator('#gameover-panel').isVisible(), false);
});

test('reduced-motion users get a steady red record highlight instead of flashing', async t => {
  const page = await openGame(t, { clock: true, viewport: { width: 390, height: 844 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => localStorage.setItem('pushbird.bestScore', '1'));
  await start(page);
  await page.clock.pauseAt(new Date(Date.now() + 100));
  for (let i = 0; i < 50; i++) {
    if (await page.locator('.score-hud').evaluate(card => card.classList.contains('is-record-breaking'))) break;
    await page.clock.runFor(500);
  }
  const style = await page.locator('.score-hud').evaluate(card => ({ animation: getComputedStyle(card).animationName, color: getComputedStyle(card).backgroundColor }));
  assert.deepEqual(style, { animation: 'none', color: 'rgb(214, 51, 65)' });
  const celebration = await page.locator('#record-celebration').boundingBox();
  assert.ok(celebration.x >= 0 && celebration.x + celebration.width <= 390);
  assert.equal(await page.locator('#record-confetti .confetti-piece').count(), 0, 'reduced motion omits falling particles');
  await page.clock.runFor(2500);
  assert.doesNotMatch(await page.locator('.score-hud').getAttribute('class'), /is-record-breaking/);
});

test('stalled tracking expires and permits manual movement', async t => {
  const page = await openGame(t, { pose: 'waiting', camera: 'available' });
  await start(page);
  await page.evaluate(() => window.__fixture.onResults({ poseLandmarks: [{ x: .5, y: .45, z: 0, visibility: 1 }] }));
  await page.waitForFunction(() => document.querySelector('#control-mode').textContent.includes('键盘'), undefined, { timeout: 2500 });
  await expectMovement(page, () => page.keyboard.press('ArrowUp'), 'up');
});

test('invalid and invisible landmarks cannot poison the canvas state', async t => {
  const page = await openGame(t, { pose: 'waiting', camera: 'available' });
  await start(page);
  await page.evaluate(() => {
    for (const nose of [{ x: .5, y: NaN, visibility: 1 }, { x: .5, y: Infinity, visibility: 1 }, { x: .5, y: -.1, visibility: 1 }, { x: .5, y: 1.1, visibility: 1 }, { x: .5, y: .6, visibility: .1 }, { x: .5, y: .6, visibility: NaN }, { x: NaN, y: .5, visibility: 1 }, { x: 1.1, y: .5, visibility: 1 }]) {
      window.__fixture.onResults({ poseLandmarks: [nose] });
    }
  });
  assert.equal(Number.isFinite(await birdY(page)), true);
  await expectMovement(page, () => page.keyboard.press('ArrowUp'), 'up');
});

test('repeated start events cannot open duplicate camera streams or detectors', async t => {
  const page = await openGame(t, { pose: 'waiting', camera: 'available' });
  await page.evaluate(() => { for (let i = 0; i < 5; i++) document.querySelector('#start-button').click(); });
  await page.waitForFunction(() => window.__fixture.sends > 0);
  assert.deepEqual(await page.evaluate(() => [window.__fixture.requests, window.__fixture.instances]), [1, 1]);
});

test('camera permission resolving after departure immediately stops the late stream', async t => {
  const page = await openGame(t, { camera: 'pending' });
  await page.locator('#start-button').click();
  await page.waitForFunction(() => !!window.__fixture.resolveCamera);
  await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); window.__fixture.resolveCamera(); });
  await page.waitForFunction(() => window.__fixture.stream?.getTracks().every(track => track.readyState === 'ended'));
  assert.equal(await page.locator('#camera-feed').evaluate(video => video.srcObject), null);
});

test('missing pose SDK never blocks the game and retains a live camera fallback', async t => {
  const page = await openGame(t, { camera: 'available', sdkDelay: 4500 });
  await start(page);
  await expectMovement(page, () => page.keyboard.press('ArrowUp'), 'up');
  await page.waitForFunction(() => /不可用/.test(document.querySelector('#camera-status').textContent));
  assert.equal(await page.locator('#camera-feed').evaluate(video => video.srcObject?.getVideoTracks()[0].readyState), 'live');
});

test('asynchronous pose option failures are handled without uncaught rejection', async t => {
  const page = await openGame(t, { camera: 'available', pose: 'options-error' });
  await start(page);
  await expectMovement(page, () => page.keyboard.press('ArrowUp'), 'up');
  assert.match(await page.locator('#camera-status').innerText(), /失败|不可用/);
});

test('tutorial opens and closes without swallowing game controls', async t => {
  const page = await openGame(t);
  await page.locator('#learn-button').click();
  assert.match(await page.locator('#tutorial-drawer').getAttribute('class'), /is-open/);
  await page.keyboard.press('Escape');
  assert.doesNotMatch(await page.locator('#tutorial-drawer').getAttribute('class'), /is-open/);
});

for (const fixture of [
  { name: 'desktop mirrored camera', viewport: { width: 1280, height: 800 }, nose: { x: .35, y: .4 }, expected: { x: 832, y: 304 } },
  { name: 'portrait cover crop', viewport: { width: 390, height: 844 }, nose: { x: .55, y: .4 }, expected: { x: 138.733333, y: 337.6 } },
]) {
  test(`bird overlays the visible nose in ${fixture.name}`, async t => {
    const page = await openGame(t, { pose: 'waiting', camera: 'available', viewport: fixture.viewport });
    await start(page);
    await page.evaluate(nose => window.__fixture.onResults({ poseLandmarks: [{ ...nose, z: 0, visibility: 1 }] }), fixture.nose);
    await page.waitForTimeout(600);
    const actual = await birdPosition(page);
    assert.ok(Math.abs(actual.x - fixture.expected.x) < 8, `nose x ${fixture.expected.x}, bird x ${actual.x}`);
    assert.ok(Math.abs(actual.y - fixture.expected.y) < 8, `nose y ${fixture.expected.y}, bird y ${actual.y}`);
    if (artifactDir) await page.screenshot({ path: path.join(artifactDir, `nose-${fixture.viewport.width}.png`) });
  });
}

test('horizontal nose movement follows the mirror and freezes horizontally on tracking loss', async t => {
  const page = await openGame(t, { pose: 'waiting', camera: 'available' });
  await start(page);
  await page.evaluate(() => window.__fixture.onResults({ poseLandmarks: [{ x: .55, y: .45, z: 0, visibility: 1 }] }));
  await page.waitForTimeout(500);
  const before = await birdPosition(page);
  await page.evaluate(() => window.__fixture.onResults({ poseLandmarks: [{ x: .4, y: .45, z: 0, visibility: 1 }] }));
  await page.waitForTimeout(500);
  const after = await birdPosition(page);
  assert.ok(after.x > before.x + 150, `mirrored x moves right: ${before.x} -> ${after.x}`);
  await page.evaluate(() => window.__fixture.onResults({}));
  await expectMovement(page, () => page.keyboard.press('ArrowUp'), 'up');
  assert.ok(Math.abs((await birdPosition(page)).x - after.x) < 8, 'fallback keeps the last horizontal position');
});

test('nose position reprojects after viewport resize without another pose result', async t => {
  const page = await openGame(t, { pose: 'waiting', camera: 'available' });
  await start(page);
  await page.evaluate(() => window.__fixture.onResults({ poseLandmarks: [{ x: .55, y: .4, z: 0, visibility: 1 }] }));
  await page.waitForTimeout(350);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const actual = await birdPosition(page);
  assert.ok(Math.abs(actual.x - 138.733333) < 8, `resized x: ${actual.x}`);
  assert.ok(Math.abs(actual.y - 337.6) < 8, `resized y: ${actual.y}`);
});

test('nose outside the cover crop falls back instead of following an invisible point', async t => {
  const page = await openGame(t, { pose: 'waiting', camera: 'available', viewport: { width: 390, height: 844 } });
  await start(page);
  await page.evaluate(() => window.__fixture.onResults({ poseLandmarks: [{ x: .5, y: .45, z: 0, visibility: 1 }] }));
  await page.waitForTimeout(350);
  await page.evaluate(() => window.__fixture.onResults({ poseLandmarks: [{ x: .05, y: .45, z: 0, visibility: 1 }] }));
  assert.match(await page.locator('#control-mode').innerText(), /键盘/);
  await expectMovement(page, () => page.keyboard.press('ArrowUp'), 'up');
});

test('top speed mirrors the title with matching typography and no challenge plaque', async t => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 720 }]) {
    const page = await openGame(t, { viewport });
    assert.equal(await page.locator('.training-hud').count(), 0);
    const geometry = await page.evaluate(() => {
      const title = document.querySelector('h1'), speed = document.querySelector('#pipe-speed');
      const a = title.getBoundingClientRect(), b = speed.getBoundingClientRect();
      const ta = getComputedStyle(title), sb = getComputedStyle(speed);
      return { leftInset: a.left, rightInset: innerWidth - b.right, titleY: a.top, speedY: b.top,
        titleRight: a.right, speedLeft: b.left, titleFont: ta.fontFamily, speedFont: sb.fontFamily,
        titleSize: ta.fontSize, speedSize: sb.fontSize, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.equal(geometry.titleFont, geometry.speedFont);
    assert.equal(geometry.titleSize, geometry.speedSize);
    assert.ok(Math.abs(geometry.leftInset - geometry.rightInset) < 1, 'equal left/right inset');
    assert.ok(Math.abs(geometry.titleY - geometry.speedY) < 1, 'same title baseline row');
    assert.ok(geometry.titleRight < geometry.speedLeft, 'title and speed do not overlap');
    assert.equal(geometry.overflow, false);
    const status = await page.locator('.status-strip').boundingBox(), score = await page.locator('.score-hud').boundingBox();
    assert.ok(status.x + status.width <= score.x || status.y + status.height <= score.y || status.x >= score.x + score.width || status.y >= score.y + score.height, 'camera status is not hidden by the idle score card');
    if (artifactDir) await page.screenshot({ path: path.join(artifactDir, `symmetric-top-${viewport.width}.png`) });
  }
});

test('outside click closes notes on desktop and mobile without controlling the bird', async t => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const page = await openGame(t, { viewport, touch: viewport.width < 500 });
    await start(page);
    const before = await birdY(page);
    await page.locator('#tutorial-button').click();
    await page.waitForTimeout(450);
    await page.locator('.drawer-content h2').click();
    assert.match(await page.locator('#tutorial-drawer').getAttribute('class'), /is-open/, 'inside click keeps notes open');
    if (artifactDir) await page.screenshot({ path: path.join(artifactDir, `notes-open-${viewport.width}.png`) });
    if (viewport.width < 500) await page.touchscreen.tap(12, 300);
    else await page.mouse.click(30, 400);
    await page.waitForTimeout(450);
    assert.doesNotMatch(await page.locator('#tutorial-drawer').getAttribute('class'), /is-open/);
    assert.ok(Math.abs(await birdY(page) - before) < 8, 'dismissal does not move the bird');
    await page.locator('#tutorial-button').click();
    await page.locator('#close-tutorial').click();
    assert.doesNotMatch(await page.locator('#tutorial-drawer').getAttribute('class'), /is-open/);
  }
});

test('phone game retains movement hints after removing the training plaque', async t => {
  const page = await openGame(t, { viewport: { width: 390, height: 844 }, touch: true, clock: true });
  await start(page);
  await page.clock.pauseAt(new Date(Date.now() + 100));
  await page.clock.runFor(7000);
  assert.equal(await page.locator('.training-hud').count(), 0);
  assert.equal(await page.locator('#gameover-panel').isVisible(), false);
  assert.match(await page.locator('#action-hint').innerText(), /保持|下压|撑起|通过/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (artifactDir) await page.screenshot({ path: path.join(artifactDir, 'warmup-mobile.png') });
});
