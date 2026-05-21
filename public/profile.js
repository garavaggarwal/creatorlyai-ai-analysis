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
  // Cache profile for chatbot usage
  localStorage.setItem('creatorly_last_profile', JSON.stringify(p));

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

  // ── Creatorly Score calculation ──
  const score = p.creatorlyScore || 70;
  let scoreClass = 'neutral';
  let scoreText = 'Needs Improvement';
  if (score >= 80) {
    scoreClass = 'positive';
    scoreText = 'Excellent';
  } else if (score >= 65) {
    scoreClass = 'warning';
    scoreText = 'Good';
  } else if (score < 50) {
    scoreClass = 'negative';
    scoreText = 'Needs Attention';
  }


  // Stats row (Followers + Posts + Creatorly Score status tag)
  document.getElementById('profileStatsRow').innerHTML = `
    <div class="profile-stat">
      <div class="profile-stat-value">${formatNum(p.followersCount)}</div>
      <div class="profile-stat-label">Followers</div>
    </div>
    <div class="profile-stat">
      <div class="profile-stat-value">${formatNum(p.postsCount)}</div>
      <div class="profile-stat-label">Total Posts</div>
    </div>
    <div class="profile-stat growth-signal-stat">
      <div class="profile-stat-value growth-tag ${scoreClass}">${score}% (${scoreText})</div>
      <div class="profile-stat-label">Creatorly Score (Avg: 70%)</div>
    </div>
  `;

  // ── Insights row data binding ──
  // 1. Engagement Rate
  document.getElementById('erValue').textContent = `${p.erByViews}%`;
  const erBadge = document.getElementById('erBadge');
  erBadge.textContent = p.erByViews >= p.nicheBenchmark ? 'Above Average' : 'Below Average';
  erBadge.className = 'badge ' + (p.erByViews >= p.nicheBenchmark ? 'positive' : 'low');
  document.getElementById('erComparison').textContent = `Benchmark niche avg: ${p.nicheBenchmark}%`;

  // 2. Consistency (Friendly display)
  const reelsPerWeek = p.reelsPerWeek || 0;
  let consistencyValText = '';
  let consistencyDescText = '';
  
  if (reelsPerWeek === 0) {
    consistencyValText = 'No reels';
    consistencyDescText = 'We recommend posting at least 3 reels per week!';
  } else {
    const daysPerReel = 7 / reelsPerWeek;
    if (daysPerReel <= 1.2) {
      consistencyValText = 'Every day';
    } else if (daysPerReel <= 1.8) {
      consistencyValText = 'Every 1.5 days';
    } else if (daysPerReel <= 2.5) {
      consistencyValText = 'Every 2 days';
    } else {
      consistencyValText = `Every ${Math.round(daysPerReel)} days`;
    }

    if (reelsPerWeek >= 3) {
      consistencyDescText = `Beating niche avg (3/wk). Keep it up!`;
    } else {
      consistencyDescText = `Below niche avg (3/wk). Try posting more frequently!`;
    }
  }

  document.getElementById('consistencyValue').textContent = consistencyValText;
  const consistencyBadge = document.getElementById('consistencyBadge');
  consistencyBadge.textContent = reelsPerWeek >= 3 ? 'Excellent' : reelsPerWeek >= 1.5 ? 'Average' : 'Low';
  consistencyBadge.className = 'badge ' + (reelsPerWeek >= 3 ? 'positive' : reelsPerWeek >= 1.5 ? 'warning' : 'low');
  document.getElementById('consistencyComparison').textContent = consistencyDescText;

  // 3. Views to Likes Ratio
  document.getElementById('ratioValue').textContent = `1 in ${p.viewsToLikesRatio}`;
  const ratioBadge = document.getElementById('ratioBadge');
  ratioBadge.textContent = p.viewsToLikesRatio <= 12 ? 'Excellent' : p.viewsToLikesRatio <= 20 ? 'Average' : 'Low Likes';
  ratioBadge.className = 'badge ' + (p.viewsToLikesRatio <= 12 ? 'positive' : p.viewsToLikesRatio <= 20 ? 'warning' : 'low');
  document.getElementById('ratioComparison').textContent = `Views per Like (Niche Avg: 1 in 15)`;

  // 4. Brand Rate Card calculations & binding
  let minRate = Math.round(p.avgViews * 0.12 + (p.followersCount * (p.erByViews / 100)) * 1.0);
  let maxRate = Math.round(p.avgViews * 0.30 + (p.followersCount * (p.erByViews / 100)) * 2.5);
  
  if (minRate < 1000) minRate = 1000;
  if (maxRate < 2000) maxRate = 2000;

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  };
  const collabRateRangeText = `${formatCurrency(minRate)} - ${formatCurrency(maxRate)}`;
  
  let tier = 'Nano Creator';
  if (p.followersCount >= 1000000) {
    tier = 'Mega Creator';
  } else if (p.followersCount >= 500000) {
    tier = 'Macro Creator';
  } else if (p.followersCount >= 100000) {
    tier = 'Mid-Tier Creator';
  } else if (p.followersCount >= 10000) {
    tier = 'Micro Creator';
  }

  document.getElementById('creatorTierValue').textContent = tier;
  document.getElementById('collabRateRange').textContent = collabRateRangeText;
  document.getElementById('collabRateDesc').textContent = `Based on average views of ${formatNum(p.avgViews)} and ER of ${p.erByViews}%.`;

  // Bind ask AI buttons
  document.getElementById('askAiErBtn').onclick = (e) => {
    e.stopPropagation();
    if (window.openCreatorlyChat) {
      window.openCreatorlyChat(`My engagement rate is ${p.erByViews}%. Niche average is ${p.nicheBenchmark}%. Suggest 3 ways to improve engagement.`);
    }
  };

  document.getElementById('askAiRateBtn').onclick = (e) => {
    e.stopPropagation();
    if (window.openCreatorlyChat) {
      window.openCreatorlyChat(`My brand rates are calculated as ${collabRateRangeText}. How should I pitch this to brand sponsors?`);
    }
  };

  // ── Performance Averages (bind values) ──
  document.getElementById('avgViewsVal').textContent = formatNum(p.avgViews);
  document.getElementById('avgLikesVal').textContent = formatNum(p.avgLikes);
  document.getElementById('avgCommentsVal').textContent = formatNum(p.avgComments);

  // ── Best Performing Reel widget ──
  const bestReelContainer = document.getElementById('bestReelContainer');
  if (p.bestReel) {
    const br = p.bestReel;
    const thumbSrc = br.thumbnailUrl ? `${API_BASE}/api/image-proxy?url=${encodeURIComponent(br.thumbnailUrl)}` : '';
    const thumbHtml = thumbSrc
      ? `<img class="best-reel-img" src="${thumbSrc}" alt="Best Reel" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="best-reel-placeholder" style="display:none">🎬</div>`
      : `<div class="best-reel-placeholder">🎬</div>`;
    bestReelContainer.innerHTML = `
      <div class="best-reel-card-inner">
        <a href="${br.postUrl}" target="_blank" rel="noopener" class="best-reel-thumb-wrap">
          ${thumbHtml}
          <div class="best-reel-play-overlay">▶</div>
        </a>
        <div class="best-reel-details">
          <p class="best-reel-caption">"${br.caption || 'No caption'}"</p>
          <div class="best-reel-stats">
            <span class="best-stat-item">👁 <strong>${formatNum(br.views)}</strong> Views</span>
            <span class="best-stat-item">❤️ <strong>${formatNum(br.likes)}</strong> Likes</span>
            <span class="best-stat-item">💬 <strong>${formatNum(br.comments)}</strong> Comments</span>
          </div>
          <a href="${br.postUrl}" target="_blank" rel="noopener" class="btn btn-outline btn-sm best-reel-btn">View Reel</a>
        </div>
      </div>
    `;
  } else {
    bestReelContainer.innerHTML = `<p style="color:var(--text-dim); text-align:center; padding: 20px;">No reels found to determine best performer.</p>`;
  }

  // ── Posting Schedule Assistant ──
  document.getElementById('bestPostTimeAudience').textContent = `${p.optimalTime.day}s @ ${p.optimalTime.time}`;
  document.getElementById('bestPostTimeIndustry').textContent = `${p.industryBenchmarkTime.day}s @ ${p.industryBenchmarkTime.time}`;

  // ── Top Hashtags Cloud ──
  const hashtagsCloud = document.getElementById('topHashtagsCloud');
  if (p.topHashtags && p.topHashtags.length > 0) {
    hashtagsCloud.innerHTML = p.topHashtags.map(h => `
      <div class="hashtag-chip">
        <span class="hashtag-name">${h.tag}</span>
        <span class="hashtag-boost">💥 Avg Engagement: ${formatNum(h.avgEngagement)}</span>
      </div>
    `).join('');
  } else {
    hashtagsCloud.innerHTML = `<p style="color:var(--text-dim); text-align:center; padding: 10px; width: 100%;">No hashtags detected in recent reels.</p>`;
  }

  // Chart
  renderChart(p.viewsTrend);

  // Analyzed Reels grid
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
