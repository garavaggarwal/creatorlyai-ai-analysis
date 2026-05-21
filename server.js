const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execFile, spawnSync } = require('child_process');
const { runFfmpegAnalysis } = require('./analysers/ffmpegHelper');
const { analyseWithGemini } = require('./analysers/geminiAnalyser');
const { analyseText } = require('./analysers/textAnalyser');
const { checkUserLimit, createAnalysisRecord, saveAnalysisResult, markAnalysisFailed, getUserUsage, getCachedProfile, saveCachedProfile } = require('./supabaseDb');

// ─── Resolve yt-dlp binary path at startup ────────────────────────────────────
function resolveYtDlpPath() {
  // Priority 1: explicit env var set by the operator
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
    console.log(`🔧 yt-dlp: using YTDLP_PATH env → ${process.env.YTDLP_PATH}`);
    return process.env.YTDLP_PATH;
  }

  // Priority 2: fixed path written by postinstall script
  const fixedPath = '/app/bin/yt-dlp';
  if (fs.existsSync(fixedPath)) {
    console.log(`🔧 yt-dlp: found at fixed path → ${fixedPath}`);
    return fixedPath;
  }

  // Priority 3: common pip install locations
  const candidates = [
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    `${process.env.HOME || '/root'}/.local/bin/yt-dlp`,
    '/app/.local/bin/yt-dlp',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      console.log(`🔧 yt-dlp: found at → ${c}`);
      return c;
    }
  }

  // Priority 4: yt-dlp-wrap npm package binary (downloaded on first use)
  try {
    const YTDlpWrap = require('yt-dlp-wrap').default || require('yt-dlp-wrap');
    const wrapBin = YTDlpWrap.getDefaultBinaryPath ? YTDlpWrap.getDefaultBinaryPath() : null;
    if (wrapBin && fs.existsSync(wrapBin)) {
      console.log(`🔧 yt-dlp: using yt-dlp-wrap binary → ${wrapBin}`);
      return wrapBin;
    }
  } catch (_) { /* yt-dlp-wrap not available */ }

  // Fallback: hope it's on PATH
  console.warn('⚠️  yt-dlp: binary not found at known paths, falling back to PATH lookup');
  return 'yt-dlp';
}

const YTDLP_BIN = resolveYtDlpPath();

const app = express();
const PORT = process.env.PORT || 3001;

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman, same-origin)
    if (!origin) return callback(null, true);
    const allowed = [
      'https://creatorlyai.in',
      'https://www.creatorlyai.in',
      'https://api.creatorlyai.in',
      'http://localhost:3000',
      'http://localhost:3001',
    ];
    // Allow any vercel.app subdomain and the Railway domain itself
    if (
      allowed.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.up.railway.app') ||
      origin.includes('creatorlyai')
    ) {
      return callback(null, true);
    }
    // Allow all origins as fallback (iOS Safari compatibility)
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'X-User-Token'],
  credentials: false,
}));

// Explicitly handle OPTIONS preflight for iOS Safari
app.options('*', cors());

app.use(express.json());

// ─── Static Frontend ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── File Upload ──────────────────────────────────────────────────────────────
const upload = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'video/mp4',
      'video/quicktime',   // .mov (iPhone default)
      'video/x-msvideo',   // .avi
      'video/webm',
      'video/x-matroska',  // .mkv
      'video/x-m4v',       // .m4v (iPhone)
      'video/mov',         // some iPhone browsers send this
      'video/mpeg',
      'video/3gpp',
      'application/octet-stream', // some iPhones send raw binary
    ];
    const allowedExts = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v', '.mpeg', '.3gp'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype} (${ext}). Please upload MP4, MOV, or WEBM.`));
    }
  }
});

// ─── Cleanup helper ───────────────────────────────────────────────────────────
function cleanupFiles(videoPath, framesDir) {
  try {
    if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    if (framesDir && fs.existsSync(framesDir)) {
      fs.readdirSync(framesDir).forEach(f => fs.unlinkSync(path.join(framesDir, f)));
      fs.rmdirSync(framesDir);
    }
  } catch (e) {
    console.warn('Cleanup error:', e.message);
  }
}

// ─── Score aggregator ────────────────────────────────────────────────────────
function computeOverallScore(analysis) {
  const weights = {
    hook: 0.20,
    retention: 0.15,
    content_structure: 0.15,
    audio_quality: 0.10,
    visual_quality: 0.10,
    caption: 0.10,
    editing: 0.07,
    text_subtitles: 0.05,
    hashtags: 0.05,
    compliance: 0.03,
  };

  let total = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const score = analysis[key]?.score;
    if (score !== null && score !== undefined) {
      total += score * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? Math.round((total / totalWeight) * 10) / 10 : null;
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Creatorly Video Lab API', timestamp: new Date().toISOString() });
});

// ─── Image proxy (bypass CORS for Instagram CDN images) ───────────────────────
app.get('/api/image-proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('No URL');
  try {
    const https = require('https');
    const http = require('http');
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (proxyRes) => {
      if (proxyRes.statusCode !== 200) return res.status(proxyRes.statusCode).send('Failed');
      res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      proxyRes.pipe(res);
    }).on('error', () => res.status(500).send('Proxy error'));
  } catch (_) { res.status(500).send('Error'); }
});

// ─── Extract user ID from Supabase JWT (no external lib needed) ───────────────
function extractUserId(req) {
  try {
    const auth = req.headers['authorization'] || req.headers['x-user-token'] || '';
    const token = auth.replace('Bearer ', '').trim();
    if (!token) return null;
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.sub || null;
  } catch { return null; }
}

function extractUserEmail(req) {
  try {
    const auth = req.headers['authorization'] || req.headers['x-user-token'] || '';
    const token = auth.replace('Bearer ', '').trim();
    if (!token) return null;
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.email || null;
  } catch { return null; }
}

// ─── Usage endpoint (frontend can show "X of 5 used") ────────────────────────
app.get('/api/usage', async (req, res) => {
  const userId = extractUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const usage = await getUserUsage(userId);
  res.json({ success: true, usage });
});

// ─── History endpoint (list all user's past analyses) ─────────────────────────
app.get('/api/history', async (req, res) => {
  const userId = extractUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const https = require('https');
    const url = new URL(process.env.SUPABASE_URL);

    // Get all analyses for this user (completed + failed), ordered by date
    const result = await new Promise((resolve, reject) => {
      const path = `/rest/v1/video_analyses?user_id=eq.${encodeURIComponent(userId)}&status=in.(completed,failed)&order=created_at.desc&limit=50&select=id,created_at,original_filename,instagram_url,source,overall_score,niche,video_duration,status,error_message,thumbnail,overall_summary,video_summary`;
      const options = {
        hostname: url.hostname,
        path,
        method: 'GET',
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
      };
      const req2 = https.request(options, (r) => {
        const chunks = [];
        r.on('data', d => chunks.push(d));
        r.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch { reject(new Error('Parse error')); }
        });
      });
      req2.on('error', reject);
      req2.setTimeout(8000, () => { req2.destroy(); reject(new Error('timeout')); });
      req2.end();
    });

    // Format the response
    const history = (Array.isArray(result) ? result : []).map(row => ({
      id: row.id,
      createdAt: row.created_at,
      source: row.source,
      status: row.status,
      filename: row.original_filename || (row.instagram_url ? row.instagram_url.split('/').filter(Boolean).pop() : 'Instagram'),
      url: row.instagram_url,
      score: row.overall_score,
      thumbnail: row.thumbnail || null,
      summary: row.overall_summary || row.video_summary || null,
      niche: row.niche,
      duration: row.video_duration,
      error: row.error_message || null,
    }));

    res.json({ success: true, history });

  } catch (err) {
    console.error('History fetch error:', err.message);
    res.status(500).json({ error: 'Could not fetch history' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// ─── Login page route ─────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ─── Analyser page route ──────────────────────────────────────────────────────
app.get('/analyser', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Prompt Generator page route ──────────────────────────────────────────────
app.get('/prompt-generator', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'prompt-generator.html'));
});

// ─── Profile page route ───────────────────────────────────────────────────────
app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

// ─── Image proxy (for Instagram profile pics that block cross-origin) ─────────
app.get('/api/image-proxy', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send('No URL');
  
  try {
    const https = require('https');
    const http = require('http');
    const protocol = imageUrl.startsWith('https') ? https : http;
    
    protocol.get(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        'Referer': 'https://www.instagram.com/',
      }
    }, (proxyRes) => {
      if (proxyRes.statusCode === 301 || proxyRes.statusCode === 302) {
        // Follow redirect
        return res.redirect(proxyRes.headers.location);
      }
      res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      proxyRes.pipe(res);
    }).on('error', () => res.status(502).send('Failed'));
  } catch (_) {
    res.status(502).send('Failed');
  }
});

// ─── Niche detection helper ───────────────────────────────────────────────────
function detectNiche(bioText, posts) {
  const nicheKeywords = {
    'Fitness': ['fitness', 'gym', 'workout', 'health', 'muscle', 'bodybuilding', 'yoga'],
    'Travel': ['travel', 'wanderlust', 'explore', 'adventure', 'traveller', 'traveler', 'nomad'],
    'Food': ['food', 'recipe', 'cooking', 'chef', 'foodie', 'kitchen', 'baking'],
    'Tech': ['tech', 'coding', 'developer', 'software', 'startup', 'ai', 'gadget'],
    'Fashion': ['fashion', 'style', 'outfit', 'clothing', 'model', 'designer'],
    'Beauty': ['beauty', 'makeup', 'skincare', 'cosmetics', 'hair'],
    'Comedy': ['comedy', 'funny', 'humor', 'memes', 'jokes', 'entertainment'],
    'Education': ['education', 'learn', 'teach', 'study', 'knowledge', 'mentor'],
    'Business': ['business', 'entrepreneur', 'startup', 'marketing', 'finance', 'money'],
    'Music': ['music', 'singer', 'musician', 'artist', 'song', 'band'],
    'Photography': ['photography', 'photographer', 'photo', 'camera', 'portrait'],
    'Lifestyle': ['lifestyle', 'daily', 'vlog', 'life', 'motivation', 'inspiration'],
  };

  const allText = bioText + ' ' + posts.slice(0, 5).map(p => (p.caption || p.text || '').toLowerCase()).join(' ');

  let bestNiche = 'General';
  let bestScore = 0;
  for (const [niche, keywords] of Object.entries(nicheKeywords)) {
    const score = keywords.filter(k => allText.includes(k)).length;
    if (score > bestScore) { bestScore = score; bestNiche = niche; }
  }
  return bestNiche;
}

// ─── Profile Analytics API ────────────────────────────────────────────────────
// Local memory fallback cache
const localProfileCache = new Map();

// ─── Profile Analytics API ────────────────────────────────────────────────────
app.post('/api/profile-analytics', async (req, res) => {
  const { username, refresh } = req.body || {};
  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'No username provided' });
  }

  if (!process.env.APIFY_API_TOKEN) {
    return res.status(503).json({ error: 'Profile analytics not configured (APIFY_API_TOKEN missing)' });
  }

  const userId = extractUserId(req);
  const cleanUsername = username.trim().replace(/^@/, '').toLowerCase();

  // 1. Check Caches (24-Hour Expiration) - bypass if force refresh is requested
  if (refresh !== true && refresh !== 'true') {
    try {
      // Database Cache Check
      const cachedRecord = await getCachedProfile(cleanUsername);
      if (cachedRecord && cachedRecord.profile_data) {
        const lastUpdate = new Date(cachedRecord.updated_at).getTime();
        const ageHrs = (Date.now() - lastUpdate) / (1000 * 60 * 60);
        if (ageHrs < 24) {
          console.log(`⚡ Serving cached DB profile analytics for @${cleanUsername} (Age: ${ageHrs.toFixed(1)} hrs)`);
          return res.json({ success: true, profile: cachedRecord.profile_data, cached: true });
        }
      }
    } catch (cacheErr) {
      console.warn('⚠️ Supabase cache check error, falling back to local memory cache:', cacheErr.message);
    }

    // Memory Cache Fallback Check
    const localCached = localProfileCache.get(cleanUsername);
    if (localCached) {
      const ageHrs = (Date.now() - localCached.timestamp) / (1000 * 60 * 60);
      if (ageHrs < 24) {
        console.log(`⚡ Serving cached memory profile analytics for @${cleanUsername} (Age: ${ageHrs.toFixed(1)} hrs)`);
        return res.json({ success: true, profile: localCached.profile, cached: true });
      }
    }
  }


  // 2. No valid cache, fetch fresh data from Apify
  try {
    console.log(`\n📊 Scrape requested | Username: ${cleanUsername} | User: ${userId || 'anonymous'}`);

    const { ApifyClient } = require('apify-client');
    const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

    // Run the Instagram Profile Scraper actor requesting 40 items to make sure we get reels
    const run = await client.actor('apify/instagram-profile-scraper').call(
      {
        usernames: [cleanUsername],
        resultsLimit: 40,
      },
      {
        timeout: 120,
        memory: 1024,
      }
    );

    if (!run || !run.defaultDatasetId) {
      throw new Error('Apify run did not return a dataset');
    }

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    if (!items || items.length === 0) {
      throw new Error('Could not find this Instagram profile. Make sure the username is correct and the profile is public.');
    }

    const profile = items[0];
    console.log('📋 Profile keys:', Object.keys(profile).join(', '));

    // Extract all posts
    const allPosts = profile.latestPosts || profile.posts || profile.recentPosts || [];

    // Filter strictly for Reels (videos)
    const reels = allPosts.filter(p => 
      p.type === 'Video' || p.videoUrl || p.isVideo || 
      p.productType === 'clips' || p.productType === 'reels' ||
      (p.playCount && p.playCount > 0) ||
      (p.videoPlayCount && p.videoPlayCount > 0) ||
      (p.videoViewCount && p.videoViewCount > 0) || 
      (p.video_view_count && p.video_view_count > 0) || 
      (p.views && p.views > 0)
    );

    const targetReels = reels.slice(0, 15); // Analyse last 15 Reels only
    console.log(`📹 Reels extracted: ${reels.length} | Target Reels: ${targetReels.length}`);

    // Basic counts
    const followersCount = profile.followersCount || profile.followers || profile.follower_count || 0;
    const postsCount = profile.postsCount || profile.posts_count || profile.mediaCount || 0;

    // Calculate metrics across the last 15 reels
    const viewCounts = targetReels.map(p => p.playCount || p.videoPlayCount || p.videoViewCount || p.video_view_count || p.views || 0).filter(v => v > 0);
    const likeCounts = targetReels.map(p => p.likesCount || p.likes || p.like_count || 0);
    const commentCounts = targetReels.map(p => p.commentsCount || p.comments || p.comment_count || 0);
    const shareCounts = targetReels.map(p => p.sharesCount || p.shares || p.share_count || 0);
    const saveCounts = targetReels.map(p => p.savesCount || p.saves || p.save_count || 0);

    const avgViews15 = viewCounts.length > 0 ? Math.round(viewCounts.reduce((a, b) => a + b, 0) / viewCounts.length) : 0;
    const avgLikes15 = likeCounts.length > 0 ? Math.round(likeCounts.reduce((a, b) => a + b, 0) / likeCounts.length) : 0;
    const avgComments15 = commentCounts.length > 0 ? Math.round(commentCounts.reduce((a, b) => a + b, 0) / commentCounts.length) : 0;
    const avgShares15 = shareCounts.length > 0 ? Math.round(shareCounts.reduce((a, b) => a + b, 0) / shareCounts.length) : 0;
    const avgSaves15 = saveCounts.length > 0 ? Math.round(saveCounts.reduce((a, b) => a + b, 0) / saveCounts.length) : 0;

    // 1. Engagement Rate by Viewer (Views)
    const totalEngagement = avgLikes15 + avgComments15 + avgShares15 + avgSaves15;
    const erByViews = avgViews15 > 0 ? parseFloat(((totalEngagement) / avgViews15 * 100).toFixed(2)) : 0.00;

    // 2. Niche detection
    const bioText = (profile.biography || profile.bio || '').toLowerCase();
    const businessCat = profile.businessCategoryName || profile.category || '';
    const niche = businessCat || detectNiche(bioText, allPosts);

    // 3. Niche Benchmark ER by Followers/Views (we compare views ER here)
    const nicheBenchmarks = {
      'Fitness': 2.5,
      'Travel': 3.1,
      'Food': 2.8,
      'Tech': 1.8,
      'Fashion': 2.2,
      'Beauty': 2.4,
      'Comedy': 3.5,
      'Education': 1.9,
      'Business': 1.7,
      'Music': 2.6,
      'Photography': 2.3,
      'Lifestyle': 2.1,
      'General': 2.2
    };
    const nicheBenchmark = nicheBenchmarks[niche] || 2.2;

    // 4. Posting consistency: reels per week
    let reelsPerWeek = 0;
    if (targetReels.length >= 2) {
      const dates = targetReels.map(r => r.timestamp || r.taken_at || r.date).filter(Boolean).map(d => new Date(d).getTime());
      if (dates.length >= 2) {
        const minDate = Math.min(...dates);
        const maxDate = Math.max(...dates);
        const daysDiff = (maxDate - minDate) / (1000 * 60 * 60 * 24);
        const weeks = Math.max(daysDiff / 7, 1);
        reelsPerWeek = parseFloat((targetReels.length / weeks).toFixed(1));
      }
    } else if (targetReels.length === 1) {
      reelsPerWeek = 1.0;
    }

    // 5. Best performing reel (highest views)
    let bestReel = null;
    if (targetReels.length > 0) {
      const bestRaw = targetReels.reduce((best, curr) => {
        const currViews = curr.playCount || curr.videoPlayCount || curr.videoViewCount || curr.video_view_count || curr.views || 0;
        const bestViews = best ? (best.playCount || best.videoPlayCount || best.videoViewCount || best.video_view_count || best.views || 0) : -1;
        return currViews > bestViews ? curr : best;
      }, null);
      if (bestRaw) {
        bestReel = {
          likes: bestRaw.likesCount || bestRaw.likes || bestRaw.like_count || 0,
          comments: bestRaw.commentsCount || bestRaw.comments || bestRaw.comment_count || 0,
          views: bestRaw.playCount || bestRaw.videoPlayCount || bestRaw.videoViewCount || bestRaw.video_view_count || bestRaw.views || 0,
          date: bestRaw.timestamp || bestRaw.taken_at || bestRaw.date || null,
          thumbnailUrl: bestRaw.displayUrl || bestRaw.thumbnailUrl || bestRaw.thumbnail_src || bestRaw.imageUrl || bestRaw.display_url || '',
          postUrl: bestRaw.url || (bestRaw.shortCode ? `https://www.instagram.com/reel/${bestRaw.shortCode}/` : (bestRaw.shortcode ? `https://www.instagram.com/reel/${bestRaw.shortcode}/` : '')),
          caption: (bestRaw.caption || bestRaw.text || '').slice(0, 100),
        };
      }
    }

    // Worst performing reel (lowest views)
    let worstReel = null;
    if (targetReels.length > 0) {
      const worstRaw = targetReels.reduce((worst, curr) => {
        const currViews = curr.playCount || curr.videoPlayCount || curr.videoViewCount || curr.video_view_count || curr.views || 0;
        const worstViews = worst ? (worst.playCount || worst.videoPlayCount || worst.videoViewCount || worst.video_view_count || worst.views || 0) : Infinity;
        return currViews < worstViews ? curr : worst;
      }, null);
      if (worstRaw) {
        worstReel = {
          likes: worstRaw.likesCount || worstRaw.likes || worstRaw.like_count || 0,
          comments: worstRaw.commentsCount || worstRaw.comments || worstRaw.comment_count || 0,
          views: worstRaw.playCount || worstRaw.videoPlayCount || worstRaw.videoViewCount || worstRaw.video_view_count || worstRaw.views || 0,
          date: worstRaw.timestamp || worstRaw.taken_at || worstRaw.date || null,
          thumbnailUrl: worstRaw.displayUrl || worstRaw.thumbnailUrl || worstRaw.thumbnail_src || worstRaw.imageUrl || worstRaw.display_url || '',
          postUrl: worstRaw.url || (worstRaw.shortCode ? `https://www.instagram.com/reel/${worstRaw.shortCode}/` : (worstRaw.shortcode ? `https://www.instagram.com/reel/${worstRaw.shortcode}/` : '')),
          caption: (worstRaw.caption || worstRaw.text || '').slice(0, 100),
        };
      }
    }

    // Determine recentTrend ('growing' | 'flat' | 'declining')
    let recentTrend = 'flat';
    if (targetReels.length >= 5) {
      const recent5 = targetReels.slice(0, 5).map(p => p.playCount || p.videoPlayCount || p.videoViewCount || p.video_view_count || p.views || 0);
      const older10 = targetReels.slice(5).map(p => p.playCount || p.videoPlayCount || p.videoViewCount || p.video_view_count || p.views || 0);
      
      const avgRecent = recent5.reduce((a, b) => a + b, 0) / recent5.length;
      const avgOlder = older10.length > 0 ? (older10.reduce((a, b) => a + b, 0) / older10.length) : avgRecent;
      
      const diffPct = avgOlder > 0 ? (avgRecent - avgOlder) / avgOlder : 0;
      if (diffPct > 0.15) {
        recentTrend = 'growing';
      } else if (diffPct < -0.15) {
        recentTrend = 'declining';
      } else {
        recentTrend = 'flat';
      }
    }

    // Estimate profile hook score out of 10 based on views-to-likes or ER
    const hookScore = erByViews >= nicheBenchmark ? Math.round(7 + Math.min(3, ((erByViews - nicheBenchmark) / nicheBenchmark) * 3)) : Math.max(1, Math.round((erByViews / nicheBenchmark) * 7));


    // 6. Views-to-Likes ratio (views per 1 like)
    const viewsToLikesRatio = avgLikes15 > 0 ? parseFloat((avgViews15 / avgLikes15).toFixed(1)) : 0;

    // ── Calculate Creatorly Score ──
    const benchmarkViews = Math.max(2000, Math.round(followersCount * 0.08));
    const benchmarkLikes = Math.round(benchmarkViews * 0.07);
    const benchmarkComments = Math.round(benchmarkViews * 0.005);
    
    // Scoring ER
    let erScore = 0;
    if (erByViews >= nicheBenchmark) {
      erScore = 70 + Math.min(30, ((erByViews - nicheBenchmark) / nicheBenchmark) * 30);
    } else {
      erScore = nicheBenchmark > 0 ? (erByViews / nicheBenchmark) * 70 : 70;
    }
    erScore = Math.max(10, Math.min(100, erScore));

    // Scoring views-to-likes ratio (standard avg is 15 views per like. Lower is better)
    let ratioScore = 0;
    const targetRatio = 15.0;
    if (viewsToLikesRatio > 0) {
      if (viewsToLikesRatio <= targetRatio) {
        ratioScore = 70 + ((targetRatio - viewsToLikesRatio) / targetRatio) * 30;
      } else {
        ratioScore = 70 - Math.min(60, ((viewsToLikesRatio - targetRatio) / 30) * 50);
      }
    } else {
      ratioScore = 50;
    }
    ratioScore = Math.max(10, Math.min(100, ratioScore));

    // Scoring consistency (benchmark is 3.0 reels per week)
    let consistencyScore = 0;
    if (reelsPerWeek >= 3.0) {
      consistencyScore = 75 + Math.min(25, (reelsPerWeek - 3.0) * 8);
    } else {
      consistencyScore = (reelsPerWeek / 3.0) * 75;
    }
    consistencyScore = Math.max(10, Math.min(100, consistencyScore));

    // Scoring average views
    let viewsScore = 0;
    if (avgViews15 >= benchmarkViews) {
      viewsScore = 70 + Math.min(30, ((avgViews15 - benchmarkViews) / benchmarkViews) * 20);
    } else {
      viewsScore = benchmarkViews > 0 ? (avgViews15 / benchmarkViews) * 70 : 70;
    }
    viewsScore = Math.max(10, Math.min(100, viewsScore));

    // Scoring average likes
    let likesScore = 0;
    if (avgLikes15 >= benchmarkLikes) {
      likesScore = 70 + Math.min(30, ((avgLikes15 - benchmarkLikes) / benchmarkLikes) * 20);
    } else {
      likesScore = benchmarkLikes > 0 ? (avgLikes15 / benchmarkLikes) * 70 : 70;
    }
    likesScore = Math.max(10, Math.min(100, likesScore));

    // Scoring average comments
    let commentsScore = 0;
    if (avgComments15 >= benchmarkComments) {
      commentsScore = 70 + Math.min(30, ((avgComments15 - benchmarkComments) / benchmarkComments) * 20);
    } else {
      commentsScore = benchmarkComments > 0 ? (avgComments15 / benchmarkComments) * 70 : 70;
    }
    commentsScore = Math.max(10, Math.min(100, commentsScore));

    // Weighted score (Weights: ER 30%, Ratio 20%, Consistency 20%, Views 10%, Likes 10%, Comments 10%)
    const creatorlyScore = Math.round(
      erScore * 0.3 +
      ratioScore * 0.2 +
      consistencyScore * 0.2 +
      viewsScore * 0.1 +
      likesScore * 0.1 +
      commentsScore * 0.1
    );

    // 7. Optimal day & time to post based on engagement
    function calculateBestPostTime(posts) {
      if (!posts || posts.length === 0) return { day: 'Wednesday', time: '6:00 PM' };
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayScores = {};
      const hourScores = {};
      
      posts.forEach(p => {
        const dateStr = p.timestamp || p.taken_at || p.date;
        if (!dateStr) return;
        const d = new Date(dateStr);
        const day = days[d.getDay()];
        const hour = d.getHours();
        const engagement = (p.likesCount || p.likes || p.like_count || 0) + (p.commentsCount || p.comments || p.comment_count || 0);
        
        if (!dayScores[day]) dayScores[day] = { count: 0, score: 0 };
        dayScores[day].count++;
        dayScores[day].score += engagement;
        
        const hourBin = Math.floor(hour / 3) * 3;
        if (!hourScores[hourBin]) hourScores[hourBin] = { count: 0, score: 0 };
        hourScores[hourBin].count++;
        hourScores[hourBin].score += engagement;
      });
      
      let bestDay = 'Wednesday';
      let maxDayScore = -1;
      for (const [day, val] of Object.entries(dayScores)) {
        const avg = val.score / val.count;
        if (avg > maxDayScore) {
          maxDayScore = avg;
          bestDay = day;
        }
      }
      
      let bestHourBin = 18;
      let maxHourScore = -1;
      for (const [hourBin, val] of Object.entries(hourScores)) {
        const avg = val.score / val.count;
        if (avg > maxHourScore) {
          maxHourScore = avg;
          bestHourBin = parseInt(hourBin);
        }
      }
      
      const formatHour = (h) => {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hour12 = h % 12 || 12;
        return `${hour12}:00 ${ampm}`;
      };
      
      return { day: bestDay, time: formatHour(bestHourBin) };
    }
    const optimalTime = calculateBestPostTime(targetReels);

    // 8. Optimal day & time based on niche
    const nicheOptimalTimes = {
      'Business': { day: 'Tuesday', time: '10:00 AM' },
      'Tech': { day: 'Monday', time: '11:00 AM' },
      'Fitness': { day: 'Wednesday', time: '9:00 AM' },
      'Travel': { day: 'Friday', time: '12:00 PM' },
      'Food': { day: 'Friday', time: '6:00 PM' },
      'Comedy': { day: 'Friday', time: '8:00 PM' },
      'Fashion': { day: 'Thursday', time: '3:00 PM' },
      'Beauty': { day: 'Thursday', time: '4:00 PM' },
      'Music': { day: 'Saturday', time: '7:00 PM' },
      'Education': { day: 'Wednesday', time: '10:00 AM' },
      'Photography': { day: 'Wednesday', time: '2:00 PM' },
      'Lifestyle': { day: 'Sunday', time: '5:00 PM' },
      'General': { day: 'Wednesday', time: '3:00 PM' }
    };
    const industryBenchmarkTime = nicheOptimalTimes[niche] || nicheOptimalTimes['General'];

    // 9. Top 3 hashtags driving engagement
    function extractTopHashtags(posts) {
      const hashtags = {};
      posts.forEach(p => {
        const text = p.caption || p.text || '';
        const engagement = (p.likesCount || p.likes || p.like_count || 0) + (p.commentsCount || p.comments || p.comment_count || 0);
        const matches = text.match(/#\w+/g);
        if (matches) {
          const uniqueTags = [...new Set(matches.map(t => t.toLowerCase()))];
          uniqueTags.forEach(tag => {
            if (!hashtags[tag]) hashtags[tag] = { count: 0, engagement: 0 };
            hashtags[tag].count++;
            hashtags[tag].engagement += engagement;
          });
        }
      });
      
      return Object.entries(hashtags)
        .map(([tag, val]) => ({ tag, avgEngagement: Math.round(val.engagement / val.count), count: val.count }))
        .sort((a, b) => b.avgEngagement - a.avgEngagement)
        .slice(0, 3);
    }
    const topHashtags = extractTopHashtags(targetReels);

    const result = {
      username: profile.username || cleanUsername,
      fullName: profile.fullName || profile.full_name || '',
      biography: profile.biography || profile.bio || '',
      profilePicUrl: profile.profilePicUrl || profile.profilePicUrlHD || profile.profile_pic_url || '',
      isVerified: profile.verified || profile.isVerified || false,
      isBusinessAccount: profile.isBusinessAccount || profile.is_business || false,
      businessCategory: businessCat,
      niche,
      nicheBenchmark,
      externalUrl: profile.externalUrl || profile.external_url || '',

      // Key metrics (Strictly reels analytics)
      followersCount,
      postsCount,
      avgViews: avgViews15,
      avgLikes: avgLikes15,
      avgComments: avgComments15,
      avgShares: avgShares15,
      avgSaves: avgSaves15,
      erByViews,
      viewsToLikesRatio,
      reelsPerWeek,
      bestReel,
      worstReel,
      recentTrend,
      hookScore,
      optimalTime,
      industryBenchmarkTime,
      topHashtags,
      creatorlyScore,
      nicheBenchmarkScore: 70,

      // Chronological view/likes trend for the last 15 reels
      viewsTrend: targetReels.slice().reverse().map(p => ({
        views: p.playCount || p.videoPlayCount || p.videoViewCount || p.video_view_count || p.views || 0,
        likes: p.likesCount || p.likes || p.like_count || 0,
        date: p.timestamp || p.taken_at || p.date || null,
      })),

      // Return analyzed reels for the reels grid
      recentReels: targetReels.map(p => ({
        caption: (p.caption || p.text || '').slice(0, 100),
        likes: p.likesCount || p.likes || p.like_count || 0,
        comments: p.commentsCount || p.comments || p.comment_count || 0,
        views: p.playCount || p.videoPlayCount || p.videoViewCount || p.video_view_count || p.views || 0,
        shares: p.sharesCount || p.shares || p.share_count || 0,
        saves: p.savesCount || p.saves || p.save_count || 0,
        date: p.timestamp || p.taken_at || p.date || null,
        type: 'Video',
        thumbnailUrl: p.displayUrl || p.thumbnailUrl || p.thumbnail_src || p.imageUrl || p.display_url || '',
        postUrl: p.url || (p.shortCode ? `https://www.instagram.com/reel/${p.shortCode}/` : (p.shortcode ? `https://www.instagram.com/reel/${p.shortcode}/` : '')),
      })),
    };

    // Save caches (Database and memory)
    try {
      await saveCachedProfile(cleanUsername, result);
    } catch (saveCacheErr) {
      console.warn('⚠️ Failed to save to database cache:', saveCacheErr.message);
    }

    localProfileCache.set(cleanUsername, {
      timestamp: Date.now(),
      profile: result,
    });

    console.log(`✅ Profile analytics done for @${cleanUsername}. Followers: ${followersCount}, ER by Views: ${erByViews}%`);
    res.json({ success: true, profile: result });

  } catch (err) {
    console.error('❌ Profile analytics error:', err.message);
    res.status(500).json({ error: err.message || 'Could not fetch profile analytics' });
  }
});

// ─── Instagram URL download helper ──────────────────────────────────────────

// Extract the shortcode from any Instagram reel/post URL
function extractShortcode(url) {
  const m = url.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

// Stream a URL to a local file path (shared utility)
function streamUrlToFile(videoUrl, outputPath) {
  const https = require('https');
  const http  = require('http');

  return new Promise((resolve, reject) => {
    const protocol = videoUrl.startsWith('https') ? https : http;
    const file = fs.createWriteStream(outputPath);
    const req = protocol.get(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        'Referer': 'https://www.instagram.com/',
      }
    }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        file.destroy();
        return streamUrlToFile(res.headers.location, outputPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.destroy();
        return reject(new Error(`CDN returned HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(outputPath); });
      file.on('error', reject);
    });
    req.on('error', (e) => { file.destroy(); reject(e); });
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Video download timed out')); });
  });
}

// Main: try each strategy in order
async function downloadInstagramReel(url, outputPath) {
  // 1. Clean the URL (strip tracking parameters like ?igsh=...)
  const cleanUrl = url.split('?')[0];
  const shortcode = extractShortcode(cleanUrl);
  
  if (!shortcode) {
    console.error('❌ Invalid Instagram URL:', url);
    throw new Error('Could not extract shortcode from Instagram URL. Please check the link.');
  }

  console.log(`\n🔍 Attempting download for: ${cleanUrl}`);

  // Strategy 1: Apify Instagram Scraper (most reliable — uses proxies)
  if (process.env.APIFY_API_TOKEN) {
    try {
      console.log('⬇️  Strategy 1: Apify Instagram Scraper...');
      await downloadViaApify(cleanUrl, outputPath);
      console.log('✅ Apify succeeded');
      return outputPath;
    } catch (e0) {
      console.warn('⚠️  Apify failed:', e0.message);
    }
  } else {
    console.warn('⚠️  APIFY_API_TOKEN not set, skipping Apify strategy');
  }

  // Strategy 2: Cobalt API (with one retry on transient failure)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`⬇️  Strategy 2: Cobalt API (attempt ${attempt})...`);
      await downloadViaCobalt(cleanUrl, outputPath);
      console.log('✅ Cobalt succeeded');
      return outputPath;
    } catch (e1) {
      console.warn(`⚠️  Cobalt attempt ${attempt} failed:`, e1.message);
      if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Strategy 3: yt-dlp (system binary resolved at startup)
  try {
    console.log('⬇️  Strategy 3: yt-dlp...');
    await downloadViaYtDlp(cleanUrl, outputPath);
    console.log('✅ yt-dlp succeeded');
    return outputPath;
  } catch (e2) {
    console.warn('⚠️  yt-dlp failed:', e2.message);
  }

  // Strategy 4: yt-dlp-wrap npm package (downloads its own binary if needed)
  try {
    console.log('⬇️  Strategy 4: yt-dlp-wrap...');
    await downloadViaYtDlpWrap(cleanUrl, outputPath);
    console.log('✅ yt-dlp-wrap succeeded');
    return outputPath;
  } catch (e3) {
    console.error('❌ All strategies failed. Last error:', e3.message);
    throw new Error(
      'Instagram is blocking the server from downloading this reel.\n' +
      'Please download the video to your device and upload it directly to Creatorly AI.'
    );
  }
}

// ─── Strategy 1: Apify Instagram Scraper ──────────────────────────────────────
async function downloadViaApify(url, outputPath) {
  const { ApifyClient } = require('apify-client');
  const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

  // Run the Instagram scraper actor with the reel URL
  const run = await client.actor('apify/instagram-scraper').call(
    {
      directUrls: [url],
      resultsType: 'posts',
      resultsLimit: 1,
      addParentData: false,
    },
    {
      timeout: 120, // 2 minute timeout
      memory: 1024, // 1GB memory
    }
  );

  if (!run || !run.defaultDatasetId) {
    throw new Error('Apify run did not return a dataset');
  }

  // Fetch results
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  
  if (!items || items.length === 0) {
    throw new Error('Apify returned no results for this URL');
  }

  const post = items[0];
  
  // Log the keys we got back for debugging
  console.log('📋 Apify result keys:', Object.keys(post).join(', '));
  
  // Try multiple possible field names for video URL
  let videoUrl = post.videoUrl 
    || post.video_url 
    || post.videoPlaybackUrl
    || post.video_play_url
    || post.url  // some actors put the CDN URL here
    || null;
  
  // Check nested structures
  if (!videoUrl && post.videoVersions && post.videoVersions.length > 0) {
    videoUrl = post.videoVersions[0].url;
  }
  if (!videoUrl && post.video_versions && post.video_versions.length > 0) {
    videoUrl = post.video_versions[0].url;
  }
  if (!videoUrl && post.media && post.media.video_url) {
    videoUrl = post.media.video_url;
  }
  // displayUrl is usually an image, only use as last resort for video type
  if (!videoUrl && post.type === 'Video' && post.displayUrl) {
    videoUrl = post.displayUrl;
  }
  if (!videoUrl && post.isVideo && post.displayUrl) {
    videoUrl = post.displayUrl;
  }
  
  if (!videoUrl) {
    console.error('❌ Apify result (first 500 chars):', JSON.stringify(post).slice(0, 500));
    throw new Error('Apify could not extract video URL from this reel');
  }

  console.log('📡 Apify provided video URL, downloading to local disk...');
  await streamUrlToFile(videoUrl, outputPath);
  
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
    throw new Error('Downloaded file is too small or missing');
  }
  
  return outputPath;
}

// Rename the typo-d function for clarity
async function downloadViaCobalt(url, outputPath) {
  const https = require('https');
  const body = JSON.stringify({ 
    url, 
    downloadMode: 'auto', 
    filenamePattern: 'basic',
    youtubeVideoCodec: 'h264' // specifically request h264 for better compatibility
  });

  const cobaltVideoUrl = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cobalt.tools',
      path: '/',
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'CreatorlyAI/1.0'
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        try {
          const rawResponse = Buffer.concat(chunks).toString();
          const json = JSON.parse(rawResponse);
          
          if (json.status === 'error') {
            console.error('Cobalt API Error Detail:', json.error);
            return reject(new Error(`Cobalt error: ${json.error?.code || 'Unknown'}`));
          }
          
          if (json.url) return resolve(json.url);
          
          if (json.picker) {
            const video = json.picker.find(p => p.type === 'video') || json.picker[0];
            if (video?.url) return resolve(video.url);
          }
          
          reject(new Error('No video URL in Cobalt response'));
        } catch (e) {
          reject(new Error('Cobalt parse error: ' + e.message));
        }
      });
    });

    req.on('error', (e) => reject(new Error('Cobalt Request Error: ' + e.message)));
    req.setTimeout(25000, () => { req.destroy(); reject(new Error('Cobalt API timeout')); });
    req.write(body);
    req.end();
  });

  console.log('📡 Cobalt provided stream URL, downloading to local disk...');
  await streamUrlToFile(cobaltVideoUrl, outputPath);
  return outputPath;
}
// Strategy 2: yt-dlp fallback
function downloadViaYtDlp(url, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '--no-playlist',
      '--format', 'best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--output', outputPath,
      '--add-header', 'User-Agent:Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      '--add-header', 'Referer:https://www.instagram.com/',
      '--no-check-certificates',
      '--socket-timeout', '30',
      url,
    ];
    console.log(`   Binary: ${YTDLP_BIN}`);
    execFile(YTDLP_BIN, args, { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('yt-dlp stderr:', stderr || err.message);
        return reject(new Error('yt-dlp: ' + (stderr || err.message).slice(0, 200)));
      }
      if (!fs.existsSync(outputPath)) {
        return reject(new Error('yt-dlp finished but output file not found'));
      }
      resolve(outputPath);
    });
  });
}

// Strategy 3: yt-dlp-wrap npm package (self-contained binary download)
async function downloadViaYtDlpWrap(url, outputPath) {
  const YTDlpWrap = require('yt-dlp-wrap').default || require('yt-dlp-wrap');
  const ytDlpWrap = new YTDlpWrap();

  // Download the yt-dlp binary if it hasn't been fetched yet
  const wrapBin = YTDlpWrap.getDefaultBinaryPath ? YTDlpWrap.getDefaultBinaryPath() : null;
  if (wrapBin && !fs.existsSync(wrapBin)) {
    console.log('   Downloading yt-dlp binary via yt-dlp-wrap...');
    await YTDlpWrap.downloadFromGithub(wrapBin);
  }

  return new Promise((resolve, reject) => {
    ytDlpWrap.exec([
      url,
      '--no-playlist',
      '--format', 'best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--output', outputPath,
      '--add-header', 'User-Agent:Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      '--add-header', 'Referer:https://www.instagram.com/',
      '--no-check-certificates',
      '--socket-timeout', '30',
    ])
    .on('error', (err) => reject(new Error('yt-dlp-wrap: ' + err.message)))
    .on('close', () => {
      if (!fs.existsSync(outputPath)) {
        return reject(new Error('yt-dlp-wrap finished but output file not found'));
      }
      resolve(outputPath);
    });
  });
}

// ─── Latest result endpoint (fallback when record_id wasn't received) ─────────
app.get('/api/latest-result', async (req, res) => {
  const userId = extractUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const https = require('https');
    const url = new URL(process.env.SUPABASE_URL);

    const result = await new Promise((resolve, reject) => {
      const path = `/rest/v1/video_analyses?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=1&select=id,status,full_result,error_message`;
      const options = {
        hostname: url.hostname,
        path,
        method: 'GET',
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
      };
      const req2 = https.request(options, (r) => {
        const chunks = [];
        r.on('data', d => chunks.push(d));
        r.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch { reject(new Error('Parse error')); }
        });
      });
      req2.on('error', reject);
      req2.setTimeout(8000, () => { req2.destroy(); reject(new Error('timeout')); });
      req2.end();
    });

    const row = Array.isArray(result) ? result[0] : null;
    if (!row) return res.json({ status: 'not_found' });

    if (row.status === 'completed' && row.full_result) {
      return res.json({ success: true, status: 'completed', results: row.full_result });
    }
    if (row.status === 'failed') {
      return res.json({ success: false, status: 'failed', error: row.error_message || 'Analysis failed' });
    }
    return res.json({ success: false, status: 'processing' });

  } catch (err) {
    res.status(500).json({ error: 'Could not fetch result' });
  }
});

// ─── Result polling endpoint ──────────────────────────────────────────────────
// Frontend calls this to recover a result after a network drop
app.get('/api/result/:recordId', async (req, res) => {
  const { recordId } = req.params;
  const userId = extractUserId(req);

  if (!recordId) return res.status(400).json({ error: 'No record ID' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const https = require('https');
    const url = new URL(process.env.SUPABASE_URL);

    const result = await new Promise((resolve, reject) => {
      // Fetch the record — service role bypasses RLS
      const path = `/rest/v1/video_analyses?id=eq.${encodeURIComponent(recordId)}&select=status,full_result,error_message,user_id`;
      const options = {
        hostname: url.hostname,
        path,
        method: 'GET',
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
      };
      const req2 = https.request(options, (r) => {
        const chunks = [];
        r.on('data', d => chunks.push(d));
        r.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch { reject(new Error('Parse error')); }
        });
      });
      req2.on('error', reject);
      req2.setTimeout(8000, () => { req2.destroy(); reject(new Error('timeout')); });
      req2.end();
    });

    const row = Array.isArray(result) ? result[0] : null;
    if (!row) return res.status(404).json({ error: 'Record not found' });

    // Security: only the owner can fetch their result
    if (userId && row.user_id && row.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (row.status === 'completed' && row.full_result) {
      return res.json({ success: true, status: 'completed', results: row.full_result });
    }
    if (row.status === 'failed') {
      return res.json({ success: false, status: 'failed', error: row.error_message || 'Analysis failed' });
    }
    // Still processing
    return res.json({ success: false, status: 'processing' });

  } catch (err) {
    console.error('Result fetch error:', err.message);
    res.status(500).json({ error: 'Could not fetch result' });
  }
});
app.post('/api/analyse', upload.single('video'), async (req, res) => {
  const videoPath = req.file?.path;
  const framesDir = videoPath ? videoPath + '_frames' : null;
  let recordId = null;

  try {
    if (!videoPath) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    }

    const caption = (req.body.caption || '').trim();
    const hashtags = (req.body.hashtags || '').trim();
    const niche = (req.body.niche || 'general').trim();
    const userId = extractUserId(req);

    // ── Limit check ──────────────────────────────────────────────────────────
    if (userId) {
      const limitCheck = await checkUserLimit(userId, extractUserEmail(req));
      if (!limitCheck.allowed) {
        return res.status(429).json({ error: limitCheck.reason, limit_reached: true, used: limitCheck.used, limit: limitCheck.limit });
      }
    }

    console.log(`\n📥 New analysis request | Niche: ${niche} | File: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)}MB) | User: ${userId || 'anonymous'}`);

    // ── Create DB record ─────────────────────────────────────────────────────
    recordId = await createAnalysisRecord(userId, {
      source: 'upload',
      niche,
      filename: req.file.originalname,
      fileSizeMb: parseFloat((req.file.size / 1024 / 1024).toFixed(2)),
    });

    // 1. Run ffmpeg analysis
    const ffmpegData = await runFfmpegAnalysis(videoPath, framesDir);
    if (ffmpegData.videoInfo.duration < 1) {
      return res.status(400).json({ error: 'Video is too short or could not be read' });
    }

    // 2. Run Gemini Vision analysis
    const geminiAnalysis = await analyseWithGemini(ffmpegData, caption, hashtags, niche);

    // 3. Run text analysis
    const textAnalysis = await analyseText({ caption, hashtags, niche });

    // 4. Merge everything
    const finalResult = {
      ...geminiAnalysis,
      caption: textAnalysis.caption,
      hashtags: textAnalysis.hashtags,
      video_info: {
        duration: ffmpegData.videoInfo.duration,
        resolution: ffmpegData.computed.aspectRatio,
        is_vertical: ffmpegData.computed.isVertical,
        fps: ffmpegData.videoInfo.fps,
        has_audio: ffmpegData.videoInfo.hasAudio,
      },
      technical: ffmpegData.computed,
      timeline_data: {
        duration: ffmpegData.videoInfo.duration,
        scene_cuts: ffmpegData.sceneTimestamps || [],
        silence_segments: ffmpegData.silenceSegments || [],
      },
      overall_score: null,
      analysed_at: new Date().toISOString(),
      thumbnail: ffmpegData.thumbnail || null,
    };

    finalResult.overall_score = computeOverallScore(finalResult);

    // ── Save to Supabase ─────────────────────────────────────────────────────
    await saveAnalysisResult(recordId, finalResult);

    console.log(`✅ Analysis complete. Overall score: ${finalResult.overall_score}/10`);
    res.json({ success: true, record_id: recordId, results: finalResult });

  } catch (err) {
    console.error('❌ Analysis error:', err.message);
    await markAnalysisFailed(recordId, err.message);
    res.status(500).json({ error: err.message || 'Analysis failed' });
  } finally {
    cleanupFiles(videoPath, framesDir);
  }
});

// ─── Instagram URL Analysis Endpoint ────────────────────────────────────────
app.post('/api/analyse-url', express.json(), async (req, res) => {
  const { url, caption = '', hashtags = '', niche = 'general' } = req.body || {};
  let recordId = null;

  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'No Instagram URL provided' });
  }

  const instagramPattern = /instagram\.com\/(reel|p|tv)\//i;
  if (!instagramPattern.test(url)) {
    return res.status(400).json({ error: 'Please provide a valid Instagram Reel URL (instagram.com/reel/...)' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
  }

  const userId = extractUserId(req);

  // ── Limit check ────────────────────────────────────────────────────────────
  if (userId) {
    const limitCheck = await checkUserLimit(userId, extractUserEmail(req));
    if (!limitCheck.allowed) {
      return res.status(429).json({ error: limitCheck.reason, limit_reached: true, used: limitCheck.used, limit: limitCheck.limit });
    }
  }

  const tmpId = Date.now() + '_' + Math.random().toString(36).slice(2);
  const videoPath = `/tmp/uploads/insta_${tmpId}.mp4`;
  const framesDir = videoPath + '_frames';

  fs.mkdirSync('/tmp/uploads', { recursive: true });

  try {
    console.log(`\n📥 Instagram URL analysis | Niche: ${niche} | URL: ${url} | User: ${userId || 'anonymous'}`);

    // ── Create DB record ───────────────────────────────────────────────────
    recordId = await createAnalysisRecord(userId, {
      source: 'instagram_url',
      niche,
      instagramUrl: url.trim(),
    });

    // 1. Download the reel
    await downloadInstagramReel(url.trim(), videoPath);
    if (!fs.existsSync(videoPath)) {
      throw new Error('Download failed — file not found after download finished');
    }

    // 2. Run the same pipeline
    const ffmpegData = await runFfmpegAnalysis(videoPath, framesDir);
    if (ffmpegData.videoInfo.duration < 1) {
      return res.status(400).json({ error: 'Video is too short or could not be read' });
    }

    const geminiAnalysis = await analyseWithGemini(ffmpegData, caption.trim(), hashtags.trim(), niche.trim());
    const textAnalysis   = await analyseText({ caption: caption.trim(), hashtags: hashtags.trim(), niche: niche.trim() });

    const finalResult = {
      ...geminiAnalysis,
      caption: textAnalysis.caption,
      hashtags: textAnalysis.hashtags,
      video_info: {
        duration:    ffmpegData.videoInfo.duration,
        resolution:  ffmpegData.computed.aspectRatio,
        is_vertical: ffmpegData.computed.isVertical,
        fps:         ffmpegData.videoInfo.fps,
        has_audio:   ffmpegData.videoInfo.hasAudio,
      },
      technical:    ffmpegData.computed,
      timeline_data: {
        duration:         ffmpegData.videoInfo.duration,
        scene_cuts:       ffmpegData.sceneTimestamps  || [],
        silence_segments: ffmpegData.silenceSegments  || [],
      },
      overall_score: null,
      analysed_at:   new Date().toISOString(),
      source: 'instagram_url',
      thumbnail: ffmpegData.thumbnail || null,
    };

    finalResult.overall_score = computeOverallScore(finalResult);

    // ── Save to Supabase ───────────────────────────────────────────────────
    await saveAnalysisResult(recordId, finalResult);

    console.log(`✅ URL analysis complete. Overall score: ${finalResult.overall_score}/10`);
    res.json({ success: true, record_id: recordId, results: finalResult });

  } catch (err) {
    console.error('❌ URL analysis error:', err.message);
    await markAnalysisFailed(recordId, err.message);
    res.status(500).json({ error: err.message || 'Analysis failed' });
  } finally {
    cleanupFiles(videoPath, framesDir);
  }
});

// ─── Prompt Generator API ─────────────────────────────────────────────────────
app.post('/api/generate-prompts', express.json(), async (req, res) => {
  const { idea, tool = 'General' } = req.body || {};

  if (!idea || idea.trim().length < 10) {
    return res.status(400).json({ error: 'Please describe your reel idea (at least 10 characters)' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'AI not configured' });
  }

  const userId = extractUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-05-20' });

    const toolContext = tool !== 'General'
      ? `The prompts MUST be optimized for ${tool}'s specific syntax, capabilities, and best practices. Include tool-specific keywords and formatting that work best with ${tool}.`
      : 'The prompts should be general-purpose and work with any AI video generation tool (Runway, Kling, Sora, Pika, etc.).';

    const prompt = `You are an expert AI video prompt engineer specializing in creating viral Instagram Reels content for Indian creators.

The user wants to create a reel about: "${idea.trim()}"
Target AI video tool: ${tool}

${toolContext}

Generate exactly 5 detailed, ready-to-paste video generation prompts. Each prompt should:
- Be 2-4 sentences long
- Include specific visual details (camera angles, lighting, colors, movements)
- Include mood/atmosphere descriptions
- Be optimized for short-form vertical video (9:16 aspect ratio, 15-60 seconds)
- Consider Indian audience aesthetics and trends
- Be different from each other (different angles/styles/moods)

Return ONLY a JSON array of 5 strings. No markdown, no explanation, just the JSON array.
Example format: ["prompt 1 text here", "prompt 2 text here", ...]`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Parse JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Could not parse AI response');
    }

    const prompts = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(prompts) || prompts.length === 0) {
      throw new Error('Invalid prompt format from AI');
    }

    console.log(`✨ Prompt generation done | Tool: ${tool} | Prompts: ${prompts.length} | User: ${userId}`);
    res.json({ success: true, tool, prompts: prompts.slice(0, 5) });

  } catch (err) {
    console.error('❌ Prompt generation error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate prompts' });
  }
});

// ─── Chatbot API ──────────────────────────────────────────────────────────────
app.post('/api/chatbot', async (req, res) => {
  const { messages, creatorProfile } = req.body || {};

  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY not configured locally. Proxying chatbot request to Railway backend...');
    try {
      const railwayRes = await fetch('https://api.creatorlyai.in/api/chatbot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
      });

      if (!railwayRes.ok) {
        const errText = await railwayRes.text();
        return res.status(railwayRes.status).send(errText);
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = railwayRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
      return;
    } catch (proxyErr) {
      console.error('❌ Failed to proxy local chatbot request to Railway:', proxyErr.message);
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server and local proxy failed: ' + proxyErr.message });
    }
  }

  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    const creatorProfileJson = creatorProfile ? JSON.stringify(creatorProfile, null, 2) : '{}';

    const systemInstruction = `You are CreatorlyAI, a personal Instagram growth strategist for Indian creators.

You have access to this creator's profile data:
${creatorProfileJson}

Rules:
- Always reference their actual data when answering. Never give generic advice when their data is available
- Be concise and specific. Max 4 sentences per response unless they ask for a detailed breakdown
- Speak like a sharp strategist, not a helpful AI assistant. No filler phrases like "Great question" or "Certainly"
- When mentioning a metric, always compare it to niche average so creator understands context
- End every response with one specific next action they can take
- If asked about hooks, always reference their actual hook score and worst performing reel
- If asked about captions, generate options that match their niche and tone
- If asked about brand rates, use their actual engagement rate and avg views to calculate
- If data is unavailable for a question, answer from general creator knowledge but flag that it is based on general benchmarks not their data
- Never use bullet points in responses. Write in short flowing sentences like a real person texting advice`;

    const model = genAI.getGenerativeModel({ 
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      systemInstruction
    });

    const contents = [];
    if (messages && Array.isArray(messages)) {
      messages.forEach(m => {
        contents.push({
          role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
          parts: [{ text: m.content || '' }]
        });
      });
    }

    // Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();

    const resultStream = await model.generateContentStream({ contents });

    for await (const chunk of resultStream.stream) {
      const chunkText = chunk.text();
      res.write(chunkText);
    }
    res.end();

  } catch (err) {
    console.error('❌ Chatbot streaming error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Failed to get chat response' });
    } else {
      res.write(`\n[Error: ${err.message}]`);
      res.end();
    }
  }
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum size is 500MB.' });
  }
  res.status(400).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Creatorly Video Lab API running on port ${PORT}`);
  console.log(`   Gemini API Key: ${process.env.GEMINI_API_KEY ? '✅ Set' : '❌ MISSING'}`);
});

// Trigger redeployment - chatbot and rate card integration v1.1.0

