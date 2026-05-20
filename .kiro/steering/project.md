# Creatorly AI — Project Steering File

This file gives full context to any AI assistant (Kiro, Cursor, Copilot, etc.) working on this project. Read it completely before making any changes.

---

## What This Project Is

**Creatorly AI** is a "Video Lab" SaaS tool for Indian Instagram/Reels creators. Users upload a video (or paste an Instagram URL) and get a deep AI-powered analysis — hook strength, retention, audio sync, editing quality, trend-fit score, suggested captions, hashtags, and a sync timeline. The result is called the **Creatorly Score**.

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
| AI Analysis | Google Gemini API (vision + text) via `@google/generative-ai` |
| Video Processing | FFmpeg (frame extraction, audio stats, scene cuts, thumbnail) via `ffmpeg-static` + `fluent-ffmpeg` |
| Instagram Download | Apify (`apify/instagram-scraper` actor) as primary, Cobalt/yt-dlp as fallbacks |
| Profile Analytics | Apify (`apify/instagram-profile-scraper` actor) |
| Database / Auth | Supabase (PostgreSQL + Auth) |
| CI/CD | GitHub → Railway (auto-deploy on push to `main`) |

---

## Repository Structure

```
/
├── server.js                  # Main Express server — all API endpoints
├── config.js                  # App config: limits, unlimited email allowlist
├── supabaseDb.js              # Server-side Supabase helper (limit checks, save results)
├── supabase_migration.sql     # SQL to create video_analyses table (run once in Supabase)
├── analysers/
│   ├── ffmpegHelper.js        # FFmpeg frame extraction, scene cuts, audio stats, thumbnail
│   ├── geminiAnalyser.js      # 2-stage Gemini analysis (classify → analyse)
│   └── textAnalyser.js        # Caption + hashtag text analysis
├── public/
│   ├── index.html             # Analyser page (main app)
│   ├── app.js                 # Analyser frontend logic
│   ├── auth.js                # Supabase auth module (shared across all pages)
│   ├── style.css              # Main styles (responsive, sidebar, bottom nav, results UI)
│   ├── landing.html/css/js    # Marketing landing page
│   ├── login.html/css/js      # Login/signup page
│   ├── profile.html/css/js    # Instagram profile analytics page
│   └── prompt-generator.html/css/js  # AI video prompt generator page
├── apt.txt                    # Railway system packages: ffmpeg, python3, python3-pip
├── package.json               # Dependencies + postinstall (installs yt-dlp to /app/bin)
├── vercel.json                # Vercel routing config (MUST add route for every new page/file)
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
| `GET` | `/health` | Health check |

All analysis endpoints accept `Authorization: Bearer <supabase_jwt>` header.

---

## Railway Environment Variables

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key (required) |
| `GEMINI_MODEL` | Gemini model name — set to `gemini-2.5-flash` (current working model) |
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
- **Table:** `video_analyses` — created via `supabase_migration.sql`
- **RLS:** Enabled. Users can only SELECT their own rows. Backend uses service_role key to bypass RLS.

### video_analyses table key fields
- `id`, `user_id`, `status` (processing/completed/failed), `source` (upload/instagram_url)
- `niche`, `original_filename`, `instagram_url`, `file_size_mb`
- Scores: `overall_score`, `hook_score`, `retention_score`, `visual_score`, `audio_score`, `editing_score`, `content_score`, `text_score`, `compliance_score`, `sync_score`, `caption_score`, `hashtag_score`
- `predicted_performance`, `video_duration`, `video_resolution`, `video_fps`, `is_vertical`, `has_audio`, `scene_cuts`, `cuts_per_minute`, `silence_gaps`
- `overall_summary`, `video_summary`, `top_3_wins`, `top_3_fixes`, `suggested_captions`, `suggested_hashtags`, `sync_timeline`
- `full_result` (JSONB — complete Gemini response)
- `thumbnail` (text — base64 JPEG, first frame)

**Migration:** Run `ALTER TABLE public.video_analyses ADD COLUMN IF NOT EXISTS thumbnail text;` in Supabase SQL Editor.

---

## Analysis Pipeline

```
Video File / Instagram URL
  → FFmpeg (smart frame extraction + scene cuts + audio + thumbnail)
  → Gemini Stage 1: Classify reel type (singing/meme/cinematic/etc.)
  → Gemini Stage 2: Category-aware analysis (scoring adapts to reel type)
  → Text Analyser (caption + hashtag scoring)
  → Score Aggregator (weighted overall score)
  → Save to Supabase (including thumbnail)
  → Return to frontend
```

---

## Frame Extraction Strategy (`ffmpegHelper.js`)

Smart multi-strategy extraction to ensure Gemini sees every important moment:

1. **First 5s: every 0.5s** — dense hook coverage (10 frames)
2. **After 5s: every 2s baseline** — catches slow sections
3. **Scene change timestamps** — exact cut points from FFmpeg scene detection
4. **Midpoints between scene cuts** — captures what's in the middle of each shot
5. **Last 2s: every 0.3s** — catches punchlines, reveals, meme faces, CTAs
6. **Dedup within 0.2s** — removes near-duplicate timestamps
7. **Max 30 frames total**

This ensures last-second reveals (e.g. a meme face shown for <1s at the end) are always captured.

---

## Gemini Analysis (`geminiAnalyser.js`)

### 2-Stage Architecture

**Stage 1 — Classification** (uses first 2 frames only, fast):
- Classifies reel into 20+ types: singing, meme, comedy, transformation, cinematic, educational, fitness, food, dance, etc.
- Detects hook type: voice_hook, visual_hook, text_hook, shock_hook, curiosity_hook, etc.
- Falls back to `general` if classification fails

**Stage 2 — Category-Aware Analysis** (all frames):
- Scoring weights adapt per reel type (e.g. singing: emotion > cuts; meme: timing > intimacy)
- Niche-specific guidance for 20+ types
- Creator coach tone — no jargon

### JSON Response Keys (frontend depends on ALL of these)
```
niche, short_description, why_viral, why_rework
hook, retention, visual_quality, audio_quality, content_structure, editing, text_subtitles, compliance
  (each has: score, sub_scores, strengths[], improvements[])
video_summary, overall_summary, predicted_performance
top_3_wins[], top_3_fixes[], top_2_wins[]
suggested_captions[], suggested_hashtags[]
sync_timeline[], sync_score
_reel_type, _hook_type (metadata, non-breaking)
```

### Tone Rules
- Talk like a creator coach, NOT a video engineer
- NEVER use: LUFS, pacing degradation, frame cadence, normalization, transformation resolution
- Skip unavailable metrics entirely (no "N/A" comments)
- Each strength/improvement: complete sentence, 8-12 words
- top_3_fixes: 2-3 sentences with timestamps and concrete actions
- why_viral / why_rework: 2 complete sentences each

### Model Fallback Chain
`GEMINI_MODEL` env var → `gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-2.0-flash-lite` → `gemini-1.5-flash`

### Debug Mode
Set `DEBUG_ANALYSIS=true` on Railway to enable:
- Full trace logged to console
- JSON trace saved to `/debug-logs/analysis_TIMESTAMP.json`
- Includes: classification, rubric, metric interpretation, hallucination risks, raw Gemini response

---

## Instagram URL Download

Four strategies tried in order (`downloadInstagramReel` in `server.js`):
1. **Apify** (`apify/instagram-scraper`) — primary, uses residential proxies. Requires `APIFY_API_TOKEN`. ~$0.05-0.10/reel.
2. **Cobalt API** (`api.cobalt.tools`) — tried twice with 2s pause
3. **yt-dlp** — binary at `/app/bin/yt-dlp` (installed by postinstall script)
4. **yt-dlp-wrap** — npm package, self-downloads binary as last resort

---

## Auth System (`public/auth.js`)

- Pure vanilla JS — no Supabase SDK, uses direct REST API calls
- `signIn()`, `signUp()`, `signOut()`, `signInWithGoogle()`
- `handleOAuthCallback()` — processes Google OAuth hash tokens
- Session stored in `localStorage` as `creatorly_session`
- `isLoggedIn()` returns true if token valid OR refresh_token exists
- Auto-refresh: silently renews token 5 minutes before expiry
- `getRawSession()` — sync; `getSession()` — async with refresh

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
- Fixed 240px sidebar, collapsible to 64px (icons only)
- State persisted in `localStorage` as `creatorly_sidebar_collapsed`
- Top header hidden on desktop (sidebar has the logo)
- Nav items: Home, New Analysis, History, Profile

### Mobile (<1024px) — Bottom Navigation
- 4 items: Home, Analyse (+), History, Profile
- Centre "Analyse" button: elevated purple circle
- Profile button shows Instagram profile pic (proxied via `/api/image-proxy`, saved in `localStorage` as `creatorly_ig_pic`)
- Falls back to person icon if no username connected

### Navigation Logic
- `navigateTo('analyse')` — **always resets to upload view** (clears previous results)
- `navigateTo('history')` — shows history page, re-fetches from API every time
- `navigateTo('home')` — redirects to landing page

---

## Results Page Layout (`index.html` + `app.js`)

### Section Order:
1. **Score Card** — thumbnail (left, small, 9:16), score ring + niche pill + perf badge (right, 80/20 split), description below
2. **Verdict Card** — separate card with "What's the verdict?" header + 2-line verdict text
3. **TOP FIXES** — numbered items with High/Medium/Low impact badges
4. **REEL SCORES** — horizontally scrollable cards with ring charts (Hook, Visuals, Editing, Audio, Content, Retention, Text)
5. **VIDEO TIMELINE ANALYSIS** — full-width video player + color-coded timeline bar + issue rows
6. **CAPTION IDEAS** — 5 captions, each with Copy button
7. **TOP HASHTAGS FOR THIS REEL** — 10 hashtag pills, clickable to copy
8. **Analyse Another Reel** button

### Score Card Layout (confirmed wireframe):
```
┌─────────┐  ┌──────────────────────┐
│         │  │        (7.5/10)      │  ← 80% = Score ring
│  thumb  │  │                      │
│ (small) │  ├──────────────────────┤
│  0:38   │  │ Reaction · Average   │  ← 20% = Niche + Badge
└─────────┘  └──────────────────────┘
Short description of what the reel is about
```

### Reel Score Cards:
- Horizontally scrollable
- Each card: ring chart (color-coded) + score + label + Strong/Average/Weak badge + 2 bullet points
- 2 bullet points = 1 strength + 1 improvement (complete sentences, no truncation)

### Timeline:
- Full-width video player above timeline (current session only)
- Color-coded bar: red=critical, amber=improve, green=good (NO text inside segments)
- Issue rows below bar (only actual issues, not every frame)
- Draggable cursor (mouse + touch)
- Clicking thumbnail in score card scrolls to video

---

## Profile Analytics (`/profile`)

- Endpoint: `POST /api/profile-analytics` — uses `apify/instagram-profile-scraper`
- First visit: blurred preview + unlock card (enter username)
- Return visits: skeleton loading → auto-fetches saved username
- Username saved in `localStorage` as `creatorly_ig_username`
- Profile pic saved in `localStorage` as `creatorly_ig_pic` (proxied URL)
- Change username: edit icon (✏️) next to profile name → popup modal

### 8 Metrics (from last 10 reels):
1. Avg Reel Views
2. Avg Likes
3. Avg Comments
4. Avg Shares
5. Avg Saves
6. ER by Followers (%) = (Likes+Comments+Shares+Saves) ÷ Followers × 100
7. ER by Views (%) = (Likes+Comments+Shares+Saves) ÷ Views × 100
8. Reach Efficiency = Views ÷ Followers

### Niche Detection:
- Auto-detected from bio + captions using keyword matching
- 12 categories: Fitness, Travel, Food, Tech, Fashion, Beauty, Comedy, Education, Business, Music, Photography, Lifestyle

---

## Screen Lock / Network Drop Recovery

1. `localStorage.creatorly_inflight` set before request fires: `{ ts, authToken, recordId? }`
2. On network error: `tryRecoverResult()` polls every 5s for up to 3 minutes
3. `visibilitychange` (screen unlock) + `pageshow` (iOS bfcache) → silent background recovery
4. `checkPendingOnLoad()` on page load — discards entries >10 min old
5. Recovery is **silent** — no "Reconnecting..." messages, original progress UI preserved

---

## Analysis History

- `GET /api/history` — returns last 50 analyses (completed + failed)
- Failed analyses shown with red border, ❌ icon, error message
- Clicking completed item loads full results
- History re-fetches from API every time the tab is opened

---

## Image Proxy (`GET /api/image-proxy?url=...`)

- Proxies Instagram CDN images through the server to bypass CORS
- Used for: profile photos, reel thumbnails
- 24h cache header
- Graceful fallback on error

---

## Credits Bar

- Shows "X used / 5 available" with purple gradient progress bar
- Fetches from `GET /api/usage` on page load
- Hidden until data loads

---

## Custom Domain

- `api.creatorlyai.in` → Railway (CNAME to `i1uwfu0h.up.railway.app`)
- All `API_BASE` in frontend uses `https://api.creatorlyai.in`
- CORS in `server.js` allows `https://api.creatorlyai.in`

---

## Known Issues / TODO

- **Railway idle timeout** — Container sleeps after ~17s inactivity on hobby plan. Wakes on request.
- **Google OAuth test users** — App is in "testing" mode; only added test users can sign in with Google. Need to publish.
- **Thumbnail column migration** — Run `ALTER TABLE public.video_analyses ADD COLUMN IF NOT EXISTS thumbnail text;` in Supabase.
- **Apify video URL extraction** — `apify/instagram-scraper` sometimes returns data without a `videoUrl` field. Multiple field names are tried (`videoUrl`, `video_url`, `videoVersions[0].url`, etc.).
- **Instagram CDN CORS** — Profile pics and thumbnails can't be loaded directly from browser. Must use `/api/image-proxy`.

---

## Coding Conventions

- **No TypeScript** — pure vanilla JS throughout
- **No frontend framework** — plain HTML/CSS/JS
- **CSS variables** for theming — defined in `:root`
- **Mobile-first** — breakpoints at 1024px, 768px, 480px, 390px, 360px
- **iOS Safari fixes** — `viewport-fit=cover`, `font-size: max(16px, ...)` on inputs
- **No `&&` in shell commands** — use `;` or `&` (Windows CMD compatibility)
- All API calls include `Authorization: Bearer <token>` header
- Server extracts user from JWT via `extractUserId(req)` — no external JWT library
- **`fluent-ffmpeg .screenshots()`** is a terminal method — NEVER chain `.run()` after it
- **`vercel.json`** must have a route for every new HTML page AND every JS/CSS file it references
- **CSS `display: flex` overrides `hidden` attribute** — always add `[hidden] { display: none }` for flex elements that use `hidden`
- All CSS/JS in HTML use relative paths (`/style.css`, `/auth.js`) — never absolute Railway URLs

---

## Kiro Hooks

No active hooks. Steering file updates are done manually on request only.
