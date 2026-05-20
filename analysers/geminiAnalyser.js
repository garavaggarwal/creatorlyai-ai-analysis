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

// ─── Stage 1: Reel type classification ───────────────────────────────────────
function buildClassificationPrompt(computed, caption, niche) {
  const duration = computed.videoInfo?.duration?.toFixed(1);
  const sceneCuts = computed.computed.sceneCuts;
  const isVertical = computed.computed.isVertical;

  return `You are an Instagram Reels expert. Look at these video frames and classify this reel.

VIDEO DATA:
- Duration: ${duration}s
- Scene cuts: ${sceneCuts}
- Format: ${isVertical ? 'Vertical' : 'Horizontal'}
- Niche hint: "${niche || 'general'}"
- Caption: "${caption || '(none)'}"

IMPORTANT: The LAST frame(s) may contain a punchline, meme face, or comedic reveal that defines the reel type. A reel that shows a "before" and ends with a funny/meme face is a COMEDY reel, not a transformation reel. Look at ALL frames before classifying.

Return ONLY this JSON:
{
  "reel_type": "one of: singing | music_performance | talking_head | educational | meme | comedy | transformation | storytelling | vlog | cinematic | product_ad | beauty | fashion | fitness | food | dance | motivational | lip_sync | reaction | faceless_text | general",
  "hook_type": "one of: voice_hook | visual_hook | text_hook | shock_hook | curiosity_hook | story_hook | transformation_hook | music_hook | none",
  "creator_intent": "one short sentence",
  "content_style": "one of: raw_authentic | polished_edited | aesthetic_cinematic | fast_paced | slow_emotional | educational_clear | comedic_timing | performance_based"
}`;
}

// ─── Stage 2: Master analysis prompt ─────────────────────────────────────────
function buildAnalysisPrompt(computed, caption, hashtags, niche, classification) {
  const duration = computed.videoInfo?.duration?.toFixed(1);
  const sceneCuts = computed.computed.sceneCuts;
  const cutsPerMin = computed.computed.cutsPerMinute;
  const avgShot = computed.computed.avgShotLength;
  const loudness = computed.computed.loudnessLUFS;
  const silenceGaps = computed.computed.silenceGaps;
  const brightness = computed.computed.avgBrightness;
  const brightnessLabel = computed.computed.brightnessLabel;
  const isVertical = computed.computed.isVertical;

  const reelType = classification?.reel_type || 'general';
  const hookType = classification?.hook_type || 'none';
  const creatorIntent = classification?.creator_intent || '';

  // Build frame timestamp list from the actually extracted frames
  const frameTimestamps = (computed.frameTimestamps || []).map(t => t.toFixed(1));

  // Human-readable audio description
  let audioDesc = 'not measured';
  if (loudness !== null && loudness !== undefined) {
    if (loudness < -20) audioDesc = 'too quiet — hard to hear without headphones';
    else if (loudness < -12) audioDesc = 'good listening level';
    else audioDesc = 'loud — may distort on some devices';
  }

  const nicheGuidance = getNicheRules(reelType);

  return `You are an expert Instagram Reels analyst and creator coach. A creator has submitted their reel for a full analysis. Your job is to give them the kind of honest, specific, actionable feedback that a top creator coach would give — not generic advice, but real observations tied to what you can actually see in these frames.

REEL CONTEXT:
- Type: ${reelType.replace(/_/g, ' ')} (hook style: ${hookType.replace(/_/g, ' ')})
- Creator's intent: ${creatorIntent || 'not specified'}
- Niche: ${niche || 'general'}
- Caption: "${caption || 'none provided'}"
- Hashtags: "${hashtags || 'none provided'}"

TECHNICAL SNAPSHOT (translate these into creator-friendly language — never use jargon like LUFS, frame cadence, or normalization):
- Duration: ${duration}s
- Cuts: ${sceneCuts} scene cuts total, averaging ${cutsPerMin} cuts/min with ~${avgShot}s per shot
- Audio: ${audioDesc}
- Silence gaps longer than 2s: ${silenceGaps}
${brightness !== null && brightness !== undefined ? `- Lighting: ${brightnessLabel}` : ''}
- Orientation: ${isVertical ? 'Vertical (correct for Reels)' : 'NOT vertical — will be cropped or letterboxed on Instagram'}

FRAMES PROVIDED (you have screenshots at these timestamps — reference them specifically):
${frameTimestamps.join('s, ')}s

SCORING FOCUS FOR THIS REEL TYPE:
${nicheGuidance}

─────────────────────────────────────────────────────────────────
HOW TO WRITE YOUR ANALYSIS:

Think of yourself as a creator coach reviewing this reel with the creator sitting next to you. Be specific about what you see. Reference actual timestamps. Tell them exactly what's working and exactly what to fix.

For EVERY score category:
- strengths[0]: Write exactly 1 complete sentence (8–12 words) describing something specific that is genuinely working. Reference what you see in the frames. Make it feel like real feedback.
- improvements[0]: Write exactly 1 complete sentence (8–12 words) describing the most important thing to fix. Include a timestamp where relevant.

IMPORTANT: Both strengths[0] and improvements[0] MUST be complete sentences that end with a period. Never truncate mid-sentence.

For top_3_fixes: 3 highest-impact changes. Each fix should be 2–3 sentences. Name the timestamp, describe what's wrong, give a concrete action.

For top_3_wins: 3 things the creator should be proud of. Be specific and genuine.

For why_viral: If this reel has real viral potential, explain exactly why in 2 complete sentences. If not, leave as empty string.

For why_rework: In 2 complete sentences, explain the core reason this reel needs work.

For short_description: 1–2 sentences describing what this reel is actually about.

For sync_timeline: Go through each timestamp. Mark each as: ok / slow / audio_issue / text_issue / visual_issue / hook / ending. Note should be plain language, under 6 words.

For suggested_captions: 5 real captions this creator could actually use — hook-first, specific to their content.

For suggested_hashtags: 10 hashtags relevant to this specific reel and niche.

─────────────────────────────────────────────────────────────────
Return ONLY valid JSON. No markdown fences, no explanation outside the JSON.

{
  "niche": "detected niche in 1-2 words",
  "short_description": "1-2 sentences describing what this reel is actually about",
  "why_viral": "2 complete sentences explaining viral potential, or empty string if none",
  "why_rework": "2 complete sentences explaining the core issue holding this reel back",
  "hook": {
    "score": 7.5,
    "sub_scores": { "first_frame_clarity": 8, "motion_in_first_second": 7, "text_overlay_hook": 6, "pattern_interrupt": 7, "curiosity_gap": 6 },
    "strengths": ["One complete sentence of 8-12 words about what is working in the hook."],
    "improvements": ["One complete sentence of 8-12 words about the most important hook fix, with a timestamp."]
  },
  "retention": {
    "score": 6.5,
    "sub_scores": { "pacing": 7, "scene_variety": 6, "dead_air_risk": 8, "payoff_timing": 6, "loopability": 5 },
    "strengths": ["One complete sentence of 8-12 words about what keeps viewers watching."],
    "improvements": ["One complete sentence of 8-12 words about the biggest retention risk, with a timestamp."]
  },
  "visual_quality": {
    "score": 7.0,
    "sub_scores": { "brightness": 8, "sharpness": 7, "framing": 8, "color_grade": 7, "camera_stability": 7 },
    "strengths": ["One complete sentence of 8-12 words about the strongest visual element."],
    "improvements": ["One complete sentence of 8-12 words about the most important visual fix."]
  },
  "audio_quality": {
    "score": 7.0,
    "sub_scores": { "loudness_level": 7, "speech_clarity": 8, "background_noise": 7, "music_balance": 6 },
    "strengths": ["One complete sentence of 8-12 words about what is working with the audio."],
    "improvements": ["One complete sentence of 8-12 words about the most important audio fix."]
  },
  "content_structure": {
    "score": 6.5,
    "sub_scores": { "storytelling_arc": 7, "value_density": 7, "cta_presence": 5, "emotional_hook": 6 },
    "strengths": ["One complete sentence of 8-12 words about the strongest structural element."],
    "improvements": ["One complete sentence of 8-12 words about the most important structural fix."]
  },
  "editing": {
    "score": 7.0,
    "sub_scores": { "cut_rhythm": 7, "visual_variety": 6, "transitions": 8, "thumbnail_moment": 8 },
    "strengths": ["One complete sentence of 8-12 words about the strongest editing choice."],
    "improvements": ["One complete sentence of 8-12 words about the most important editing fix, with a timestamp."]
  },
  "text_subtitles": {
    "score": 6.0,
    "sub_scores": { "subtitle_presence": 5, "readability": 7, "placement": 6, "timing": 7 },
    "strengths": ["One complete sentence of 8-12 words about what is working with text or subtitles."],
    "improvements": ["One complete sentence of 8-12 words about the most important text fix."]
  },
  "compliance": {
    "score": 9,
    "flags": [],
    "warnings": [],
    "is_brand_safe": true
  },
  "video_summary": "2-3 friendly sentences about what this video is, what works, and who it is for.",
  "overall_summary": "One punchy sentence capturing the single most important thing about this reel.",
  "predicted_performance": "below_average | average | above_average | viral_potential",
  "top_3_wins": [
    "Specific win with evidence from the frames and why it matters for this reel.",
    "Specific win with evidence from the frames and why it matters for this reel.",
    "Specific win with evidence from the frames and why it matters for this reel."
  ],
  "top_3_fixes": [
    "2-3 sentences: name the timestamp, describe what is wrong, give a concrete action.",
    "2-3 sentences: name the timestamp, describe what is wrong, give a concrete action.",
    "2-3 sentences: describe the issue and give a concrete action the creator can take."
  ],
  "suggested_captions": [
    "Real caption option 1 — hook-first, specific to this content",
    "Real caption option 2 — emotional or relatable angle",
    "Real caption option 3 — bold statement or provocative question",
    "Real caption option 4 — CTA or niche-specific value",
    "Real caption option 5 — trending format or humour"
  ],
  "suggested_hashtags": [
    "#tag1", "#tag2", "#tag3", "#tag4", "#tag5",
    "#tag6", "#tag7", "#tag8", "#tag9", "#tag10"
  ],
  "sync_timeline": [
    { "timestamp": 0.0, "status": "hook", "note": "opening frame" }
  ],
  "sync_score": 8
}`;
}

// ─── Niche-specific scoring rules ────────────────────────────────────────────
function getNicheRules(reelType) {
  const rules = {
    singing: 'SINGING: Prioritize emotion, vocal quality, face expression. DO NOT penalize slow cuts — slow cuts are intentional in performance content.',
    music_performance: 'MUSIC PERFORMANCE: Prioritize emotional delivery, performance energy, authenticity. Camera angles and lighting matter more than pacing.',
    meme: 'MEME: Timing and punchline are everything. Slow memes fail. Reward surprise, relatability, and the moment the joke lands.',
    comedy: 'COMEDY: Timing, delivery, punchline clarity. Pacing matters — dead air kills comedy. Reward genuine laughs.',
    talking_head: 'TALKING HEAD: Hook in first 3s is critical. Look for text overlays, pattern interrupts, eye contact, and a clear CTA.',
    educational: 'EDUCATIONAL: Hook, clarity, value density, CTA. Reward actionable content that teaches something specific.',
    transformation: 'TRANSFORMATION: Before/after clarity is #1. Penalize if the final result is unclear or the reveal is weak.',
    cinematic: 'CINEMATIC: Visual mood and atmosphere are primary. DO NOT penalize slow pace — reward intentional composition and colour.',
    product_ad: 'PRODUCT AD: CTA clarity is #1. Product visibility, offer strength, and trust signals matter most.',
    fitness: 'FITNESS: Transformation arc, motivation, intensity, and a satisfying payoff. Energy is everything.',
    food: 'FOOD: Visual appetite appeal, satisfying reveal, close-up quality. If it does not look delicious, it fails.',
    dance: 'DANCE: Energy, music sync, creative angles, hook in first 2s. Reward originality and clean execution.',
    beauty: 'BEAUTY/FASHION: Aesthetic, transformation quality, aspirational feel. Lighting and colour grade are critical.',
    fashion: 'BEAUTY/FASHION: Aesthetic, transformation quality, aspirational feel. Lighting and colour grade are critical.',
    storytelling: 'STORYTELLING: Narrative arc, emotional pull, satisfying payoff. Reward vulnerability and genuine moments.',
    vlog: 'VLOG: Personality, authenticity, hook, energy. Reward genuine moments over polished production.',
    motivational: 'MOTIVATIONAL: Emotional impact, message clarity, shareability. Does it make you feel something?',
    lip_sync: 'LIPSYNC: Sync accuracy, expression, energy. Reward creativity in how the creator interprets the audio.',
    reaction: 'REACTION: Genuine reaction, timing, build-up. Reward authentic emotion over performed reactions.',
    faceless_text: 'FACELESS TEXT: Text clarity, pacing, hook line, value density. Every second of text must earn its place.',
    general: 'GENERAL: Balanced scoring across all dimensions. Prioritize hook strength, pacing, visual quality, and a clear message.',
  };
  return rules[reelType] || rules.general;
}

// ─── Model fallback chain ─────────────────────────────────────────────────────
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
  const parts = [classificationPrompt, ...imageParts.slice(0, 2)];

  for (const modelName of MODEL_FALLBACKS) {
    try {
      const responseText = await callWithRetry(modelName, parts, 1);
      debugLog('CLASSIFICATION_RAW', { model: modelName, response: responseText.slice(0, 300) });
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const classification = JSON.parse(jsonMatch[0]);
        console.log(`   Reel classified as: ${classification.reel_type} (hook: ${classification.hook_type})`);
        debugLog('CLASSIFICATION_RESULT', classification);
        return classification;
      }
    } catch (_) {}
  }

  console.warn('   Classification failed — using general');
  return { reel_type: 'general', hook_type: 'none', creator_intent: '', content_style: '' };
}

// ─── Main exported function ───────────────────────────────────────────────────
async function analyseWithGemini(ffmpegData, caption, hashtags, niche) {
  console.log('Gemini Vision analysis starting (2-stage)...');

  const imageParts = ffmpegData.framePaths
    .filter(p => fs.existsSync(p))
    .map(p => imageToGeminiPart(p));

  if (imageParts.length === 0) {
    throw new Error('No video frames could be extracted for analysis');
  }

  const trace = DEBUG ? { timestamp: new Date().toISOString(), frameCount: imageParts.length } : null;

  // Stage 1: Classify
  const classification = await classifyReel(ffmpegData, caption, niche, imageParts);
  if (trace) trace.classification = classification;

  // Stage 2: Analyse
  const analysisPrompt = buildAnalysisPrompt(ffmpegData, caption, hashtags, niche, classification);
  const parts = [analysisPrompt, ...imageParts];

  if (trace) trace.prompt = analysisPrompt;

  let lastError;
  for (const modelName of MODEL_FALLBACKS) {
    try {
      const responseText = await callWithRetry(modelName, parts, 2);

      if (trace) trace.raw_gemini_response = responseText;
      debugLog('RAW_RESPONSE_PREVIEW', { model: modelName, preview: responseText.slice(0, 400) });

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Gemini did not return valid JSON');
      const analysis = JSON.parse(jsonMatch[0]);

      analysis._reel_type = classification.reel_type;
      analysis._hook_type = classification.hook_type;

      if (trace) {
        trace.model_used = modelName;
        trace.final_scores = { predicted_performance: analysis.predicted_performance, sync_score: analysis.sync_score };
        saveDebugTrace(trace);
      }

      console.log(`Gemini analysis complete (model: ${modelName}, type: ${classification.reel_type})`);
      return analysis;
    } catch (err) {
      lastError = err;
      const isServiceError = err.message?.includes('503') ||
                             err.message?.includes('429') ||
                             err.message?.includes('overloaded') ||
                             err.message?.includes('not found') ||
                             err.message?.includes('404');
      if (isServiceError) {
        console.warn(`Model ${modelName} unavailable. Trying next...`);
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
