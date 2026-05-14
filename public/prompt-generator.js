/* ── Prompt Generator Page ── */
const API_BASE = 'https://web-production-7bc95.up.railway.app';

// Auth check
(function checkAuth() {
  if (window.location.hash && window.location.hash.includes('access_token')) {
    if (typeof handleOAuthCallback === 'function') handleOAuthCallback();
    return;
  }
  if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
    window.location.href = '/login';
  }
})();

const pgForm = document.getElementById('pgForm');
const pgIdea = document.getElementById('pgIdea');
const pgTool = document.getElementById('pgTool');
const pgSubmitBtn = document.getElementById('pgSubmitBtn');
const pgCharCount = document.getElementById('pgCharCount');
const pgLoading = document.getElementById('pgLoading');
const pgResults = document.getElementById('pgResults');
const pgResultsTool = document.getElementById('pgResultsTool');
const pgPromptsList = document.getElementById('pgPromptsList');
const pgError = document.getElementById('pgError');
const pgErrorMsg = document.getElementById('pgErrorMsg');
const pgAgainBtn = document.getElementById('pgAgainBtn');
const pgRetryBtn = document.getElementById('pgRetryBtn');

// Character count + enable/disable submit
pgIdea.addEventListener('input', () => {
  const len = pgIdea.value.length;
  pgCharCount.textContent = len;
  pgSubmitBtn.disabled = len < 10;
});

// Submit
pgForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const idea = pgIdea.value.trim();
  if (idea.length < 10) return;

  pgForm.hidden = true;
  pgResults.hidden = true;
  pgError.hidden = true;
  pgLoading.hidden = false;

  const session = typeof getRawSession === 'function' ? getRawSession() : null;
  const authToken = session?.access_token || null;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const resp = await fetch(`${API_BASE}/api/generate-prompts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ idea, tool: pgTool.value }),
    });

    const json = await resp.json();

    if (!resp.ok || !json.success) {
      throw new Error(json.error || 'Failed to generate prompts');
    }

    pgLoading.hidden = true;
    pgResults.hidden = false;
    pgResultsTool.textContent = `Optimized for: ${json.tool || pgTool.value}`;
    renderPrompts(json.prompts);

  } catch (err) {
    pgLoading.hidden = true;
    pgError.hidden = false;
    pgErrorMsg.textContent = err.message || 'Something went wrong';
  }
});

function renderPrompts(prompts) {
  pgPromptsList.innerHTML = prompts.map((text, i) => `
    <div class="pg-prompt-card">
      <div class="pg-prompt-num">Prompt ${i + 1}</div>
      <div class="pg-prompt-text">${escapeHtml(text)}</div>
      <button class="pg-copy-btn" onclick="copyPrompt(this, ${i})">Copy</button>
    </div>
  `).join('');
  window._generatedPrompts = prompts;
}

function copyPrompt(btn, idx) {
  const text = window._generatedPrompts[idx];
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Generate More
pgAgainBtn.addEventListener('click', () => {
  pgResults.hidden = true;
  pgForm.hidden = false;
});

// Retry
pgRetryBtn.addEventListener('click', () => {
  pgError.hidden = true;
  pgForm.hidden = false;
});
