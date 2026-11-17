import './styles.css';
import { trainingStep, pipeOutcome, pipeSpeed } from './training.js';
import { scoreCardPosition } from './forehead.js';
import { bindSpeedControl } from './speed.js';
import { PipeStream } from './pipe-stream.js';

const canvas = document.querySelector('#game-canvas');
const ctx = canvas.getContext('2d');
const video = document.querySelector('#camera-feed');
const cameraStatus = document.querySelector('#camera-status');
const controlMode = document.querySelector('#control-mode');
const sideScore = document.querySelector('#side-score');
const introPanel = document.querySelector('#intro-panel');
const countdownPanel = document.querySelector('#countdown-panel');
const countdownNumber = document.querySelector('#countdown-number');
const gameoverPanel = document.querySelector('#gameover-panel');
const finalScore = document.querySelector('#final-score');
const gameoverMessage = document.querySelector('#gameover-message');
const actionHint = document.querySelector('#action-hint');
const tutorialDrawer = document.querySelector('#tutorial-drawer');
const tutorialBackdrop = document.querySelector('#tutorial-backdrop');
const soundButton = document.querySelector('#sound-button');
const music = document.querySelector('#background-music');
const scoreHUD = document.querySelector('.score-hud');
const recordFeedback = document.querySelector('#record-feedback');
const recordTitle = document.querySelector('#record-title');
const personalBest = document.querySelector('#personal-best');
const recordCelebration = document.querySelector('#record-celebration');
const recordConfetti = document.querySelector('#record-confetti');
music.volume = .24;
const speedDisplay = document.querySelector('#pipe-speed');

const state = {
  countdownTimer: null,
  challengeSpeed: 1,
  phase: 'ready',
  score: 0,
  lastTime: 0,
  groundOffset: 0,
  pipes: [],
  bird: { x: .24, y: .45, velocity: 0, rotation: 0, flap: 0 },
  width: 0,
  height: 0,
  scale: 1,
  pipeStream: null,
  audioEnabled: true,
  audioContext: null,
  cameraReady: false,
  cameraPending: false,
  cameraStream: null,
  cameraGeneration: 0,
  poseReady: false,
  pose: null,
  poseLoopBusy: false,
  poseFrame: null,
  poseGeneration: 0,
  lastPoseTime: 0,
  lastPoseY: null,
  posePhase: 'idle',
  poseCooldown: 0,
  pulse: 0,
  collisionGrace: 0,
  headX: .24,
  headTargetX: .24,
  nose: null,
  headY: .45,
  headTargetY: .45,
  manualTargetY: .45,
  headVelocity: 0,
  pipeIndex: 0,
  completedPipes: 0,
  streak: 0,
  anchorY: .45,
  feedbackTime: 0,
  headClearance: 48,
  faceWorker: null,
  faceReady: false,
  faceBusy: false,
  faceAnchor: null,
  faceTime: 0,
  faceNextFrame: 0,
  hudAnchor: null,
  hudSource: null,
  bestAtStart: 0,
  bestScore: 0,
  recordBroken: false,
  recordFlashTimer: null,
  celebrationTimer: null,
};

const settings = {
  gravity: 1180,
  pipeSpeed: 215,
  pipeWidth: 64,
  pipeGap: 190,
  groundHeight: 48,
};

const speedControl = bindSpeedControl({ slider: speedDisplay, onChange(factor, previous) {
  state.challengeSpeed = factor;
  for (const pipe of state.pipes) pipe.speed *= factor / previous;
  refreshTrainingHUD();
} });

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = rect.width;
  state.height = rect.height;
  state.scale = Math.max(rect.width / 1100, .7);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  settings.pipeGap = Math.max(140, Math.min(210, rect.height * .27));
  settings.pipeWidth = Math.max(52, Math.min(76, rect.width * .065));
  settings.groundHeight = Math.max(42, Math.min(64, rect.height * .075));
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function setStatus(label, kind = '') {
  cameraStatus.className = `camera-status ${kind}`;
  cameraStatus.innerHTML = `<i></i>${label}`;
}

function setScore(value) {
  const text = String(value).padStart(2, '0');
  sideScore.textContent = text;
}

function readBestScore() {
  try {
    const value = Number(localStorage.getItem('pushbird.bestScore'));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch { return 0; }
}

function renderPersonalBest() {
  personalBest.textContent = `个人纪录 ${String(state.bestScore).padStart(2, '0')}`;
}

function clearRecordFlash() {
  clearTimeout(state.recordFlashTimer);
  state.recordFlashTimer = null;
  scoreHUD.classList.remove('is-record-breaking');
}

function clearRecordCelebration() {
  clearTimeout(state.celebrationTimer);
  state.celebrationTimer = null;
  recordCelebration.classList.add('is-hidden');
  recordConfetti.replaceChildren();
}

function celebrateRecord(firstScore = false) {
  clearRecordCelebration();
  recordTitle.textContent = firstScore ? '首次得分！' : '新纪录！';
  recordFeedback.textContent = firstScore ? '迈出第一步，太棒了！继续保持你的节奏' : `突破 ${state.bestAtStart} 分，太棒了！保持你的节奏`;
  recordCelebration.classList.remove('is-hidden');
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const colors = ['#ff536d', '#ffd451', '#67e8a5', '#53c8ff', '#b292ff', '#ff9f43', '#fff8e8'];
    const pieces = document.createDocumentFragment();
    for (let index = 0; index < 42; index++) {
      const piece = document.createElement('i');
      piece.className = 'confetti-piece';
      piece.style.left = `${8 + Math.random() * 84}%`;
      piece.style.backgroundColor = colors[index % colors.length];
      piece.style.setProperty('--drift', `${(Math.random() - .5) * 200}px`);
      piece.style.setProperty('--spin', `${360 + Math.random() * 720}deg`);
      piece.style.animationDelay = `${Math.random() * .15}s`;
      pieces.append(piece);
    }
    recordConfetti.append(pieces);
  }
  playTone(1046, .12);
  state.celebrationTimer = setTimeout(clearRecordCelebration, 2400);
}

function updateRecord() {
  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    try { localStorage.setItem('pushbird.bestScore', String(Math.max(state.bestScore, readBestScore()))); } catch { /* 无持久存储仍能正常游玩 */ }
  }
  renderPersonalBest();
  if (state.recordBroken || state.score <= state.bestAtStart) return false;
  state.recordBroken = true;
  scoreHUD.classList.add('is-record-breaking');
  celebrateRecord(state.bestAtStart === 0);
  state.recordFlashTimer = setTimeout(clearRecordFlash, 1800);
  return true;
}

function resetRound() {
  clearRecordFlash();
  clearRecordCelebration();
  recordFeedback.textContent = '';
  state.bestScore = Math.max(state.bestScore, readBestScore());
  state.bestAtStart = state.bestScore;
  renderPersonalBest();
  state.recordBroken = false;
  state.score = 0;
  state.pipes = [];
  state.groundOffset = 0;
  state.pipeStream = null;
  state.bird = { x: .24, y: .45, velocity: 0, rotation: 0, flap: 0 };
  state.pulse = 0;
  state.collisionGrace = 0;
  state.headY = .45;
  state.headTargetY = .45;
  state.manualTargetY = .45;
  state.headVelocity = 0;
  state.pipeIndex = state.completedPipes = state.streak = 0;
  state.feedbackTime = 0;
  const position = state.poseReady && state.nose ? mapNoseToStage(state.nose) : null;
  if (!position) state.nose = null;
  state.headX = state.headTargetX = position?.x ?? .24;
  state.headY = state.headTargetY = position?.y ?? .45;
  state.bird.x = state.headX;
  state.bird.y = state.headY;
  state.lastPoseY = null;
  state.posePhase = 'idle';
  setScore(0);
  refreshTrainingHUD();
}

function beginCountdown() {
  if (state.phase === 'countdown' || state.phase === 'playing') return;
  clearInterval(state.countdownTimer);
  music.currentTime = 0;
  resetRound();
  state.phase = 'countdown';
  startMusic();
  introPanel.classList.add('is-hidden');
  gameoverPanel.classList.add('is-hidden');
  countdownPanel.classList.remove('is-hidden');
  let count = 3;
  countdownNumber.textContent = count;
  playTone(480, .08);
  state.countdownTimer = setInterval(() => {
    count -= 1;
    if (count > 0) {
      countdownNumber.textContent = count;
      playTone(520 + (3 - count) * 65, .08);
    } else {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
      countdownPanel.classList.add('is-hidden');
      state.phase = 'playing';
      state.lastTime = performance.now();
      state.pipeStream = null;
      state.anchorY = state.headY;
      state.collisionGrace = 1.35;
      actionHint.textContent = '前 3 道放心练习，第 4 道开始正式挑战';
      playTone(760, .12);
    }
  }, 760);
}

function endRound() {
  if (state.phase !== 'playing') return;
  state.phase = 'gameover';
  music.pause();
  finalScore.textContent = String(state.score).padStart(2, '0');
  gameoverMessage.textContent = state.score > 0 ? `已稳稳通过 ${state.score} 道，休息好再继续。` : '已经找到起点，休息好可以再慢慢来。';
  gameoverPanel.classList.remove('is-hidden');
  actionHint.textContent = '点击“再飞一次”重新开始';
  playTone(380, .12);
}

function flap() {
  if (state.phase === 'ready' || state.phase === 'gameover') {
    beginCountdown();
    return;
  }
  if (state.phase !== 'playing') return;
  if (state.poseReady && state.cameraReady) return;
  state.manualTargetY = Math.max(.14, state.manualTargetY - .1);
  state.headTargetY = state.manualTargetY;
  state.bird.flap = 1;
  state.pulse = 1;
  playTone(680, .055, 'square');
}

function currentTrainingStep() {
  const step = trainingStep({ index: state.pipeIndex, width: state.width, height: state.height,
    groundHeight: settings.groundHeight, birdX: state.width * state.bird.x,
    anchorY: state.anchorY, successes: state.score, streak: state.streak, speedFactor: state.challengeSpeed });
  return step;
}

function spawnPipe(x) {
  const step = currentTrainingStep();
  state.pipes.push({ ...step, x, passed: false, hit: false, width: settings.pipeWidth });
  state.pipeIndex++;
}

function refreshTrainingHUD() {
  const next = state.pipes.find(pipe => !pipe.passed);
  const factor = state.challengeSpeed;
  const speed = (next?.speed ?? pipeSpeed(state.width) * factor).toFixed(1);
  if (speedDisplay.textContent !== speed) {
    speedDisplay.textContent = speed;
    speedDisplay.setAttribute('aria-label', `水管速度 ${speed} px/s；左拨加速，右拨减速`);
  }
}

function movementHint() {
  const next = state.pipes.find(pipe => !pipe.passed);
  return next?.direction === 'down' ? '↓ 慢慢下压' : next?.direction === 'up' ? '↑ 从容撑起' : '先保持，找到舒服的位置';
}

function finishPipe(pipe) {
  Object.assign(state, pipeOutcome({ ...state, warmup: pipe.warmup, hit: pipe.hit }));
  state.completedPipes++;
  setScore(state.score);
  if (!pipe.hit) {
    state.pulse = 1;
    actionHint.textContent = state.streak >= 3 ? `连续 ${state.streak} 道，节奏很稳！` : '稳稳通过，继续按自己的节奏';
    playTone(850, .08);
    if (updateRecord()) actionHint.textContent = state.bestAtStart === 0 ? '首次得分，太棒了！继续保持' : '新纪录！已经超过上次最好成绩';
  } else {
    actionHint.textContent = pipe.warmup ? '热身碰到也没关系，下一道慢慢来' : '调整一下就好，下一道继续';
  }
  state.feedbackTime = 2;
  refreshTrainingHUD();
}

function updateGame(dt) {
  if (state.phase !== 'playing' && !(state.poseReady && (state.phase === 'ready' || state.phase === 'countdown'))) return;
  const safeDt = Math.min(dt, .035);
  // Reproject after viewport/video changes using the same centered cover crop as CSS.
  const position = state.poseReady && state.nose ? mapNoseToStage(state.nose) : null;
  if (position) { state.headTargetX = position.x; state.headTargetY = position.y; }
  const previousY = state.bird.y;
  state.headX += (state.headTargetX - state.headX) * Math.min(1, safeDt * 12);
  state.headY += (state.headTargetY - state.headY) * Math.min(1, safeDt * 12);
  state.bird.x = state.headX;
  state.bird.y = state.headY;
  state.headVelocity = (state.bird.y - previousY) / Math.max(safeDt, .001);
  state.bird.rotation = Math.max(-.45, Math.min(.45, state.headVelocity * 2.2));
  state.bird.flap = Math.max(0, state.bird.flap - safeDt * 7);
  state.pulse = Math.max(0, state.pulse - safeDt * 5);
  if (state.phase !== 'playing') return;
  state.feedbackTime = Math.max(0, state.feedbackTime - safeDt);
  state.collisionGrace = Math.max(0, state.collisionGrace - safeDt);
  const speed = pipeSpeed(state.width) * state.challengeSpeed;
  const travel = speed * safeDt;
  state.groundOffset = (state.groundOffset + travel) % 48;
  for (const pipe of state.pipes) {
    pipe.speed = speed;
    pipe.x -= travel;
  }
  if (!state.pipeStream) {
    const step = currentTrainingStep();
    state.pipeStream = new PipeStream({ originX: step.x, spacing: step.spacing });
  }
  for (const x of state.pipeStream.advance(travel)) spawnPipe(x);
  const bird = birdRect();
  for (const pipe of state.pipes) {
    // A gate is assessed once. A warmup contact teaches without ending the round.
    if (!pipe.passed && !pipe.hit && (intersects(bird, { x: pipe.x, y: 0, w: pipe.width, h: pipe.top }) ||
      intersects(bird, { x: pipe.x, y: pipe.top + pipe.gap, w: pipe.width, h: state.height - settings.groundHeight - pipe.top - pipe.gap }))) {
      pipe.hit = true;
      if (!pipe.warmup) { endRound(); return; }
      actionHint.textContent = '碰到也没关系，放慢一点继续';
      state.feedbackTime = 2;
    }
    if (!pipe.passed && pipe.x + pipe.width < bird.x) {
      pipe.passed = true;
      finishPipe(pipe);
      if (state.phase !== 'playing') break;
    }
  }
  state.pipes = state.pipes.filter((pipe) => pipe.x > -pipe.width - 10);
  refreshTrainingHUD();
  if (state.feedbackTime === 0) actionHint.textContent = movementHint();
}

function birdRect() {
  const size = Math.max(26, Math.min(44, state.width * .038));
  return { x: state.width * state.bird.x - size * .5, y: state.height * state.bird.y - size * .5, w: size, h: size };
}

function intersects(a, b) {
  const padding = 5;
  return a.x + padding < b.x + b.w && a.x + a.w - padding > b.x && a.y + padding < b.y + b.h && a.y + a.h - padding > b.y;
}

function draw() {
  ctx.clearRect(0, 0, state.width, state.height);
  drawPipes();
  drawBird();
  drawGround();
  positionScoreHUD();
  if (state.phase === 'playing' && state.pulse > 0) drawPulse();
}

function positionScoreHUD() {
  // The score has its own image anchor. It must never use bird.x/bird.y.
  const tracked = state.cameraReady && state.faceAnchor && performance.now() - state.faceTime < 900;
  const target = tracked ? mapNoseToStage(state.faceAnchor) : null;
  const source = target ? 'forehead' : 'none';
  scoreHUD.dataset.anchor = source;
  if (!target) {
    state.hudAnchor = null;
    state.hudSource = source;
    scoreHUD.style.removeProperty('left');
    scoreHUD.style.removeProperty('right');
    scoreHUD.style.removeProperty('top');
    return;
  }
  if (!state.hudAnchor || state.hudSource !== source) state.hudAnchor = { ...target };
  else {
    state.hudAnchor.x += (target.x - state.hudAnchor.x) * .35;
    state.hudAnchor.y += (target.y - state.hudAnchor.y) * .35;
  }
  state.hudSource = source;
  const width = scoreHUD.offsetWidth;
  const height = scoreHUD.offsetHeight;
  const { left, top } = scoreCardPosition({ x: state.hudAnchor.x * state.width, y: state.hudAnchor.y * state.height },
    { width, height }, { width: state.width, height: state.height });
  scoreHUD.style.left = `${left}px`;
  scoreHUD.style.top = `${top}px`;
  scoreHUD.style.right = 'auto';
}

function drawPipes() {
  for (const pipe of state.pipes) {
    ctx.save();
    if (pipe.hit) ctx.globalAlpha = .35;
    drawPipe(pipe.x, pipe.top, pipe.width, true);
    drawPipe(pipe.x, pipe.top + pipe.gap, pipe.width, false, state.height - settings.groundHeight - pipe.top - pipe.gap);
    ctx.fillStyle = '#fff8e8';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pipe.direction === 'down' ? '↓ 下压' : pipe.direction === 'up' ? '↑ 撑起' : '保持', pipe.x + pipe.width / 2, pipe.top + pipe.gap / 2 - 22);
    ctx.restore();
  }
}

function drawPipe(x, y, width, capAtBottom, height = y) {
  const pipeHeight = capAtBottom ? y : height;
  const bodyY = capAtBottom ? 0 : y + 10;
  const bodyH = capAtBottom ? Math.max(0, y - 10) : Math.max(0, height - 10);
  ctx.save();
  ctx.fillStyle = '#5ba43b';
  ctx.strokeStyle = '#193f32';
  ctx.lineWidth = 4;
  ctx.fillRect(x + 7, bodyY, width - 14, bodyH);
  ctx.strokeRect(x + 7, bodyY, width - 14, bodyH);
  ctx.fillStyle = '#b8ef60';
  ctx.fillRect(x + 14, bodyY + 3, 9, Math.max(0, bodyH - 6));
  ctx.fillStyle = '#356e37';
  ctx.fillRect(x + width - 17, bodyY + 2, 6, Math.max(0, bodyH - 4));
  const capY = capAtBottom ? y - 14 : y;
  ctx.fillStyle = '#66b943';
  ctx.strokeStyle = '#193f32';
  ctx.lineWidth = 4;
  ctx.fillRect(x, capY, width, 24);
  ctx.strokeRect(x, capY, width, 24);
  ctx.fillStyle = '#b8ef60';
  ctx.fillRect(x + 8, capY + 4, 10, 13);
  ctx.restore();
}

function drawBird() {
  const bird = birdRect();
  const cx = bird.x + bird.w / 2;
  const cy = bird.y + bird.h / 2;
  const s = bird.w / 30;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(state.bird.rotation);
  ctx.imageSmoothingEnabled = false;
  ctx.lineWidth = Math.max(2, 3 * s);
  ctx.strokeStyle = '#17232d';
  ctx.fillStyle = '#ffd451';
  ctx.beginPath();
  ctx.roundRect(-14 * s, -10 * s, 27 * s, 20 * s, 5 * s);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f18a32';
  ctx.beginPath(); ctx.moveTo(11 * s, -1 * s); ctx.lineTo(22 * s, 3 * s); ctx.lineTo(11 * s, 7 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f9f5dc'; ctx.beginPath(); ctx.arc(5 * s, -5 * s, 5 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#17232d'; ctx.beginPath(); ctx.arc(7 * s, -5 * s, 2 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = state.bird.flap > .3 ? '#fff0a6' : '#e8b83f';
  ctx.beginPath(); ctx.ellipse(-5 * s, 5 * s, 10 * s, 5 * s, -.22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawGround() {
  const y = state.height - settings.groundHeight;
  ctx.save();
  ctx.fillStyle = '#365f3c'; ctx.fillRect(0, y, state.width, settings.groundHeight);
  ctx.beginPath(); ctx.rect(0, y, state.width, settings.groundHeight); ctx.clip();
  for (let x = -48 - state.groundOffset; x < state.width + 48; x += 48) {
    ctx.fillStyle = '#b4ec58'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 25, y); ctx.lineTo(x - 4, state.height); ctx.lineTo(x - 29, state.height); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = '#193f32'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, y + 2); ctx.lineTo(state.width, y + 2); ctx.stroke();
  ctx.restore();
}

function drawPulse() {
  const bird = birdRect();
  ctx.save(); ctx.strokeStyle = `rgba(255, 212, 81, ${state.pulse * .55})`; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(bird.x + bird.w / 2, bird.y + bird.h / 2, bird.w * (1.4 - state.pulse * .3), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}

function frame(now) {
  // RAF supplies the frame's start time, which can precede a countdown callback's
  // performance.now(). Never let that ordering move the simulation backwards.
  now = Math.max(now, state.lastTime);
  const dt = state.lastTime ? (now - state.lastTime) / 1000 : 0;
  state.lastTime = now;
  requestFaceFrame(now);
  if (state.poseReady && now - state.lastPoseTime > 1200) {
    useManualControl('头部暂时丢失 · 可手动控制');
  }
  updateGame(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

async function enableCamera() {
  if (state.cameraReady || state.cameraPending) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    useManualControl('浏览器不支持摄像头', 'error');
    return;
  }
  state.cameraPending = true;
  const generation = ++state.cameraGeneration;
  try {
    setStatus('请求摄像头…');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (generation !== state.cameraGeneration) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    state.cameraStream = stream;
    video.srcObject = stream;
    await video.play();
    if (generation !== state.cameraGeneration) return;
    state.cameraReady = true;
    startFaceTracking();
    stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
      if (state.cameraStream !== stream) return;
      releaseCamera();
      useManualControl('摄像头已断开 · 可手动控制', 'error');
    }));
    setStatus('摄像头已连接', 'ok');
    controlMode.textContent = '键盘 / 点击';
    setupPose();
  } catch (error) {
    if (generation !== state.cameraGeneration) return;
    releaseCamera();
    useManualControl(error.name === 'NotAllowedError' ? '摄像头未授权 · 可继续玩' : '摄像头不可用 · 可继续玩', 'error');
  } finally {
    if (generation === state.cameraGeneration) state.cameraPending = false;
  }
}

let poseScriptPromise;
function loadPose() {
  if (window.Pose) return Promise.resolve();
  if (poseScriptPromise) return poseScriptPromise;
  poseScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const finish = (error) => {
      clearTimeout(timeout);
      script.onload = script.onerror = null;
      if (error) { script.remove(); reject(error); } else resolve();
    };
    const timeout = setTimeout(() => finish(new Error('Pose loading timed out')), 8000);
    script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/pose.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => finish(window.Pose ? null : new Error('Pose unavailable'));
    script.onerror = () => finish(new Error('Pose loading failed'));
    document.head.append(script);
  }).catch(error => { poseScriptPromise = null; throw error; });
  return poseScriptPromise;
}

function useManualControl(label, kind = '') {
  if (state.poseReady) {
    state.headTargetX = state.headX;
    state.manualTargetY = state.headY;
    state.headTargetY = state.headY;
  }
  state.poseReady = false;
  controlMode.textContent = '键盘 / 点击';
  actionHint.textContent = '点击画面或用方向键上下移动小鸟';
  setStatus(label, kind);
}

function stopPose() {
  state.poseGeneration++;
  cancelAnimationFrame(state.poseFrame);
  state.poseFrame = null;
  const pose = state.pose;
  state.pose = null;
  state.poseReady = false;
  state.poseLoopBusy = false;
  try { Promise.resolve(pose?.close()).catch(() => {}); } catch { /* 释放失败不影响手动模式 */ }
}

function releaseCamera() {
  stopFaceTracking();
  state.cameraGeneration++;
  state.cameraPending = false;
  useManualControl('摄像头已关闭 · 可手动控制');
  stopPose();
  state.cameraStream?.getTracks().forEach(track => track.stop());
  state.cameraStream = null;
  state.cameraReady = false;
  video.srcObject = null;
}
window.addEventListener('pagehide', () => { clearRecordFlash(); clearRecordCelebration(); music.pause(); releaseCamera(); });

function stopFaceTracking() {
  state.faceWorker?.terminate();
  state.faceWorker = null;
  state.faceReady = state.faceBusy = false;
  state.faceAnchor = null;
}

function startFaceTracking() {
  stopFaceTracking();
  try {
    const worker = new Worker(new URL('/vision/face-worker.js', location.href));
    state.faceWorker = worker;
    worker.onmessage = ({ data }) => {
      if (state.faceWorker !== worker) return;
      if (data.type === 'ready') { state.faceReady = true; return; }
      if (data.type === 'error') { stopFaceTracking(); return; }
      if (data.type !== 'result') return;
      state.faceBusy = false;
      const point = data.anchor;
      state.faceAnchor = point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 ? point : null;
      state.faceTime = performance.now();
    };
    worker.onerror = () => { if (state.faceWorker === worker) stopFaceTracking(); };
    worker.postMessage({ type: 'init', wasmPath: new URL('/vision/wasm', location.href).href, modelPath: new URL('/models/face_landmarker.task', location.href).href });
  } catch { stopFaceTracking(); }
}

async function requestFaceFrame(now) {
  if (!state.cameraReady || !state.faceReady || state.faceBusy || now < state.faceNextFrame || video.readyState < 2 || document.hidden) return;
  const worker = state.faceWorker;
  state.faceBusy = true;
  state.faceNextFrame = now + 125;
  let image;
  try {
    image = await createImageBitmap(video, { resizeWidth: 320, resizeHeight: Math.max(1, Math.round(320 * video.videoHeight / video.videoWidth)) });
    if (worker !== state.faceWorker) { image.close(); return; }
    worker.postMessage({ type: 'frame', image, timestamp: now, nose: state.poseReady ? state.nose : null }, [image]);
  } catch {
    image?.close();
    if (worker === state.faceWorker) stopFaceTracking();
  }
}

async function setupPose() {
  const generation = ++state.poseGeneration;
  useManualControl('摄像头已连接 · 正在加载识别', 'ok');
  try {
    await loadPose();
    if (!state.cameraReady || generation !== state.poseGeneration) return;
    const pose = new window.Pose({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}` });
    state.pose = pose;
    await pose.setOptions({ modelComplexity: 0, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: .55, minTrackingConfidence: .5 });
    if (state.pose !== pose || generation !== state.poseGeneration) return;
    pose.onResults(results => { if (state.pose === pose) handlePoseResults(results); });
    setStatus('摄像头已连接 · 等待头部入镜', 'ok');
    requestPoseFrame();
  } catch {
    if (generation !== state.poseGeneration) return;
    stopPose();
    useManualControl('动作识别不可用 · 可手动控制', 'error');
  }
}

function requestPoseFrame() {
  if (!state.pose || !state.cameraReady || state.poseLoopBusy) return;
  if (video.readyState < 2) { state.poseFrame = requestAnimationFrame(requestPoseFrame); return; }
  const pose = state.pose;
  state.poseLoopBusy = true;
  Promise.resolve().then(() => pose.send({ image: video })).catch(() => {
    if (state.pose !== pose) return;
    useManualControl('动作识别失败 · 可手动控制', 'error');
    stopPose();
  }).finally(() => {
    if (state.pose !== pose) return;
    state.poseLoopBusy = false;
    state.poseFrame = requestAnimationFrame(requestPoseFrame);
  });
}

function handlePoseResults(results) {
  const nose = results?.poseLandmarks?.[0];
  if (!nose || !Number.isFinite(nose.x) || nose.x < 0 || nose.x > 1 || !Number.isFinite(nose.y) || nose.y < 0 || nose.y > 1 || !Number.isFinite(nose.visibility ?? 1) || (nose.visibility ?? 1) < .45) {
    if (state.poseReady) useManualControl('头部暂时丢失 · 可手动控制');
    return;
  }
  const position = mapNoseToStage(nose);
  if (!position || position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1) {
    if (state.poseReady) useManualControl('鼻尖已离开画面 · 可手动控制');
    return;
  }
  if (!state.poseReady) {
    controlMode.textContent = '头部跟随控制';
    actionHint.textContent = '小鸟贴着鼻尖，移动头部穿过缺口';
    setStatus('头部识别正常', 'ok');
  }
  state.poseReady = true;
  state.lastPoseTime = performance.now();
  state.nose = { x: nose.x, y: nose.y };
  const facePoints = results.poseLandmarks.slice(1, 11)
    .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y) && (point.visibility ?? 1) >= .45)
    .map(mapNoseToStage).filter(Boolean);
  const faceTop = facePoints.length ? Math.min(...facePoints.map(point => point.y)) : position.y;
  state.headClearance = Math.max(42, (position.y - faceTop) * state.height + state.height * .045);
  state.headTargetX = position.x;
  state.headTargetY = position.y;
}

function mapNoseToStage(nose) {
  if (!video.videoWidth || !video.videoHeight || !state.width || !state.height) return null;
  const scale = Math.max(state.width / video.videoWidth, state.height / video.videoHeight);
  const imageWidth = video.videoWidth * scale;
  const imageHeight = video.videoHeight * scale;
  return {
    x: (state.width - (nose.x * imageWidth + (state.width - imageWidth) / 2)) / state.width,
    y: (nose.y * imageHeight + (state.height - imageHeight) / 2) / state.height,
  };
}

function playTone(frequency, duration, type = 'sine') {
  if (!state.audioEnabled) return;
  try {
    state.audioContext ||= new AudioContext();
    const oscillator = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.035, state.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, state.audioContext.currentTime + duration);
    oscillator.connect(gain).connect(state.audioContext.destination);
    oscillator.start(); oscillator.stop(state.audioContext.currentTime + duration);
    return () => { try { oscillator.stop(); } catch { /* Already finished. */ } };
  } catch { /* 音效不是核心功能 */ }
}

function startMusic() {
  if (!state.audioEnabled || document.hidden) return;
  music.play().catch(() => { soundButton.title = '背景音乐暂不可用，点击可重试'; });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { music.pause(); }
  else if (state.phase === 'playing' || state.phase === 'countdown') startMusic();
});

document.querySelector('#start-button').addEventListener('click', () => { enableCamera(); beginCountdown(); });
document.querySelector('#restart-button').addEventListener('click', beginCountdown);
document.querySelector('#home-button').addEventListener('click', () => {
  clearInterval(state.countdownTimer);
  clearRecordFlash(); clearRecordCelebration(); music.pause(); speedControl.hide();
  state.phase = 'ready'; state.pipes = []; state.score = 0;
  setScore(0); refreshTrainingHUD();
  gameoverPanel.classList.add('is-hidden'); introPanel.classList.remove('is-hidden');
});
function setTutorialOpen(open) {
  tutorialDrawer.classList.toggle('is-open', open);
  tutorialBackdrop.classList.toggle('is-hidden', !open);
}
document.querySelector('#learn-button').addEventListener('click', () => setTutorialOpen(true));
document.querySelector('#tutorial-button').addEventListener('click', () => setTutorialOpen(true));
document.querySelector('#close-tutorial').addEventListener('click', () => setTutorialOpen(false));
tutorialBackdrop.addEventListener('click', () => setTutorialOpen(false));
soundButton.addEventListener('click', () => {
  state.audioEnabled = !state.audioEnabled;
  soundButton.classList.toggle('is-muted', !state.audioEnabled);
  soundButton.textContent = state.audioEnabled ? '♫' : '×';
  soundButton.setAttribute('aria-pressed', String(!state.audioEnabled));
  soundButton.setAttribute('aria-label', state.audioEnabled ? '关闭音乐与音效' : '开启音乐与音效');
  if (!state.audioEnabled) { music.pause(); }
  else if (state.phase === 'playing' || state.phase === 'countdown') startMusic();
});
window.addEventListener('keydown', (event) => {
  if (event.target.closest('input, select, button, summary, [role=slider]') || tutorialDrawer.classList.contains('is-open')) {
    if (event.code === 'Escape') setTutorialOpen(false);
    return;
  }
  if (event.code === 'Space' || event.code === 'ArrowUp') { event.preventDefault(); flap(); }
  if (event.code === 'ArrowDown') {
    event.preventDefault();
    if (!state.poseReady || !state.cameraReady) {
      state.manualTargetY = Math.min(.84, state.manualTargetY + .1);
      state.headTargetY = state.manualTargetY;
    }
  }
  if (event.code === 'Escape') setTutorialOpen(false);
});
canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  if (state.poseReady && state.cameraReady) return;
  const rect = canvas.getBoundingClientRect();
  state.manualTargetY = Math.max(.14, Math.min(.84, (event.clientY - rect.top) / rect.height));
  state.headTargetY = state.manualTargetY;
  state.pulse = 1;
});

state.bestScore = readBestScore();
renderPersonalBest();
setScore(0);
setStatus('准备摄像头');
refreshTrainingHUD();
