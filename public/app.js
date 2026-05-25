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
  renderNavProfilePic();
  fetchCredits();

  // Navigate directly to history tab if loaded with #history hash
  if (window.location.hash === '#history') {
    navigateTo('history');
  }

  // Handle dynamically switching tabs when hash changes
  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#history') {
      navigateTo('history');
    } else if (window.location.hash === '#analyse' || window.location.hash === '') {
      navigateTo('analyse');
    }
  });
});

/* ── Show Instagram profile pic in bottom nav ── */
function renderNavProfilePic() {
  const navProfileAvatar = document.getElementById('navProfileAvatar');
  const navProfileLabel = document.getElementById('navProfileLabel');
  if (!navProfileAvatar) return;
  
  const savedPic = localStorage.getItem('creatorly_ig_pic');
  const savedUsername = localStorage.getItem('creatorly_ig_username');
  
  if (savedPic) {
    navProfileAvatar.innerHTML = `<img src="${savedPic}" class="nav-profile-img" alt="" onerror="this.parentElement.innerHTML='<svg width=22 height=22 viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><path d=&quot;M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2&quot;/><circle cx=&quot;12&quot; cy=&quot;7&quot; r=&quot;4&quot;/></svg>'" />`;
  }
  if (savedUsername && navProfileLabel) {
    navProfileLabel.textContent = '@' + savedUsername;
  }
}

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
  if (activeTab === 'upload') {
    setGlobalProgress(0, "Preparing video file upload...");
  } else {
    startProcessingAnimation(10);
  }

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

        let processingStarted = false;
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const uPercent = Math.round((evt.loaded / evt.total) * 100);
            const globalPercent = Math.round(uPercent * 0.3); // Map 0-100% upload to 0-30% global progress
            setGlobalProgress(globalPercent, `Uploading video: ${uPercent}%`);
            if (uPercent >= 100 && !processingStarted) {
              processingStarted = true;
              startProcessingAnimation(30);
            }
          }
        };

        xhr.onload = () => {
          if (!processingStarted) {
            processingStarted = true;
            startProcessingAnimation(30);
          }
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

    setGlobalProgress(100, "Analysis complete!");
    setTimeout(() => {
      localStorage.removeItem('creatorly_inflight');
      showResults(data.data.results);
    }, 450);

  } catch (err) {
    clearProgressInterval();
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

  // Immediately show pulse-type loading skeleton
  if (historyPageList) {
    historyPageList.innerHTML = `
      <div class="history-skeleton-item">
        <div class="history-skeleton-thumb"></div>
        <div class="history-skeleton-info">
          <div class="history-skeleton-line short"></div>
          <div class="history-skeleton-line"></div>
        </div>
        <div class="history-skeleton-score"></div>
      </div>
      <div class="history-skeleton-item">
        <div class="history-skeleton-thumb"></div>
        <div class="history-skeleton-info">
          <div class="history-skeleton-line short"></div>
          <div class="history-skeleton-line"></div>
        </div>
        <div class="history-skeleton-score"></div>
      </div>
      <div class="history-skeleton-item">
        <div class="history-skeleton-thumb"></div>
        <div class="history-skeleton-info">
          <div class="history-skeleton-line short"></div>
          <div class="history-skeleton-line"></div>
        </div>
        <div class="history-skeleton-score"></div>
      </div>
    `;
    if (historyPageEmpty) historyPageEmpty.hidden = true;
  }

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
  // Only display successfully completed analyses
  const successHistory = (historyData || []).filter(item => item.status !== 'failed');

  if (successHistory.length === 0) {
    if (historyPageList) historyPageList.innerHTML = '';
    if (historyPageEmpty) historyPageEmpty.hidden = false;
    return;
  }
  
  if (historyPageEmpty) historyPageEmpty.hidden = true;
  
  historyPageList.innerHTML = successHistory.map(item => {
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
  clearProgressInterval();
  progressCard.hidden = true;
  resultsSection.hidden = false;
  errorCard.hidden = true;
  if (historyPage) historyPage.hidden = true;
  // Show hero and main (in case we came from history tab)
  const hero = document.querySelector('.hero');
  const main = document.querySelector('.main');
  if (hero) hero.hidden = false;
  if (main) main.hidden = false;

  // Save latest analysis results so that Chatbot/Ask AI has access to it!
  try {
    localStorage.setItem('creatorly_last_analysis', JSON.stringify(results));
  } catch (e) {
    console.warn('Failed to save last analysis to localStorage:', e);
  }

  renderResults(results);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showError(msg) {
  clearProgressInterval();
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
  clearProgressInterval();
  uploadCard.hidden = false;
  progressCard.hidden = true;
  resultsSection.hidden = true;
  errorCard.hidden = true;
  clearFile();
  instaUrlInput.value = '';
  updateSubmitBtn();
  document.getElementById('nicheInput').value = 'general';
  
  // Hide custom revamp views
  const floatBtn = document.getElementById('floatingAskAiBtn');
  if (floatBtn) floatBtn.hidden = true;
  const winsCard = document.getElementById('winsCard');
  const winsLabel = document.getElementById('winsSectionLabel');
  if (winsCard) winsCard.hidden = true;
  if (winsLabel) winsLabel.hidden = true;

  // Pause and reset video player
  const videoPlayer = document.getElementById('videoPlayer');
  if (videoPlayer) { videoPlayer.pause(); videoPlayer.src = ''; }
  // Revoke old video URL
  if (currentVideoUrl) { URL.revokeObjectURL(currentVideoUrl); currentVideoUrl = null; }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
retryBtn.addEventListener('click', resetUI);
analyseAnotherBtn.addEventListener('click', resetUI);

/* ── Dynamic Progress & Step animation ── */
let progressInterval = null;
let currentGlobalPercent = 0;

function clearProgressInterval() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

function setGlobalProgress(percent, statusText) {
  currentGlobalPercent = percent;
  const percentEl = document.getElementById('progressPercent');
  const circleEl = document.getElementById('progressRingCircle');
  const subEl = document.querySelector('.progress-sub');
  
  if (percentEl) {
    percentEl.textContent = `${Math.round(percent)}%`;
  }
  if (circleEl) {
    const offset = 201 - (201 * (percent / 100));
    circleEl.style.strokeDashoffset = offset;
  }
  if (subEl && statusText) {
    subEl.textContent = statusText;
  }
  
  // Highlight steps based on percent (7 vertical stages V2)
  const s1 = document.getElementById('step1');
  const s2 = document.getElementById('step2');
  const s3 = document.getElementById('step3');
  const s4 = document.getElementById('step4');
  const s5 = document.getElementById('step5');
  const s6 = document.getElementById('step6');
  const s7 = document.getElementById('step7');
  
  if (s1 && s2 && s3 && s4 && s5 && s6 && s7) {
    const setStepState = (el, state) => {
      if (state === 'done') {
        el.className = 'step-v2 done';
      } else if (state === 'active') {
        el.className = 'step-v2 active';
      } else {
        el.className = 'step-v2';
      }
    };

    if (percent < 15) {
      setStepState(s1, 'active');
      setStepState(s2, 'pending');
      setStepState(s3, 'pending');
      setStepState(s4, 'pending');
      setStepState(s5, 'pending');
      setStepState(s6, 'pending');
      setStepState(s7, 'pending');
    } else if (percent < 35) {
      setStepState(s1, 'done');
      setStepState(s2, 'active');
      setStepState(s3, 'pending');
      setStepState(s4, 'pending');
      setStepState(s5, 'pending');
      setStepState(s6, 'pending');
      setStepState(s7, 'pending');
    } else if (percent < 50) {
      setStepState(s1, 'done');
      setStepState(s2, 'done');
      setStepState(s3, 'active');
      setStepState(s4, 'pending');
      setStepState(s5, 'pending');
      setStepState(s6, 'pending');
      setStepState(s7, 'pending');
    } else if (percent < 65) {
      setStepState(s1, 'done');
      setStepState(s2, 'done');
      setStepState(s3, 'done');
      setStepState(s4, 'active');
      setStepState(s5, 'pending');
      setStepState(s6, 'pending');
      setStepState(s7, 'pending');
    } else if (percent < 80) {
      setStepState(s1, 'done');
      setStepState(s2, 'done');
      setStepState(s3, 'done');
      setStepState(s4, 'done');
      setStepState(s5, 'active');
      setStepState(s6, 'pending');
      setStepState(s7, 'pending');
    } else if (percent < 92) {
      setStepState(s1, 'done');
      setStepState(s2, 'done');
      setStepState(s3, 'done');
      setStepState(s4, 'done');
      setStepState(s5, 'done');
      setStepState(s6, 'active');
      setStepState(s7, 'pending');
    } else if (percent < 100) {
      setStepState(s1, 'done');
      setStepState(s2, 'done');
      setStepState(s3, 'done');
      setStepState(s4, 'done');
      setStepState(s5, 'done');
      setStepState(s6, 'done');
      setStepState(s7, 'active');
    } else {
      setStepState(s1, 'done');
      setStepState(s2, 'done');
      setStepState(s3, 'done');
      setStepState(s4, 'done');
      setStepState(s5, 'done');
      setStepState(s6, 'done');
      setStepState(s7, 'done');
    }
  }
}

function startProcessingAnimation(startPercent = 10) {
  clearProgressInterval();
  
  let current = startPercent;
  setGlobalProgress(current, "Initializing analysis workspace...");
  
  const statusMessages = [
    { threshold: 15, text: "Initializing analysis workspace..." },
    { threshold: 35, text: "Processing video upload/download..." },
    { threshold: 50, text: "Extracting frames and sampling timeline..." },
    { threshold: 65, text: "Analyzing speech loudness and silence gaps..." },
    { threshold: 80, text: "Gemini Vision evaluating scene flow and hook..." },
    { threshold: 92, text: "Aggregating metrics and final scores..." },
    { threshold: 98, text: "Generating custom captions and hashtags..." }
  ];
  
  progressInterval = setInterval(() => {
    if (current < 99) {
      // Easing curve: increase slower as we get closer to 99%
      let increment = 1.2;
      if (current > 85) increment = 0.2;
      else if (current > 60) increment = 0.5;
      else if (current > 35) increment = 0.8;
      
      current = Math.min(99, current + increment);
      
      // Find appropriate status text
      let msg = "Processing video analysis...";
      for (const m of statusMessages) {
        if (current <= m.threshold) {
          msg = m.text;
          break;
        }
      }
      if (current > 92) {
        msg = "Assembling final report...";
      }
      
      setGlobalProgress(current, msg);
    }
  }, 300); // update every 300ms for ultra-smooth fluid movement!
}

// Backward compatibility fallback
function animateSteps() {
  // Handled dynamically via setGlobalProgress/startProcessingAnimation
}

/* ── Render results ── */
function renderResults(r) {
  // 1. Top card — thumbnail, niche, score, sub-scores
  const thumbImg = document.getElementById('resultThumb');
  if (r.thumbnail && thumbImg) {
    thumbImg.src = r.thumbnail;
    // Make thumbnail clickable — scroll to video
    thumbImg.parentElement.onclick = () => {
      const tl = document.getElementById('timelineCard');
      if (tl) tl.scrollIntoView({ behavior: 'smooth' });
    };
  }
  
  const durationEl = document.getElementById('resultDuration');
  if (durationEl && r.video_info?.duration) durationEl.textContent = formatTime(r.video_info.duration);

  const nicheEl = document.getElementById('resultNiche');
  if (nicheEl) nicheEl.textContent = r.niche || r._reel_type?.replace(/_/g, ' ') || 'General';

  const perfPill = document.getElementById('perfBadge');
  const perfMap = { viral_potential: ['Viral potential', 'viral'], above_average: ['Above average', 'above'], average: ['Average', 'average'], below_average: ['Needs rework', ''] };
  const [perfLabel, perfCls] = perfMap[r.predicted_performance] || ['Analysed', ''];
  if (perfPill) { perfPill.textContent = perfLabel; perfPill.className = `perf-pill ${perfCls}`; }

  const summaryEl = document.getElementById('overallSummary');
  if (summaryEl) summaryEl.textContent = r.short_description || r.video_summary || r.overall_summary || '';

  // Sub-scores removed from top card — shown in Reel Scores section instead

  // Score ring
  const score = r.overall_score;
  const scoreEl = document.getElementById('overallScore');
  const ringFill = document.getElementById('ringFill');
  const circumference = 314;
  const color = score >= 7.5 ? '#22c55e' : score >= 5 ? '#a855f7' : score >= 3 ? '#eab308' : '#ef4444';
  if (ringFill) { ringFill.style.stroke = color; ringFill.style.strokeDashoffset = circumference - (score / 10) * circumference; }
  if (scoreEl) {
    const displayScore = score?.toFixed ? score.toFixed(1) : '—';
    scoreEl.innerHTML = `${displayScore}<span class="score-denom">/10</span>`;
    scoreEl.style.color = color;
  }

  // 2. Verdict text (in top card, below divider) — 2-3 lines strategist tone
  const verdictText = document.getElementById('verdictText');
  if (verdictText) verdictText.textContent = r.verdict || r.why_viral || r.why_rework || r.video_summary || '';

  // 2.5 WHAT'S WORKING (Wins Card)
  const winsList = document.getElementById('winsList');
  const winsCard = document.getElementById('winsCard');
  const winsLabel = document.getElementById('winsSectionLabel');
  const wins = r.top_3_wins || [];
  if (winsList && winsCard && winsLabel) {
    const cleanWins = wins.filter(w => w && w.trim().length > 0).slice(0, 2);
    if (cleanWins.length > 0) {
      winsList.innerHTML = cleanWins.map(win => {
        return `
          <div class="win-item-v2" style="display: flex; gap: 10px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid var(--border);">
            <span class="win-icon" style="color: #22c55e; flex-shrink: 0; font-size: 1.1rem; margin-top: 1px;">✅</span>
            <div class="win-desc" style="font-size: 0.84rem; color: var(--text-dim); font-weight: 400; line-height: 1.4;">${win}</div>
          </div>
        `;
      }).join('');
      const lastItem = winsList.querySelector('.win-item-v2:last-child');
      if (lastItem) lastItem.style.borderBottom = 'none';
      winsCard.hidden = false;
      winsLabel.hidden = false;
    } else {
      winsCard.hidden = true;
      winsLabel.hidden = true;
    }
  }

  // 3. Fixes - up to 5, ranked by impact, clickable seeking
  const fixesList = document.getElementById('fixesList');
  const fixes = r.top_5_fixes || r.top_3_fixes || [];
  if (fixesList) {
    fixesList.innerHTML = fixes.slice(0, 5).map((fix, i) => {
      const impact = i < 2 ? 'high' : i < 4 ? 'medium' : 'low';
      const impactLabel = i < 2 ? 'High impact' : i < 4 ? 'Medium impact' : 'Low impact';
      const parts = fix.split(/\s*—\s*|\.\s*Fix:\s*/);
      const title = (parts[0] || fix).trim();
      const desc = (parts.slice(1).join(' — ') || '').trim();
      const timestamp = extractTimestamp(fix);
      const clickableClass = timestamp !== null ? 'clickable-fix' : '';
      const clickHandler = timestamp !== null ? `onclick="jumpToTime(${timestamp}); const tl = document.getElementById('timelineCard'); if (tl) tl.scrollIntoView({ behavior: 'smooth' });"` : '';

      return `
        <div class="fix-item-v2 ${clickableClass}" ${clickHandler} style="cursor: ${timestamp !== null ? 'pointer' : 'default'};">
          <div class="fix-num ${impact}">${i + 1}</div>
          <div class="fix-content">
            <div class="fix-title" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; font-weight: 500;">
              ${title}
              <span class="fix-impact ${impact}">${impactLabel}</span>
              ${timestamp !== null ? `<span class="fix-seek-badge" style="font-size: 0.65rem; background: rgba(168,85,247,0.15); color: #c084fc; padding: 2px 6px; border-radius: 4px; font-weight: 500;">⏱️ Seek</span>` : ''}
            </div>
            ${desc ? `<div class="fix-desc" style="font-weight: 400;">${desc}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // 5. Reel Scores — horizontal scrollable cards with rings (non-bullet short paragraph)
  const scoresScroll = document.getElementById('reelScoresScroll');
  if (scoresScroll) {
    const scoreCategories = [
      { key: 'hook', label: 'Hook' },
      { key: 'visual_quality', label: 'Visuals' },
      { key: 'editing', label: 'Editing' },
      { key: 'audio_quality', label: 'Audio' },
      { key: 'content_structure', label: 'Content' },
      { key: 'retention', label: 'Retention' },
      { key: 'text_subtitles', label: 'Text' },
    ];
    scoresScroll.innerHTML = scoreCategories.filter(c => r[c.key]?.score != null).map(c => {
      const s = r[c.key].score;
      const color = s >= 7 ? '#22c55e' : s >= 5 ? '#eab308' : '#ef4444';
      const badgeClass = s >= 7 ? 'strong' : s >= 5 ? 'average' : 'weak';
      const badgeText = s >= 7 ? 'Strong' : s >= 5 ? 'Average' : 'Weak';
      // Get up to 2 complete points (strengths or improvements)
      const points = [
        ...(r[c.key].strengths || []).slice(0, 1),
        ...(r[c.key].improvements || []).slice(0, 1),
      ].slice(0, 2);
      const circumference = 188;
      const offset = circumference - (s / 10) * circumference;
      const paragraphText = points.join(' ');
      const pointsHtml = `<p class="reel-score-paragraph" style="font-size: 0.8rem; color: var(--text-dim); line-height: 1.4; margin: 4px 0 0; font-weight: 400;">${paragraphText}</p>`;

      let aiButtonHtml = '';
      if (c.key === 'hook') {
        aiButtonHtml = `
          <button class="ask-ai-trigger-btn" onclick="window.openCreatorlyChat('How can I improve my latest reel\\\'s hook?')">
            <span class="sparkle-icon">✨</span> Ask AI
          </button>
        `;
      }

      return `
        <div class="reel-score-card">
          <div class="reel-score-ring">
            <svg viewBox="0 0 72 72">
              <circle class="ring-bg-sm" cx="36" cy="36" r="30"/>
              <circle class="ring-fill-sm" cx="36" cy="36" r="30" style="stroke:${color};stroke-dashoffset:${offset}"/>
            </svg>
            <div class="reel-score-num" style="color:${color}">${s}</div>
          </div>
          <div class="reel-score-label">${c.label}</div>
          <span class="reel-score-badge ${badgeClass}">${badgeText}</span>
          <div class="reel-score-points">${pointsHtml}</div>
          ${aiButtonHtml}
        </div>
      `;
    }).join('');
  }

  // Floating chatbot integration
  const floatBtn = document.getElementById('floatingAskAiBtn');
  if (floatBtn) {
    floatBtn.hidden = false;
    floatBtn.onclick = () => {
      localStorage.setItem('currentAnalysisContext', JSON.stringify(r));
      window.openCreatorlyChat("Let's talk about the analysis of this video.");
    };
  }

  // 6. Timeline — always show
  const timelineCard = document.getElementById('timelineCard');
  const td = r.timeline_data;
  if (timelineCard) {
    if (td && td.duration > 0) {
      timelineCard.hidden = false;
      renderSyncTimeline(td, r.sync_timeline, r.sync_score);
    } else if (r.sync_timeline && r.sync_timeline.length > 0 && r.video_info?.duration > 0) {
      timelineCard.hidden = false;
      renderSyncTimeline({ duration: r.video_info.duration, scene_cuts: [], silence_segments: [] }, r.sync_timeline, r.sync_score);
    }
  }

  // 6. Captions (copyable)
  const suggestionsCard = document.getElementById('suggestionsCard');
  const captionsEl = document.getElementById('suggestedCaptions');
  if (r.suggested_captions && r.suggested_captions.length > 0 && captionsEl) {
    let captionsHtml = r.suggested_captions.slice(0, 5).map((c, i) =>
      `<div class="caption-item-v2"><span class="caption-num-v2">${i + 1}</span><span class="caption-text-v2">${c}</span><button class="copy-btn-sm" onclick="copyText(this, '${c.replace(/'/g, "\\'")}')">Copy</button></div>`
    ).join('');

    // Add Ask AI trigger button for refining captions
    captionsHtml += `
      <div class="ask-ai-caption-btn-container">
        <button class="ask-ai-caption-btn" onclick="window.openCreatorlyChat('Can you refine the caption suggestions for this reel to make them more conversational?')">
          <span class="sparkle-icon">✨</span> Ask AI to refine captions
        </button>
      </div>
    `;

    captionsEl.innerHTML = captionsHtml;
    if (suggestionsCard) suggestionsCard.hidden = false;
  }

  // 7. Hashtags (copyable pills)
  const hashtagsCard = document.getElementById('hashtagsCardFull');
  const hashtagsEl = document.getElementById('suggestedHashtagsResult');
  if (r.suggested_hashtags && r.suggested_hashtags.length > 0 && hashtagsEl) {
    hashtagsEl.innerHTML = r.suggested_hashtags.slice(0, 10).map(t => {
      const tag = t.startsWith('#') ? t : '#' + t;
      return `<span class="hashtag-pill" onclick="copyText(this, '${tag}')">${tag}</span>`;
    }).join('');
    if (hashtagsCard) hashtagsCard.hidden = false;
  }

  // 8. Overall score ring animation
  if (score !== null) {
    const targetOffset = circumference - (score / 10) * circumference;
    if (ringFill) {
      ringFill.style.strokeDashoffset = circumference; // start empty
      ringFill.style.transition = 'none';
    }

    // Ease-out cubic function
    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

    const duration = 1200; // ms
    const startTime = performance.now();

    function animateRing(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeOut(t);

      // Animate ring
      if (ringFill) {
        const currentOffset = circumference - eased * (circumference - targetOffset);
        ringFill.style.strokeDashoffset = currentOffset;
      }

      // Animate counter — show X.X/10 format
      if (scoreEl) {
        const currentScore = eased * score;
        scoreEl.textContent = currentScore.toFixed(1) + '/10';
      }

      if (t < 1) {
        requestAnimationFrame(animateRing);
      } else {
        if (ringFill) ringFill.style.strokeDashoffset = targetOffset;
        if (scoreEl) {
          scoreEl.textContent = score.toFixed(1) + '/10';
          scoreEl.style.fontSize = '0.9rem';
        }
      }
    }

    // Small delay so DOM is ready
    setTimeout(() => requestAnimationFrame(animateRing), 80);
  } else {
    if (scoreEl) scoreEl.textContent = '—';
  }

  // Verdict — action-oriented labels
  const scoreVerdict = document.getElementById('scoreVerdict');
  if (scoreVerdict) {
    scoreVerdict.textContent =
      score >= 8 ? 'Viral Potential 🔥' : score >= 6.5 ? 'Strong Content' : score >= 5 ? 'Good Foundation' : 'Needs Rework';
  }

  // Performance badge
  const perf = r.predicted_performance || '';
  const perfBadge = document.getElementById('perfBadge');
  if (perfBadge) {
    const perfMap = {
      viral_potential: ['🔥 Viral Potential', 'perf-viral'],
      above_average:   ['📈 High Reach', 'perf-above'],
      average:         ['⚡ Good Foundation', 'perf-average'],
      below_average:   ['🔧 Needs Rework', 'perf-below'],
    };
    const [label, cls] = perfMap[perf] || ['⚡ Analysed', 'perf-average'];
    perfBadge.textContent = label;
    perfBadge.className = `perf-badge ${cls}`;
  }

  // Overall summary
  const overallSummary = document.getElementById('overallSummary');
  if (overallSummary) overallSummary.textContent = r.overall_summary || '';



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
  if (scrollContainer) scrollContainer.innerHTML = '';
  if (detailContainer) {
    detailContainer.hidden = true;
    detailContainer.innerHTML = '';
  }

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
    if (scrollContainer) {
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
    }
  });

  // Hook Rewrite section — better opening suggestions from hook analysis
  const hookData = r.hook;
  const hookRewriteCard = document.getElementById('hookRewriteCard');
  if (hookRewriteCard && hookData && hookData.improvements && hookData.improvements.length > 0) {
    hookRewriteCard.hidden = false;
    const hookRewritesEl = document.getElementById('hookRewrites');
    if (hookRewritesEl) {
      hookRewritesEl.innerHTML = hookData.improvements.map((fix, i) =>
        `<div class="hook-rewrite-item">
          <span class="hook-rewrite-num">${i + 1}</span>
          <span class="hook-rewrite-text">${fix}</span>
        </div>`
      ).join('');
    }
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
  const videoInfoGrid = document.getElementById('videoInfoGrid');
  if (videoInfoGrid) {
    videoInfoGrid.innerHTML = infoItems.map(({ label, value }) =>
      `<div class="info-item"><div class="info-label">${label}</div><div class="info-value">${value}</div></div>`
    ).join('');
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
  if (scrollContainer) {
    scrollContainer.querySelectorAll('.breakdown-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.key === key);
    });
  }

  if (!detailContainer) return;

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
  const bar = document.getElementById('timelineBar');
  const tStamps = document.getElementById('timelineTimestamps');
  const issuesList = document.getElementById('timelineIssues');
  const syncBadge = document.getElementById('syncScoreBadge');
  const playhead = document.getElementById('timelinePlayhead');

  if (!bar) return;
  bar.innerHTML = '';
  bar.appendChild(playhead);
  if (tStamps) tStamps.innerHTML = '';
  if (issuesList) issuesList.innerHTML = '';

  // ── Video Player Setup (simple) ──
  const videoPlayerWrap = document.getElementById('videoPlayerWrap');
  const videoPlayer = document.getElementById('videoPlayer');
  const bigPlayBtn = document.getElementById('bigPlayBtn');
  const videoTimeEl = document.getElementById('videoTime');

  if (currentVideoUrl && videoPlayer && videoPlayerWrap) {
    videoPlayer.src = currentVideoUrl;
    videoPlayerWrap.hidden = false;

    if (bigPlayBtn) {
      bigPlayBtn.onclick = () => {
        if (videoPlayer.paused) { videoPlayer.play(); bigPlayBtn.style.opacity = '0'; }
        else { videoPlayer.pause(); bigPlayBtn.style.opacity = '1'; }
      };
    }
    videoPlayer.onclick = () => {
      if (videoPlayer.paused) { videoPlayer.play(); if (bigPlayBtn) bigPlayBtn.style.opacity = '0'; }
      else { videoPlayer.pause(); if (bigPlayBtn) bigPlayBtn.style.opacity = '1'; }
    };
    videoPlayer.onended = () => { if (bigPlayBtn) bigPlayBtn.style.opacity = '1'; };

    videoPlayer.ontimeupdate = () => {
      if (videoPlayer.duration > 0) {
        const pct = (videoPlayer.currentTime / videoPlayer.duration) * 100;
        playhead.style.left = pct + '%';
        if (videoTimeEl) videoTimeEl.textContent = formatTime(videoPlayer.currentTime);
      }
    };

    // Timeline bar drag to seek
    const seekFromBar = (clientX) => {
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      videoPlayer.currentTime = pct * videoPlayer.duration;
    };
    bar.onmousedown = (e) => {
      seekFromBar(e.clientX);
      const onMove = (ev) => seekFromBar(ev.clientX);
      const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
    bar.ontouchstart = (e) => { seekFromBar(e.touches[0].clientX); };
    bar.ontouchmove = (e) => { e.preventDefault(); seekFromBar(e.touches[0].clientX); };
  } else {
    if (videoPlayerWrap) videoPlayerWrap.hidden = true;
  }

  // Sync score badge
  if (syncScore != null && syncBadge) {
    const bc = syncScore >= 7 ? 'sync-good' : syncScore >= 5 ? 'sync-mid' : 'sync-bad';
    syncBadge.className = `sync-score-badge ${bc}`;
    syncBadge.textContent = `${syncScore}/10`;
  }

  // Colored segments on timeline bar — NO text, just colors
  if (syncPoints && syncPoints.length > 0) {
    const sorted = [...syncPoints].sort((a, b) => a.timestamp - b.timestamp);
    sorted.forEach((pt, i) => {
      const nextTs = sorted[i + 1]?.timestamp ?? duration;
      const width = ((nextTs - pt.timestamp) / duration) * 100;
      const colorClass = pt.status === 'ok' ? 'green' : (pt.status === 'audio_issue' || pt.status === 'slow') ? 'amber' : 'red';
      const seg = document.createElement('div');
      seg.className = `tl-segment-v3 ${colorClass}`;
      seg.style.width = width + '%';
      bar.appendChild(seg);
    });
  } else {
    const seg = document.createElement('div');
    seg.className = 'tl-segment-v3 green';
    seg.style.width = '100%';
    bar.appendChild(seg);
  }

  // Timestamps
  if (tStamps) {
    const stamps = [0, duration * 0.25, duration * 0.5, duration * 0.75, duration];
    tStamps.innerHTML = stamps.map(t => `<span>${formatTime(t)}</span>`).join('');
  }

  // Issue rows - sorted chronologically, clickable to seek
  const issues = (syncPoints || []).filter(p => p.status !== 'ok');
  if (issuesList) {
    if (issues.length === 0) {
      issuesList.innerHTML = '<div class="tl-issue-row green"><span class="tl-issue-dot" style="background:#15803d"></span> No issues found — your reel looks great!</div>';
    } else {
      const sortedIssues = [...issues].sort((a, b) => a.timestamp - b.timestamp);
      issuesList.innerHTML = sortedIssues.map(pt => {
        const time = formatTime(pt.timestamp);
        const colorClass = (pt.status === 'audio_issue' || pt.status === 'slow' || pt.status === 'ending') ? 'amber' : 'red';
        const note = pt.note || 'Issue detected';
        return `
          <div class="tl-issue-row ${colorClass}" onclick="jumpToTime(${pt.timestamp})" style="cursor: pointer;">
            <span class="tl-issue-dot" style="background:${colorClass === 'red' ? '#dc2626' : '#b45309'}"></span>
            ${time} — ${note}
          </div>
        `;
      }).join('');
    }
  }
}

// Toggle issue card expansion
function toggleIssueCard(el, timestamp) {
  const wasExpanded = el.classList.contains('expanded');
  // Close all
  el.parentElement.querySelectorAll('.tl2-issue-card').forEach(c => c.classList.remove('expanded'));
  // Toggle this one
  if (!wasExpanded) el.classList.add('expanded');
}

// Parse timestamp in seconds from a text string
function extractTimestamp(text) {
  if (!text) return null;
  const mMinSec = text.match(/\[?(\d+):(\d+)\]?/);
  if (mMinSec) {
    const mins = parseInt(mMinSec[1], 10);
    const secs = parseInt(mMinSec[2], 10);
    return mins * 60 + secs;
  }
  const mSec = text.match(/\b(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)\b/i);
  if (mSec) {
    return parseFloat(mSec[1]);
  }
  const mAt = text.match(/\bat\s+(\d+(?:\.\d+)?)\b/i);
  if (mAt) {
    return parseFloat(mAt[1]);
  }
  return null;
}

// Jump video to timestamp
function jumpToTime(timestamp) {
  const videoPlayer = document.getElementById('videoPlayer');
  if (videoPlayer && currentVideoUrl) {
    videoPlayer.currentTime = timestamp;
    videoPlayer.pause();
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
