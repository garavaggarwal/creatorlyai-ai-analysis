const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Resolve paths, falling back to system binaries if static binaries are not downloaded/available
let ffmpegPath = ffmpegStatic;
let ffprobePath = ffprobeStatic.path;

if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
  console.log('🔧 ffmpeg-static path not found, falling back to system ffmpeg');
  ffmpegPath = 'ffmpeg';
}
if (!ffprobePath || !fs.existsSync(ffprobePath)) {
  console.log('🔧 ffprobe-static path not found, falling back to system ffprobe');
  ffprobePath = 'ffprobe';
}

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// ─── Extract Lightweight Audio Track ──────────────────────────────────────────
function extractAudioTrack(videoPath, outputPath) {
  return new Promise((resolve) => {
    // Try MP3 extraction (32k mono)
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioChannels(1)
      .audioBitrate('32k')
      .save(outputPath)
      .on('end', () => {
        console.log('🎵 Audio track extracted successfully (MP3)');
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.warn('MP3 audio extraction failed, trying WAV:', err.message);
        // Fallback to uncompressed WAV (always works, but larger)
        const wavPath = outputPath.replace(/\.mp3$/, '.wav');
        ffmpeg(videoPath)
          .noVideo()
          .audioCodec('pcm_s16le')
          .audioChannels(1)
          .audioFrequency(16000) // downsample to 16kHz
          .save(wavPath)
          .on('end', () => {
            console.log('🎵 Fallback audio track extracted successfully (WAV)');
            resolve(wavPath);
          })
          .on('error', (wavErr) => {
            console.warn('WAV audio extraction failed too:', wavErr.message);
            resolve(null);
          });
      });
  });
}

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

  // Determine start/end bounds based on user request:
  // - First 5s or 20% of start (whichever is larger) broken in 0.1s frames
  // - End part 20% also in 0.1s frames
  const startDuration = Math.max(5, duration * 0.2);
  const endDuration = duration * 0.2;
  const startEnd = startDuration;
  const endStart = Math.max(startEnd, duration - endDuration);

  // 1. Hook / Start region (whichever is larger: first 5s or 20%): every 0.1s
  const hookEnd = Math.min(startEnd, duration);
  for (let t = 0; t <= hookEnd; t += 0.1) {
    timestamps.add(Math.round(t * 10));
  }

  // 2. Middle region: every 1.0s
  if (endStart > hookEnd) {
    for (let t = hookEnd; t <= endStart; t += 1.0) {
      timestamps.add(Math.round(t * 10));
    }
  }

  // 3. Scene change timestamps & midpoints (helpful transition indicators)
  if (sceneTimestamps && sceneTimestamps.length > 0) {
    sceneTimestamps.forEach(t => {
      timestamps.add(Math.round(t * 10));
    });
    const sortedScenes = [...sceneTimestamps].sort((a, b) => a - b);
    for (let i = 0; i < sortedScenes.length - 1; i++) {
      const mid = (sortedScenes[i] + sortedScenes[i + 1]) / 2;
      timestamps.add(Math.round(mid * 10));
    }
    if (sortedScenes.length > 0) {
      const lastCut = sortedScenes[sortedScenes.length - 1];
      const mid = (lastCut + duration) / 2;
      timestamps.add(Math.round(mid * 10));
    }
  }

  // 4. Ending region: Last 20% of video: every 0.1s
  if (duration > endStart) {
    for (let t = endStart; t <= duration; t += 0.1) {
      timestamps.add(Math.round(t * 10));
    }
    // Always include the very last frame (with a slight offset)
    timestamps.add(Math.round((duration - 0.05) * 10));
  }

  // Deduplicate within 0.1s of each other (1 decisecond threshold)
  const sorted = [...timestamps].sort((a, b) => a - b);
  const deduped = [];
  for (const ds of sorted) {
    if (deduped.length === 0 || ds - deduped[deduped.length - 1] >= 1) {
      deduped.push(ds);
    }
  }

  // Clamp to valid range, map back to seconds, and limit to 120 max frames
  const validTimestamps = deduped
    .map(ds => ds / 10)
    .map(t => Math.min(t, duration - 0.05))
    .filter(t => t >= 0)
    .slice(0, 120);

  console.log(`   Extracting ${validTimestamps.length} frames at: ${validTimestamps.map(t => t.toFixed(1) + 's').join(', ')}`);

  const framePaths = new Array(validTimestamps.length).fill(null);
  const finalTimestamps = new Array(validTimestamps.length).fill(null);

  const batchSize = 8;
  for (let i = 0; i < validTimestamps.length; i += batchSize) {
    const batch = validTimestamps.slice(i, i + batchSize);
    await Promise.all(batch.map((ts, index) => {
      const frameIndex = i + index;
      const filename = `frame_${frameIndex}.jpg`;
      const targetPath = path.join(outputDir, filename);
      return new Promise((resolve) => {
        ffmpeg(videoPath)
          .screenshots({
            timestamps: [ts],
            filename: filename,
            folder: outputDir,
            size: '480x?',
          })
          .on('end', () => {
            if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
              framePaths[frameIndex] = targetPath;
              finalTimestamps[frameIndex] = ts;
            }
            resolve();
          })
          .on('error', (err) => {
            console.warn(`Frame ${frameIndex} at ${ts}s failed:`, err.message);
            resolve();
          });
      });
    }));
  }

  const cleanFramePaths = framePaths.filter(p => p !== null);
  const cleanTimestamps = finalTimestamps.filter(t => t !== null);

  return { framePaths: cleanFramePaths, frameTimestamps: cleanTimestamps };
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

  // Run scene detection, audio analysis, and video signal stats in parallel to save time!
  const [scenes, loudnessReal, silenceReal, videoStats] = await Promise.all([
    detectSceneChanges(videoPath),
    info.hasAudio ? getAudioLoudness(videoPath) : Promise.resolve({ inputI: null, inputTP: null }),
    info.hasAudio ? detectSilence(videoPath, info.duration) : Promise.resolve({ gaps: [], totalSilenceSecs: 0, silencePercent: 0, deadAirCount: 0 }),
    getVideoStats(videoPath)
  ]);

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

  // Extract thumbnail and audio track in parallel to save time!
  const [thumbnailBase64, audioPath] = await Promise.all([
    extractThumbnail(videoPath),
    info.hasAudio ? extractAudioTrack(videoPath, path.join(os.tmpdir(), `audio_${Date.now()}.mp3`)) : Promise.resolve(null)
  ]);

  console.log(`✅ ffmpeg done. Duration: ${info.duration}s, Cuts: ${scenes.length}, Frames: ${framePaths.length}, Audio: ${audioPath ? 'Yes' : 'No'}`);

  return {
    videoInfo: info,
    framePaths: framePaths,
    frameTimestamps: frameTimestamps,
    sceneTimestamps: scenes,
    silenceSegments: silenceReal.gaps,
    thumbnail: thumbnailBase64,
    audioPath: audioPath,
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
