/* ── Profile Analytics Page ── */
const API_BASE = 'https://api.creatorlyai.in';

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

// DOM refs
const profileForm = document.getElementById('profileForm');
const usernameInput = document.getElementById('usernameInput');
const blurredPreview = document.getElementById('blurredPreview');
const skeletonLoading = document.getElementById('skeletonLoading');
const profileResults = document.getElementById('profileResults');
const profileError = document.getElementById('profileError');
const profileErrorMsg = document.getElementById('profileErrorMsg');
const profileRetryBtn = document.getElementById('profileRetryBtn');

// Check if username is already saved
const savedUsername = localStorage.getItem('creatorly_ig_username');
if (savedUsername) {
  // Show skeleton loading immediately, then fetch
  blurredPreview.hidden = true;
  skeletonLoading.hidden = false;
  fetchProfile(savedUsername);
}

// Form submit
profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim().replace(/^@/, '');
  if (!username) return;
  localStorage.setItem('creatorly_ig_username', username);
  await fetchProfile(username);
});

profileRetryBtn.addEventListener('click', () => {
  profileError.hidden = true;
  blurredPreview.hidden = false;
  skeletonLoading.hidden = true;
});

// ── Change Username Popup ──
const changeUsernamePopup = document.getElementById('changeUsernamePopup');
const editUsernameBtn = document.getElementById('editUsernameBtn');
const popupCloseBtn = document.getElementById('popupCloseBtn');
const changeUsernameForm = document.getElementById('changeUsernameForm');
const newUsernameInput = document.getElementById('newUsernameInput');

// Open popup
document.addEventListener('click', (e) => {
  if (e.target.closest('#editUsernameBtn')) {
    changeUsernamePopup.hidden = false;
    newUsernameInput.value = '';
    newUsernameInput.focus();
  }
});

// Close popup
popupCloseBtn.addEventListener('click', () => {
  changeUsernamePopup.hidden = true;
});

// Close on overlay click
changeUsernamePopup.addEventListener('click', (e) => {
  if (e.target === changeUsernamePopup) {
    changeUsernamePopup.hidden = true;
  }
});

// Submit new username
changeUsernameForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const newUsername = newUsernameInput.value.trim().replace(/^@/, '');
  if (!newUsername) return;
  changeUsernamePopup.hidden = true;
  localStorage.setItem('creatorly_ig_username', newUsername);
  await fetchProfile(newUsername);
});

async function fetchProfile(username) {
  blurredPreview.hidden = true;
  skeletonLoading.hidden = false;
  profileResults.hidden = true;
  profileError.hidden = true;

  const session = typeof getRawSession === 'function' ? getRawSession() : null;
  const authToken = session?.access_token || null;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    const resp = await fetch(`${API_BASE}/api/profile-analytics`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const json = await resp.json();

    if (!resp.ok || !json.success) {
      throw new Error(json.error || 'Could not fetch profile');
    }

    skeletonLoading.hidden = true;
    profileResults.hidden = false;
    renderProfile(json.profile);

  } catch (err) {
    skeletonLoading.hidden = true;
    profileError.hidden = false;
    if (err.name === 'AbortError') {
      profileErrorMsg.textContent = 'Request timed out. Server may be unavailable. Try again.';
    } else {
      profileErrorMsg.textContent = err.message || 'Something went wrong';
    }
  }
}

function renderProfile(p) {
  // Avatar — use proxy to bypass CORS, fallback to initial
  const avatar = document.getElementById('profileAvatar');
  const avatarFallback = document.getElementById('profileAvatarFallback');
  if (p.profilePicUrl) {
    const proxiedUrl = `${API_BASE}/api/image-proxy?url=${encodeURIComponent(p.profilePicUrl)}`;
    avatar.src = proxiedUrl;
    avatar.style.display = 'block';
    avatarFallback.style.display = 'none';
    avatar.onerror = () => { avatar.style.display = 'none'; avatarFallback.style.display = 'flex'; };
    // Save proxied URL for bottom nav usage
    localStorage.setItem('creatorly_ig_pic', proxiedUrl);
  } else {
    avatar.style.display = 'none';
    avatarFallback.style.display = 'flex';
  }
  avatarFallback.textContent = (p.fullName || p.username || '?')[0].toUpperCase();

  document.getElementById('profileFullName').textContent = p.fullName || p.username;
  document.getElementById('profileUsername').textContent = `@${p.username}`;
  document.getElementById('profileBio').textContent = p.biography || '';

  const verifiedBadge = document.getElementById('verifiedBadge');
  verifiedBadge.hidden = !p.isVerified;

  // Tags
  const tags = [];
  if (p.niche && p.niche !== 'General') tags.push(p.niche);
  if (p.isBusinessAccount && p.businessCategory) tags.push(p.businessCategory);
  if (p.isVerified) tags.push('Verified');
  document.getElementById('profileTags').innerHTML = tags.map(t =>
    `<span class="profile-tag">${t}</span>`
  ).join('');

  // Stats row (Followers + Posts only, no Following)
  document.getElementById('profileStatsRow').innerHTML = `
    <div class="profile-stat">
      <div class="profile-stat-value">${formatNum(p.followersCount)}</div>
      <div class="profile-stat-label">Followers</div>
    </div>
    <div class="profile-stat">
      <div class="profile-stat-value">${formatNum(p.postsCount)}</div>
      <div class="profile-stat-label">Total Posts</div>
    </div>
  `;

  // Key Metrics — 8 exact metrics
  const erFollowersClass = p.erByFollowers >= 3 ? 'high' : p.erByFollowers >= 1 ? 'mid' : 'low';
  const erViewsClass = p.erByViews >= 10 ? 'high' : p.erByViews >= 5 ? 'mid' : 'low';
  const reachClass = p.reachEfficiency >= 1 ? 'high' : p.reachEfficiency >= 0.3 ? 'mid' : 'low';

  document.getElementById('metricsGrid').innerHTML = `
    <div class="metric-item">
      <div class="metric-value">${formatNum(p.avgViews)}</div>
      <div class="metric-label">Avg Reel Views</div>
      <div class="metric-desc">Last 10 reels avg reach</div>
    </div>
    <div class="metric-item">
      <div class="metric-value">${formatNum(p.avgLikes)}</div>
      <div class="metric-label">Avg Likes</div>
      <div class="metric-desc">Audience approval signal</div>
    </div>
    <div class="metric-item">
      <div class="metric-value">${formatNum(p.avgComments)}</div>
      <div class="metric-label">Avg Comments</div>
      <div class="metric-desc">Community interaction</div>
    </div>
    <div class="metric-item">
      <div class="metric-value">${formatNum(p.avgShares)}</div>
      <div class="metric-label">Avg Shares</div>
      <div class="metric-desc">Virality indicator</div>
    </div>
    <div class="metric-item">
      <div class="metric-value">${formatNum(p.avgSaves)}</div>
      <div class="metric-label">Avg Saves</div>
      <div class="metric-desc">Content value signal</div>
    </div>
    <div class="metric-item">
      <div class="metric-value ${erFollowersClass}">${p.erByFollowers}%</div>
      <div class="metric-label">ER by Followers</div>
      <div class="metric-desc">Engagement ÷ Followers</div>
    </div>
    <div class="metric-item">
      <div class="metric-value ${erViewsClass}">${p.erByViews}%</div>
      <div class="metric-label">ER by Views</div>
      <div class="metric-desc">Engagement ÷ Views</div>
    </div>
    <div class="metric-item">
      <div class="metric-value ${reachClass}">${p.reachEfficiency}x</div>
      <div class="metric-label">Reach Efficiency</div>
      <div class="metric-desc">Views ÷ Followers</div>
    </div>
  `;

  // Chart
  renderChart(p.viewsTrend);

  // Recent Posts — clickable to Instagram, with thumbnail images
  document.getElementById('postsGrid').innerHTML = (p.recentPosts || []).map(post => {
    const link = post.postUrl || `https://www.instagram.com/${p.username}/`;
    const thumbSrc = post.thumbnailUrl ? `${API_BASE}/api/image-proxy?url=${encodeURIComponent(post.thumbnailUrl)}` : '';
    const thumbHtml = thumbSrc
      ? `<img class="post-thumb-img" src="${thumbSrc}" alt="Post" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="post-thumb-fallback" style="display:none">${post.type === 'Video' ? '🎬' : '📷'}</div>`
      : `<div class="post-thumb-fallback">${post.type === 'Video' ? '🎬' : '📷'}</div>`;
    return `
      <a href="${link}" target="_blank" rel="noopener" class="post-item">
        <div class="post-thumb-wrap">
          ${thumbHtml}
        </div>
        <div class="post-stats">
          <span class="post-stat">❤️ ${formatNum(post.likes)}</span>
          <span class="post-stat">💬 ${formatNum(post.comments)}</span>
          ${post.views > 0 ? `<span class="post-stat">👁 ${formatNum(post.views)}</span>` : ''}
        </div>
      </a>
    `;
  }).join('') || '<p style="color:var(--text-dim)">No recent posts found</p>';

  // Recent Reels — separate section for video content
  document.getElementById('reelsGrid').innerHTML = (p.recentReels || []).map(reel => {
    const link = reel.postUrl || `https://www.instagram.com/${p.username}/reels/`;
    const thumbSrc = reel.thumbnailUrl ? `${API_BASE}/api/image-proxy?url=${encodeURIComponent(reel.thumbnailUrl)}` : '';
    const thumbHtml = thumbSrc
      ? `<img class="post-thumb-img" src="${thumbSrc}" alt="Reel" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="post-thumb-fallback" style="display:none">🎬</div>`
      : `<div class="post-thumb-fallback">🎬</div>`;
    return `
      <a href="${link}" target="_blank" rel="noopener" class="post-item">
        <div class="post-thumb-wrap">
          ${thumbHtml}
          <div class="reel-play-icon">▶</div>
        </div>
        <div class="post-stats">
          <span class="post-stat">❤️ ${formatNum(reel.likes)}</span>
          <span class="post-stat">💬 ${formatNum(reel.comments)}</span>
          ${reel.views > 0 ? `<span class="post-stat">👁 ${formatNum(reel.views)}</span>` : ''}
        </div>
      </a>
    `;
  }).join('') || '<p style="color:var(--text-dim)">No reels found</p>';
}

function renderChart(trend) {
  const wrap = document.getElementById('chartWrap');
  if (!trend || trend.length === 0) {
    wrap.innerHTML = '<p style="color:var(--text-dim);text-align:center;width:100%">No trend data available</p>';
    return;
  }

  const maxViews = Math.max(...trend.map(t => t.views), 1);
  const maxLikes = Math.max(...trend.map(t => t.likes), 1);
  const maxVal = Math.max(maxViews, maxLikes);

  const legend = `<div class="chart-legend">
    <span class="chart-legend-item"><span class="chart-legend-dot" style="background:var(--accent2)"></span>Views</span>
    <span class="chart-legend-item"><span class="chart-legend-dot" style="background:var(--green)"></span>Likes</span>
  </div>`;

  const bars = trend.map((t, i) => {
    const viewH = Math.max((t.views / maxVal) * 160, 4);
    const likeH = Math.max((t.likes / maxVal) * 160, 4);
    const label = t.date ? new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : `#${i + 1}`;
    return `
      <div class="chart-bar-group">
        <div style="display:flex;align-items:flex-end;gap:2px;height:160px">
          <div class="chart-bar views" style="height:${viewH}px" title="Views: ${formatNum(t.views)}"></div>
          <div class="chart-bar likes" style="height:${likeH}px" title="Likes: ${formatNum(t.likes)}"></div>
        </div>
        <span class="chart-bar-label">${label}</span>
      </div>
    `;
  }).join('');

  wrap.innerHTML = legend + `<div style="display:flex;align-items:flex-end;gap:4px;width:100%;overflow-x:auto;padding:10px 0">${bars}</div>`;
}

function formatNum(n) {
  if (!n || n === 0) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}
