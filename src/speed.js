export const clampSpeed = value => Number.isFinite(value) ? Math.max(.5, Math.min(2, Math.round(value * 10) / 10)) : 1;

// Horizontal movement is deliberate: drag left to go faster, right to slow down.
export const dragSpeed = (start, deltaX) => clampSpeed(start - Math.trunc(deltaX / 32) / 10);

export function bindSpeedControl({ slider, onChange }) {
  const controls = document.querySelector('#speed-controls');
  const increase = document.querySelector('#speed-increase');
  const decrease = document.querySelector('#speed-decrease');
  const reset = document.querySelector('#speed-reset');
  const percent = document.querySelector('#speed-percent');
  let factor = 1;
  let drag;

  function set(value, notify = true) {
    const next = clampSpeed(value);
    const previous = factor;
    factor = next;
    slider.setAttribute('aria-valuenow', String(Math.round(factor * 100)));
    slider.setAttribute('aria-valuetext', `${Math.round(factor * 100)}% 默认速度，左拨加速，右拨减速`);
    percent.textContent = `${Math.round(factor * 100)}%`;
    increase.disabled = factor >= 2;
    decrease.disabled = factor <= .5;
    if (notify && previous !== next) onChange(next, previous);
  }
  function show() { controls.hidden = false; slider.setAttribute('aria-expanded', 'true'); }
  function hide() { controls.hidden = true; slider.setAttribute('aria-expanded', 'false'); }

  slider.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    slider.focus({ preventScroll: true });
    slider.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: factor, axis: null };
    show();
  });
  slider.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 10) drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (drag.axis === 'x') set(dragSpeed(drag.start, dx));
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) slider.addEventListener(type, () => { drag = null; });
  slider.addEventListener('keydown', event => {
    const keys = { ArrowLeft: factor + .1, ArrowUp: factor + .1, ArrowRight: factor - .1, ArrowDown: factor - .1, Home: 1, End: 2 };
    if (Object.hasOwn(keys, event.key)) { event.preventDefault(); event.stopPropagation(); show(); set(keys[event.key]); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); controls.hidden ? show() : hide(); }
    else if (event.key === 'Escape') { hide(); event.stopPropagation(); }
  });
  slider.addEventListener('click', event => { event.preventDefault(); show(); });
  increase.addEventListener('click', () => set(factor + .1));
  decrease.addEventListener('click', () => set(factor - .1));
  reset.addEventListener('click', () => set(1));
  document.addEventListener('pointerdown', event => {
    if (!slider.contains(event.target) && !controls.contains(event.target)) hide();
  });
  document.addEventListener('focusin', event => {
    if (event.target !== slider && !controls.contains(event.target)) hide();
  });
  set(1);
  return { get factor() { return factor; }, sync(value) { set(value, false); }, hide };
}
