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

function buildVideoPrompt(computed, caption, hashtags, niche) {
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
  const aspectRatio = computed.computed.aspectRatio;

  return `You are a friendly Instagram creator coach — like a best friend who's grown multiple accounts to 100K+. You give SPECIFIC advice but in SIMPLE, PLAIN LANGUAGE that any creator can understand.

### TONE RULES (HIGHEST PRIORITY — FOLLOW THESE EXACTLY)
- Talk like an Instagram growth coach, NOT a video engineer
- NEVER use technical terms: no "LUFS", "pacing degradation", "frame cadence", "normalization", "transformation resolution", "retention metrics", "audio normalization", "visual cadence"
- If a metric is unavailable or N/A, DO NOT mention it at all. Skip it completely.
- NEVER state uncertain interpretations as facts. If unsure, soften: "may feel disconnected" not "completely unrelated"
- Keep issue descriptions UNDER 10 WORDS
- Keep fix suggestions UNDER 15 WORDS
- Every sentence should sound like a DM from a creator friend, not a report

**WORD LENGTH EXAMPLES:**
- BAD: "Audio at N/A LUFS is unmeasured, risking low volume" → GOOD: (skip — don't mention if unavailable)
- BAD: "Completely unrelated visual disrupts narrative" → GOOD: "Ending may feel disconnected"
- BAD: "Static segment reduces retention metrics" → GOOD: "This part feels slow — people may skip"
- BAD: "Boost overall audio to -14 LUFS for optimal mobile playback" → GOOD: "Make your audio louder"
- BAD: "The transformation resolution is incomplete" → GOOD: "Show the final result at the end"

### CRITICAL RULES
1. **BE SPECIFIC.** Reference timestamps: "At 3s, nothing happens for 4 seconds — add a cut here."
2. **USE NUMBERS SIMPLY.** "Only 2 cuts in 17 seconds — ${niche || 'General'} reels usually have 6-10 cuts."
3. **NICHE-AWARE.** The niche is "${niche || 'General'}". Adapt advice to this niche.
4. **NO GENERIC ADVICE.** Don't say "improve your hook" — say exactly what's wrong and how to fix it.
5. **SKIP UNAVAILABLE DATA.** If audio data is N/A or brightness is unknown, do NOT comment on it.
   - Nature/Aesthetic/Cinematic: grade on visual flow, color, atmosphere. Don't penalize for no face/text.
   - Comedy/Meme: grade on timing, punchline delivery, relatability.
   - Educational/Talking Head: grade on pattern interrupts, text hooks, pacing.
   - Fitness/Food: grade on transformation clarity, before/after, process shots.

### TECHNICAL DATA (for your reference only — DO NOT expose these terms to the creator)
- Duration: ${duration}s
- Scene cuts: ${sceneCuts} total (${cutsPerMin} cuts/min, avg shot: ${avgShot}s)
${loudness !== null && loudness !== undefined ? `- Audio loudness: ${loudness} LUFS (if below -20, audio is too quiet)` : '- Audio loudness: not measured (DO NOT comment on audio volume)'}
- Silence gaps (>2s): ${silenceGaps} detected
${silencePct > 0 ? `- Silence: ${silencePct}% of video` : ''}
${brightness !== null && brightness !== undefined ? `- Brightness: ${brightnessLabel}` : '- Brightness: not measured (DO NOT comment on lighting)'}
- Format: ${isVertical ? 'Vertical (good for Reels)' : 'Not vertical (will be cropped)'}
- Frame timestamps: ${frameTimestamps.map((t, i) => 'Frame' + (i+1) + '=' + t + 's').join(', ')}

### CREATOR METADATA
- Caption: "${caption || '(none provided)'}"
- Hashtags: "${hashtags || '(none provided)'}"

### WHAT I NEED FROM YOU

**For every "improvements" array:** Each item MUST be in plain creator language with a timestamp:
"At [X]s: [what's wrong in simple words]. Fix: [what to do, simply]."
Example: "At 0-3s: There's no text on screen to hook people. Fix: Add a bold 3-word question in the first 1.5 seconds."
Example: "At 8s: Nothing happens for 4 seconds — people will scroll. Fix: Add a quick zoom or cut here."
Example: "At 5s: The audio is way too quiet. Fix: Make it louder so people hear it while scrolling."

**For "top_3_fixes":** The 3 biggest things holding this reel back, in plain language.
Example: "First 2 seconds have no text — add a hook line so people stop scrolling"
Example: "Your audio is too quiet — make it louder so it grabs attention on the feed"
Example: "At 7s nothing moves for 5 seconds — add a cut or zoom to keep energy up"

**For "top_3_wins":** What's already great about this reel, in encouraging language.
Example: "Great first cut at 1.2s — keeps the energy high right away"
Example: "Perfect vertical format — fills the whole screen on Reels"
Example: "The lighting looks clean and professional"

### SYNC TIMELINE
Analyse each frame and determine if visual/audio/text are aligned at that moment.

### RESPONSE FORMAT — Return EXACTLY this JSON and nothing else:

{
  "hook": {
    "score": 7,
    "sub_scores": { "first_frame_clarity": 8, "motion_in_first_second": 7, "text_overlay_hook": 6, "pattern_interrupt": 7, "curiosity_gap": 6 },
    "strengths": ["Timestamp-specific strength with evidence"],
    "improvements": ["At Xs: [issue]. Fix: [specific action with numbers]."]
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
  "video_summary": "2-3 sentence friendly description of what this video is about and who it is for.",
  "overall_summary": "One sentence: what is the #1 thing holding this reel back from going viral?",
  "predicted_performance": "below_average | average | above_average | viral_potential",
  "top_3_wins": [
    "Evidence-based win with timestamp or number",
    "Evidence-based win with timestamp or number",
    "Evidence-based win with timestamp or number"
  ],
  "top_3_fixes": [
    "At [X]s: [specific issue]. Fix: [measurable action].",
    "At [X]s: [specific issue]. Fix: [measurable action].",
    "[Technical issue with number]. Fix: [measurable action]."
  ],
  "suggested_captions": [
    "Caption 1 — hook-first, max 15 words",
    "Caption 2 — question style",
    "Caption 3 — bold statement",
    "Caption 4 — CTA focused",
    "Caption 5 — relatable/funny",
    "Caption 6 — storytelling",
    "Caption 7 — niche insider language",
    "Caption 8 — trending format",
    "Caption 9 — emotional angle",
    "Caption 10 — controversial take"
  ],
  "suggested_hashtags": [
    "#tag1", "#tag2", "#tag3", "#tag4", "#tag5",
    "#tag6", "#tag7", "#tag8", "#tag9", "#tag10",
    "#tag11", "#tag12", "#tag13", "#tag14", "#tag15",
    "#tag16", "#tag17", "#tag18", "#tag19", "#tag20"
  ],
  "sync_timeline": [
    { "timestamp": 0.0, "status": "ok", "note": "specific observation max 8 words" }
  ],
  "sync_score": 8
}`;
}

// ─── Analyse video frames with Gemini ────────────────────────────────────────
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
        console.log(`   Retrying in ${delay/1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

async function analyseWithGemini(ffmpegData, caption, hashtags, niche) {
  console.log('Gemini Vision analysis starting...');

  const imageParts = ffmpegData.framePaths
    .filter(p => fs.existsSync(p))
    .map(p => imageToGeminiPart(p));

  if (imageParts.length === 0) {
    throw new Error('No video frames could be extracted for analysis');
  }

  const prompt = buildVideoPrompt(ffmpegData, caption, hashtags, niche);
  const parts = [prompt, ...imageParts];

  let lastError;
  for (const modelName of MODEL_FALLBACKS) {
    try {
      const responseText = await callWithRetry(modelName, parts, 2);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Gemini did not return valid JSON');
      const analysis = JSON.parse(jsonMatch[0]);
      console.log(`Gemini analysis complete (model: ${modelName})`);
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
