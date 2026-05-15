const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── Debug instrumentation ────────────────────────────────────────────────────
const DEBUG = process.env.DEBUG_ANALYSIS === 'true';
const DEBUG_LOG_DIR = path.join(__dirname, '..', 'debug-logs');

function debugLog(label, data) {
  if (!DEBUG) return;
  console.log(`\n[DEBUG] ${label}:`, JSON.stringify(data, null, 2));
}

function saveDebugTrace(trace) {
  if (!DEBUG) return;
  try {
    if (!fs.existsSync(DEBUG_LOG_DIR)) fs.mkdirSync(DEBUG_LOG_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
    const filename = path.join(DEBUG_LOG_DIR, `analysis_${ts}.json`);
    fs.writeFileSync(filename, JSON.stringify(trace, null, 2));
    console.log(`[DEBUG] Full trace saved → ${filename}`);
  } catch (e) {
    console.warn('[DEBUG] Could not save trace file:', e.message);
  }
}

// Build metric interpretation based on reel type
function interpretMetrics(computed, reelType) {
  const { sceneCuts, cutsPerMinute, silencePercent, silenceGaps, loudnessLUFS, avgBrightness, brightnessLabel } = computed.computed;
  const duration = computed.videoInfo?.duration;

  const isSlow = ['singing', 'music_performance', 'cinematic', 'storytelling'].includes(reelType);
  const isFast = ['meme', 'comedy', 'dance', 'fitness'].includes(reelType);

  return {
    sceneCuts: {
      value: sceneCuts,
      interpretation: isSlow
        ? (sceneCuts <= 3 ? 'acceptable for this format' : 'more cuts than typical for this style')
        : isFast
          ? (sceneCuts >= 5 ? 'good pacing for this format' : 'may feel slow for this format')
          : 'within normal range',
    },
    cutsPerMinute: {
      value: cutsPerMinute,
      interpretation: cutsPerMinute < 3 ? 'slow pacing' : cutsPerMinute < 8 ? 'moderate pacing' : 'fast pacing',
    },
    silence: {
      value: silencePct => silencePct,
      interpretation: silenceGaps > 2 ? 'multiple silence gaps detected — may hurt engagement' : 'minimal silence',
    },
    audio: {
      value: loudnessLUFS ?? 'unavailable',
      interpretation: loudnessLUFS === null || loudnessLUFS === undefined
        ? 'unavailable — cannot assess audio loudness'
        : loudnessLUFS < -20 ? 'audio is quiet' : loudnessLUFS < -12 ? 'audio level is good' : 'audio may be loud',
    },
    brightness: {
      value: avgBrightness ?? 'unavailable',
      interpretation: avgBrightness === null || avgBrightness === undefined
        ? 'unavailable — cannot assess lighting'
        : brightnessLabel,
    },
    duration: {
      value: duration,
      interpretation: duration < 10 ? 'very short' : duration < 30 ? 'standard reel length' : duration < 60 ? 'longer reel' : 'very long',
    },
  };
}

// Build scoring rubric weights per reel type
function getScoringRubric(reelType) {
  const rubrics = {
    singing:           { hook: 20, emotion: 25, audio: 25, visual_connection: 15, shareability: 15, reason: 'music/vocal performance — emotion and audio are primary' },
    music_performance: { hook: 20, emotion: 25, audio: 25, visual_connection: 15, shareability: 15, reason: 'music performance — emotion and audio are primary' },
    meme:              { hook: 30, timing: 25, pacing: 20, relatability: 15, shareability: 10, reason: 'meme format — hook and timing are critical' },
    comedy:            { hook: 25, timing: 25, pacing: 20, relatability: 20, shareability: 10, reason: 'comedy — timing and relatability drive shares' },
    talking_head:      { hook: 30, clarity: 25, text_support: 20, cta: 15, pacing: 10, reason: 'talking head — hook and clarity are most important' },
    educational:       { hook: 25, clarity: 25, value_density: 20, cta: 15, text_support: 15, reason: 'educational — clarity and value density drive saves' },
    transformation:    { before_after: 30, reveal_payoff: 25, pacing: 20, emotional_impact: 15, storytelling: 10, reason: 'transformation — clear before/after and payoff are critical' },
    cinematic:         { visual_mood: 30, atmosphere: 25, composition: 20, emotional_pull: 15, music_sync: 10, reason: 'cinematic — visual quality and mood are primary' },
    product_ad:        { cta: 30, hook: 25, product_visibility: 20, offer_clarity: 15, conversion: 10, reason: 'product ad — CTA and conversion are primary' },
    fitness:           { transformation: 25, motivation: 25, process: 20, intensity: 15, payoff: 15, reason: 'fitness — transformation and motivation drive engagement' },
    food:              { visual_appeal: 30, reveal: 25, pacing: 20, close_up_quality: 15, payoff: 10, reason: 'food — visual appetite appeal is primary' },
    dance:             { energy: 25, music_sync: 25, visual_variety: 20, hook: 20, creativity: 10, reason: 'dance — energy and sync are primary' },
    general:           { hook: 25, retention: 20, visual: 20, audio: 15, structure: 20, reason: 'general balanced scoring' },
  };
  return rubrics[reelType] || rubrics.general;
}

// ─── Convert image to Gemini Part ────────────────────────────────────────────
function imageToGeminiPart(filePath, mimeType = 'image/jpeg') {
  const data = fs.readFileSync(filePath);
  return {
    inlineData: {
      data: data.toString('base64'),
      mimeType,
    },
  };
}

// ─── Stage 1: Reel type classification prompt ─────────────────────────────────
function buildClassificationPrompt(computed, caption, niche) {
  const duration = computed.videoInfo?.duration?.toFixed(1);
  const sceneCuts = computed.computed.sceneCuts;
  const isVertical = computed.computed.isVertical;

  return `You are an Instagram Reels expert. Look at these video frames and classify this reel.

### VIDEO DATA
- Duration: ${duration}s
- Scene cuts: ${sceneCuts}
- Format: ${isVertical ? 'Vertical' : 'Horizontal'}
- Niche hint: "${niche || 'general'}"
- Caption: "${caption || '(none)'}"

### CLASSIFY THIS REEL
Return ONLY this JSON (no other text):
{
  "reel_type": "one of: singing | music_performance | talking_head | educational | meme | comedy | transformation | storytelling | vlog | cinematic | product_ad | beauty | fashion | fitness | food | dance | motivational | lip_sync | reaction | faceless_text | general",
  "hook_type": "one of: voice_hook | visual_hook | text_hook | shock_hook | curiosity_hook | story_hook | transformation_hook | music_hook | none",
  "creator_intent": "one short sentence describing what the creator is trying to achieve",
  "content_style": "one of: raw_authentic | polished_edited | aesthetic_cinematic | fast_paced | slow_emotional | educational_clear | comedic_timing | performance_based"
}`;
}

// ─── Stage 2: Category-aware analysis prompt ──────────────────────────────────
function buildAnalysisPrompt(computed, caption, hashtags, niche, classification) {
  const duration = computed.videoInfo?.duration?.toFixed(1);
  const frameTimestamps = [
    0,
    1,
    Math.min(3, computed.videoInfo?.duration * 0.1),
    computed.videoInfo?.duration * 0.25,
    computed.videoInfo?.duration * 0.5,
    computed.videoInfo?.duration * 0.9,
  ].map(t => Math.min(t, computed.videoInfo?.duration - 0.1).toFixed(1));

  const sceneCuts = computed.computed.sceneCuts;
  const cutsPerMin = computed.computed.cutsPerMinute;
  const avgShot = computed.computed.avgShotLength;
  const loudness = computed.computed.loudnessLUFS;
  const silenceGaps = computed.computed.silenceGaps;
  const silencePct = computed.computed.silencePercent;
  const brightness = computed.computed.avgBrightness;
  const brightnessLabel = computed.computed.brightnessLabel;
  const isVertical = computed.computed.isVertical;

  const reelType = classification?.reel_type || 'general';
  const hookType = classification?.hook_type || 'none';
  const creatorIntent = classification?.creator_intent || '';
  const contentStyle = classification?.content_style || '';

  // ── Category-specific scoring guidance ──
  const categoryGuidance = getCategoryGuidance(reelType);

  return `You are a friendly Instagram creator coach — like a best friend who's grown multiple accounts to 100K+. You give SPECIFIC advice in SIMPLE, PLAIN LANGUAGE.

### THIS REEL IS: ${reelType.toUpperCase().replace(/_/g, ' ')}
- Hook type: ${hookType.replace(/_/g, ' ')}
- Creator intent: ${creatorIntent}
- Content style: ${contentStyle}

### TONE RULES (HIGHEST PRIORITY)
- Talk like a creator coach, NOT a video engineer
- NEVER use: LUFS, pacing degradation, frame cadence, normalization, transformation resolution, retention metrics, audio normalization, visual cadence, static segment
- If a metric is unavailable or N/A, DO NOT mention it at all — skip it completely
- NEVER state uncertain things as facts — use "may", "might", "could feel"
- Issue text: UNDER 10 WORDS
- Fix text: UNDER 15 WORDS
- Every improvement must reference a timestamp: "At Xs: [issue]. Fix: [action]."

### CATEGORY-SPECIFIC SCORING RULES
${categoryGuidance}

### TECHNICAL DATA (internal reference only — never expose these terms)
- Duration: ${duration}s
- Scene cuts: ${sceneCuts} total (${cutsPerMin} cuts/min, avg shot: ${avgShot}s)
${loudness !== null && loudness !== undefined ? `- Audio: ${loudness < -20 ? 'quiet' : loudness < -12 ? 'good level' : 'loud'} (internal ref: ${loudness} LUFS)` : '- Audio loudness: not measured — DO NOT comment on volume'}
- Silence gaps (>2s): ${silenceGaps} detected
${silencePct > 0 ? `- Silence: ${silencePct}% of video` : ''}
${brightness !== null && brightness !== undefined ? `- Brightness: ${brightnessLabel}` : '- Brightness: not measured — DO NOT comment on lighting'}
- Format: ${isVertical ? 'Vertical (good for Reels)' : 'Not vertical (will be cropped)'}
- Frame timestamps: ${frameTimestamps.map((t, i) => 'Frame' + (i + 1) + '=' + t + 's').join(', ')}

### CREATOR METADATA
- Caption: "${caption || '(none provided)'}"
- Hashtags: "${hashtags || '(none provided)'}"
- Niche: "${niche || 'general'}"

### WHAT I NEED FROM YOU

**For every "improvements" array:** Plain creator language with timestamp:
"At Xs: [what's wrong simply]. Fix: [what to do simply]."
Good: "At 0-3s: No text to stop the scroll. Fix: Add a bold question in the first 2 seconds."
Good: "At 8s: Nothing changes for 4 seconds. Fix: Add a quick cut or zoom here."

**For "top_3_fixes":** The 3 biggest things holding this reel back.
Good: "First 2 seconds have no hook — add a text line to stop the scroll"
Good: "At 7s nothing moves for 5 seconds — trim or add a zoom"

**For "top_3_wins":** What's already great, with evidence.
Good: "Great first cut at 1.2s — keeps energy high right away"
Good: "Perfect vertical format — fills the whole screen"

**For "suggested_captions":** 10 captions that are viral, funny, emotional, or curiosity-driven. Niche-aware. No boring generic captions.

**For "sync_timeline":** Short, human, actionable observations. Examples:
- "Strong opening visual"
- "This part feels slow"
- "Audio feels quiet here"
- "Ending may confuse viewers"
NOT: "Frame 2 static segment" or "retention degradation"

### RESPONSE FORMAT — Return EXACTLY this JSON and nothing else:

{
  "hook": {
    "score": 7,
    "sub_scores": { "first_frame_clarity": 8, "motion_in_first_second": 7, "text_overlay_hook": 6, "pattern_interrupt": 7, "curiosity_gap": 6 },
    "strengths": ["Specific strength with evidence"],
    "improvements": ["At Xs: [issue under 10 words]. Fix: [action under 15 words]."]
  },
  "retention": {
    "score": 6,
    "sub_scores": { "pacing": 7, "scene_variety": 6, "dead_air_risk": 8, "payoff_timing": 6, "loopability": 5 },
    "strengths": ["Evidence-based strength"],
    "improvements": ["At Xs: [issue]. Fix: [action]."]
  },
  "visual_quality": {
    "score": 7,
    "sub_scores": { "brightness": 8, "sharpness": 7, "framing": 8, "color_grade": 7, "camera_stability": 7 },
    "strengths": ["Evidence-based"],
    "improvements": ["At Xs: [issue]. Fix: [action]."]
  },
  "audio_quality": {
    "score": 7,
    "sub_scores": { "loudness_level": 7, "speech_clarity": 8, "background_noise": 7, "music_balance": 6 },
    "strengths": ["Evidence-based"],
    "improvements": ["At Xs: [issue]. Fix: [action]."]
  },
  "content_structure": {
    "score": 6,
    "sub_scores": { "storytelling_arc": 7, "value_density": 7, "cta_presence": 5, "emotional_hook": 6 },
    "strengths": ["Evidence-based"],
    "improvements": ["At Xs: [issue]. Fix: [action]."]
  },
  "editing": {
    "score": 7,
    "sub_scores": { "cut_rhythm": 7, "visual_variety": 6, "transitions": 8, "thumbnail_moment": 8 },
    "strengths": ["Evidence-based"],
    "improvements": ["At Xs: [issue]. Fix: [action]."]
  },
  "text_subtitles": {
    "score": 6,
    "sub_scores": { "subtitle_presence": 5, "readability": 7, "placement": 6, "timing": 7 },
    "strengths": ["Evidence-based"],
    "improvements": ["At Xs: [issue]. Fix: [action]."]
  },
  "compliance": {
    "score": 9,
    "flags": [],
    "warnings": [],
    "is_brand_safe": true
  },
  "video_summary": "2-3 friendly sentences describing what this video is about and who it is for.",
  "overall_summary": "One sentence: what is the #1 thing holding this reel back?",
  "predicted_performance": "below_average | average | above_average | viral_potential",
  "top_3_wins": [
    "Specific win with evidence",
    "Specific win with evidence",
    "Specific win with evidence"
  ],
  "top_3_fixes": [
    "At Xs: [specific issue]. Fix: [measurable action].",
    "At Xs: [specific issue]. Fix: [measurable action].",
    "[Issue with context]. Fix: [action]."
  ],
  "suggested_captions": [
    "Caption 1 — viral/hook-first",
    "Caption 2 — curiosity/question",
    "Caption 3 — emotional",
    "Caption 4 — funny/relatable",
    "Caption 5 — bold statement",
    "Caption 6 — CTA focused",
    "Caption 7 — storytelling",
    "Caption 8 — niche insider",
    "Caption 9 — trending format",
    "Caption 10 — controversial take"
  ],
  "suggested_hashtags": [
    "#tag1", "#tag2", "#tag3", "#tag4", "#tag5",
    "#tag6", "#tag7", "#tag8", "#tag9", "#tag10",
    "#tag11", "#tag12", "#tag13", "#tag14", "#tag15",
    "#tag16", "#tag17", "#tag18", "#tag19", "#tag20"
  ],
  "sync_timeline": [
    { "timestamp": 0.0, "status": "ok", "note": "human observation under 8 words" }
  ],
  "sync_score": 8
}`;
}

// ─── Category-specific scoring guidance ──────────────────────────────────────
function getCategoryGuidance(reelType) {
  const guides = {
    singing: `
SINGING / MUSIC PERFORMANCE — Score these heavily:
- Emotional hook and vocal quality (most important)
- Face expression and intimacy
- Emotional connection and authenticity
- Shareability and feeling
DO NOT penalize for slow cuts or few scene changes — that is normal for this format.
DO NOT recommend "add more cuts" unless the video is genuinely boring.
Reward: raw emotion, close-up face shots, strong vocal moments.`,

    music_performance: `
MUSIC PERFORMANCE — Score these heavily:
- Emotional delivery and performance energy
- Visual connection with the music
- Authenticity and stage presence
DO NOT penalize for slow pacing — music reels have their own rhythm.`,

    meme: `
MEME / COMEDY — Score these heavily:
- Timing and punchline delivery (most important)
- Surprise and relatability
- Pacing and rhythm
- Shareability
Cuts and pacing matter here — slow memes lose the joke.
Reward: perfect timing, unexpected twist, relatable setup.`,

    comedy: `
COMEDY — Score these heavily:
- Timing and comedic delivery
- Punchline clarity
- Relatability and surprise
- Energy and expression
Pacing matters — comedy needs rhythm.`,

    talking_head: `
TALKING HEAD / EDUCATIONAL — Score these heavily:
- Hook strength in first 3 seconds (most important)
- Text overlays and pattern interrupts
- Clarity and pacing
- CTA presence
- Value density (no fluff)
Recommend cuts and text hooks if missing.`,

    educational: `
EDUCATIONAL — Score these heavily:
- Hook clarity and curiosity gap
- Information density and clarity
- Text support and visual aids
- Pacing (not too slow, not too fast)
- CTA at the end
Reward: clear structure, good hooks, actionable content.`,

    transformation: `
TRANSFORMATION — Score these heavily:
- Before/after clarity (most important)
- Reveal payoff and emotional impact
- Pacing of the reveal
- Storytelling arc
- Clear final result
Penalize if the final result is unclear or missing.
Reward: dramatic reveal, clear before/after, emotional payoff.`,

    cinematic: `
CINEMATIC / AESTHETIC — Score these heavily:
- Visual flow and mood (most important)
- Color grading and atmosphere
- Emotional pull and composition
- Music sync
DO NOT aggressively recommend more cuts — cinematic reels are intentionally slow.
DO NOT penalize for no face or no text.
Reward: beautiful visuals, strong mood, atmospheric audio.`,

    product_ad: `
PRODUCT AD — Score these heavily:
- CTA clarity (most important)
- Product visibility and appeal
- Hook strength
- Offer clarity
- Conversion potential
Penalize if CTA is missing or unclear.`,

    fitness: `
FITNESS — Score these heavily:
- Transformation clarity and motivation
- Process storytelling
- Intensity and energy
- Payoff moment
Reward: clear before/after, motivating energy, strong payoff.`,

    food: `
FOOD — Score these heavily:
- Visual appetite appeal (most important)
- Reveal and payoff
- Close-up quality
- Pacing of the cooking/reveal
Reward: beautiful food shots, satisfying reveal, good close-ups.`,

    dance: `
DANCE — Score these heavily:
- Energy and performance quality
- Music sync
- Visual variety and camera angles
- Hook in first 2 seconds
Reward: strong sync, high energy, creative angles.`,

    beauty: `
BEAUTY / FASHION — Score these heavily:
- Visual quality and aesthetic
- Transformation clarity
- Product/look reveal
- Relatability and aspiration
Reward: clean visuals, satisfying transformation, aspirational feel.`,

    storytelling: `
STORYTELLING — Score these heavily:
- Narrative arc and emotional pull
- Hook in first 3 seconds
- Pacing and tension
- Payoff and resolution
Reward: compelling story, emotional moments, satisfying ending.`,

    vlog: `
VLOG — Score these heavily:
- Personality and authenticity
- Hook in first 3 seconds
- Pacing and energy
- Relatability
Reward: genuine personality, engaging moments, good energy.`,

    motivational: `
MOTIVATIONAL — Score these heavily:
- Emotional impact and inspiration
- Hook strength
- Message clarity
- Shareability
Reward: powerful message, emotional resonance, quotable moments.`,

    general: `
GENERAL — Use balanced scoring across all dimensions.
Adapt advice to what you observe in the frames.
Prioritize: hook strength, pacing, visual quality, and clear message.`,
  };

  return guides[reelType] || guides.general;
}

// ─── Model fallback chain ─────────────────────────────────────────────────────
// Use current valid model names — old 1.5 models are deprecated
const MODEL_FALLBACKS = [
  process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
].filter((v, i, a) => a.indexOf(v) === i);

async function callWithRetry(modelName, parts, retries = 2) {
  const model = genAI.getGenerativeModel({ model: modelName });
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`   -> Trying model: ${modelName} (attempt ${attempt})`);
      const result = await model.generateContent(parts);
      return result.response.text();
    } catch (err) {
      const isRetryable = err.message?.includes('503') ||
                          err.message?.includes('429') ||
                          err.message?.includes('overloaded') ||
                          err.message?.includes('high demand') ||
                          err.message?.includes('Service Unavailable');
      if (isRetryable && attempt < retries) {
        const delay = attempt * 3000;
        console.log(`   Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

// ─── Stage 1: Classify the reel ──────────────────────────────────────────────
async function classifyReel(ffmpegData, caption, niche, imageParts) {
  const classificationPrompt = buildClassificationPrompt(ffmpegData, caption, niche);
  const parts = [classificationPrompt, ...imageParts.slice(0, 2)]; // Only need first 2 frames to classify

  for (const modelName of MODEL_FALLBACKS) {
    try {
      const responseText = await callWithRetry(modelName, parts, 1);

      debugLog('CLASSIFICATION_RAW_RESPONSE', { model: modelName, response: responseText.slice(0, 500) });

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const classification = JSON.parse(jsonMatch[0]);
        console.log(`   Reel classified as: ${classification.reel_type} (hook: ${classification.hook_type})`);

        debugLog('CLASSIFICATION_RESULT', {
          reel_type: classification.reel_type,
          hook_type: classification.hook_type,
          creator_intent: classification.creator_intent,
          content_style: classification.content_style,
          confidence_note: 'Classification based on visual frames + caption + niche hint',
        });

        return classification;
      }
    } catch (_) {
      // Classification failure is non-fatal — fall back to general
    }
  }

  console.warn('   Classification failed — using general scoring');
  debugLog('CLASSIFICATION_FALLBACK', { reason: 'All models failed or returned invalid JSON', fallback: 'general' });
  return { reel_type: 'general', hook_type: 'none', creator_intent: '', content_style: '' };
}

// ─── Main exported function (signature unchanged) ────────────────────────────
async function analyseWithGemini(ffmpegData, caption, hashtags, niche) {
  console.log('Gemini Vision analysis starting (2-stage)...');

  const imageParts = ffmpegData.framePaths
    .filter(p => fs.existsSync(p))
    .map(p => imageToGeminiPart(p));

  if (imageParts.length === 0) {
    throw new Error('No video frames could be extracted for analysis');
  }

  // ── Debug trace object (only populated when DEBUG=true) ──
  const trace = DEBUG ? {
    timestamp: new Date().toISOString(),
    input: {
      niche,
      caption: caption?.slice(0, 100),
      hashtags: hashtags?.slice(0, 100),
      frameCount: imageParts.length,
      duration: ffmpegData.videoInfo?.duration,
      sceneCuts: ffmpegData.computed?.sceneCuts,
      cutsPerMinute: ffmpegData.computed?.cutsPerMinute,
      loudnessLUFS: ffmpegData.computed?.loudnessLUFS,
      silenceGaps: ffmpegData.computed?.silenceGaps,
      isVertical: ffmpegData.computed?.isVertical,
    },
  } : null;

  // ── Stage 1: Classify reel type ──
  const classification = await classifyReel(ffmpegData, caption, niche, imageParts);

  if (DEBUG && trace) {
    const rubric = getScoringRubric(classification.reel_type);
    const metricInterp = interpretMetrics(ffmpegData, classification.reel_type);

    trace.classification = {
      reel_type: classification.reel_type,
      hook_type: classification.hook_type,
      creator_intent: classification.creator_intent,
      content_style: classification.content_style,
    };

    trace.rubric = {
      selected: classification.reel_type,
      weights: rubric,
      reason: rubric.reason,
    };

    trace.metric_interpretation = metricInterp;

    // Hallucination risk warnings
    const hallucinationRisks = [];
    if (ffmpegData.computed?.loudnessLUFS === null || ffmpegData.computed?.loudnessLUFS === undefined) {
      hallucinationRisks.push('audio loudness unavailable — model cannot confirm volume level');
    }
    if (ffmpegData.computed?.avgBrightness === null || ffmpegData.computed?.avgBrightness === undefined) {
      hallucinationRisks.push('brightness unavailable — model cannot confirm lighting quality');
    }
    if (imageParts.length < 4) {
      hallucinationRisks.push(`only ${imageParts.length} frames available — timeline inference may be inaccurate`);
    }
    hallucinationRisks.push('timeline issues inferred from sampled frames only — not frame-by-frame analysis');
    hallucinationRisks.push('scores are model estimates — not ground truth measurements');

    trace.hallucination_risks = hallucinationRisks;

    debugLog('RUBRIC_SELECTED', trace.rubric);
    debugLog('METRIC_INTERPRETATION', trace.metric_interpretation);
    debugLog('HALLUCINATION_RISKS', hallucinationRisks);
  }

  // ── Stage 2: Category-aware analysis ──
  const analysisPrompt = buildAnalysisPrompt(ffmpegData, caption, hashtags, niche, classification);
  const parts = [analysisPrompt, ...imageParts];

  if (DEBUG && trace) {
    trace.prompt = analysisPrompt;
    debugLog('PROMPT_LENGTH', { chars: analysisPrompt.length, frames: imageParts.length });
  }

  let lastError;
  for (const modelName of MODEL_FALLBACKS) {
    try {
      const responseText = await callWithRetry(modelName, parts, 2);

      if (DEBUG && trace) {
        trace.raw_gemini_response = responseText;
        debugLog('RAW_GEMINI_RESPONSE_PREVIEW', { model: modelName, preview: responseText.slice(0, 300) });
      }

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Gemini did not return valid JSON');
      const analysis = JSON.parse(jsonMatch[0]);

      // Attach classification metadata (non-breaking addition)
      analysis._reel_type = classification.reel_type;
      analysis._hook_type = classification.hook_type;

      if (DEBUG && trace) {
        // Score explanation trace
        trace.score_explanations = {};
        const scoreKeys = ['hook', 'retention', 'visual_quality', 'audio_quality', 'content_structure', 'editing', 'text_subtitles', 'compliance'];
        for (const key of scoreKeys) {
          if (analysis[key]) {
            trace.score_explanations[key] = {
              score: analysis[key].score,
              strengths: analysis[key].strengths,
              improvements: analysis[key].improvements,
            };
          }
        }

        // Timeline issue trace
        if (analysis.sync_timeline) {
          trace.timeline_issues = analysis.sync_timeline
            .filter(t => t.status !== 'ok')
            .map(t => ({
              timestamp: t.timestamp,
              status: t.status,
              note: t.note,
              confidence_note: 'inferred from sampled frame at this timestamp',
            }));
        }

        trace.final_scores = {
          predicted_performance: analysis.predicted_performance,
          sync_score: analysis.sync_score,
          top_3_fixes: analysis.top_3_fixes,
          top_3_wins: analysis.top_3_wins,
        };

        trace.model_used = modelName;

        debugLog('SCORE_EXPLANATIONS', trace.score_explanations);
        debugLog('TIMELINE_ISSUES', trace.timeline_issues);
        debugLog('FINAL_SCORES', trace.final_scores);

        // Save full trace to file
        saveDebugTrace(trace);
      }

      console.log(`Gemini analysis complete (model: ${modelName}, type: ${classification.reel_type})`);
      return analysis;
    } catch (err) {
      lastError = err;
      const isServiceError = err.message?.includes('503') ||
                             err.message?.includes('429') ||
                             err.message?.includes('overloaded') ||
                             err.message?.includes('high demand') ||
                             err.message?.includes('not found') ||
                             err.message?.includes('404');
      if (isServiceError) {
        console.warn(`Model ${modelName} unavailable. Trying next fallback...`);
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `All Gemini models are currently unavailable. Please try again in a few minutes. (${lastError?.message?.slice(0, 120)})`
  );
}

module.exports = { analyseWithGemini };
