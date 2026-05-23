(function () {
  const noProfileState = document.getElementById('noProfileState');
  const rateCardState  = document.getElementById('rateCardState');

  // Safe storage utility
  const storage = {
    getItem(key) {
      try { return localStorage.getItem(key); } catch (_) { return null; }
    },
    setItem(key, value) {
      try { localStorage.setItem(key, value); } catch (_) {}
    }
  };

  // Helper formatting functions
  function formatNum(n) {
    if (!n) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString('en-IN');
  }

  function getCreatorProfile() {
    try {
      const data = storage.getItem('creatorly_last_profile');
      return data ? JSON.parse(data) : null;
    } catch (_) {
      return null;
    }
  }

  const p = getCreatorProfile();

  if (!p || !p.username) {
    if (noProfileState) noProfileState.hidden = false;
    if (rateCardState) rateCardState.hidden = true;
    return;
  }

  if (noProfileState) noProfileState.hidden = true;
  if (rateCardState) rateCardState.hidden = false;

  // ─── Rate Card Calculation ───
  const reelMin = Math.round(p.avgViews * 0.12 + (p.followersCount * (p.erByViews / 100)) * 1.0);
  const reelMax = Math.round(p.avgViews * 0.30 + (p.followersCount * (p.erByViews / 100)) * 2.5);

  const rates = {
    reel:     { min: Math.max(reelMin, 1000),         max: Math.max(reelMax, 2000) },
    story:    { min: Math.max(Math.round(reelMin * 0.42), 400),   max: Math.max(Math.round(reelMax * 0.55), 800) },
    post:     { min: Math.max(Math.round(reelMin * 0.65), 700),   max: Math.max(Math.round(reelMax * 0.75), 1500) },
    carousel: { min: Math.max(Math.round(reelMin * 0.80), 900),   max: Math.max(Math.round(reelMax * 0.90), 1800) },
  };
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

  // Bind values to DOM elements
  document.getElementById('creatorTierValue').textContent = tier;
  document.getElementById('rateCardBasedOn').textContent = `${formatNum(p.followersCount)} followers · ${p.erByViews}% ER`;
  document.getElementById('rateReel').textContent = fmtRange(rates.reel);
  document.getElementById('rateStory').textContent = fmtRange(rates.story);
  document.getElementById('ratePost').textContent = fmtRange(rates.post);
  document.getElementById('rateCarousel').textContent = fmtRange(rates.carousel);
  document.getElementById('rateBundle').textContent = fmtRange(rates.bundle);
  document.getElementById('collabRateDesc').textContent =
    `Valuation based on avg. ${formatNum(p.avgViews)} views/reel and ${p.erByViews}% engagement rate.`;

  // ─── Spin keyframe injector ───
  if (!document.getElementById('rate-card-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'rate-card-animation-styles';
    style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }

  // ─── Unlock & Overlay Logic ───
  const rateCardOverlay   = document.getElementById('rateCardOverlay');
  const rateCardContent   = document.getElementById('rateCardContent');
  const generateRateCardBtn = document.getElementById('generateRateCardBtn');
  const sharePdfBtn       = document.getElementById('sharePdfBtn');

  const unlockedKey = 'creatorly_rate_card_unlocked_' + p.username;
  const isUnlocked  = storage.getItem(unlockedKey) === 'true';

  const urlParams       = new URLSearchParams(window.location.search);
  const triggerFromUrl  = urlParams.get('generateRateCard') === 'true' || window.location.hash === '#generate';

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
      if (generateRateCardBtn) {
        generateRateCardBtn.innerHTML = '<span style="display:inline-block; width:12px; height:12px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 0.6s linear infinite; margin-right:6px; vertical-align:middle;"></span> Generating Rate Card...';
        generateRateCardBtn.disabled = true;
      }
      setTimeout(() => {
        if (rateCardOverlay) { rateCardOverlay.style.opacity = '0'; rateCardOverlay.style.pointerEvents = 'none'; }
        if (rateCardContent) {
          rateCardContent.classList.remove('rate-card-blurred');
          rateCardContent.style.pointerEvents = 'auto';
          rateCardContent.style.opacity = '1';
        }
        storage.setItem(unlockedKey, 'true');
        enableShareBtn();
        setTimeout(() => { if (rateCardOverlay) rateCardOverlay.style.display = 'none'; }, 420);
      }, 1200);
    } else {
      if (rateCardOverlay) rateCardOverlay.style.display = 'none';
      if (rateCardContent) {
        rateCardContent.classList.remove('rate-card-blurred');
        rateCardContent.style.pointerEvents = 'auto';
        rateCardContent.style.opacity = '1';
      }
      storage.setItem(unlockedKey, 'true');
      enableShareBtn();
    }
  }

  if (generateRateCardBtn) {
    generateRateCardBtn.onclick = () => unlockRateCard(true);
  }

  if (isUnlocked || triggerFromUrl) {
    unlockRateCard(triggerFromUrl && !isUnlocked);
    if (triggerFromUrl) {
      // clean URL parameter/hash
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  } else {
    if (rateCardOverlay) {
      rateCardOverlay.style.display = 'flex';
      rateCardOverlay.style.opacity = '1';
      rateCardOverlay.style.pointerEvents = 'auto';
    }
    if (rateCardContent) {
      rateCardContent.classList.add('rate-card-blurred');
      rateCardContent.style.pointerEvents = 'none';
      rateCardContent.style.opacity = '0.12';
    }
    if (generateRateCardBtn) {
      generateRateCardBtn.innerHTML = '✨ Generate My Rate Card';
      generateRateCardBtn.disabled = false;
    }
  }

  // ─── PDF Generation / Export ───
  function generateAndSharePdf(p, rates, tier, fmtRange, formatCurrency) {
    const btn = document.getElementById('sharePdfBtn');
    if (btn) {
      btn.style.opacity = '0.7';
      btn.style.pointerEvents = 'none';
      btn.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border:2px solid #a5b4fc;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;margin-right:5px;vertical-align:middle;"></span> Generating PDF…`;
    }

    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const fmtN  = (n) => {
      if (!n || n === 0) return '0';
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
      return n.toString();
    };

    // Get the current scroll offset
    const currentScrollY = window.scrollY || window.pageYOffset || 0;

    // Create a hidden wrapper container positioned at the current scroll coordinates
    const wrapper = document.createElement('div');
    wrapper.id = 'tempPdfWrapper';
    wrapper.style.width = '0';
    wrapper.style.height = '0';
    wrapper.style.overflow = 'hidden';
    wrapper.style.position = 'absolute';
    wrapper.style.left = '0';
    wrapper.style.top = currentScrollY + 'px';
    wrapper.style.zIndex = '99999';
    wrapper.style.pointerEvents = 'none';

    const tempDiv = document.createElement('div');
    tempDiv.id = 'tempPdfRenderElement';
    tempDiv.style.width = '794px'; // standard A4 pixel width at 96 DPI
    tempDiv.style.background = '#fff';
    tempDiv.style.fontFamily = "'Inter', sans-serif";

    tempDiv.innerHTML = `
      <div style="background:#fff;color:#0f0a1a;padding:0;width:794px;">
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

    wrapper.appendChild(tempDiv);
    document.body.appendChild(wrapper);

    // Trigger html2pdf configuration
    const opt = {
      margin:      [0, 0, 0, 0],
      filename:    `${p.username}_media_kit_${today.replace(/ /g,'_')}.pdf`,
      image:       { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 1.5, // 1.5 scale is high-quality and very fast
        useCORS: false, 
        scrollX: 0, 
        scrollY: currentScrollY, 
        windowWidth: 794,
        windowHeight: 1123,
        letterRendering: true 
      },
      jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak:   { mode: 'avoid-all' },
    };

    if (typeof html2pdf !== 'undefined') {
      html2pdf().set(opt).from(tempDiv).save().then(() => {
        if (btn) {
          btn.style.opacity = '1';
          btn.style.pointerEvents = 'auto';
          btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Share to Brand`;
        }
        document.body.removeChild(wrapper);
      }).catch((err) => {
        console.error('[CreatorlyAI] PDF generation error:', err);
        if (btn) {
          btn.style.opacity = '1';
          btn.style.pointerEvents = 'auto';
          btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Share to Brand`;
        }
        document.body.removeChild(wrapper);
        alert('Failed to generate PDF. Please try again.');
      });
    } else {
      console.warn('[CreatorlyAI] html2pdf not loaded yet.');
      if (btn) {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Share to Brand`;
      }
      document.body.removeChild(wrapper);
      alert('PDF library still loading — try again in a moment.');
    }
  }

})();
