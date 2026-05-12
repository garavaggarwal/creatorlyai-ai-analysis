/* ── Left panel typewriter ── */
const leftPhrases = ['Start growing today.', 'Go viral with AI.', 'Know your score.', 'Fix your hook.'];
let lIdx = 0, lChar = 0, lDel = false;
const leftTyped = document.getElementById('leftTyped');
function leftTypeLoop() {
  if (!leftTyped) return;
  const cur = leftPhrases[lIdx];
  leftTyped.textContent = lDel ? cur.substring(0, lChar - 1) : cur.substring(0, lChar + 1);
  lDel ? lChar-- : lChar++;
  let d = lDel ? 45 : 70;
  if (!lDel && lChar === cur.length) { d = 2000; lDel = true; }
  else if (lDel && lChar === 0) { lDel = false; lIdx = (lIdx + 1) % leftPhrases.length; d = 300; }
  setTimeout(leftTypeLoop, d);
}

/* ── Animate reel stat counters ── */
function animateReelStats() {
  document.querySelectorAll('.reel-stat-num').forEach(el => {
    const target = parseInt(el.dataset.target);
    const suffix = el.dataset.suffix || '';
    const dur = 2000;
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const val = ease * target;
      if (target >= 1000000) el.textContent = (val / 1000000).toFixed(1) + 'M';
      else if (target >= 1000) el.textContent = Math.floor(val / 1000) + 'K';
      else el.textContent = Math.floor(val);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}
const quotes = [
  { text: "Content is the atomic particle of all digital marketing.", author: "Rebecca Lieb" },
  { text: "Your brand is what people say about you when you're not in the room.", author: "Jeff Bezos" },
  { text: "Create content that teaches. You can't give up. You need to be consistently awesome.", author: "Neil Patel" },
  { text: "The best marketing doesn't feel like marketing.", author: "Tom Fishburne" },
  { text: "In a world of algorithms, hashtags and followers, know the true measure of your influence.", author: "Germany Kent" },
  { text: "Creativity is intelligence having fun.", author: "Albert Einstein" },
  { text: "Stop interrupting what people are interested in and be what people are interested in.", author: "Craig Davis" },
];

function typeWriter(el, text, speed = 28, cb) {
  el.textContent = '';
  let i = 0;
  const interval = setInterval(() => {
    el.textContent += text[i++];
    if (i >= text.length) { clearInterval(interval); if (cb) cb(); }
  }, speed);
}

function showRandomQuote() {
  const q = quotes[Math.floor(Math.random() * quotes.length)];
  const textEl   = document.getElementById('quoteText');
  const authorEl = document.getElementById('quoteAuthor');
  authorEl.textContent = '';
  typeWriter(textEl, q.text, 25, () => {
    setTimeout(() => { authorEl.textContent = '— ' + q.author; }, 200);
  });
}

function createParticles() {
  const container = document.getElementById('bgParticles');
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 6 + 3;
    p.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;animation-duration:${Math.random()*12+8}s;animation-delay:${Math.random()*10}s;`;
    container.appendChild(p);
  }
}

/* ── Tab switching ── */
function switchTab(tab) {
  const loginForm  = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const tabLogin   = document.getElementById('tabLogin');
  const tabSignup  = document.getElementById('tabSignup');
  const indicator  = document.getElementById('tabIndicator');
  const switchText = document.getElementById('switchText');

  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    indicator.classList.remove('right');
    switchText.innerHTML = `Don't have an account? <a href="#" onclick="switchTab('signup'); return false;">Sign up free</a>`;
    document.getElementById('authTitle').textContent = 'Welcome back';
    document.getElementById('authSubtitle').textContent = 'Login to analyse your reels and grow faster';
  } else {
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
    tabLogin.classList.remove('active');
    tabSignup.classList.add('active');
    indicator.classList.add('right');
    switchText.innerHTML = `Already have an account? <a href="#" onclick="switchTab('login'); return false;">Login</a>`;
    document.getElementById('authTitle').textContent = 'Create your account';
    document.getElementById('authSubtitle').textContent = 'Join thousands of Indian creators growing with AI';
  }
  const card = document.getElementById('authCard');
  card.style.transform = 'scale(0.98)';
  setTimeout(() => { card.style.transform = 'scale(1)'; }, 150);
}

function togglePassword(id, btn) {
  const input = document.getElementById(id);
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.textContent = input.type === 'password' ? '👁' : '🙈';
}

/* ── Toast ── */
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 4000);
}

/* ── Set button loading state ── */
function setLoading(btn, loading, text) {
  btn.disabled = loading;
  btn.querySelector('.btn-auth-text').textContent = loading ? text : btn.dataset.original;
}

/* ── LOGIN ── */
async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('.btn-auth');
  const email    = form.querySelector('input[type="email"]').value.trim();
  const password = form.querySelector('input[type="password"]').value;

  if (!btn.dataset.original) btn.dataset.original = btn.querySelector('.btn-auth-text').textContent;
  setLoading(btn, true, 'Logging in…');

  try {
    await signIn({ email, password });
    showToast('✅ Welcome back!', 'success');
    setTimeout(() => { window.location.href = '/analyser'; }, 1000);
  } catch (err) {
    console.error('Login error:', err);
    showToast('❌ ' + (err.message || 'Login failed'), 'error');
    form.classList.add('shake');
    setTimeout(() => form.classList.remove('shake'), 500);
    setLoading(btn, false);
  }
}

/* ── SIGNUP ── */
async function handleSignup(e) {
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('.btn-auth');
  const inputs = form.querySelectorAll('input');
  const fullName        = inputs[0].value.trim();
  const email           = inputs[1].value.trim();
  const password        = inputs[2].value;
  const instagramHandle = inputs[3].value.trim().replace('@', '');
  const mobile          = inputs[4].value.trim();

  if (!btn.dataset.original) btn.dataset.original = btn.querySelector('.btn-auth-text').textContent;
  setLoading(btn, true, 'Creating account…');

  try {
    await signUp({ email, password, fullName, instagramHandle, mobile });
    showToast('🎉 Account created! Check your email to verify.', 'success');
    setTimeout(() => { window.location.href = '/analyser'; }, 1500);
  } catch (err) {
    console.error('Signup error:', err);
    showToast('❌ ' + (err.message || 'Signup failed'), 'error');
    form.classList.add('shake');
    setTimeout(() => form.classList.remove('shake'), 500);
    setLoading(btn, false);
  }
}

/* ── Social login ── */
function socialLogin(provider) {
  if (provider === 'Google') {
    signInWithGoogle();
    return;
  }
  showToast(`${provider} login coming soon!`, 'success');
}

/* ── Redirect if already logged in ── */
function checkAlreadyLoggedIn() {
  if (isLoggedIn()) {
    window.location.href = '/analyser';
  }
}

/* ── Input focus effects ── */
function addInputEffects() {
  document.querySelectorAll('.input-wrap input').forEach(input => {
    input.addEventListener('focus', () => {
      input.closest('.form-group').querySelector('label').style.color = '#a855f7';
    });
    input.addEventListener('blur', () => {
      input.closest('.form-group').querySelector('label').style.color = '';
    });
  });
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  checkAlreadyLoggedIn();
  createParticles();
  showRandomQuote();
  addInputEffects();
  leftTypeLoop();
  setTimeout(animateReelStats, 600);
  const card = document.getElementById('authCard');
  if (card) card.style.transition = 'transform 0.15s ease';
});
