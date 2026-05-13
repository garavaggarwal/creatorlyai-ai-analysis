/* ── Profile Analytics Page ── */
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

// DOM refs
const profileForm = document.getElementById('profileForm');
const usernameInput = document.getElementById('usernameInput');
const blurredPreview = document.getElementById('blurredPreview');
const profileLoading = document.getElementById('profileLoading');
const profileResults = document.getElementById('profileResults');
const profileError = document.getElementById('profileError');
const profileErrorMsg = document.getElementById('profileErrorMsg');
const profileRetryBtn = document.getElementById('profileRetryBtn');

// Check if username is already saved
const savedUsername = localStorage.getItem('creatorly_ig_username');
if (savedUsername) {
  // Auto-fetch on load if username is saved
  blurredPreview.hidden = true;
  fetchProfile(savedUsername);
}

// Form submit
profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim().replace(/^@/, '');
  if (!username) return;
  // Save username for future visits
  localStorage.setItem('creatorly_ig_username', username);
  await fetchProfile(username);
});

profileRetryBtn.addEventListener('click', () => {
  profileError.hidden = true;
  blurredPreview.hidden = false;
});

async function fetchProfile(username) {
  blurredPreview.hidden = true;
  profileLoading.hidden = false;
  profileResults.hidden = true;
  profileError.hidden = true;

  const session = typeof getRawSession === 'function' ? getRawSession() : null;
  const authToken = session?.access_token || null;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const resp = await fetch(`${API_BASE}/api/profile-analytics`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username }),
    });

    const json = await resp.json();

    if (!resp.ok || !json.success) {
      throw new Error(json.error || 'Could not fetch profile');
    }

    profileLoading.hidden = true;
    profileResults.hidden = false;
    renderProfile(json.profile);

  } catch (err) {
    profileLoading.hidden = true;
    profileError.hidden = false;
    profileErrorMsg.textContent = err.message;
  }
}

function renderProfile(p) {
  // Avatar & info
  const avatar = document.getElementById('profileAvatar');
  if (p.profilePicUrl) {
    avatar.src = p.profilePicUrl;
    avatar.style.display = 'block';
  }
  document.getElementById('profileFullName').textContent = p.fullName || p.username;
  document.getElementById('profileUsername').textContent = `@${p.username}`;
  document.getElementById('profileBio').textContent = p.biography || '';

  const verifiedBadge = document.getElementById('verifiedBadge');
  verifiedBadge.hidden = !p.isVerified;

  // Tags
  const tags = [];
  if (p.isBusinessAccount) tags.push(p.businessCategory || 'Business');
  if (p.isVerified) tags.push('Verified');
  document.getElementById('profileTags').innerHTML = tags.map(t =>
    `<span class="profile-tag">${t}</span>`
  ).join('');

  // Stats row
  document.getElementById('profileStatsRow').innerHTML = `
    <div class="profile-stat">
      <div class="profile-stat-value">${formatNum(p.followersCount)}</div>
      <div class="profile-stat-label">Followers</div>
    </div>
    <div class="profile-stat">
      <div class="profile-stat-value">${formatNum(p.followingCount)}</div>
      <div class="profile-stat-label">Following</div>
    </div>
    <div class="profile-stat">
      <div class="profile-stat-value">${formatNum(p.postsCount)}</div>
      <div class="profile-stat-label">Posts</div>
    </div>
  `;

  // Key Metrics
  const erClass = p.engagementRate >= 3 ? 'high' : p.engagementRate >= 1 ? 'mid' : 'low';
  const freqClass = p.postingFrequency >= 12 ? 'high' : p.postingFrequency >= 4 ? 'mid' : 'low';

  document.getElementById('metricsGrid').innerHTML = `
    <div class="metric-item">
      <div class="metric-value">${formatNum(p.avgViews)}</div>
      <div class="metric-label">Avg Views/Reel</div>
      <div class="metric-desc">Mean views across last 12 reels</div>
    </div>
    <div class="metric-item">
      <div class="metric-value">${formatNum(p.avgLikes)}</div>
      <div class="metric-label">Avg Likes/Reel</div>
      <div class="metric-desc">Passive approval signal</div>
    </div>
    <div class="metric-item">
      <div class="metric-value">${formatNum(p.avgComments)}</div>
      <div class="metric-label">Avg Comments</div>
      <div class="metric-desc">Conversation & reaction</div>
    </div>
    <div class="metric-item">
      <div class="metric-value ${erClass}">${p.engagementRate}%</div>
      <div class="metric-label">Engagement Rate</div>
      <div class="metric-desc">(Likes + Comments) ÷ Followers</div>
    </div>
    <div class="metric-item">
      <div class="metric-value ${freqClass}">${p.postingFrequency}</div>
      <div class="metric-label">Posts/30 Days</div>
      <div class="metric-desc">Posting consistency</div>
    </div>
    <div class="metric-item">
      <div class="metric-value">${formatNum(p.followersCount)}</div>
      <div class="metric-label">Followers</div>
      <div class="metric-desc">Total audience size</div>
    </div>
  `;

  // Chart
  renderChart(p.viewsTrend);

  // Hashtags
  document.getElementById('hashtagsCloud').innerHTML = p.topHashtags.map(h =>
    `<span class="hashtag-chip">${h.tag}<span class="hashtag-count">×${h.count}</span></span>`
  ).join('') || '<p style="color:var(--text-dim)">No hashtags found in recent posts</p>';

  // Recent Posts
  document.getElementById('postsGrid').innerHTML = (p.recentPosts || []).map(post => `
    <div class="post-item">
      ${post.thumbnailUrl ? `<img class="post-thumb" src="${post.thumbnailUrl}" loading="lazy" alt="" />` : '<div class="post-thumb" style="background:var(--bg3)"></div>'}
      <div class="post-stats">
        <span class="post-stat">❤️ ${formatNum(post.likes)}</span>
        <span class="post-stat">💬 ${formatNum(post.comments)}</span>
        ${post.views > 0 ? `<span class="post-stat">👁 ${formatNum(post.views)}</span>` : ''}
      </div>
    </div>
  `).join('') || '<p style="color:var(--text-dim)">No recent posts found</p>';
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
