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

  return `You are a world-class Instagram Reels Strategist who gives SPECIFIC, MEASURABLE, DATA-BACKED advice. Never give generic tips. Every recommendation must reference actual timestamps, numbers, or detected issues from this video.

### CRITICAL RULES
1. **NO GENERIC ADVICE.** Instead of "use faster cuts", say "Detected only ${sceneCuts} cuts in ${duration}s. ${niche || 'General'} reels typically use ${Math.round(computed.videoInfo?.duration / 2.5)}-${Math.round(computed.videoInfo?.duration / 1.5)} cuts."
2. **TIMESTAMP-SPECIFIC.** Reference exact seconds: "At 3.2s, the frame is static for 4s — add a zoom or cut here."
3. **MEASURABLE.** Use numbers: "Audio at ${loudness ?? 'unknown'} LUFS — boost to -14 LUFS for optimal mobile playback."
4. **NICHE-AWARE.** The niche is "${niche || 'General'}". Adapt all benchmarks to this niche.
   - Nature/Aesthetic/Cinematic: grade on visual flow, color, atmosphere. Don't penalize for no face/text.
   - Comedy/Meme: grade on timing, punchline delivery, relatability.
   - Educational/Talking Head: grade on pattern interrupts, text hooks, pacing.
   - Fitness/Food: grade on transformation clarity, before/after, process shots.

### TECHNICAL DATA (use these numbers in your analysis)
- Duration: ${duration}s
- Scene cuts: ${sceneCuts} total (${cutsPerMin} cuts/min, avg shot: ${avgShot}s)
- Audio loudness: ${loudness ?? 'N/A'} LUFS (optimal: -14 to -12 LUFS)
- Silence gaps (>2s): ${silenceGaps} detected
- Silence %: ${silencePct}% of video
- Brightness: ${brightness ?? 'N/A'} (label: ${brightnessLabel})
- Format: ${aspectRatio} — ${isVertical ? 'VERTICAL (good)' : 'NOT VERTICAL (will be cropped on Reels)'}
- Frame timestamps: ${frameTimestamps.map((t, i) => 'Frame' + (i+1) + '=' + t + 's').join(', ')}

### CREATOR METADATA
- Caption: "${caption || '(none provided)'}"
- Hashtags: "${hashtags || '(none provided)'}"

### WHAT I NEED FROM YOU

**For every "improvements" array:** Each item MUST follow this format:
"At [timestamp]s: [specific issue]. Fix: [exact action with numbers]."
Example: "At 0-3s: No text hook visible. Fix: Add 3-word text overlay in first 1.5s."
Example: "At 8.2s: 4s static shot with no movement. Fix: Add zoom-in or cut at 8s."

**For "top_3_fixes":** The 3 most impactful changes, each with a timestamp and measurable action.
Example: "0-2s: Add text hook — reels with text in first 2s get 40% more retention"
Example: "Audio at -24 LUFS is too quiet — boost to -14 LUFS (viewers scroll past quiet reels)"

**For "top_3_wins":** What's already working, with evidence.
Example: "First cut at 1.2s creates strong pattern interrupt"
Example: "Vertical 9:16 format optimized for full-screen Reels"

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
