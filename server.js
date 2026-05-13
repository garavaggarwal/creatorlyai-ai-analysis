const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execFile, spawnSync } = require('child_process');
const { runFfmpegAnalysis } = require('./analysers/ffmpegHelper');
const { analyseWithGemini } = require('./analysers/geminiAnalyser');
const { analyseText } = require('./analysers/textAnalyser');
const { checkUserLimit, createAnalysisRecord, saveAnalysisResult, markAnalysisFailed, getUserUsage } = require('./supabaseDb');

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
