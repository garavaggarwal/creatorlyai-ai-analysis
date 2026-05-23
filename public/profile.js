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

  // ── 4. Brand Rate Card – Multi-format calculations ──
  const reelMin = Math.round(p.avgViews * 0.12 + (p.followersCount * (p.erByViews / 100)) * 1.0);
  const reelMax = Math.round(p.avgViews * 0.30 + (p.followersCount * (p.erByViews / 100)) * 2.5);

  const rates = {
    reel:     { min: Math.max(reelMin, 1000),         max: Math.max(reelMax, 2000) },
    story:    { min: Math.max(Math.round(reelMin * 0.42), 400),   max: Math.max(Math.round(reelMax * 0.55), 800) },
    post:     { min: Math.max(Math.round(reelMin * 0.65), 700),   max: Math.max(Math.round(reelMax * 0.75), 1500) },
    carousel: { min: Math.max(Math.round(reelMin * 0.80), 900),   max: Math.max(Math.round(reelMax * 0.90), 1800) },
  };
  // Bundle = Story + Reel + Post with a small volume discount (~10%)
  rates.bundle = {
    min: Math.round((rates.story.min + rates.reel.min + rates.post.min) * 0.9),
    max: Math.round((rates.story.max + rates.reel.max + rates.post.max) * 0.9),
  };

  const formatCurrency = (val) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  const fmtRange = (r) => `${formatCurrency(r.min)} – ${formatCurrency(r.max)}`;

  let tier = 'Nano Creator';
  if (p.followersCount >= 1000000) tier = 'Mega Creator';
  else if (p.followersCount >= 500000) tier = 'Macro Creator';
  else if (p.followersCount >= 100000) tier = 'Mid-Tier Creator';
  else if (p.followersCount >= 10000)  tier = 'Micro Creator';

  // Bind values to new multi-format elements
  document.getElementById('creatorTierValue').textContent = tier;
  document.getElementById('rateCardBasedOn').textContent = `${formatNum(p.followersCount)} followers · ${p.erByViews}% ER`;
  document.getElementById('rateReel').textContent = fmtRange(rates.reel);
  document.getElementById('rateStory').textContent = fmtRange(rates.story);
  document.getElementById('ratePost').textContent = fmtRange(rates.post);
  document.getElementById('rateCarousel').textContent = fmtRange(rates.carousel);
  document.getElementById('rateBundle').textContent = fmtRange(rates.bundle);
  document.getElementById('collabRateDesc').textContent =
    `Valuation based on avg. ${formatNum(p.avgViews)} views/reel and ${p.erByViews}% engagement rate.`;

  // ── Spin keyframe ──
  if (!document.getElementById('rate-card-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'rate-card-animation-styles';
    style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }

  // ── Rate card overlay/unlock DOM refs ──
  const rateCardOverlay   = document.getElementById('rateCardOverlay');
  const rateCardContent   = document.getElementById('rateCardContent');
  const generateRateCardBtn = document.getElementById('generateRateCardBtn');
  const sharePdfBtn       = document.getElementById('sharePdfBtn');

  const unlockedKey = 'creatorly_rate_card_unlocked_' + p.username;
  const isUnlocked  = localStorage.getItem(unlockedKey) === 'true';

  const urlParams       = new URLSearchParams(window.location.search);
  const triggerFromUrl  = urlParams.get('generateRateCard') === 'true';

  // ── Enable Share PDF button after unlock ──
  function enableShareBtn() {
    if (!sharePdfBtn) return;
    sharePdfBtn.style.cursor       = 'pointer';
    sharePdfBtn.style.color        = '#a5b4fc';
    sharePdfBtn.style.borderColor  = 'rgba(168,85,247,0.35)';
    sharePdfBtn.style.background   = 'rgba(168,85,247,0.06)';
    sharePdfBtn.removeAttribute('title');
    sharePdfBtn.onclick = () => generateAndSharePdf(p, rates, tier, fmtRange, formatCurrency);
  }

  function unlockRateCard(animate = false) {
    if (animate) {
      generateRateCardBtn.innerHTML = '<span style="display:inline-block; width:12px; height:12px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 0.6s linear infinite; margin-right:6px; vertical-align:middle;"></span> Calculating Worth...';
      generateRateCardBtn.disabled = true;
      setTimeout(() => {
        if (rateCardOverlay) { rateCardOverlay.style.opacity = '0'; rateCardOverlay.style.pointerEvents = 'none'; }
        if (rateCardContent) { rateCardContent.style.filter = 'none'; rateCardContent.style.pointerEvents = 'auto'; rateCardContent.style.opacity = '1'; }
        localStorage.setItem(unlockedKey, 'true');
        enableShareBtn();
        setTimeout(() => { if (rateCardOverlay) rateCardOverlay.style.display = 'none'; }, 420);
      }, 1100);
    } else {
      if (rateCardOverlay) rateCardOverlay.style.display = 'none';
      if (rateCardContent) { rateCardContent.style.filter = 'none'; rateCardContent.style.pointerEvents = 'auto'; rateCardContent.style.opacity = '1'; }
      localStorage.setItem(unlockedKey, 'true');
      enableShareBtn();
    }
  }

  if (generateRateCardBtn) {
    generateRateCardBtn.onclick = () => unlockRateCard(true);
  }

  if (isUnlocked || triggerFromUrl) {
    unlockRateCard(triggerFromUrl && !isUnlocked);
    if (triggerFromUrl) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } else {
    if (rateCardOverlay) { rateCardOverlay.style.display = 'flex'; rateCardOverlay.style.opacity = '1'; rateCardOverlay.style.pointerEvents = 'auto'; }
    if (rateCardContent) { rateCardContent.style.filter = 'blur(14px)'; rateCardContent.style.pointerEvents = 'none'; rateCardContent.style.opacity = '0.12'; }
    if (generateRateCardBtn) { generateRateCardBtn.innerHTML = '✨ Generate My Rate Card'; generateRateCardBtn.disabled = false; }
    // Share button stays disabled until rate card generated
    if (sharePdfBtn) {
      sharePdfBtn.title = 'Generate Rate Card first to unlock sharing';
      sharePdfBtn.onclick = (e) => {
        e.stopPropagation();
        sharePdfBtn.textContent = '⚠ Generate Rate Card first';
        setTimeout(() => {
          sharePdfBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Share PDF';
        }, 2500);
      };
    }
  }

  // ── Ask AI buttons ──
  document.getElementById('askAiErBtn').onclick = (e) => {
    e.stopPropagation();
    if (window.openCreatorlyChat) window.openCreatorlyChat("Suggest 3 ways to improve my profile's engagement rate.");
  };

  document.getElementById('askAiRateBtn').onclick = (e) => {
    e.stopPropagation();
    if (window.openCreatorlyChat) window.openCreatorlyChat("How should I pitch to brand sponsors and determine my brand rates?");
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

// ── PDF Generation / Share ──
function generateAndSharePdf(p, rates, tier, fmtRange, formatCurrency) {
  const btn = document.getElementById('sharePdfBtn');
  if (btn) {
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';
    btn.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border:2px solid #a5b4fc;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;margin-right:5px;vertical-align:middle;"></span> Generating…`;
  }

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtN  = (n) => {
    if (!n || n === 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  const pdfEl = document.getElementById('profilePdfCard');
  if (!pdfEl) return;

  pdfEl.innerHTML = `
    <div style="background:#fff;color:#0f0a1a;font-family:'Inter',sans-serif;padding:0;max-width:794px;">

      <!-- Header Band -->
      <div style="background:linear-gradient(135deg,#a855f7,#6366f1);padding:28px 36px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:1.4rem;font-weight:900;color:#fff;letter-spacing:-0.03em;">Creatorly AI</div>
          <div style="font-size:0.72rem;color:rgba(255,255,255,0.75);margin-top:2px;letter-spacing:0.04em;">CREATOR MEDIA KIT</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.72rem;color:rgba(255,255,255,0.7);">Generated ${today}</div>
          <div style="font-size:0.78rem;font-weight:700;color:#fff;margin-top:3px;">@${p.username}</div>
        </div>
      </div>

      <!-- Profile Info -->
      <div style="padding:28px 36px 20px;border-bottom:1px solid #f1f5f9;">
        <div style="display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <div style="font-size:1.4rem;font-weight:900;color:#1e1b4b;letter-spacing:-0.02em;">${p.fullName || p.username}</div>
            <div style="font-size:0.85rem;color:#6366f1;font-weight:600;margin-top:2px;">@${p.username}${p.isVerified ? ' ✓' : ''}</div>
            ${p.biography ? `<div style="font-size:0.78rem;color:#475569;margin-top:8px;line-height:1.55;max-width:420px;">${p.biography}</div>` : ''}
            ${p.niche && p.niche !== 'General' ? `<div style="display:inline-block;margin-top:10px;padding:3px 10px;background:#f3f0ff;color:#7c3aed;border-radius:99px;font-size:0.7rem;font-weight:700;">${p.niche}</div>` : ''}
          </div>
          <div style="display:flex;gap:20px;flex-shrink:0;">
            <div style="text-align:center;">
              <div style="font-size:1.4rem;font-weight:900;color:#1e1b4b;">${fmtN(p.followersCount)}</div>
              <div style="font-size:0.65rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-top:2px;">Followers</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:1.4rem;font-weight:900;color:#1e1b4b;">${p.erByViews}%</div>
              <div style="font-size:0.65rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-top:2px;">Eng. Rate</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:1.4rem;font-weight:900;color:#1e1b4b;">${fmtN(p.avgViews)}</div>
              <div style="font-size:0.65rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-top:2px;">Avg Views</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Key Metrics Grid -->
      <div style="padding:22px 36px;border-bottom:1px solid #f1f5f9;">
        <div style="font-size:0.68rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin-bottom:14px;">Performance Metrics</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;">
          ${[
            { label:'Total Posts', value: fmtN(p.postsCount) },
            { label:'Avg Likes',   value: fmtN(p.avgLikes) },
            { label:'Avg Comments',value: fmtN(p.avgComments) },
            { label:'Creatorly Score', value: (p.creatorlyScore || 70) + '%' },
          ].map(m => `
            <div style="background:#f8f9fc;border-radius:10px;padding:12px;text-align:center;">
              <div style="font-size:1.2rem;font-weight:800;color:#1e1b4b;">${m.value}</div>
              <div style="font-size:0.62rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px;">${m.label}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Rate Card -->
      <div style="padding:22px 36px;border-bottom:1px solid #f1f5f9;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-size:0.68rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Brand Collaboration Rate Card</div>
            <div style="font-size:1rem;font-weight:800;color:#7c3aed;margin-top:3px;">${tier}</div>
          </div>
          <div style="font-size:0.7rem;color:#64748b;">AI Valuation · ${today}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${[
            { icon:'🎥', label:'Reel',            sub:'Short-form video',     rate: fmtRange(rates.reel),     color:'#7c3aed' },
            { icon:'📖', label:'Story',           sub:'Frame/swipe-set · 24h', rate: fmtRange(rates.story),    color:'#4f46e5' },
            { icon:'🖼️', label:'Feed Post',        sub:'Static image · Permanent', rate: fmtRange(rates.post), color:'#16a34a' },
            { icon:'🎠', label:'Carousel Post',    sub:'Multi-slide · Permanent', rate: fmtRange(rates.carousel), color:'#d97706' },
            { icon:'💼', label:'Bundle Package',   sub:'Story + Reel + Post',  rate: fmtRange(rates.bundle),  color:'#059669', highlight: true },
          ].map(r => `
            <div style="display:flex;align-items:center;gap:14px;padding:11px 14px;background:${r.highlight ? '#f0fdf4' : '#f8f9fc'};border-radius:10px;border:1px solid ${r.highlight ? '#bbf7d0' : '#e2e8f0'};">
              <div style="font-size:1.1rem;width:32px;text-align:center;">${r.icon}</div>
              <div style="flex:1;">
                <div style="font-size:0.83rem;font-weight:700;color:#1e1b4b;">${r.label}${r.highlight ? ' <span style="font-size:0.6rem;color:#059669;font-weight:800;background:#d1fae5;padding:1px 6px;border-radius:99px;">Best Value</span>' : ''}</div>
                <div style="font-size:0.62rem;color:#94a3b8;">${r.sub}</div>
              </div>
              <div style="font-size:0.88rem;font-weight:800;color:${r.color};white-space:nowrap;">${r.rate}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Posting Benchmarks -->
      <div style="padding:22px 36px;border-bottom:1px solid #f1f5f9;">
        <div style="font-size:0.68rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin-bottom:14px;">Benchmarks & Posting</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
          <div style="background:#f8f9fc;border-radius:10px;padding:12px;">
            <div style="font-size:0.62rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Niche ER Benchmark</div>
            <div style="font-size:0.95rem;font-weight:800;color:#1e1b4b;">${p.erByViews}% vs ${p.nicheBenchmark}% avg</div>
            <div style="font-size:0.62rem;color:${p.erByViews >= p.nicheBenchmark ? '#16a34a' : '#dc2626'};font-weight:600;margin-top:3px;">${p.erByViews >= p.nicheBenchmark ? '▲ Above average' : '▼ Below average'}</div>
          </div>
          <div style="background:#f8f9fc;border-radius:10px;padding:12px;">
            <div style="font-size:0.62rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Best Time to Post</div>
            <div style="font-size:0.95rem;font-weight:800;color:#1e1b4b;">${p.optimalTime ? p.optimalTime.day + 's @ ' + p.optimalTime.time : '--'}</div>
            <div style="font-size:0.62rem;color:#64748b;margin-top:3px;">Based on reel performance</div>
          </div>
          <div style="background:#f8f9fc;border-radius:10px;padding:12px;">
            <div style="font-size:0.62rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Posting Frequency</div>
            <div style="font-size:0.95rem;font-weight:800;color:#1e1b4b;">${p.reelsPerWeek || 0} reels/wk</div>
            <div style="font-size:0.62rem;color:${(p.reelsPerWeek||0) >= 3 ? '#16a34a' : '#d97706'};font-weight:600;margin-top:3px;">${(p.reelsPerWeek||0) >= 3 ? '✓ Consistent' : 'Niche avg: 3/wk'}</div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:18px 36px;background:#f8f9fc;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:0.7rem;font-weight:700;color:#7c3aed;">Creatorly AI</div>
        <div style="font-size:0.65rem;color:#94a3b8;">This rate card is AI-generated and for indicative purposes only · ${today}</div>
      </div>
    </div>
  `;

  // Trigger html2pdf
  const opt = {
    margin:      [0, 0, 0, 0],
    filename:    `${p.username}_media_kit_${today.replace(/ /g,'_')}.pdf`,
    image:       { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
    jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:   { mode: 'avoid-all' },
  };

  if (typeof html2pdf !== 'undefined') {
    html2pdf().set(opt).from(pdfEl).save().then(() => {
      if (btn) {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Share PDF`;
      }
    });
  } else {
    console.warn('[CreatorlyAI] html2pdf not loaded yet.');
    if (btn) {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Share PDF`;
    }
    alert('PDF library still loading — try again in a moment.');
  }
}
