const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
const MODEL_FALLBACKS = [
  process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
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
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const classification = JSON.parse(jsonMatch[0]);
        console.log(`   Reel classified as: ${classification.reel_type} (hook: ${classification.hook_type})`);
        return classification;
      }
    } catch (_) {
      // Classification failure is non-fatal — fall back to general
    }
  }

  console.warn('   Classification failed — using general scoring');
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

  // ── Stage 1: Classify reel type ──
  const classification = await classifyReel(ffmpegData, caption, niche, imageParts);

  // ── Stage 2: Category-aware analysis ──
  const analysisPrompt = buildAnalysisPrompt(ffmpegData, caption, hashtags, niche, classification);
  const parts = [analysisPrompt, ...imageParts];

  let lastError;
  for (const modelName of MODEL_FALLBACKS) {
    try {
      const responseText = await callWithRetry(modelName, parts, 2);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Gemini did not return valid JSON');
      const analysis = JSON.parse(jsonMatch[0]);

      // Attach classification metadata (non-breaking addition)
      analysis._reel_type = classification.reel_type;
      analysis._hook_type = classification.hook_type;

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
