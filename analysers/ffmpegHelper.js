const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const fs = require('fs');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

// ─── Get Video Metadata ───────────────────────────────────────────────────────
function getVideoInfo(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
      resolve({
        duration: metadata.format.duration || 0,
        size: metadata.format.size || 0,
        fps: eval(videoStream?.r_frame_rate || '30/1'),
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
        hasAudio: !!audioStream,
        audioCodec: audioStream?.codec_name || null,
        videoCodec: videoStream?.codec_name || null,
      });
    });
  });
}

// ─── Extract Thumbnail (base64 for storage) ──────────────────────────────────
function extractThumbnail(videoPath) {
  return new Promise((resolve) => {
    const thumbName = `thumb_${Date.now()}.jpg`;
    const thumbFolder = '/tmp';
    const thumbPath = path.join(thumbFolder, thumbName);

    ffmpeg(videoPath)
      .on('end', () => {
        try {
          if (fs.existsSync(thumbPath)) {
            const buffer = fs.readFileSync(thumbPath);
            const base64 = buffer.toString('base64');
            fs.unlinkSync(thumbPath); // Clean up
            resolve(`data:image/jpeg;base64,${base64}`);
          } else {
            resolve(null);
          }
        } catch (e) {
          console.warn('Thumbnail read error:', e.message);
          resolve(null);
        }
      })
      .on('error', (err) => {
        console.warn('Thumbnail extraction failed:', err.message);
        resolve(null);
      })
      .screenshots({
        timestamps: ['0'],
        filename: thumbName,
        folder: thumbFolder,
        size: '320x?',
      });
  });
}

// ─── Extract Key Frames ───────────────────────────────────────────────────────
// Comprehensive extraction strategy:
// 1. First 5s: every 0.5s (dense hook — most critical for analysis)
// 2. After 5s: every 2s baseline (catches slow sections)
// 3. Scene change timestamps: exact cut points from FFmpeg
// 4. Midpoints between scene cuts: captures what's in each shot
// 5. Last 2s: every 0.3s (catches punchlines, reveals, meme faces, CTAs)
// 6. Dedup within 0.2s, max 30 frames
async function extractFrames(videoPath, duration, outputDir, sceneTimestamps) {
  const timestamps = new Set(); // Stores integer deciseconds (tenths of a second)

  // 1. Hook region: First 5 seconds — every 0.2s (dense hook coverage)
  const hookEnd = Math.min(5, duration);
  for (let t = 0; t <= hookEnd; t += 0.2) {
    timestamps.add(Math.round(t * 10));
  }

  // 2. Middle region: After 5 seconds — adaptive 1.0s or 2.0s interval
  if (duration > 8) {
    const midEnd = duration - 3;
    const step = duration <= 60 ? 1.0 : 2.0;
    for (let t = 5.0; t <= midEnd; t += step) {
      timestamps.add(Math.round(t * 10));
    }
  }

  // 3. Scene change timestamps & midpoints (exact cut points from FFmpeg selection)
  if (sceneTimestamps && sceneTimestamps.length > 0) {
    sceneTimestamps.forEach(t => {
      timestamps.add(Math.round(t * 10));
    });
    // Add midpoints between consecutive scene cuts
    const sortedScenes = [...sceneTimestamps].sort((a, b) => a - b);
    for (let i = 0; i < sortedScenes.length - 1; i++) {
      const mid = (sortedScenes[i] + sortedScenes[i + 1]) / 2;
      timestamps.add(Math.round(mid * 10));
    }
    // Midpoint from last scene cut to end
    if (sortedScenes.length > 0) {
      const lastCut = sortedScenes[sortedScenes.length - 1];
      const mid = (lastCut + duration) / 2;
      timestamps.add(Math.round(mid * 10));
    }
  }

  // 4. Ending region: Last 3 seconds — every 0.3s (catches reveals, punchlines, CTAs)
  if (duration > 0) {
    const startEnd = Math.max(0, duration - 3);
    for (let t = startEnd; t <= duration; t += 0.3) {
      timestamps.add(Math.round(t * 10));
    }
    // Always include the very last frame (with a slight offset)
    timestamps.add(Math.round((duration - 0.05) * 10));
  }

  // Deduplicate within 0.2s of each other (2 deciseconds threshold)
  const sorted = [...timestamps].sort((a, b) => a - b);
  const deduped = [];
  for (const ds of sorted) {
    if (deduped.length === 0 || ds - deduped[deduped.length - 1] >= 2) {
      deduped.push(ds);
    }
  }

  // Clamp to valid range, map back to seconds, and limit to 75 max frames
  const validTimestamps = deduped
    .map(ds => ds / 10)
    .map(t => Math.min(t, duration - 0.05))
    .filter(t => t >= 0)
    .slice(0, 75);

  console.log(`   Extracting ${validTimestamps.length} frames at: ${validTimestamps.map(t => t.toFixed(1) + 's').join(', ')}`);

  const framePaths = [];
  const finalTimestamps = [];

  for (let i = 0; i < validTimestamps.length; i++) {
    const ts = validTimestamps[i];
    const filename = `frame_${i}.jpg`;
    const targetPath = path.join(outputDir, filename);
    await new Promise((resolve) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: [ts],
          filename: filename,
          folder: outputDir,
          size: '720x?',
        })
        .on('end', () => {
          if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
            framePaths.push(targetPath);
            finalTimestamps.push(ts);
          }
          resolve();
        })
        .on('error', (err) => {
          console.warn(`Frame ${i} at ${ts}s failed:`, err.message);
          resolve();
        });
    });
  }

  return { framePaths, frameTimestamps: finalTimestamps };
}

// ─── Scene Change Detection ───────────────────────────────────────────────────
function detectSceneChanges(videoPath) {
  return new Promise((resolve) => {
    const scenes = [];
    ffmpeg(videoPath)
      .outputOptions([
        '-vf', 'select=\'gt(scene,0.35)\',showinfo',
        '-f', 'null',
      ])
      .output('/dev/null')
      .on('stderr', (line) => {
        const match = line.match(/pts_time:([\d.]+)/);
        if (match) scenes.push(parseFloat(match[1]));
      })
      .on('end', () => resolve(scenes))
      .on('error', () => resolve([])) // Fallback: no scene data
      .run();
  });
}

// ─── Audio Loudness (LUFS) ────────────────────────────────────────────────────
function getAudioLoudness(videoPath) {
  return new Promise((resolve) => {
    let loudnessData = { inputI: null, inputTP: null, inputLRA: null };
    ffmpeg(videoPath)
      .audioFilters('loudnorm=print_format=json')
      .format('null')
      .output('/dev/null')
      .on('stderr', (line) => {
        try {
          if (line.includes('"input_i"')) {
            const json = line.substring(line.indexOf('{'));
            const parsed = JSON.parse(json);
            loudnessData = {
              inputI: parseFloat(parsed.input_i),       // Integrated loudness (LUFS)
              inputTP: parseFloat(parsed.input_tp),     // True peak
              inputLRA: parseFloat(parsed.input_lra),  // Loudness range
            };
          }
        } catch (_) {}
      })
      .on('end', () => resolve(loudnessData))
      .on('error', () => resolve(loudnessData))
      .run();
  });
}

// ─── Silence Detection ────────────────────────────────────────────────────────
function detectSilence(videoPath, duration) {
  return new Promise((resolve) => {
    const silenceGaps = [];
    let totalSilence = 0;
    ffmpeg(videoPath)
      .audioFilters('silencedetect=noise=-40dB:d=0.5')
      .format('null')
      .output('/dev/null')
      .on('stderr', (line) => {
        const startMatch = line.match(/silence_start: ([\d.]+)/);
        const endMatch = line.match(/silence_end: ([\d.]+)/);
        const durMatch = line.match(/silence_duration: ([\d.]+)/);
        if (startMatch && endMatch && durMatch) {
          const gap = parseFloat(durMatch[1]);
          silenceGaps.push({ start: parseFloat(startMatch[1]), duration: gap });
          totalSilence += gap;
        }
      })
      .on('end', () => resolve({
        gaps: silenceGaps,
        totalSilenceSecs: Math.round(totalSilence * 10) / 10,
        silencePercent: duration > 0 ? Math.round((totalSilence / duration) * 100) : 0,
        deadAirCount: silenceGaps.filter(g => g.duration > 2).length,
      }))
      .on('error', () => resolve({ gaps: [], totalSilenceSecs: 0, silencePercent: 0, deadAirCount: 0 }))
      .run();
  });
}

// ─── Video Brightness / Sharpness ────────────────────────────────────────────
function getVideoStats(videoPath) {
  return new Promise((resolve) => {
    let brightnessValues = [];
    ffmpeg(videoPath)
      .outputOptions(['-vf', 'signalstats,metadata=print:file=-', '-f', 'null'])
      .output('/dev/null')
      .on('stderr', (line) => {
        const match = line.match(/YAVG=([\d.]+)/);
        if (match) brightnessValues.push(parseFloat(match[1]));
      })
      .on('end', () => {
        if (brightnessValues.length === 0) return resolve({ avgBrightness: null, brightnessVariance: null });
        const avg = brightnessValues.reduce((a, b) => a + b, 0) / brightnessValues.length;
        const variance = brightnessValues.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / brightnessValues.length;
        resolve({
          avgBrightness: Math.round(avg),
          brightnessVariance: Math.round(variance),
        });
      })
      .on('error', () => resolve({ avgBrightness: null, brightnessVariance: null }))
      .run();
  });
}

// ─── Main ffmpeg Analyser ─────────────────────────────────────────────────────
async function runFfmpegAnalysis(videoPath, framesOutputDir) {
  console.log('🎬 Starting ffmpeg analysis...');

  const info = await getVideoInfo(videoPath);
  const scenes = await detectSceneChanges(videoPath);
  const loudnessReal = info.hasAudio ? await getAudioLoudness(videoPath) : { inputI: null, inputTP: null };
  const silenceReal = info.hasAudio ? await detectSilence(videoPath, info.duration) : { gaps: [], totalSilenceSecs: 0, silencePercent: 0, deadAirCount: 0 };
  const videoStats = await getVideoStats(videoPath);

  // Extract frames (using scene change timestamps for smarter sampling)
  fs.mkdirSync(framesOutputDir, { recursive: true });
  const { framePaths, frameTimestamps } = await extractFrames(videoPath, info.duration, framesOutputDir, scenes);

  // Calculate pacing metrics
  const cutsPerMinute = info.duration > 0 ? (scenes.length / info.duration) * 60 : 0;
  const avgShotLength = scenes.length > 0 ? info.duration / (scenes.length + 1) : info.duration;

  // Brightness interpretation
  let brightnessLabel = 'Unknown';
  if (videoStats.avgBrightness !== null) {
    if (videoStats.avgBrightness < 60) brightnessLabel = 'Too Dark';
    else if (videoStats.avgBrightness < 100) brightnessLabel = 'Slightly Dark';
    else if (videoStats.avgBrightness < 180) brightnessLabel = 'Well Lit';
    else if (videoStats.avgBrightness < 220) brightnessLabel = 'Bright';
    else brightnessLabel = 'Overexposed';
  }

  // Loudness interpretation
  let loudnessLabel = 'Unknown';
  if (loudnessReal.inputI !== null) {
    if (loudnessReal.inputI < -30) loudnessLabel = 'Too Quiet';
    else if (loudnessReal.inputI < -20) loudnessLabel = 'Slightly Quiet';
    else if (loudnessReal.inputI < -12) loudnessLabel = 'Good Level';
    else if (loudnessReal.inputI < -6) loudnessLabel = 'Slightly Loud';
    else loudnessLabel = 'Too Loud / Clipping Risk';
  }

  // Extract thumbnail
  const thumbnailBase64 = await extractThumbnail(videoPath);

  console.log(`✅ ffmpeg done. Duration: ${info.duration}s, Cuts: ${scenes.length}, Frames: ${framePaths.length}`);

  return {
    videoInfo: info,
    framePaths: framePaths,
    frameTimestamps: frameTimestamps,
    sceneTimestamps: scenes,
    silenceSegments: silenceReal.gaps,
    thumbnail: thumbnailBase64,
    computed: {
      sceneCuts: scenes.length,
      cutsPerMinute: Math.round(cutsPerMinute * 10) / 10,
      avgShotLength: Math.round(avgShotLength * 10) / 10,
      loudnessLUFS: loudnessReal.inputI,
      loudnessLabel,
      truePeakDB: loudnessReal.inputTP,
      silenceGaps: silenceReal.deadAirCount,
      silencePercent: silenceReal.silencePercent,
      totalSilenceSecs: silenceReal.totalSilenceSecs,
      avgBrightness: videoStats.avgBrightness,
      brightnessLabel,
      aspectRatio: info.width && info.height ? `${info.width}x${info.height}` : 'Unknown',
      isVertical: info.height > info.width,
    }
  };
}

module.exports = { runFfmpegAnalysis, extractThumbnail };
