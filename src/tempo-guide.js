import { TempoClock, validateTempo } from './tempo.js';

const phases = [
  { name: '慢下', breath: '轻轻吸气，受控下降', voice: '慢下，吸气', tone: 240 },
  { name: '停住', breath: '保持稳定，自然呼吸，不必憋气', voice: '停住', tone: 660 },
  { name: '推起', breath: '推起时呼气，自然伸直，避免过伸', voice: '推起，呼气', tone: 880 },
];

export function createTempoGuide({ music, audioEnabled, tone, onCycle, onPause }) {
  const panel = document.querySelector('#tempo-panel');
  const phaseLabel = document.querySelector('#tempo-phase');
  const seconds = document.querySelector('#tempo-seconds');
  const breath = document.querySelector('#tempo-breath');
  const pauseButton = document.querySelector('#tempo-pause');
  const segments = [...panel.querySelectorAll('.tempo-segment')];
  let clock = new TempoClock([2, 1, 2]);
  let voice = false;
  let cueKey = '';
  let speechTimer;
  let stopTone;
  let voiceGeneration = 0;
  let current = clock.snapshot();

  function silence() {
    voiceGeneration++;
    clearTimeout(speechTimer);
    stopTone?.(); stopTone = null;
    try { window.speechSynthesis?.cancel(); } catch { /* Optional device capability. */ }
    music.volume = .24;
  }

  function cue(view) {
    silence();
    if (!audioEnabled()) return;
    const phase = phases[view.index];
    stopTone = tone(phase.tone, view.index === 0 ? .35 : .12);
    if (!voice || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    try {
      const generation = voiceGeneration;
      const utterance = new window.SpeechSynthesisUtterance(phase.voice);
      utterance.lang = 'zh-CN';
      utterance.rate = 1.05;
      music.volume = .08;
      const restore = () => { if (generation === voiceGeneration) music.volume = .24; };
      utterance.onend = utterance.onerror = restore;
      // Devices without an installed voice may never fire completion callbacks.
      speechTimer = setTimeout(restore, 1800);
      window.speechSynthesis.speak(utterance);
    } catch { music.volume = .24; }
  }

  function render(view) {
    panel.dataset.phase = view.phase;
    panel.dataset.status = view.status;
    const label = view.status === 'paused' ? view.reason : phases[view.index].name;
    if (phaseLabel.textContent !== label) phaseLabel.textContent = label;
    seconds.textContent = view.status === 'running' ? `${view.remaining.toFixed(1)}s` : '—';
    breath.textContent = view.status === 'paused' ? '准备好后继续，本周期会从慢下重新开始' : phases[view.index].breath;
    pauseButton.textContent = view.status === 'paused' ? '准备继续' : '暂停休息';
    for (let index = 0; index < segments.length; index++) {
      segments[index].style.flex = String(clock.durations[index]);
      segments[index].hidden = clock.durations[index] === 0;
      segments[index].classList.toggle('is-active', index === view.index && view.status === 'running');
      segments[index].querySelector('i').style.transform = `scaleX(${index < view.index ? 1 : index === view.index ? view.progress : 0})`;
    }
  }

  function pause(reason = '休息一下，按自己的节奏来') {
    clock.pause(reason);
    current = clock.snapshot();
    panel.classList.remove('is-hidden');
    silence(); render(current); onPause();
  }

  return {
    configure(durations, useVoice) {
      silence();
      clock = new TempoClock(validateTempo(durations));
      current = clock.snapshot(); voice = useVoice; cueKey = '';
    },
    get durations() { return clock.durations; },
    get paused() { return clock.status === 'paused'; },
    get completed() { return clock.completed ?? 0; },
    setRate(now, rate) {
      const wasRunning = clock.status === 'running';
      current = clock.setRate(now, rate);
      if (wasRunning && current.status === 'paused') { silence(); onPause(); }
      if (current.cycleEvent) onCycle(current.completed);
      render(current);
    },
    prepare(reset = false) {
      silence();
      if (reset) {
        const rate = clock.rate;
        clock = new TempoClock(clock.durations);
        clock.setRate(performance.now(), rate);
      }
      panel.classList.add('is-hidden');
    },
    start(now, reset = false) {
      clock.start(now, reset); cueKey = '';
      panel.classList.remove('is-hidden');
      this.update(now);
    },
    pause,
    silence,
    stop() { silence(); clock.pause('训练已结束'); panel.classList.add('is-hidden'); },
    update(now) {
      const wasRunning = clock.status === 'running';
      current = clock.tick(now);
      if (wasRunning && current.status === 'paused') { silence(); onPause(); }
      if (current.cycleEvent) onCycle(current.completed);
      const key = `${current.completed}:${current.phase}`;
      if (current.status === 'running' && key !== cueKey) { cueKey = key; cue(current); }
      render(current);
    },
    draw(ctx, width, height) {
      const mobile = width <= 720;
      const x1 = width * .13, x2 = width * .87;
      const top = height * (mobile ? .4 : .34), bottom = height * .59;
      const total = clock.total;
      const point = elapsed => {
        const [down, hold, up] = clock.durations.map(n => n * 1000);
        const y = elapsed <= down ? top + (bottom - top) * elapsed / down : elapsed <= down + hold ? bottom : bottom - (bottom - top) * Math.min(1, (elapsed - down - hold) / up);
        return { x: x1 + (x2 - x1) * elapsed / total, y };
      };
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineWidth = 22;
      ctx.strokeStyle = 'rgba(169,227,75,.15)'; ctx.beginPath();
      const boundaries = [0, clock.durations[0] * 1000, (clock.durations[0] + clock.durations[1]) * 1000, total];
      boundaries.forEach((time, index) => { const p = point(time); if (index) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#a9e34b'; ctx.setLineDash([7, 8]); ctx.stroke(); ctx.setLineDash([]);
      const target = point(current.elapsed);
      ctx.beginPath(); ctx.arc(target.x, target.y, 11, 0, Math.PI * 2);
      ctx.fillStyle = '#fff8e8'; ctx.fill(); ctx.strokeStyle = '#274f37'; ctx.stroke();
      ctx.fillStyle = '#fff8e8'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('节奏示意 · 动作幅度按自己舒适范围', width / 2, top - 22);
      ctx.restore();
    },
  };
}
