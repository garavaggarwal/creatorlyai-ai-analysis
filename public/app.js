/* ── Config ── */
const API_BASE = 'https://api.creatorlyai.in';

/* ── Auth check — redirect to login if not logged in ── */
(function checkAuth() {
  // Handle OAuth callback first (tokens arrive in URL hash after Google login)
  if (window.location.hash && window.location.hash.includes('access_token')) {
    handleOAuthCallback();
    // Give it a moment to save the session, then proceed
    setTimeout(() => {
      if (!isLoggedIn()) window.location.href = '/login';
    }, 500);
    return;
  }
  if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
    window.location.href = '/login';
  }
})();

/* ── Render user in header ── */
function renderHeaderUser() {
  const user = typeof getUser === 'function' ? getUser() : null;
  const headerAuth = document.getElementById('headerAuth');
  if (!headerAuth) return;

  if (user) {
    const name    = typeof getUserDisplayName === 'function' ? getUserDisplayName(user) : user.email;
    const initial = typeof getUserInitial === 'function' ? getUserInitial(user) : name[0].toUpperCase();
    headerAuth.innerHTML = `
      <div class="user-menu">
        <div class="user-avatar" id="userAvatarBtn" title="${name}">${initial}</div>
        <div class="user-dropdown" id="userDropdown" hidden>
          <div class="user-dropdown-avatar">${initial}</div>
          <div class="user-dropdown-name">${name}</div>
          <div class="user-dropdown-email">${user.email}</div>
          <hr class="dropdown-divider" />
          <button class="dropdown-item" onclick="handleLogout()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            Sign Out
          </button>
        </div>
      </div>
    `;
    document.getElementById('userAvatarBtn').addEventListener('click', () => {
      const dd = document.getElementById('userDropdown');
      dd.hidden = !dd.hidden;
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.user-menu')) {
        const dd = document.getElementById('userDropdown');
        if (dd) dd.hidden = true;
      }
    });
  }
}

async function handleLogout() {
  if (typeof signOut === 'function') await signOut();
  window.location.href = 'https://creatorlyai.in';
}

/* ── Sidebar collapse/expand toggle ── */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('collapsed');
  document.body.classList.toggle('sidebar-collapsed');
  // Save preference
  localStorage.setItem('creatorly_sidebar_collapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
}
// Restore sidebar state on load
(function restoreSidebarState() {
  const collapsed = localStorage.getItem('creatorly_sidebar_collapsed');
  if (collapsed === '1') {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.add('collapsed');
    document.body.classList.add('sidebar-collapsed');
  }
})();

/* ── Render user in sidebar (desktop) ── */
function renderSidebarUser() {
  const user = typeof getUser === 'function' ? getUser() : null;
  const sidebarUser = document.getElementById('sidebarUser');
  if (!sidebarUser) return;

  if (user) {
    const name    = typeof getUserDisplayName === 'function' ? getUserDisplayName(user) : user.email;
    const initial = typeof getUserInitial === 'function' ? getUserInitial(user) : name[0].toUpperCase();
    sidebarUser.innerHTML = `
      <div class="sidebar-user">
        <div class="sidebar-user-avatar">${initial}</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">${name}</div>
          <div class="sidebar-user-email">${user.email}</div>
        </div>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderHeaderUser();
  renderSidebarUser();
  fetchCredits();
});

/* ── Credits bar ── */
async function fetchCredits() {
  const creditsBar = document.getElementById('creditsBar');
  if (!creditsBar) return;
  const session = typeof getRawSession === 'function' ? getRawSession() : null;
  const token = session?.access_token;
  if (!token) return;

  try {
    const resp = await fetch(`${API_BASE}/api/usage`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resp.ok) return;
    const json = await resp.json();
    if (!json.success) return;

    const used = json.usage?.used || 0;
    const limit = json.usage?.limit || 5;
    const remaining = Math.max(0, limit - used);
    const pct = Math.min(100, (used / limit) * 100);

    document.getElementById('creditsCount').textContent = `${used} used / ${limit} available`;
    document.getElementById('creditsFill').style.width = pct + '%';
    creditsBar.hidden = false;
  } catch (_) {}
}

/* ── DOM refs ── */
const dropZone          = document.getElementById('dropZone');
const videoInput        = document.getElementById('videoInput');
const browseBtn         = document.getElementById('browseBtn');
const filePreview       = document.getElementById('filePreview');
const fileName          = document.getElementById('fileName');
const fileSize          = document.getElementById('fileSize');
const removeFile        = document.getElementById('removeFile');
const submitBtn         = document.getElementById('submitBtn');
const analyseForm       = document.getElementById('analyseForm');
const uploadCard        = document.getElementById('uploadCard');
const progressCard      = document.getElementById('progressCard');
const resultsSection    = document.getElementById('resultsSection');
const errorCard         = document.getElementById('errorCard');
const errorMsg          = document.getElementById('errorMsg');
const retryBtn          = document.getElementById('retryBtn');
const analyseAnotherBtn = document.getElementById('analyseAnotherBtn');
const historyCard       = document.getElementById('historyCard');
const historyGrid       = document.getElementById('historyGrid');
const historyEmpty      = document.getElementById('historyEmpty');
const historyPage       = document.getElementById('historyPage');
const historyPageList   = document.getElementById('historyPageList');
const historyPageEmpty  = document.getElementById('historyPageEmpty');
const bottomNav         = document.getElementById('bottomNav');
const navHome           = document.getElementById('navHome');
const navAnalyse        = document.getElementById('navAnalyse');
const navHistory        = document.getElementById('navHistory');
const sideNavHome       = document.getElementById('sideNavHome');
const sideNavAnalyse    = document.getElementById('sideNavAnalyse');
const sideNavHistory    = document.getElementById('sideNavHistory');

// Tab refs
const tabUpload    = document.getElementById('tabUpload');
const tabLink      = document.getElementById('tabLink');
const panelUpload  = document.getElementById('panelUpload');
const panelLink    = document.getElementById('panelLink');
const instaUrlInput = document.getElementById('instaUrlInput');
const pasteUrlBtn  = document.getElementById('pasteUrlBtn');

let selectedFile = null;
let activeTab = 'upload'; // 'upload' | 'link'
let currentVideoUrl = null; // Object URL for the uploaded video (current session only)

/* ── Tab switching ── */
tabUpload.addEventListener('click', () => switchTab('upload'));
tabLink.addEventListener('click',   () => switchTab('link'));

function switchTab(tab) {
  activeTab = tab;
  tabUpload.classList.toggle('active', tab === 'upload');
  tabLink.classList.toggle('active',   tab === 'link');
  tabUpload.setAttribute('aria-selected', tab === 'upload');
  tabLink.setAttribute('aria-selected',   tab === 'link');
  panelUpload.hidden = tab !== 'upload';
  panelLink.hidden   = tab !== 'link';
  // Re-evaluate submit button state
  updateSubmitBtn();
}

function updateSubmitBtn() {
  if (activeTab === 'upload') {
    submitBtn.disabled = !selectedFile;
    submitBtn.querySelector('.btn-text').textContent = 'Analyse Reel';
  } else {
    submitBtn.disabled = !instaUrlInput.value.trim();
    submitBtn.querySelector('.btn-text').textContent = 'Analyse Reel';
  }
}

/* ── Paste button ── */
pasteUrlBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    instaUrlInput.value = text;
    updateSubmitBtn();
  } catch {
    instaUrlInput.focus();
  }
});
instaUrlInput.addEventListener('input', updateSubmitBtn);

/* ── File selection ── */
browseBtn.addEventListener('click', () => videoInput.click());
dropZone.addEventListener('click', (e) => {
  if (e.target.closest('#browseBtn') || e.target.closest('#removeFile')) return;
  videoInput.click();
});
videoInput.addEventListener('change', () => {
  if (videoInput.files[0]) setFile(videoInput.files[0]);
});
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) setFile(file);
});
removeFile.addEventListener('click', (e) => { e.stopPropagation(); clearFile(); });

function setFile(file) {
  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);
  filePreview.hidden = false;
  submitBtn.disabled = false;
  // Create object URL for video playback in results
  if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
  currentVideoUrl = URL.createObjectURL(file);
}
function clearFile() {
  selectedFile = null;
  videoInput.value = '';
  filePreview.hidden = true;
  updateSubmitBtn();
  // Don't revoke here — we need it for results playback
}
function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

analyseForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const niche = document.getElementById('nicheInput').value;
  showProgress();
  animateSteps();

  const session = typeof getRawSession === 'function' ? getRawSession() : null;
  const authToken = session?.access_token || null;

  // ── Mark analysis as in-flight BEFORE the request ──────────────────────────
  // Use localStorage (survives tab kill / screen lock) with a timestamp so we
  // can discard stale entries (older than 10 minutes).
  const pendingEntry = { ts: Date.now(), authToken };
  localStorage.setItem('creatorly_inflight', JSON.stringify(pendingEntry));

  try {
    let data;

    if (activeTab === 'upload') {
      if (!selectedFile) return;
      const formData = new FormData();
      formData.append('video', selectedFile);
      formData.append('caption', '');
      formData.append('hashtags', '');
      formData.append('niche', niche);

      data = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/api/analyse`);
        xhr.timeout = 300000;
        if (authToken) xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText);
            resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data: json });
          } catch { reject(new Error('Invalid response from server')); }
        };
        xhr.onerror   = () => reject(new Error('network'));
        xhr.ontimeout = () => reject(new Error('network'));
        xhr.send(formData);
      });

    } else {
      const url = instaUrlInput.value.trim();
      if (!url) return;

      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      try {
        const resp = await fetch(`${API_BASE}/api/analyse-url`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ url, niche, caption: '', hashtags: '' }),
          signal: AbortSignal.timeout(300000),
        });
        const json = await resp.json();
        data = { ok: resp.ok, status: resp.status, data: json };
      } catch (_) {
        throw new Error('network');
      }
    }

    // Upgrade the in-flight entry with the record_id once we have it
    if (data?.data?.record_id) {
      localStorage.setItem('creatorly_inflight', JSON.stringify({
        ts: Date.now(),
        authToken,
        recordId: data.data.record_id,
      }));
    }

    // Handle limit reached
    if (data.status === 429 || data.data?.limit_reached) {
      localStorage.removeItem('creatorly_inflight');
      showError(data.data?.error || 'Analysis limit reached. Please upgrade to continue.');
      return;
    }

    if (!data.ok || !data.data.success) {
      throw new Error(data.data.error || 'Analysis failed. Please try again.');
    }

    localStorage.removeItem('creatorly_inflight');
    showResults(data.data.results);

  } catch (err) {
    if (err.message === 'network') {
      await tryRecoverResult();
    } else {
      localStorage.removeItem('creatorly_inflight');
      showError(err.message || 'Something went wrong. Please try again.');
    }
  }
});

/* ── Recovery: poll /api/result/:id after network drop / screen lock ── */
async function tryRecoverResult() {
  let inflight = null;
  try { inflight = JSON.parse(localStorage.getItem('creatorly_inflight')); } catch (_) {}

  // Discard if older than 10 minutes (stale from a previous session)
  if (!inflight || (Date.now() - inflight.ts) > 10 * 60 * 1000) {
    localStorage.removeItem('creatorly_inflight');
    showError('Connection lost. Please check your internet and try again.');
    return;
  }

  const { recordId, authToken } = inflight;

  if (!recordId) {
    // We don't have a record_id yet — the upload itself was interrupted.
    // Poll the user's most recent processing record instead.
    await pollLatestRecord(authToken, true);
    return;
  }

  // Don't show "Reconnecting" — keep original progress UI
  await pollRecord(recordId, authToken, 36, 5000, true);
}

/* ── Poll a specific record ID ── */
async function pollRecord(recordId, authToken, maxAttempts = 36, intervalMs = 5000, silent = false) {
  const progressSub = document.querySelector('.progress-sub');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, intervalMs));
    
    // Only update UI if not in silent recovery mode
    if (!silent && progressSub) {
      progressSub.textContent = `Still analysing\u2026 (${Math.round(attempt * intervalMs / 1000)}s)`;
    }

    try {
      const headers = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const resp = await fetch(`${API_BASE}/api/result/${recordId}`, { headers });
      if (!resp.ok) continue;
      const json = await resp.json();

      if (json.status === 'completed' && json.results) {
        localStorage.removeItem('creatorly_inflight');
        showResults(json.results);
        return;
      }
      if (json.status === 'failed') {
        localStorage.removeItem('creatorly_inflight');
        showError(json.error || 'Analysis failed on the server. Please try again.');
        return;
      }
    } catch (_) { /* still offline — keep trying */ }
  }

  localStorage.removeItem('creatorly_inflight');
  showError('Analysis timed out. Please try again.');
}

/* ── Poll the user's latest processing record (no record_id yet) ── */
async function pollLatestRecord(authToken, silent = false, maxAttempts = 24, intervalMs = 5000) {
  const progressSub = document.querySelector('.progress-sub');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, intervalMs));
    
    // Only update UI if not in silent recovery mode
    if (!silent && progressSub) {
      progressSub.textContent = `Reconnecting\u2026 (${Math.round(attempt * intervalMs / 1000)}s)`;
    }

    try {
      const headers = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const resp = await fetch(`${API_BASE}/api/latest-result`, { headers });
      if (!resp.ok) continue;
      const json = await resp.json();

      if (json.status === 'completed' && json.results) {
        localStorage.removeItem('creatorly_inflight');
        showResults(json.results);
        return;
      }
      if (json.status === 'failed') {
        localStorage.removeItem('creatorly_inflight');
        showError(json.error || 'Analysis failed. Please try again.');
        return;
      }
    } catch (_) {}
  }

  localStorage.removeItem('creatorly_inflight');
  showError('Connection lost during upload. Please try again.');
}

// Removed showReconnecting() — recovery now happens silently without changing UI

/* ── visibilitychange: fires when screen unlocks or tab becomes active ── */
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;

  let inflight = null;
  try { inflight = JSON.parse(localStorage.getItem('creatorly_inflight')); } catch (_) {}
  if (!inflight) return;
  if ((Date.now() - inflight.ts) > 10 * 60 * 1000) {
    localStorage.removeItem('creatorly_inflight');
    return;
  }

  const { recordId, authToken } = inflight;
  // Don't change UI — keep original progress state

  if (recordId) {
    // Check once immediately — result may already be ready
    try {
      const headers = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const resp = await fetch(`${API_BASE}/api/result/${recordId}`, { headers });
      const json = await resp.json();
      if (json.status === 'completed' && json.results) {
        localStorage.removeItem('creatorly_inflight');
        showResults(json.results);
        return;
      }
      if (json.status === 'failed') {
        localStorage.removeItem('creatorly_inflight');
        showError(json.error || 'Analysis failed. Please try again.');
        return;
      }
    } catch (_) {}
    // Not ready yet — start polling silently
    await pollRecord(recordId, authToken, 36, 5000, true);
  } else {
    await pollLatestRecord(authToken, true);
  }
});

/* ── pageshow: fires when page is restored from bfcache (iOS Safari) ── */
window.addEventListener('pageshow', async (event) => {
  // Only act if page was restored from cache (iOS back-forward cache)
  if (!event.persisted) return;

  let inflight = null;
  try { inflight = JSON.parse(localStorage.getItem('creatorly_inflight')); } catch (_) {}
  if (!inflight) return;
  if ((Date.now() - inflight.ts) > 10 * 60 * 1000) {
    localStorage.removeItem('creatorly_inflight');
    return;
  }

  const { recordId, authToken } = inflight;
  // Don't change UI — keep original progress state

  if (recordId) {
    try {
      const headers = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const resp = await fetch(`${API_BASE}/api/result/${recordId}`, { headers });
      const json = await resp.json();
      if (json.status === 'completed' && json.results) {
        localStorage.removeItem('creatorly_inflight');
        showResults(json.results);
        return;
      }
      if (json.status === 'failed') {
        localStorage.removeItem('creatorly_inflight');
        showError(json.error || 'Analysis failed. Please try again.');
        return;
      }
    } catch (_) {}
    await pollRecord(recordId, authToken, 36, 5000, true);
  } else {
    await pollLatestRecord(authToken, true);
  }
});

/* ── On page load: recover if there's a stale in-flight entry ── */
(async function checkPendingOnLoad() {
  let inflight = null;
  try { inflight = JSON.parse(localStorage.getItem('creatorly_inflight')); } catch (_) {}
  if (!inflight) return;
  if ((Date.now() - inflight.ts) > 10 * 60 * 1000) {
    localStorage.removeItem('creatorly_inflight');
    return;
  }

  const { recordId, authToken } = inflight;
  if (!recordId) return; // no ID yet — wait for visibilitychange

  try {
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const resp = await fetch(`${API_BASE}/api/result/${recordId}`, { headers });
    const json = await resp.json();

    if (json.status === 'completed' && json.results) {
      localStorage.removeItem('creatorly_inflight');
      showProgress();
      setTimeout(() => showResults(json.results), 400);
    } else if (json.status === 'failed') {
      localStorage.removeItem('creatorly_inflight');
    }
    // processing — leave entry, visibilitychange will handle it
  } catch (_) {}
})();

/* ── Load history on page load ── */
let historyData = [];

(async function loadHistory() {
  const session = typeof getRawSession === 'function' ? getRawSession() : null;
  const authToken = session?.access_token || null;
  
  if (!authToken) return;
  
  try {
    const headers = {};
    headers['Authorization'] = `Bearer ${authToken}`;
    const resp = await fetch(`${API_BASE}/api/history`, { headers });
    if (!resp.ok) return;
    const json = await resp.json();
    
    if (json.success && json.history && json.history.length > 0) {
      historyData = json.history;
    }
  } catch (_) {}
})();

/* ── Navigation ── */
let currentNav = 'analyse'; // 'home' | 'analyse' | 'history'

function navigateTo(tab) {
  currentNav = tab;
  
  // Update bottom nav active states
  if (navHome) navHome.classList.toggle('active', tab === 'home');
  if (navAnalyse) navAnalyse.classList.toggle('active', tab === 'analyse');
  if (navHistory) navHistory.classList.toggle('active', tab === 'history');
  
  // Update sidebar active states
  if (sideNavHome) sideNavHome.classList.toggle('active', tab === 'home');
  if (sideNavAnalyse) sideNavAnalyse.classList.toggle('active', tab === 'analyse');
  if (sideNavHistory) sideNavHistory.classList.toggle('active', tab === 'history');
  
  // Hide all sections
  const hero = document.querySelector('.hero');
  const main = document.querySelector('.main');
  const footer = document.querySelector('.footer');
  
  if (tab === 'home') {
    // Go to landing page
    window.location.href = '/';
    return;
  }
  
  if (tab === 'analyse') {
    if (hero) hero.hidden = false;
    if (main) main.hidden = false;
    if (footer) footer.hidden = false;
    if (historyPage) historyPage.hidden = true;
    // Always reset to upload view — clear any previous results/errors
    resetUI();
  }
  
  if (tab === 'history') {
    if (hero) hero.hidden = true;
    if (main) main.hidden = true;
    if (footer) footer.hidden = true;
    if (historyPage) historyPage.hidden = false;
    // Always re-fetch history when navigating to this tab
    fetchAndRenderHistory();
  }
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Set initial active state
if (navAnalyse) navAnalyse.classList.add('active');
if (sideNavAnalyse) sideNavAnalyse.classList.add('active');

/* ── Render history page (list view) ── */
async function fetchAndRenderHistory() {
  const session = typeof getRawSession === 'function' ? getRawSession() : null;
  const authToken = session?.access_token || null;
  if (!authToken) { renderHistoryPage(); return; }

  try {
    const resp = await fetch(`${API_BASE}/api/history`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (resp.ok) {
      const json = await resp.json();
      if (json.success && json.history) {
        historyData = json.history;
      }
    }
  } catch (_) {}
  renderHistoryPage();
}

function renderHistoryPage() {
  if (!historyData || historyData.length === 0) {
    if (historyPageList) historyPageList.innerHTML = '';
    if (historyPageEmpty) historyPageEmpty.hidden = false;
    return;
  }
  
  if (historyPageEmpty) historyPageEmpty.hidden = true;
  
  historyPageList.innerHTML = historyData.map(item => {
    const isFailed = item.status === 'failed';
    const score = item.score || 0;
    const scoreClass = isFailed ? 'failed' : (score >= 7 ? 'high' : score >= 5 ? 'mid' : 'low');
    const dateStr = formatRelativeDate(item.createdAt);
    const filename = item.filename || 'Untitled';
    const thumbHtml = item.thumbnail 
      ? `<img class="history-list-thumb" src="${item.thumbnail}" alt="Video thumbnail" loading="lazy" />`
      : `<div class="history-list-thumb-placeholder">${isFailed ? '❌' : '🎬'}</div>`;
    const niche = item.niche || 'general';
    const sourceIcon = item.source === 'instagram_url' ? '📸' : '📤';
    
    // Show short 3-5 word description, fallback to filename
    const summary = item.summary || '';
    const shortDesc = summary 
      ? summary.split(/[\s,.\-—]+/).slice(0, 5).join(' ')
      : `${sourceIcon} ${filename}`;
    const displayName = shortDesc.length > 40 ? shortDesc.slice(0, 40) + '…' : shortDesc;
    
    const scoreHtml = isFailed 
      ? `<div class="history-list-score failed">Failed</div>`
      : `<div class="history-list-score ${scoreClass}">${score.toFixed(1)}</div>`;
    
    const errorHtml = isFailed && item.error 
      ? `<div class="history-list-error">${item.error.length > 60 ? item.error.slice(0, 60) + '…' : item.error}</div>` 
      : '';
    
    return `
      <div class="history-list-item ${isFailed ? 'history-failed' : ''}" onclick="loadHistoryResult('${item.id}')">
        ${thumbHtml}
        <div class="history-list-info">
          <div class="history-list-name">${displayName}</div>
          <div class="history-list-meta">
            <span>${dateStr}</span>
            <span class="history-list-niche">${niche}</span>
          </div>
          ${errorHtml}
        </div>
        ${scoreHtml}
      </div>
    `;
  }).join('');
}

/* ── Format relative date ── */
function formatRelativeDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/* ── Load a specific history result ── */
async function loadHistoryResult(recordId) {
  const session = typeof getRawSession === 'function' ? getRawSession() : null;
  const authToken = session?.access_token || null;
  
  if (!authToken) return;
  
  // Switch to analyse tab to show results
  navigateTo('analyse');
  showProgress();
  
  try {
    const headers = {};
    headers['Authorization'] = `Bearer ${authToken}`;
    const resp = await fetch(`${API_BASE}/api/result/${recordId}`, { headers });
    if (!resp.ok) {
      showError('Could not load analysis');
      return;
    }
    const json = await resp.json();
    
    if (json.status === 'completed' && json.results) {
      showResults(json.results);
    } else if (json.status === 'failed') {
      showError(json.error || 'Analysis failed');
    } else {
      showError('Analysis is still processing');
    }
  } catch (_) {
    showError('Could not load analysis');
  }
}

/* ── UI state ── */
function showProgress() {
  uploadCard.hidden = true;
  progressCard.hidden = false;
  resultsSection.hidden = true;
  errorCard.hidden = true;
  if (historyPage) historyPage.hidden = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showResults(results) {
  progressCard.hidden = true;
  resultsSection.hidden = false;
  if (historyPage) historyPage.hidden = true;
  // Show hero and main (in case we came from history tab)
  const hero = document.querySelector('.hero');
  const main = document.querySelector('.main');
  if (hero) hero.hidden = false;
  if (main) main.hidden = false;
  renderResults(results);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showError(msg) {
  progressCard.hidden = true;
  errorCard.hidden = false;
  if (historyPage) historyPage.hidden = true;
  // Show hero and main (in case we came from history tab)
  const hero = document.querySelector('.hero');
  const main = document.querySelector('.main');
  if (hero) hero.hidden = false;
  if (main) main.hidden = false;
  errorMsg.textContent = msg;
}
function resetUI() {
  uploadCard.hidden = false;
  progressCard.hidden = true;
  resultsSection.hidden = true;
  errorCard.hidden = true;
  clearFile();
  instaUrlInput.value = '';
  updateSubmitBtn();
  document.getElementById('nicheInput').value = 'general';
  // Pause and reset video player
  const videoPlayer = document.getElementById('videoPlayer');
  if (videoPlayer) { videoPlayer.pause(); videoPlayer.src = ''; }
  // Revoke old video URL
  if (currentVideoUrl) { URL.revokeObjectURL(currentVideoUrl); currentVideoUrl = null; }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
retryBtn.addEventListener('click', resetUI);
analyseAnotherBtn.addEventListener('click', resetUI);

/* ── Step animation ── */
function animateSteps() {
  const steps = [
    document.getElementById('step1'),
    document.getElementById('step2'),
    document.getElementById('step3'),
  ];
  steps.forEach(s => s.className = 'step');
  let i = 0;
  function next() {
    if (i > 0) steps[i - 1].className = 'step done';
    if (i < steps.length) { steps[i].className = 'step active'; i++; setTimeout(next, 12000); }
  }
  next();
}

/* ── Render results ── */
function renderResults(r) {
  // Show thumbnail if available
  const thumbWrap = document.getElementById('resultThumbWrap');
  const thumbImg = document.getElementById('resultThumb');
  if (r.thumbnail && thumbWrap && thumbImg) {
    thumbImg.src = r.thumbnail;
    thumbWrap.hidden = false;
  } else if (thumbWrap) {
    thumbWrap.hidden = true;
  }

  // Score ring — animated fill + count-up number
  const score = r.overall_score;
  const scoreEl = document.getElementById('overallScore');
  const ringFill = document.getElementById('ringFill');
  const circumference = 314; // 2 * π * r(50)

  const color = score >= 7.5 ? '#22c55e' : score >= 5 ? '#a855f7' : score >= 3 ? '#eab308' : '#ef4444';
  ringFill.style.stroke = color;
  scoreEl.style.color = color;

  if (score !== null) {
    // Start ring at full offset (empty) then animate to target
    const targetOffset = circumference - (score / 10) * circumference;
    ringFill.style.strokeDashoffset = circumference; // start empty
    ringFill.style.transition = 'none';

    // Ease-out cubic function
    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

    const duration = 1200; // ms
    const startTime = performance.now();

    function animateRing(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeOut(t);

      // Animate ring
      const currentOffset = circumference - eased * (circumference - targetOffset);
      ringFill.style.strokeDashoffset = currentOffset;

      // Animate counter
      const currentScore = eased * score;
      scoreEl.textContent = currentScore.toFixed(1);

      if (t < 1) {
        requestAnimationFrame(animateRing);
      } else {
        ringFill.style.strokeDashoffset = targetOffset;
        scoreEl.textContent = score.toFixed(1);
      }
    }

    // Small delay so DOM is ready
    setTimeout(() => requestAnimationFrame(animateRing), 80);
  } else {
    scoreEl.textContent = '—';
  }

  // Verdict — action-oriented labels
  document.getElementById('scoreVerdict').textContent =
    score >= 8 ? 'Viral Potential 🔥' : score >= 6.5 ? 'Strong Content' : score >= 5 ? 'Good Foundation' : 'Needs Rework';

  // Performance badge
  const perf = r.predicted_performance || '';
  const perfBadge = document.getElementById('perfBadge');
  const perfMap = {
    viral_potential: ['🔥 Viral Potential', 'perf-viral'],
    above_average:   ['📈 High Reach', 'perf-above'],
    average:         ['⚡ Good Foundation', 'perf-average'],
    below_average:   ['🔧 Needs Rework', 'perf-below'],
  };
  const [label, cls] = perfMap[perf] || ['⚡ Analysed', 'perf-average'];
  perfBadge.textContent = label;
  perfBadge.className = `perf-badge ${cls}`;

  // Overall summary
  document.getElementById('overallSummary').textContent = r.overall_summary || '';

  // Wins & Fixes
  renderList('winsList', r.top_3_wins || []);
  renderList('fixesList', r.top_3_fixes || []);

  // Score breakdown — horizontally scrollable chips + detail card
  const breakdownKeys = [
    { key: 'hook',              label: 'Hook',              icon: '🪝' },
    { key: 'retention',         label: 'Retention',         icon: '📈' },
    { key: 'visual_quality',    label: 'Visual',            icon: '👁️' },
    { key: 'audio_quality',     label: 'Audio',             icon: '🔊' },
    { key: 'content_structure', label: 'Content',           icon: '📋' },
    { key: 'editing',           label: 'Editing',           icon: '✂️' },
    { key: 'text_subtitles',    label: 'Text',              icon: '📝' },
    { key: 'compliance',        label: 'Compliance',        icon: '✅' },
  ];
  const scrollContainer = document.getElementById('breakdownScroll');
  const detailContainer = document.getElementById('breakdownDetail');
  scrollContainer.innerHTML = '';
  detailContainer.hidden = true;
  detailContainer.innerHTML = '';

  // Store breakdown data for click handling
  window._breakdownData = {};

  breakdownKeys.forEach(({ key, label, icon }, idx) => {
    const item = r[key];
    if (!item) return;
    const s = item.score;
    const scoreCls = s >= 7 ? 'score-high' : s >= 5 ? 'score-mid' : 'score-low';

    // Store data for detail view
    window._breakdownData[key] = { item, label, icon, scoreCls };

    // Create chip
    const chip = document.createElement('div');
    chip.className = `breakdown-chip ${scoreCls}`;
    chip.dataset.key = key;
    chip.innerHTML = `
      <span class="chip-icon">${icon}</span>
      <span class="chip-score">${s ?? '—'}</span>
      <span class="chip-label">${label}</span>
    `;
    chip.onclick = () => selectBreakdownChip(key);
    scrollContainer.appendChild(chip);

    // Auto-select first chip
    if (idx === 0) setTimeout(() => selectBreakdownChip(key), 200);
  });

  // Caption analysis — removed from results page
  // Hashtag analysis — removed from results page

  // Suggested captions (no hashtags)
  const hasSugCaptions = r.suggested_captions && r.suggested_captions.length > 0;
  if (hasSugCaptions) {
    document.getElementById('suggestionsCard').hidden = false;
    document.getElementById('suggestedCaptions').innerHTML = r.suggested_captions.map((c, i) =>
      `<div class="caption-suggestion">
        <span class="caption-num">${i + 1}</span>
        <span class="caption-text">${c}</span>
        <button class="copy-btn" onclick="copyText(this, '${c.replace(/'/g, "\\'")}')">Copy</button>
      </div>`
    ).join('');
  }

  // Hook Rewrite section — better opening suggestions from hook analysis
  const hookData = r.hook;
  const hookRewriteCard = document.getElementById('hookRewriteCard');
  if (hookData && hookData.improvements && hookData.improvements.length > 0) {
    hookRewriteCard.hidden = false;
    document.getElementById('hookRewrites').innerHTML = hookData.improvements.map((fix, i) =>
      `<div class="hook-rewrite-item">
        <span class="hook-rewrite-num">${i + 1}</span>
        <span class="hook-rewrite-text">${fix}</span>
      </div>`
    ).join('');
  }

  // Video info
  const vi = r.video_info || {};
  const tech = r.technical || {};
  const infoItems = [
    { label: 'Duration',     value: vi.duration ? vi.duration.toFixed(1) + 's' : '—' },
    { label: 'Resolution',   value: vi.resolution || '—' },
    { label: 'Format',       value: vi.is_vertical ? '📱 Vertical' : '🖥 Horizontal' },
    { label: 'FPS',          value: vi.fps ? Math.round(vi.fps) : '—' },
    { label: 'Audio',        value: vi.has_audio ? '✅ Yes' : '❌ No' },
    { label: 'Scene Cuts',   value: tech.sceneCuts ?? '—' },
    { label: 'Cuts/min',     value: tech.cutsPerMinute ?? '—' },
    { label: 'Silence Gaps', value: tech.silenceGaps ?? '—' },
  ];
  document.getElementById('videoInfoGrid').innerHTML = infoItems.map(({ label, value }) =>
    `<div class="info-item"><div class="info-label">${label}</div><div class="info-value">${value}</div></div>`
  ).join('');

  // Sync Timeline
  const td = r.timeline_data;
  if (td && td.duration > 0) {
    document.getElementById('timelineCard').hidden = false;
    renderSyncTimeline(td, r.sync_timeline, r.sync_score);
  }
}

/* ── Helper renderers ── */

/* ── Select a breakdown chip and show its detail ── */
function selectBreakdownChip(key) {
  const data = window._breakdownData[key];
  if (!data) return;

  const { item, label, icon, scoreCls } = data;
  const detailContainer = document.getElementById('breakdownDetail');
  const scrollContainer = document.getElementById('breakdownScroll');

  // Update active chip
  scrollContainer.querySelectorAll('.breakdown-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.key === key);
  });

  // Build detail content
  const s = item.score;
  const pct = s !== null ? (s / 10) * 100 : 0;
  let detailHtml = '';

  if (key === 'compliance') {
    const brandSafe = item.is_brand_safe;
    const flags = item.flags || [];
    const warnings = item.warnings || [];
    detailHtml = `
      <div class="detail-header ${scoreCls}">
        <span class="detail-icon">${icon}</span>
        <span class="detail-title">${label}</span>
        <span class="detail-score">${s ?? '—'}/10</span>
      </div>
      <div class="detail-bar-wrap"><div class="detail-bar ${scoreCls}" style="width:${pct}%"></div></div>
      <div class="sub-scores">
        <div class="sub-score-row">
          <span>Brand Safe</span>
          <span class="sub-score-val" style="color:${brandSafe ? 'var(--green)' : 'var(--red)'}">${brandSafe ? '✅ Yes' : '❌ No'}</span>
        </div>
      </div>
      ${flags.length > 0 ? renderDetailSection('⚠️ Flags', flags) : '<div class="detail-section"><div class="detail-label" style="color:var(--green)">✅ No flags found</div></div>'}
      ${warnings.length > 0 ? renderDetailSection('Warnings', warnings) : ''}
    `;
  } else {
    detailHtml = `
      <div class="detail-header ${scoreCls}">
        <span class="detail-icon">${icon}</span>
        <span class="detail-title">${label}</span>
        <span class="detail-score">${s ?? '—'}/10</span>
      </div>
      <div class="detail-bar-wrap"><div class="detail-bar ${scoreCls}" style="width:${pct}%"></div></div>
      ${renderSubScores(item.sub_scores)}
      ${renderDetailSection('Strengths', item.strengths)}
      ${renderDetailSection('Improvements', item.improvements)}
    `;
  }

  detailContainer.innerHTML = detailHtml;
  detailContainer.hidden = false;
}

function renderList(id, items) {
  document.getElementById(id).innerHTML = items.map(item => `<li>${item}</li>`).join('');
}

function renderSubScores(sub) {
  if (!sub || Object.keys(sub).length === 0) return '';
  const rows = Object.entries(sub).slice(0, 4).map(([k, v]) =>
    `<div class="sub-score-row"><span>${k.replace(/_/g, ' ')}</span><span class="sub-score-val">${v}</span></div>`
  ).join('');
  return `<div class="sub-scores">${rows}</div>`;
}

function renderDetailSection(title, items) {
  if (!items || items.length === 0) return '';
  return `<div class="detail-section"><div class="detail-label">${title}</div><ul class="detail-list">${items.map(i => `<li>${i}</li>`).join('')}</ul></div>`;
}

function renderTextAnalysis(data) {
  const s = data.score;
  const cls = s >= 7 ? 'score-high' : s >= 5 ? 'score-mid' : 'score-low';
  return `
    <div class="analysis-score-row ${cls}">
      <div class="analysis-score-num breakdown-score">${s ?? '—'}</div>
      <div class="breakdown-bar-wrap" style="height:8px"><div class="breakdown-bar" style="width:${(s/10)*100}%"></div></div>
    </div>
    ${renderDetailSection('Strengths', data.strengths)}
    ${renderDetailSection('Improvements', data.improvements)}
  `;
}

function renderHashtagAnalysis(data) {
  const s = data.score;
  const cls = s >= 7 ? 'score-high' : s >= 5 ? 'score-mid' : 'score-low';
  const badTags = (data.overbroad_tags || []).map(t => `<span class="tag bad">#${t}</span>`).join('');
  const suggestions = (data.suggested_replacements || []).map(t => `<span class="tag good">#${t.replace('#','')}</span>`).join('');
  return `
    <div class="analysis-score-row ${cls}">
      <div class="analysis-score-num breakdown-score">${s ?? '—'}</div>
      <div class="breakdown-bar-wrap" style="height:8px"><div class="breakdown-bar" style="width:${(s/10)*100}%"></div></div>
    </div>
    ${badTags ? `<div class="detail-label" style="margin-top:12px">Overbroad tags</div><div class="tag-list">${badTags}</div>` : ''}
    ${suggestions ? `<div class="detail-label" style="margin-top:12px">Suggested replacements</div><div class="tag-list">${suggestions}</div>` : ''}
    ${renderDetailSection('Improvements', data.improvements)}
  `;
}

/* ── Sync Timeline renderer ── */
function renderSyncTimeline(td, syncPoints, syncScore) {
  const duration = td.duration;
  const bar       = document.getElementById('timelineBar');
  const markers   = document.getElementById('timelineMarkers');
  const tStamps   = document.getElementById('timelineTimestamps');
  const issuesList = document.getElementById('timelineIssues');
  const syncBadge = document.getElementById('syncScoreBadge');
  const playhead  = document.getElementById('timelinePlayhead');

  bar.innerHTML = markers.innerHTML = tStamps.innerHTML = issuesList.innerHTML = '';
  // Re-add playhead after clearing
  bar.appendChild(playhead);

  // ── Setup video player if video is available ──
  const videoPlayerWrap = document.getElementById('videoPlayerWrap');
  const videoPlayer = document.getElementById('videoPlayer');
  const videoPlayBtn = document.getElementById('videoPlayBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const videoTime = document.getElementById('videoTime');

  if (currentVideoUrl && videoPlayer && videoPlayerWrap) {
    videoPlayer.src = currentVideoUrl;
    videoPlayerWrap.hidden = false;

    // Play/Pause toggle
    videoPlayBtn.onclick = () => {
      if (videoPlayer.paused) {
        videoPlayer.play();
      } else {
        videoPlayer.pause();
      }
    };

    videoPlayer.onplay = () => { playIcon.hidden = true; pauseIcon.hidden = false; };
    videoPlayer.onpause = () => { playIcon.hidden = false; pauseIcon.hidden = true; };

    // Sync playhead with video time
    videoPlayer.ontimeupdate = () => {
      if (videoPlayer.duration > 0) {
        const pct = (videoPlayer.currentTime / videoPlayer.duration) * 100;
        playhead.style.left = `${pct}%`;
        videoTime.textContent = `${formatTime(videoPlayer.currentTime)} / ${formatTime(videoPlayer.duration)}`;
      }
    };

    // Click on timeline bar to seek
    bar.style.cursor = 'pointer';
    bar.onclick = (e) => {
      const rect = bar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      videoPlayer.currentTime = pct * videoPlayer.duration;
    };
  } else {
    if (videoPlayerWrap) videoPlayerWrap.hidden = true;
    playhead.style.left = '0%';
  }

  // Sync score badge
  if (syncScore != null) {
    const bc = syncScore >= 7 ? 'sync-good' : syncScore >= 5 ? 'sync-mid' : 'sync-bad';
    syncBadge.className = `sync-score-badge ${bc}`;
    syncBadge.textContent = `Sync Score: ${syncScore}/10`;
  }

  const statusColors = { ok: '#22c55e', audio_issue: '#f97316', text_issue: '#a855f7', visual_issue: '#ef4444' };

  // Colored segments from Gemini
  if (syncPoints && syncPoints.length > 0) {
    const sorted = [...syncPoints].sort((a, b) => a.timestamp - b.timestamp);
    sorted.forEach((pt, i) => {
      const nextTs = sorted[i + 1]?.timestamp ?? duration;
      const left  = (pt.timestamp / duration) * 100;
      const width = ((nextTs - pt.timestamp) / duration) * 100;
      const color = statusColors[pt.status] || statusColors.ok;
      const seg = document.createElement('div');
      seg.className = 'tl-segment';
      seg.style.cssText = `left:${left}%;width:${width}%;background:${color};opacity:${pt.status === 'ok' ? 0.3 : 0.75}`;
      seg.title = `${pt.timestamp}s — ${pt.status}: ${pt.note}`;
      bar.appendChild(seg);
    });
  } else {
    const seg = document.createElement('div');
    seg.className = 'tl-segment';
    seg.style.cssText = `left:0%;width:100%;background:#22c55e;opacity:0.3`;
    bar.appendChild(seg);
  }

  // Scene cut markers (precise ffmpeg)
  (td.scene_cuts || []).forEach(ts => {
    const m = document.createElement('div');
    m.className = 'tl-marker scene-cut';
    m.style.left = `${(ts / duration) * 100}%`;
    m.title = `Scene cut at ${ts.toFixed(1)}s`;
    markers.appendChild(m);
  });

  // Silence overlays (precise ffmpeg)
  (td.silence_segments || []).forEach(s => {
    const el = document.createElement('div');
    el.className = 'tl-silence';
    el.style.cssText = `left:${(s.start / duration) * 100}%;width:${Math.max((s.duration / duration) * 100, 0.5)}%`;
    el.title = `Silence: ${s.start.toFixed(1)}s – ${(s.start + s.duration).toFixed(1)}s`;
    bar.appendChild(el);
  });

  // Timestamp labels
  const labelCount = Math.min(8, Math.floor(duration));
  for (let i = 0; i <= labelCount; i++) {
    const t = (i / labelCount) * duration;
    const lbl = document.createElement('div');
    lbl.className = 'tl-timestamp';
    lbl.style.left = `${(t / duration) * 100}%`;
    lbl.textContent = `${Math.round(t)}s`;
    tStamps.appendChild(lbl);
  }

  // Issues list
  const issues = (syncPoints || []).filter(p => p.status !== 'ok');
  if (issues.length === 0) {
    issuesList.innerHTML = '<div class="tl-all-good">✅ No sync issues detected across the timeline</div>';
  } else {
    issuesList.innerHTML = issues.map(p => {
      const icon  = { audio_issue: '🔊', text_issue: '📝', visual_issue: '🎥' }[p.status] || '⚠️';
      const lbl   = p.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `<div class="tl-issue">
        <span class="tl-issue-time">${parseFloat(p.timestamp).toFixed(1)}s</span>
        <span class="tl-issue-icon">${icon}</span>
        <span class="tl-issue-label ${p.status}">${lbl}</span>
        <span class="tl-issue-note">${p.note}</span>
      </div>`;
    }).join('');
  }
}

/* ── Format time (seconds → m:ss) ── */
function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ── Copy helper ── */
function copyText(el, text) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = el.textContent;
    el.textContent = '✓ Copied!';
    el.classList.add('copied');
    setTimeout(() => { el.textContent = orig; el.classList.remove('copied'); }, 2000);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    const orig = el.textContent;
    el.textContent = '✓ Copied!';
    setTimeout(() => { el.textContent = orig; }, 2000);
  });
}
