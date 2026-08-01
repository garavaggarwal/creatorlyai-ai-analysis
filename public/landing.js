/* ── Particles ── */
function createParticles() {
  const c = document.getElementById('bgParticles');
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const s = Math.random() * 5 + 2;
    p.style.cssText = `width:${s}px;height:${s}px;left:${Math.random()*100}%;animation-duration:${Math.random()*14+9}s;animation-delay:${Math.random()*12}s;`;
    c.appendChild(p);
  }
}

/* ── Navbar ── */
function initNavbar() {
  const nb = document.getElementById('navbar');
  window.addEventListener('scroll', () => nb.classList.toggle('scrolled', window.scrollY > 60), { passive: true });
}

/* ── Stat counter + bar ── */
function animateStats() {
  document.querySelectorAll('.stat-card').forEach(card => {
    const numEl = card.querySelector('.stat-num');
    const bar   = card.querySelector('.stat-bar-fill');
    const target  = parseFloat(numEl.dataset.target);
    const suffix  = numEl.dataset.suffix || '';
    const decimal = parseInt(numEl.dataset.decimal || '0');
    const dur = 1600;
    const start = performance.now();

    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

    function tick(now) {
      const t = Math.min((now - start) / dur, 1);
      const val = easeOut(t) * target;
      numEl.textContent = (decimal > 0 ? val.toFixed(decimal) : Math.floor(val)) + suffix;
      if (t < 1) requestAnimationFrame(tick);
      else numEl.textContent = (decimal > 0 ? target.toFixed(decimal) : target) + suffix;
    }
    requestAnimationFrame(tick);
    if (bar) setTimeout(() => { bar.style.width = bar.style.width; }, 100);
  });
}

/* ── Demo ring + bars animation ── */
const demoScores = [
  [9.1, 8.3, 7.2],
  [7.2, 9.0, 8.1],
  [8.8, 7.5, 6.8],
];
const demoVerdicts = ['Excellent', 'Good', 'Excellent'];
const demoCaptions = [
  'POV: You finally found your peace 🏔️',
  'This place changed me forever. No filter needed.',
  'Not all those who wander are lost 🌿',
];
let demoIdx = 0;

function runDemoAnimation() {
  const scores = demoScores[demoIdx % demoScores.length];
  const overall = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  const color = overall >= 8 ? '#22c55e' : overall >= 6.5 ? '#a855f7' : '#eab308';
  const circumference = 314;
  const targetOffset = circumference - (overall / 10) * circumference;

  const ring     = document.getElementById('demoRing');
  const scoreEl  = document.getElementById('demoScore');
  const verdictEl = document.getElementById('demoVerdict');
  const perfEl   = document.getElementById('demoPerf');
  const captionEl = document.getElementById('demoCaptionText');

  // Reset ring
  ring.style.stroke = color;
  ring.style.strokeDashoffset = circumference;
  scoreEl.style.color = color;
  scoreEl.textContent = '0';
  verdictEl.textContent = 'Analysing...';
  perfEl.textContent = '';
  if (captionEl) captionEl.textContent = '';

  // Reset bars
  document.querySelectorAll('.demo-bar-fill-anim').forEach(b => { b.style.width = '0'; });

  const dur = 1400;
  const start = performance.now();
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function tick(now) {
    const t = Math.min((now - start) / dur, 1);
    const e = easeOut(t);
    ring.style.strokeDashoffset = circumference - e * (circumference - targetOffset);
    scoreEl.textContent = (e * overall).toFixed(1);
    if (t < 1) requestAnimationFrame(tick);
    else {
      ring.style.strokeDashoffset = targetOffset;
      scoreEl.textContent = overall;
      verdictEl.textContent = overall >= 8 ? 'Excellent' : overall >= 6.5 ? 'Good' : 'Average';
      perfEl.textContent = overall >= 8 ? '🔥 Viral Potential' : overall >= 6.5 ? '⬆️ Above Average' : '➡️ Average';
      if (captionEl) captionEl.textContent = demoCaptions[demoIdx % demoCaptions.length];
    }
  }
  requestAnimationFrame(tick);

  // Animate bars
  const barRows = document.querySelectorAll('.demo-bar-row');
  barRows.forEach((row, i) => {
    const fill  = row.querySelector('.demo-bar-fill-anim');
    const score = scores[i];
    const c     = row.dataset.color;
    fill.style.background = c;
    setTimeout(() => { fill.style.width = (score / 10 * 100) + '%'; }, 200 + i * 80);
  });

  demoIdx++;
}

/* ── Scroll reveal ── */
function initReveal() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

  // Trigger stat bars when in view
  const statsObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        document.querySelectorAll('.stat-bar-fill').forEach(b => { b.style.width = b.style.width; });
        animateStats();
        statsObs.disconnect();
      }
    });
  }, { threshold: 0.3 });
  const statsRow = document.querySelector('.stats-row');
  if (statsRow) statsObs.observe(statsRow);

  // Trigger demo when in view
  const demoObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        runDemoAnimation();
        demoObs.disconnect();
      }
    });
  }, { threshold: 0.3 });
  const demo = document.querySelector('.demo-wrap');
  if (demo) demoObs.observe(demo);
}

/* ── Repeat demo every 5s ── */
function initDemoLoop() {
  // After first trigger, re-run every 5s with slightly varied scores for realism
  setInterval(() => {
    // Add small random fluctuation to scores to look like live data
    demoScores[demoIdx % demoScores.length] = demoScores[demoIdx % demoScores.length].map(s => {
      const delta = (Math.random() - 0.5) * 0.8;
      return Math.min(10, Math.max(5, parseFloat((s + delta).toFixed(1))));
    });
    runDemoAnimation();
  }, 5000);
}

/* ── 3D tilt on stat cards ── */
function initTilt() {
  document.querySelectorAll('.stat-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `translateY(-6px) rotateX(${-y * 10}deg) rotateY(${x * 10}deg)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  createParticles();
  initNavbar();
  initReveal();
  initDemoLoop();
  initTilt();

  // Live bar fluctuation — makes demo bars move like a real graph every 2.5s
  setInterval(() => {
    document.querySelectorAll('.demo-bar-row').forEach(row => {
      const baseScore = parseFloat(row.dataset.score);
      const delta = (Math.random() - 0.5) * 1.4;
      const newScore = Math.min(10, Math.max(4.5, parseFloat((baseScore + delta).toFixed(1))));
      const fill = row.querySelector('.demo-bar-fill-anim');
      const val  = row.querySelector('.demo-bar-val');
      if (fill) fill.style.width = (newScore / 10 * 100) + '%';
      if (val)  val.textContent = newScore.toFixed(1);
    });
  }, 2500);
});
