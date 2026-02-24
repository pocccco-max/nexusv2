/* ══════════════════════════════════════════════════════════
   ATOM PHYSICS TIMER — hourglass.js
   Nexus AI v1.0.0
   Requires: Storage utility (in index.html)
══════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  const canvas    = document.getElementById('atom-canvas');
  if (!canvas) return;
  const ctx       = canvas.getContext('2d');
  const startBtn  = document.getElementById('atom-start');
  const pauseBtn  = document.getElementById('atom-pause');
  const resetBtn  = document.getElementById('atom-reset');
  const minInput  = document.getElementById('atom-min');
  const secInput  = document.getElementById('atom-sec-inp');
  const presetsEl = document.getElementById('atom-presets');
  const timeDisplay  = document.getElementById('atom-time');
  const statusLabel  = document.getElementById('atom-status-label');
  const finishedEl   = document.getElementById('atom-finished');

  let W = 500, H = 500, animId = null;
  let isRunning = false, isPaused = false;
  let totalDuration = 300, elapsedTime = 0, lastTimestamp = null;

  /* ── Atom config ── */
  const NUCLEUS_RADIUS = 28;
  const PROTON_COUNT   = 8;
  const NEUTRON_COUNT  = 8;

  const ORBITS = [
    { a: 140, b: 50,  tilt: 0,                 electrons: 2, speed: 1.0,  phase: 0    },
    { a: 160, b: 55,  tilt: Math.PI / 3,        electrons: 2, speed: 0.75, phase: 1.05 },
    { a: 155, b: 52,  tilt: 2 * Math.PI / 3,   electrons: 3, speed: 0.6,  phase: 2.1  },
    { a: 145, b: 48,  tilt: Math.PI / 5,        electrons: 3, speed: 0.85, phase: 0.5  },
  ];

  let electronAngles = ORBITS.map(o =>
    Array.from({ length: o.electrons }, (_, i) => (i / o.electrons) * Math.PI * 2)
  );

  /* ── Nucleus particles ── */
  const nucleons = [];
  for (let i = 0; i < PROTON_COUNT + NEUTRON_COUNT; i++) {
    const r = (Math.random() * 0.6 + 0.4) * NUCLEUS_RADIUS;
    const a = Math.random() * Math.PI * 2;
    nucleons.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      r: 5 + Math.random() * 3,
      isProton:   i < PROTON_COUNT,
      drift:      Math.random() * Math.PI * 2,
      driftAmp:   1.5 + Math.random() * 2,
      driftSpeed: 0.4 + Math.random() * 0.8
    });
  }

  /* ── Helpers ── */
  function getStyle(v) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }

  function resize() {
    const view   = document.getElementById('atom-view');
    const viewW  = view ? view.clientWidth : window.innerWidth;
    const maxW   = Math.min(viewW - 40, 480);
    const maxH   = Math.min(window.innerHeight * 0.48, 480);
    const size   = Math.max(Math.min(maxW, maxH), 120);
    W = H = size;
    const dpr    = window.devicePixelRatio || 1;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
  }

  function getProgress() {
    return (isRunning || isPaused) ? Math.min(elapsedTime / totalDuration, 1) : 0;
  }

  /* ── Draw: Nucleus ── */
  function drawNucleus(t) {
    const cx = W / 2, cy = H / 2;
    const a1 = getStyle('--a1');
    const a2 = getStyle('--a2');
    const a3 = getStyle('--a3');

    // Outer glow
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, NUCLEUS_RADIUS * 2.2);
    grd.addColorStop(0,   a1 + '66');
    grd.addColorStop(0.5, a2 + '33');
    grd.addColorStop(1,   'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, NUCLEUS_RADIUS * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Nucleons
    for (const n of nucleons) {
      const dx = Math.cos(t * n.driftSpeed + n.drift) * n.driftAmp;
      const dy = Math.sin(t * n.driftSpeed * 1.3 + n.drift) * n.driftAmp;
      const nx = cx + n.x + dx;
      const ny = cy + n.y + dy;
      const col = n.isProton ? a2 : a3;
      const g   = ctx.createRadialGradient(nx - n.r * 0.3, ny - n.r * 0.3, 0, nx, ny, n.r);
      g.addColorStop(0,   '#fff8');
      g.addColorStop(0.4, col);
      g.addColorStop(1,   col + '99');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(nx, ny, n.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Core shimmer
    const core = ctx.createRadialGradient(cx - 4, cy - 4, 0, cx, cy, NUCLEUS_RADIUS * 0.7);
    core.addColorStop(0, '#ffffff44');
    core.addColorStop(1, 'transparent');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, NUCLEUS_RADIUS * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ── Draw: Orbits + Electrons ── */
  function drawOrbits(t, progress) {
    const cx = W / 2, cy = H / 2;
    const a2 = getStyle('--a2');
    const a3 = getStyle('--a3');

    ORBITS.forEach((orbit, oi) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(orbit.tilt);

      // Orbit path
      ctx.beginPath();
      ctx.ellipse(0, 0, orbit.a, orbit.b, 0, 0, Math.PI * 2);
      ctx.strokeStyle = a2 + '28';
      ctx.lineWidth   = 1.2;
      ctx.stroke();

      // Progress arc on first orbit
      if (oi === 0 && progress > 0) {
        ctx.beginPath();
        ctx.ellipse(0, 0, orbit.a, orbit.b, 0, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        ctx.strokeStyle = a3 + 'cc';
        ctx.lineWidth   = 2.5;
        ctx.stroke();
      }

      // Electrons
      electronAngles[oi].forEach((angle, ei) => {
        const speed = orbit.speed * (isRunning && !isPaused ? 0.02 : 0.004);
        electronAngles[oi][ei] += speed;
        const ea  = electronAngles[oi][ei];
        const ex  = Math.cos(ea) * orbit.a;
        const ey  = Math.sin(ea) * orbit.b;

        // Trail
        for (let tr = 1; tr <= 8; tr++) {
          const ta  = ea - tr * 0.05 * (speed / 0.02);
          const tex = Math.cos(ta) * orbit.a;
          const tey = Math.sin(ta) * orbit.b;
          ctx.beginPath();
          ctx.arc(tex, tey, 2 * (1 - tr / 9), 0, Math.PI * 2);
          ctx.fillStyle = a3 + Math.floor((1 - tr / 9) * 60).toString(16).padStart(2, '0');
          ctx.fill();
        }

        // Electron glow
        const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 5);
        eg.addColorStop(0,   '#fff');
        eg.addColorStop(0.4, a3);
        eg.addColorStop(1,   a2 + '00');
        ctx.beginPath();
        ctx.arc(ex, ey, 5, 0, Math.PI * 2);
        ctx.fillStyle = eg;
        ctx.fill();

        // Glow ring
        ctx.beginPath();
        ctx.arc(ex, ey, 5, 0, Math.PI * 2);
        ctx.shadowColor = a3;
        ctx.shadowBlur  = 12;
        ctx.fillStyle   = a3 + 'aa';
        ctx.fill();
        ctx.shadowBlur  = 0;
      });

      ctx.restore();
    });
  }

  /* ── Draw: Energy rings (running only) ── */
  function drawEnergyRings(t) {
    if (!isRunning || isPaused) return;
    const cx = W / 2, cy = H / 2;
    const a3 = getStyle('--a3');
    for (let r = 0; r < 3; r++) {
      const radius = 170 + r * 25 + Math.sin(t * 1.2 + r * 2.1) * 4;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = a3 + Math.floor((0.04 - r * 0.01) * 255).toString(16).padStart(2, '0');
      ctx.lineWidth   = 1;
      ctx.stroke();
    }
  }

  /* ── Animation loop ── */
  let tick = 0;
  function animate() {
    tick += 0.016;
    ctx.clearRect(0, 0, W, H);
    const progress = getProgress();
    drawEnergyRings(tick);
    drawOrbits(tick, progress);
    drawNucleus(tick);
    animId = requestAnimationFrame(animate);
  }

  /* ── Timer display ── */
  function updateDisplay() {
    const remaining = Math.max(0, totalDuration - elapsedTime);
    const m = Math.floor(remaining / 60);
    const s = Math.floor(remaining % 60);
    timeDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /* ── Timer loop ── */
  function timerLoop(ts) {
    if (!isRunning || isPaused) return;
    if (lastTimestamp !== null) {
      elapsedTime += (ts - lastTimestamp) / 1000;
    }
    lastTimestamp = ts;
    updateDisplay();
    if (elapsedTime >= totalDuration) {
      elapsedTime = totalDuration;
      updateDisplay();
      stop();
      finishedEl.classList.add('show');
      statusLabel.textContent = 'complete';
      return;
    }
    requestAnimationFrame(timerLoop);
  }

  /* ── Input helpers ── */
  function getDurationFromInputs() {
    const m = parseInt(minInput?.value) || 0;
    const s = parseInt(secInput?.value) || 0;
    return Math.max(1, m * 60 + s);
  }

  function syncInputsFromDuration(secs) {
    if (minInput) minInput.value = Math.floor(secs / 60);
    if (secInput) secInput.value = String(secs % 60).padStart(2, '0');
  }

  /* ── Presets ── */
  if (presetsEl) {
    presetsEl.querySelectorAll('.atom-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        if (isRunning) return;
        const sec = parseInt(btn.dataset.sec);
        presetsEl.querySelectorAll('.atom-preset').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        syncInputsFromDuration(sec);
        totalDuration = sec;
        updateDisplay();
      });
    });
  }

  /* ── Custom inputs ── */
  function onCustomInput() {
    if (isRunning) return;
    presetsEl?.querySelectorAll('.atom-preset').forEach(b => b.classList.remove('active'));
    const sec = getDurationFromInputs();
    presetsEl?.querySelectorAll('.atom-preset').forEach(b => {
      if (parseInt(b.dataset.sec) === sec) b.classList.add('active');
    });
    totalDuration = sec;
    updateDisplay();
  }
  minInput?.addEventListener('input', onCustomInput);
  secInput?.addEventListener('input', onCustomInput);

  /* ── Start / Pause / Stop / Reset ── */
  function start() {
    if (isRunning && !isPaused) return;
    if (!isRunning) {
      totalDuration = getDurationFromInputs();
      elapsedTime   = 0;
      finishedEl.classList.remove('show');
    }
    isRunning = true; isPaused = false; lastTimestamp = null;
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    if (minInput) minInput.disabled = true;
    if (secInput) secInput.disabled = true;
    presetsEl?.querySelectorAll('.atom-preset').forEach(b => b.style.pointerEvents = 'none');
    statusLabel.textContent = 'running';
    requestAnimationFrame(timerLoop);
  }

  function pause() {
    if (!isRunning) return;
    isPaused = true; lastTimestamp = null;
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    statusLabel.textContent = 'paused';
  }

  function stop() {
    isRunning = false; isPaused = false; lastTimestamp = null;
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    if (minInput) minInput.disabled = false;
    if (secInput) secInput.disabled = false;
    presetsEl?.querySelectorAll('.atom-preset').forEach(b => b.style.pointerEvents = '');
  }

  function reset() {
    stop();
    elapsedTime = 0;
    finishedEl.classList.remove('show');
    totalDuration = getDurationFromInputs();
    updateDisplay();
    statusLabel.textContent = 'ready';
  }

  /* ── Events ── */
  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', pause);
  resetBtn.addEventListener('click', reset);
  window.addEventListener('resize', resize);

  /* ── Init ── */
  resize();
  totalDuration = getDurationFromInputs();
  updateDisplay();
  animate(0);

  /* ── Public API ── */
  window.AtomTimer = { resize, start, pause, stop, reset };
})();
