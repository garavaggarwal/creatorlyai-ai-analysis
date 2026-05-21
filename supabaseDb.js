// ─── Supabase DB helper (server-side) ────────────────────────────────────────
// Uses the service-role key so it can bypass RLS and write from the backend.

const https = require('https');
const { MAX_ANALYSES_PER_USER, MAX_ANALYSES_PER_DAY, MAX_ANALYSES_PER_MONTH, UNLIMITED_EMAILS } = require('./config');

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key (secret)

// ─── Raw REST helper ──────────────────────────────────────────────────────────
function supabasePost(path, body, method = 'POST') {
  return new Promise((resolve, reject) => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return resolve({ data: null, error: 'Supabase not configured' });
    }

    const url = new URL(SUPABASE_URL);
    const payload = JSON.stringify(body);

    const options = {
      hostname: url.hostname,
      path,
      method,
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Length': Buffer.byteLength(payload),
        'Prefer': method === 'POST' ? 'return=representation' : '',
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString();
          const data = text ? JSON.parse(text) : null;
          if (res.statusCode >= 400) {
            resolve({ data: null, error: data?.message || data?.error || `HTTP ${res.statusCode}` });
          } else {
            resolve({ data, error: null });
          }
        } catch (e) {
          resolve({ data: null, error: e.message });
        }
      });
    });

    req.on('error', e => resolve({ data: null, error: e.message }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ data: null, error: 'Supabase timeout' }); });
    req.write(payload);
    req.end();
  });
}

function supabaseGet(path) {
  return new Promise((resolve, reject) => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return resolve({ data: null, error: 'Supabase not configured' });
    }

    const url = new URL(SUPABASE_URL);

    const options = {
      hostname: url.hostname,
      path,
      method: 'GET',
      headers: {
        'apikey':        SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString();
          const data = text ? JSON.parse(text) : null;
          if (res.statusCode >= 400) {
            resolve({ data: null, error: data?.message || `HTTP ${res.statusCode}` });
          } else {
            resolve({ data, error: null });
          }
        } catch (e) {
          resolve({ data: null, error: e.message });
        }
      });
    });

    req.on('error', e => resolve({ data: null, error: e.message }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ data: null, error: 'Supabase timeout' }); });
    req.end();
  });
}

// ─── Count analyses for a user ────────────────────────────────────────────────
async function getUserAnalysisCount(userId, since = null) {
  let path = `/rest/v1/video_analyses?select=id&user_id=eq.${encodeURIComponent(userId)}&status=eq.completed`;
  if (since) path += `&created_at=gte.${encodeURIComponent(since)}`;
  const { data, error } = await supabaseGet(path);
  if (error) { console.warn('Count query error:', error); return 0; }
  return Array.isArray(data) ? data.length : 0;
}

// ─── Check if user is within limits ──────────────────────────────────────────
async function checkUserLimit(userId, userEmail) {
  if (!userId) return { allowed: true };

  // Unlimited allowlist — bypass all limits
  if (userEmail && UNLIMITED_EMAILS.map(e => e.toLowerCase()).includes(userEmail.toLowerCase())) {
    console.log(`✅ Unlimited access granted for: ${userEmail}`);
    return { allowed: true };
  }

  // Lifetime limit
  if (MAX_ANALYSES_PER_USER > 0) {
    const total = await getUserAnalysisCount(userId);
    if (total >= MAX_ANALYSES_PER_USER) {
      return {
        allowed: false,
        reason: `You've used all ${MAX_ANALYSES_PER_USER} of your free analyses. Upgrade to continue.`,
        used: total,
        limit: MAX_ANALYSES_PER_USER,
      };
    }
  }

  // Daily limit
  if (MAX_ANALYSES_PER_DAY > 0) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = await getUserAnalysisCount(userId, todayStart.toISOString());
    if (todayCount >= MAX_ANALYSES_PER_DAY) {
      return {
        allowed: false,
        reason: `Daily limit of ${MAX_ANALYSES_PER_DAY} analyses reached. Come back tomorrow!`,
        used: todayCount,
        limit: MAX_ANALYSES_PER_DAY,
      };
    }
  }

  // Monthly limit
  if (MAX_ANALYSES_PER_MONTH > 0) {
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthCount = await getUserAnalysisCount(userId, monthStart.toISOString());
    if (monthCount >= MAX_ANALYSES_PER_MONTH) {
      return {
        allowed: false,
        reason: `Monthly limit of ${MAX_ANALYSES_PER_MONTH} analyses reached.`,
        used: monthCount,
        limit: MAX_ANALYSES_PER_MONTH,
      };
    }
  }

  return { allowed: true };
}

// ─── Create a pending record before analysis starts ───────────────────────────
async function createAnalysisRecord(userId, meta) {
  const record = {
    user_id:        userId,
    status:         'processing',
    source:         meta.source || 'upload',          // 'upload' | 'instagram_url'
    niche:          meta.niche  || 'general',
    original_filename: meta.filename || null,
    instagram_url:  meta.instagramUrl || null,
    file_size_mb:   meta.fileSizeMb   || null,
    created_at:     new Date().toISOString(),
  };

  const { data, error } = await supabasePost('/rest/v1/video_analyses', record);
  if (error) { console.warn('Failed to create analysis record:', error); return null; }
  return Array.isArray(data) ? data[0]?.id : data?.id || null;
}

// ─── Update record with full results after analysis completes ─────────────────
async function saveAnalysisResult(recordId, result) {
  if (!recordId) return;

  const update = {
    status:           'completed',
    completed_at:     new Date().toISOString(),

    // Scores
    overall_score:    result.overall_score,
    hook_score:       result.hook?.score ?? null,
    retention_score:  result.retention?.score ?? null,
    visual_score:     result.visual_quality?.score ?? null,
    audio_score:      result.audio_quality?.score ?? null,
    editing_score:    result.editing?.score ?? null,
    content_score:    result.content_structure?.score ?? null,
    text_score:       result.text_subtitles?.score ?? null,
    compliance_score: result.compliance?.score ?? null,
    sync_score:       result.sync_score ?? null,
    caption_score:    result.caption?.score ?? null,
    hashtag_score:    result.hashtags?.score ?? null,

    // Predicted performance
    predicted_performance: result.predicted_performance || null,

    // Video metadata
    video_duration:   result.video_info?.duration ?? null,
    video_resolution: result.video_info?.resolution || null,
    video_fps:        result.video_info?.fps ?? null,
    is_vertical:      result.video_info?.is_vertical ?? null,
    has_audio:        result.video_info?.has_audio ?? null,
    scene_cuts:       result.technical?.sceneCuts ?? null,
    cuts_per_minute:  result.technical?.cutsPerMinute ?? null,
    silence_gaps:     result.technical?.silenceGaps ?? null,

    // AI outputs (stored as JSONB)
    overall_summary:      result.overall_summary || null,
    video_summary:        result.video_summary   || null,
    top_3_wins:           result.top_3_wins      || [],
    top_3_fixes:          result.top_3_fixes     || [],
    suggested_captions:   result.suggested_captions  || [],
    suggested_hashtags:   result.suggested_hashtags  || [],
    sync_timeline:        result.sync_timeline   || [],
    full_result:          result,                       // full JSON blob for future use

    // Thumbnail (only include if column exists — won't break if not yet migrated)
    thumbnail:            result.thumbnail || null,
  };

  // PATCH by id
  const path = `/rest/v1/video_analyses?id=eq.${encodeURIComponent(recordId)}`;
  const { error } = await supabasePost(path, update, 'PATCH');
  if (error) console.warn('Failed to save analysis result:', error);
}

// ─── Mark a record as failed ──────────────────────────────────────────────────
async function markAnalysisFailed(recordId, errorMsg) {
  if (!recordId) return;
  const path = `/rest/v1/video_analyses?id=eq.${encodeURIComponent(recordId)}`;
  await supabasePost(path, { status: 'failed', error_message: errorMsg?.slice(0, 500), completed_at: new Date().toISOString() }, 'PATCH');
}

// ─── Get remaining analyses for a user (for frontend display) ─────────────────
async function getUserUsage(userId) {
  if (!userId) return null;
  const total = await getUserAnalysisCount(userId);
  return {
    used:      total,
    limit:     MAX_ANALYSES_PER_USER,
    remaining: MAX_ANALYSES_PER_USER > 0 ? Math.max(0, MAX_ANALYSES_PER_USER - total) : null,
  };
}

// ─── Profile cache helpers ────────────────────────────────────────────────────
async function getCachedProfile(username) {
  const path = `/rest/v1/profile_analytics_cache?username=eq.${encodeURIComponent(username.toLowerCase())}`;
  const { data, error } = await supabaseGet(path);
  if (error) {
    console.warn('Failed to fetch cached profile:', error);
    return null;
  }
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function saveCachedProfile(username, profileData) {
  const cleanUsername = username.toLowerCase();
  const cached = await getCachedProfile(cleanUsername);
  
  const record = {
    username: cleanUsername,
    profile_data: profileData,
    updated_at: new Date().toISOString(),
  };

  if (cached) {
    const path = `/rest/v1/profile_analytics_cache?username=eq.${encodeURIComponent(cleanUsername)}`;
    const { error } = await supabasePost(path, { profile_data: profileData, updated_at: new Date().toISOString() }, 'PATCH');
    if (error) console.warn('Failed to update cached profile:', error);
  } else {
    const { error } = await supabasePost('/rest/v1/profile_analytics_cache', record, 'POST');
    if (error) console.warn('Failed to insert cached profile:', error);
  }
}

module.exports = {
  checkUserLimit,
  createAnalysisRecord,
  saveAnalysisResult,
  markAnalysisFailed,
  getUserUsage,
  getCachedProfile,
  saveCachedProfile,
};

