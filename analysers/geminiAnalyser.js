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

  return `You are a world-class TikTok and Instagram Reels Strategist. Your job is to deeply analyze the provided video frames and metadata to predict its viral potential. Do NOT give basic, generic advice (e.g., "show your face", "add cuts"). I need sophisticated, advanced content strategy adapted to the specific niche.

### VIRAL CONTENT PLAYBOOK & RULES
1. **NICHE CONTEXT IS KING:** The target niche is "${niche || 'General'}". YOU MUST ADAPT YOUR CRITERIA TO THIS NICHE!
   - If the niche is "Nature", "Aesthetic", or "Cinematic", DO NOT penalize for lacking a human face, fast cuts, or text overlays. Instead, grade based on visual majesty, color grading, and atmospheric audio.
   - If the niche is "Talking Head" or "Educational", grade heavily on pattern interrupts, text hook clarity, and pacing.
2. **The Hook (0-3s):** Is there a visual pattern interrupt or curiosity gap relevant to the niche?
3. **Retention Mechanics:** A viral video must have high 'Value Density' (no fluff).
4. **Authenticity over Polish:** Sometimes, raw/lo-fi videos go viral faster than highly edited ones.
5. **The Algorithm:** Does this video evoke an emotion that makes someone want to share or save it?

### TECHNICAL DATA
- Duration: ${duration}s
- Frame timestamps provided: ${frameTimestamps.join('s, ')}s
- Cuts/scene changes: ${computed.computed.sceneCuts} (${computed.computed.cutsPerMinute} cuts/min)
- Average shot length: ${computed.computed.avgShotLength}s
- Loudness: ${computed.computed.loudnessLUFS ?? 'N/A'} LUFS
- Silence/Dead air gaps (>2s): ${computed.computed.silenceGaps}
- Format: ${computed.computed.aspectRatio} — ${computed.computed.isVertical ? 'VERTICAL' : 'NOT VERTICAL'}

### CREATOR METADATA
- Caption: "${caption || '(none)'}"
- Hashtags: "${hashtags || '(none)'}"

### SYNC ANALYSIS INSTRUCTIONS
The frames provided correspond to timestamps: ${frameTimestamps.map((t, i) => `Frame ${i+1}=${t}s`).join(', ')}.
For the sync_timeline, analyse each frame and estimate whether the VISUAL content, AUDIO narrative, and TEXT overlays are in sync at that moment.
- "in_sync" = visual action matches what audio/text is communicating
- "audio_issue" = audio seems mismatched, missing, or dead air at this point
- "text_issue" = text overlay missing when needed, or present when not needed
- "visual_issue" = visual content doesn't match the audio/text narrative
- "ok" = everything aligned

### STRICT FORMATTING INSTRUCTIONS
- KEEP IT SHORT! Do not write paragraphs. The creator will be overwhelmed.
- All "strengths", "improvements", "top_3_wins", and "top_3_fixes" MUST be ultra-concise, punchy 1-liners (maximum 8-10 words per item).
- "overall_summary" MUST be exactly 1 short sentence about viral potential.
- "video_summary" MUST be 2-3 warm, friendly sentences describing what the video is about, its vibe, and target audience. This is NOT a critique — it's a description.
- "suggested_captions" MUST be 10 ready-to-use caption options tailored to the video content and niche. Each caption should have a different style/angle — punchy, question, CTA, emotional, bold, relatable, etc.
- "suggested_hashtags" MUST be 20 relevant hashtags — mix of trending, niche-specific, and mid-size tags. No generic tags like #love or #instagood.
- Grade based on SUBSTANCE and NICHE-FIT, not just technical stats.
- Return EXACTLY this JSON structure, and nothing else.

{
  "transcript": "1-sentence guess at the story.",
  "thumbnail_frame": 0,
  "hook": {
    "score": 7,
    "sub_scores": { "first_frame_clarity": 8, "motion_in_first_second": 7, "face_presence": 10, "text_overlay": 6, "pattern_interrupt": 7, "curiosity_gap": 6, "why_should_i_care": 7 },
    "strengths": ["Short 1-liner strength", "Another short strength"],
    "improvements": ["Short 1-liner improvement", "Another short improvement"]
  },
  "retention": {
    "score": 6,
    "sub_scores": { "pacing": 7, "scene_variety": 6, "dead_air_risk": 8, "intro_length": 5, "payoff_timing": 6, "loopability": 5, "end_drop_risk": 6 },
    "strengths": ["Short 1-liner"],
    "improvements": ["Short 1-liner"]
  },
  "visual_quality": {
    "score": 7,
    "sub_scores": { "brightness": 8, "sharpness": 7, "framing": 8, "background_clutter": 6, "camera_stability": 7, "color_temperature": 7, "face_visibility": 9 },
    "strengths": ["Short 1-liner"],
    "improvements": ["Short 1-liner"]
  },
  "audio_quality": {
    "score": 7,
    "sub_scores": { "speech_clarity": 8, "loudness_level": 7, "background_noise": 7, "silence_gaps": 8, "music_vocal_balance": 6 },
    "strengths": ["Short 1-liner"],
    "improvements": ["Short 1-liner"]
  },
  "content_structure": {
    "score": 6,
    "sub_scores": { "problem_solution_clarity": 6, "storytelling_arc": 7, "cta_presence": 5, "value_density": 7, "emotional_intensity": 6, "specificity": 6, "jargon_level": 8 },
    "strengths": ["Short 1-liner"],
    "improvements": ["Short 1-liner"]
  },
  "editing": {
    "score": 7,
    "sub_scores": { "cut_rhythm": 7, "visual_variety": 6, "zoom_punch_in_usage": 5, "transition_smoothness": 8, "repetitive_frames": 7, "thumbnail_worthy_moment": 8 },
    "strengths": ["Short 1-liner"],
    "improvements": ["Short 1-liner"]
  },
  "text_subtitles": {
    "score": 6,
    "sub_scores": { "subtitle_presence": 5, "readability": 7, "safe_zone_placement": 6, "text_contrast": 7, "font_size": 6 },
    "strengths": ["Short 1-liner"],
    "improvements": ["Short 1-liner"]
  },
  "compliance": {
    "score": 9,
    "flags": [],
    "warnings": [],
    "is_brand_safe": true
  },
  "video_summary": "2-3 sentence friendly description of what this video is about, its vibe, and who it's for. NOT a critique — just describe the content warmly.",
  "overall_summary": "One very short sentence summarizing viral potential.",
  "predicted_performance": "below_average | average | above_average | viral_potential",
  "top_3_wins": ["Ultra-short win 1", "Ultra-short win 2", "Ultra-short win 3"],
  "top_3_fixes": ["Ultra-short fix 1", "Ultra-short fix 2", "Ultra-short fix 3"],
  "suggested_captions": [
    "Caption 1 — punchy and engaging (max 15 words)",
    "Caption 2 — different angle or hook",
    "Caption 3 — question or curiosity style",
    "Caption 4 — storytelling or emotional angle",
    "Caption 5 — bold statement or controversial take",
    "Caption 6 — CTA focused",
    "Caption 7 — relatable or funny",
    "Caption 8 — inspirational or motivational",
    "Caption 9 — niche-specific insider language",
    "Caption 10 — trending phrase or format"
  ],
  "suggested_hashtags": [
    "#trending1", "#niche1", "#viral1", "#relevant1", "#trending2",
    "#niche2", "#viral2", "#relevant2", "#trending3", "#niche3",
    "#viral3", "#relevant3", "#trending4", "#niche4", "#viral4",
    "#trending5", "#niche5", "#viral5", "#relevant5", "#trending6"
  ],
  "sync_timeline": [
    { "timestamp": 0.0, "status": "ok | audio_issue | text_issue | visual_issue", "note": "short description max 6 words" },
    { "timestamp": 1.0, "status": "ok", "note": "strong hook visual" },
    { "timestamp": 3.0, "status": "text_issue", "note": "text overlay missing here" },
    { "timestamp": 7.5, "status": "ok", "note": "audio and visual aligned" },
    { "timestamp": 15.0, "status": "audio_issue", "note": "dead air, no music" },
    { "timestamp": 27.0, "status": "ok", "note": "strong closing frame" }
  ],
  "sync_score": 8
}`;
}

// ─── Analyse video frames with Gemini ────────────────────────────────────────
// Model fallback chain: configured model → 1.5-flash → 1.5-flash-8b → 1.5-pro
const MODEL_FALLBACKS = [
  process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
].filter((v, i, a) => a.indexOf(v) === i); // dedupe

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
