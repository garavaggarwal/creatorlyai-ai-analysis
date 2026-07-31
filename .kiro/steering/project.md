# Creatorly AI — Project Steering File

This file gives full context to any AI assistant (Kiro, Cursor, Copilot, etc.) working on this project. Read it completely before making any changes.

---

## What This Project Is

**Creatorly AI** is a "Video Lab" SaaS tool for Indian Instagram/Reels creators. Users upload a video (or paste an Instagram URL) and get a deep AI-powered analysis — hook strength, retention, audio sync, editing quality, trend-fit score, suggested captions, hashtags, and a sync timeline. The result is called the **Creatorly Score**.

It also features a **Rate Card** generator to calculate a creator's brand deal valuation, and an **Ask AI** video prompt generator and chatbot that integrates direct context from the user's latest analysis.

**Live URLs:**
- Frontend: `https://creatorlyai.in` (Vercel)
- Backend API: `https://api.creatorlyai.in` (Railway, custom domain)
- Backend API (fallback): `https://web-production-7bc95.up.railway.app` (Railway)
- GitHub repo: `garavaggarwal/creatorlyai-ai-analysis`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JS — served statically from `/public` via Vercel |
| Backend | Node.js + Express — deployed on Railway |
| AI Analysis | Google Gemini API (vision + text + audio) via `@google/generative-ai` |
| Video Processing | FFmpeg (frame extraction, audio track extraction, scene cuts, loudness stats, silence gaps, thumbnail) via `ffmpeg-static` + `fluent-ffmpeg` |
| Instagram Download | Apify (`apify/instagram-scraper` actor) as primary, Cobalt/yt-dlp as fallbacks |
| Profile Analytics | Apify (`apify/instagram-profile-scraper` actor) |
| Database / Auth | Supabase (PostgreSQL + Auth) |
| CI/CD | GitHub → Railway (auto-deploy on push to `main`) |

---

## Repository Structure

```
/
├── server.js                  # Main Express server — all API endpoints, custom score weights, profile analytics logic
├── config.js                  # App config: limits, unlimited email allowlist
├── supabaseDb.js              # Server-side Supabase helper (limit checks, profile caching, save results)
├── supabase_migration.sql     # SQL to create video_analyses and cache tables (run once in Supabase)
├── analysers/
│   ├── ffmpegHelper.js        # FFmpeg key frame extraction, scene cuts, audio loudness (LUFS) stats, silence gaps, thumbnail, and audio extraction
│   ├── geminiAnalyser.js      # 2-stage Gemini analysis (classification → category-aware multimodal vision+audio analysis)
│   └── textAnalyser.js        # Caption + hashtag text analysis
├── public/
│   ├── index.html             # Analyser page (main app)
│   ├── app.js                 # Analyser frontend logic, vertical stage V2 checklist, results rendering, timeline playback
│   ├── auth.js                # Supabase auth module (shared across all pages)
│   ├── chatbot.js             # Ask AI Chatbot integration
│   ├── style.css              # Main styles (responsive, sidebar, bottom nav, results UI, wins, checklist)
│   ├── landing.html/css/js    # Marketing landing page
│   ├── login.html/css/js      # Login/signup page
│   ├── profile.html/css/js    # Instagram profile analytics page
│   ├── prompt-generator.html  # Ask AI video prompt generator & chatbot page
│   ├── rate-card.html/css/js  # Rate Card valuation generator page
│   └── vercel.json            # Vercel routing config (MUST add route for every new page/file)
├── apt.txt                    # Railway system packages: ffmpeg, python3, python3-pip
├── package.json               # Dependencies + postinstall (installs yt-dlp to /app/bin)
└── Procfile                   # Railway start command: node server.js
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/analyse` | Upload video file → full analysis |
| `POST` | `/api/analyse-url` | Instagram URL → download + analyse |
| `GET` | `/api/result/:recordId` | Poll for result by record ID (recovery) |
| `GET` | `/api/latest-result` | Get user's most recent result (recovery fallback) |
| `GET` | `/api/history` | Get user's past analyses (completed + failed) |
| `GET` | `/api/usage` | Get user's analysis usage count |
| `POST` | `/api/profile-analytics` | Fetch Instagram profile metrics via Apify |
| `GET` | `/api/image-proxy` | Proxy external images to bypass CORS (Instagram CDN) |
| `POST` | `/api/generate-prompts` | Generate AI video prompts for tools like Runway, Kling, etc. |
| `GET` | `/api/debug-gemini` | Gemini Diagnostic endpoint testing active 2026 models |
| `GET` | `/health` | Health check |

All analysis endpoints accept `Authorization: Bearer <supabase_jwt>` header.

---

## Railway Environment Variables

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key (required) |
| `GEMINI_MODEL` | Gemini model name — set to `gemini-3.5-flash` (current working model) |
| `SUPABASE_URL` | `https://iqfjyaqgazbcskuworvr.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key (secret — for server-side DB writes) |
| `MAX_ANALYSES_PER_USER` | Lifetime analysis limit per user (default: 5) |
| `MAX_ANALYSES_PER_DAY` | Daily limit (0 = disabled) |
| `MAX_ANALYSES_PER_MONTH` | Monthly limit (0 = disabled) |
| `YTDLP_PATH` | Optional: explicit path to yt-dlp binary |
| `APIFY_API_TOKEN` | Apify API token — required for Instagram reel download AND profile analytics |
| `DEBUG_ANALYSIS` | Set to `true` to enable full debug trace logging + save to `/debug-logs/` |

---

## Supabase Setup

- **Project URL:** `https://iqfjyaqgazbcskuworvr.supabase.co`
- **Auth providers:** Email/password + Google OAuth
- **Google OAuth redirect URI:** `https://iqfjyaqgazbcskuworvr.supabase.co/auth/v1/callback`
- **Tables:** `video_analyses` (for analysis records) and `profile_analytics_cache` (caches Instagram scrapers for 24 hours)
- **RLS:** Enabled. Users can only SELECT their own rows. Backend uses service_role key to bypass RLS.

---

## Analysis Pipeline

```
Video File / Instagram URL
  → FFmpeg (extracts mono audio track (MP3/WAV) + 360p frame screenshots + scene cuts + loudness + thumbnail)
  → Gemini Stage 1: Classify reel type (singing/meme/cinematic/etc.) using first 2 frames
  → Gemini Stage 2: Category-aware multimodal analysis (analyzes all frames + audio track)
  → Text Analyser (caption + hashtag scoring)
  → Score Aggregator (weighted overall score adapting to reel category)
  → Save to Supabase (including thumbnail base64 and database caching)
  → Return to frontend
```

---

## Frame Extraction Strategy (`ffmpegHelper.js`)

Variable density sample sampling strategy to optimize timeline coverage under a 30-frame limit:

1. **Hook / Start region (larger of first 5s or 20% of duration)**: dense frame sampling every 0.1s to capture micro-expressions and overlay timing.
2. **Middle region**: baseline sampling every 1.0s to catch slow segments.
3. **Scene changes**: samples exact cut points from FFmpeg scene detection + the midpoints between scene cuts.
4. **Ending region (last 20% of duration)**: dense sampling every 0.1s to capture punchlines, comedic reveals, and CTA overlays (very last frame captured at duration - 0.05s).
5. **Deduplication**: filters out frames within 0.1s of each other.
6. **Limit**: Clamped to a maximum of 30 frames total, resized to **360p** (`size: '360x?'`) to limit payload size and prevent fetch timeouts.

---

## Gemini Analysis (`geminiAnalyser.js`)

### 2-Stage Architecture

**Stage 1 — Classification** (uses first 2 frames, fast):
- Classifies reel into 20+ types: singing, music_performance, talking_head, educational, meme, comedy, transformation, storytelling, vlog, cinematic, product_ad, beauty, fashion, fitness, food, dance, motivational, lip_sync, reaction, faceless_text, general.
- Detects hook type: voice_hook, visual_hook, text_hook, shock_hook, curiosity_hook, story_hook, transformation_hook, music_hook, none.
- Falls back to `general` if classification fails.

**Stage 2 — Category-Aware Multimodal Analysis** (uses all 30 frames + audio track):
- Accepts the lightweight extracted audio track as an input part to analyze speech clarity, tone, pacing, verbal hook, and background music.
- Rubric scoring adapts weights per reel type (e.g. singing: voice quality > editing cuts; cinematic: visuals/music > speech).
- 90s hard timeout wrapping for resilience.

### JSON Response Keys (frontend depends on ALL of these)
```
niche, short_description, verdict, why_viral, why_rework,
hook, retention, visual_quality, audio_quality, content_structure, editing, text_subtitles, compliance
  (each has: score, sub_scores, strengths[], improvements[])
video_summary, overall_summary, predicted_performance,
top_3_wins[], top_5_fixes[], suggested_captions[], suggested_hashtags[],
sync_timeline[], sync_score
```

### Tone Rules
- Talk like a creator coach, NOT a video engineer.
- NEVER use: LUFS, pacing degradation, frame cadence, normalization, transformation resolution.
- Skip unavailable metrics entirely.
- strengths/improvements: complete sentences, 8-12 words.
- top_5_fixes: exactly 5 fixes, "Title — One actionable instruction. Include timestamp."
- verdict: 2-3 sentences max in a sharp strategist paragraph.

### Model Fallback Chain
Active 2026 models:
`process.env.GEMINI_MODEL || 'gemini-3.5-flash'` → `gemini-3.5-flash` → `gemini-3.1-flash-lite` → `gemini-2.5-flash`.
*Note: Deprecated models like `gemini-2.0-flash` and `gemini-1.5-flash` are excluded to avoid 404 fetch errors.*

### Debug Mode
Set `DEBUG_ANALYSIS=true` on Railway to enable full console logging and JSON trace output to `/debug-logs/analysis_TIMESTAMP.json`.

---

## Instagram URL Download

Four strategies tried in order (`downloadInstagramReel` in `server.js`):
1. **Apify** (`apify/instagram-scraper`) — primary, uses residential proxies. Requires `APIFY_API_TOKEN`. ~$0.05-0.10/reel.
2. **Cobalt API** (`api.cobalt.tools`) — tried twice with 2s pause.
3. **yt-dlp** — binary at `/app/bin/yt-dlp` (installed by postinstall script).
4. **yt-dlp-wrap** — npm package, self-downloads binary as last resort.

---

## Auth System (`public/auth.js`)

- Pure vanilla JS — no Supabase SDK, uses direct REST API calls.
- `signIn()`, `signUp()`, `signOut()`, `signInWithGoogle()`.
- `handleOAuthCallback()` — processes Google OAuth hash tokens.
- Session stored in `localStorage` as `creatorly_session`.
- `isLoggedIn()` returns true if token valid OR refresh_token exists.
- Auto-refresh: silently renews token 5 minutes before expiry.

---

## User Limits & Allowlist

In `config.js`:
```js
MAX_ANALYSES_PER_USER: 5,
UNLIMITED_EMAILS: ['vansh.2004.vg@gmail.com', 'hrithikgarg2017@gmail.com']
```
These emails bypass all limits.

---

## Navigation System

### Desktop (≥1024px) — Left Sidebar
- Fixed 240px sidebar, collapsible to 64px (icons only) via `localStorage` state.
- Top header hidden on desktop (sidebar has the logo).
- Nav items: Home, Ask AI, New Analysis, Rate Card, Profile.

### Mobile (<1024px) — Bottom Navigation
- 5 items: Home, Ask AI, Analyse (+), Rate Card, Profile.
- Centre "Analyse" button: elevated purple circle.
- Profile avatar shows IG profile pic or falls back to person icon.

---

## Results Page Layout (`index.html` + `app.js`)

### Section Order:
1. **Score Card** — Clickable thumbnail (scrolls to video), score ring + niche pill + perf badge (right), short description below.
2. **Verdict Card** — strategist paragraph explaining why the reel will/won't perform.
3. **WHAT'S WORKING** — Wins Card displaying 2 key strengths.
4. **TOP FIXES** — numbered fixes with High/Medium/Low impact badges. Clickable to seek video player to timestamp.
5. **REEL SCORES** — horizontally scrollable cards (Hook, Visuals, Editing, Audio, Content, Retention, Text) with ring charts, badge, and summary paragraph. "Hook" has a "✨ Ask AI" trigger button.
6. **VIDEO TIMELINE ANALYSIS** — video player + progress bar + color-coded timeline (red/amber/green) + issues list.
7. **CAPTION IDEAS** — 5 captions with copy buttons and an "✨ Ask AI to refine captions" button.
8. **TOP HASHTAGS** — 10 hashtag pills (clickable to copy).
9. **Analyse Another / Generate Your Rate Card** buttons.
10. **Floating Chatbot Button** — Floating "✨ Ask AI" stores current analysis in `localStorage` and opens prompt chatbot.

---

## 7-Stage Vertical Progress Loader

Fluid checklist showing progress from 0% to 100%:
- **Step 1 (0-15%)**: Preparing video analysis / "Initializing analysis workspace..."
- **Step 2 (15-35%)**: Uploading & downloading video / "Processing video upload/download..."
- **Step 3 (35-50%)**: Extracting key frames / "Extracting frames and sampling timeline..."
- **Step 4 (50-65%)**: Analyzing audio levels / "Analyzing speech loudness and silence gaps..."
- **Step 5 (65-80%)**: AI Vision reviewing hook / "Gemini Vision evaluating scene flow and hook..."
- **Step 6 (80-92%)**: Calculating scores / "Aggregating metrics and final scores..."
- **Step 7 (92-99%)**: Assembling dashboard / "Generating custom captions and hashtags..."
- **Step 100%**: Dashboard fully assembled, transitions to results.

---

## Profile Analytics (`/profile`)

- Endpoint: `POST /api/profile-analytics` — uses `apify/instagram-profile-scraper`.
- First visit: blurred preview + username prompt (cached in `localStorage`).
- 24-hour cache in database (`profile_analytics_cache` table) + local memory fallback.
- **8 Metrics (last 15 reels)**:
  1. Avg Reel Views
  2. Avg Likes
  3. Avg Comments
  4. Avg Shares
  5. Avg Saves
  6. ER by Followers (%) = (Likes+Comments+Shares+Saves) ÷ Followers × 100
  7. ER by Views (%) = (Likes+Comments+Shares+Saves) ÷ Views × 100
  8. Reach Efficiency = Views ÷ Followers
- **Niche Detection**: bio + captions matched against 12 categories (Fitness, Travel, Food, Tech, Fashion, Beauty, Comedy, Education, Business, Music, Photography, Lifestyle).

---

## Rate Card / Valuation Page (`/rate-card`)

Interactive calculator estimating sponsor valuation based on:
- Account followers and average reel views (scraped from profile analytics).
- ER vs niche benchmark score.
- Posting consistency (target: 3 reels per week).
- Outputs sponsor deal valuation ranges based on views and follower tiers.

---

## Screen Lock / Network Drop Recovery

1. `localStorage.creatorly_inflight` set before request fires: `{ ts, authToken, recordId? }`.
2. On network error: `tryRecoverResult()` polls every 5s for up to 3 minutes.
3. `visibilitychange` (screen unlock) + `pageshow` (iOS bfcache) → silent background recovery.
4. `checkPendingOnLoad()` on page load — discards entries >10 min old.

---

## Analysis History

- `GET /api/history` — returns last 50 analyses.
- Failed analyses hidden in standard tab, completed items clickable to load full results.
- History re-fetches from API every time the tab is opened.

---

## Image Proxy (`GET /api/image-proxy?url=...`)

- Proxies Instagram CDN images through the server to bypass CORS.
- Used for profile photos and reel thumbnails. Includes 24h cache headers.

---

## Credits Bar

- Shows "X used / 5 available" with purple gradient progress bar.
- Fetches from `GET /api/usage` on page load. Hidden until data loads.

---

## Custom Domain

- `api.creatorlyai.in` → Railway (CNAME to `i1uwfu0h.up.railway.app`).
- All `API_BASE` in frontend uses `https://api.creatorlyai.in`.
- CORS in `server.js` restricts / opens headers appropriately.

---

## Known Issues / TODO

- **Railway idle timeout** — Container sleeps after ~17s inactivity on hobby plan. Wakes on request.
- **Google OAuth test users** — App is in "testing" mode; only added test users can sign in with Google.
- **Thumbnail column migration** — Run `ALTER TABLE public.video_analyses ADD COLUMN IF NOT EXISTS thumbnail text;` in Supabase.
- **Apify video URL extraction** — sometimes returns data without direct video url.

---

## Coding Conventions

- **No TypeScript** — pure vanilla JS throughout.
- **No frontend framework** — plain HTML/CSS/JS (Tailwind loaded dynamically but core style is vanilla CSS in `/style.css`).
- CSS variables for theming defined in `:root`.
- Mobile-first breakpoints at 1024px, 768px, 480px, 390px, 360px.
- iOS Safari fixes: `viewport-fit=cover`, input `font-size: max(16px, ...)`.
- No `&&` in shell commands — use `;` or `&` (Windows CMD compatibility).
- All API calls include `Authorization: Bearer <token>` header.
- Server extracts user from JWT via `extractUserId(req)` — no external JWT library.
- **`fluent-ffmpeg .screenshots()`** is a terminal method — NEVER chain `.run()` after it.
- **`vercel.json`** must have a route for every new HTML page AND every JS/CSS file it references.
- **CSS `display: flex` overrides `hidden` attribute** — always add `[hidden] { display: none }` for flex elements that use `hidden`.
- All CSS/JS in HTML use relative paths (`/style.css`, `/auth.js`) — never absolute Railway URLs.
