# Creatorly AI — Project Steering File

This file gives full context to any Kiro instance working on this project. Read it before making any changes.

---

## What This Project Is

**Creatorly AI** is a "Video Lab" SaaS tool for Indian Instagram/Reels creators. Users upload a video (or paste an Instagram URL) and get a deep AI-powered analysis — hook strength, retention, audio sync, editing quality, trend-fit score, suggested captions, hashtags, and a sync timeline. The result is called the **Creatorly Score**.

**Live URLs:**
- Frontend: `https://creatorlyai.in` (Vercel)
- Backend API: `https://web-production-7bc95.up.railway.app` (Railway)
- GitHub repo: `garavaggarwal/creatorlyai-ai-analysis`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JS — served statically from `/public` |
| Backend | Node.js + Express — deployed on Railway |
| AI Analysis | Google Gemini API (vision + text) via `@google/generative-ai` |
| Video Processing | FFmpeg (frame extraction, audio stats, scene cuts, thumbnail) via `ffmpeg-static` + `fluent-ffmpeg` |
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
│   ├── geminiAnalyser.js      # Gemini Vision prompt + model fallback chain
│   └── textAnalyser.js        # Caption + hashtag text analysis
├── public/
│   ├── index.html             # Analyser page (main app + sidebar + bottom nav + history)
│   ├── app.js                 # Analyser frontend logic (navigation, history, video player)
│   ├── auth.js                # Supabase auth module (shared across all pages)
│   ├── style.css              # Analyser styles (fully responsive, sidebar, bottom nav)
│   ├── landing.html           # Landing page
│   ├── landing.css            # Landing page styles
│   ├── landing.js             # Landing page JS (animations, typewriter, etc.)
│   ├── login.html             # Login/signup page
│   ├── login.css              # Login styles
│   └── login.js               # Login/signup form logic
├── apt.txt                    # Railway system packages: ffmpeg, python3, python3-pip
├── package.json               # Dependencies + postinstall (installs yt-dlp to /app/bin)
└── Procfile                   # Railway start command
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
| `GET` | `/health` | Health check |

All analysis endpoints accept an `Authorization: Bearer <supabase_jwt>` header to identify the user.

---

## Analysis Pipeline

```
Video File / Instagram URL
  → FFmpeg (extract frames, scene cuts, audio loudness, silence detection, thumbnail)
  → Gemini Vision API (analyse frames + metadata → JSON scores)
  → Text Analyser (caption + hashtag scoring)
  → Score Aggregator (weighted overall score)
  → Save to Supabase video_analyses table (including thumbnail)
  → Return to frontend
```

**Gemini model** is configurable via `GEMINI_MODEL` env var on Railway. Current recommended: `gemini-2.5-flash-preview-05-20`. Falls back through `gemini-1.5-flash` → `gemini-1.5-flash-8b` → `gemini-1.5-pro` if unavailable.

---

## Railway Environment Variables

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key (required) |
| `GEMINI_MODEL` | Gemini model name (optional, defaults to gemini-1.5-flash) |
| `SUPABASE_URL` | `https://iqfjyaqgazbcskuworvr.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key (secret — for server-side DB writes) |
| `MAX_ANALYSES_PER_USER` | Lifetime analysis limit per user (default: 5) |
| `MAX_ANALYSES_PER_DAY` | Daily limit (0 = disabled) |
| `MAX_ANALYSES_PER_MONTH` | Monthly limit (0 = disabled) |
| `YTDLP_PATH` | Optional: explicit path to yt-dlp binary |

---

## Supabase Setup

- **Project URL:** `https://iqfjyaqgazbcskuworvr.supabase.co`
- **Auth providers enabled:** Email/password + Google OAuth
- **Google OAuth redirect URI:** `https://iqfjyaqgazbcskuworvr.supabase.co/auth/v1/callback`
- **Table:** `video_analyses` — created via `supabase_migration.sql`
- **RLS:** Enabled. Users can only SELECT their own rows. Backend uses service_role key to INSERT/UPDATE (bypasses RLS).

### video_analyses table key fields
- `id`, `user_id`, `status` (processing/completed/failed), `source` (upload/instagram_url)
- `niche`, `original_filename`, `instagram_url`, `file_size_mb`
- All 12 scores: `overall_score`, `hook_score`, `retention_score`, `visual_score`, `audio_score`, `editing_score`, `content_score`, `text_score`, `compliance_score`, `sync_score`, `caption_score`, `hashtag_score`
- `predicted_performance`, `video_duration`, `video_resolution`, `video_fps`, `is_vertical`, `has_audio`, `scene_cuts`, `cuts_per_minute`, `silence_gaps`
- `overall_summary`, `video_summary`, `top_3_wins`, `top_3_fixes`, `suggested_captions`, `suggested_hashtags`, `sync_timeline`
- `full_result` (JSONB — complete Gemini response)
- `thumbnail` (text — base64 encoded first frame, added via `ALTER TABLE`)

**Migration note:** Run `ALTER TABLE public.video_analyses ADD COLUMN IF NOT EXISTS thumbnail text;` in Supabase SQL Editor to add the thumbnail column.

---

## Auth System (`public/auth.js`)

- Pure vanilla JS — no Supabase SDK, uses direct REST API calls
- `signIn()`, `signUp()`, `signOut()`, `signInWithGoogle()`
- `handleOAuthCallback()` — processes Google OAuth hash tokens on `/analyser` page
- Session stored in `localStorage` as `creatorly_session`
- `isLoggedIn()` returns true if token valid OR refresh_token exists
- Auto-refresh: silently renews token 5 minutes before expiry
- `getRawSession()` — sync, reads localStorage directly
- `getSession()` — async, refreshes if expired

---

## User Limits & Allowlist

Configured in `config.js`:

```js
MAX_ANALYSES_PER_USER: 5,  // lifetime cap (overridable via Railway env var)
UNLIMITED_EMAILS: [
  'vansh.2004.vg@gmail.com',
  'hrithikgarg2017@gmail.com',
]
```

These two emails bypass all limits. Add more to `UNLIMITED_EMAILS` as needed.

---

## Instagram URL Download

Three strategies tried in order (server.js `downloadInstagramReel`):
1. **Cobalt API** (`api.cobalt.tools`) — tried twice with 2s pause
2. **yt-dlp** — binary resolved at startup from `/app/bin/yt-dlp` (installed by postinstall script)
3. **yt-dlp-wrap** npm package — self-downloads binary from GitHub as last resort

**Known issue:** Instagram aggressively blocks Railway datacenter IPs. All three strategies may fail for private/blocked reels. The recommended fix (not yet implemented) is to use a RapidAPI Instagram downloader service or route yt-dlp through a residential proxy.

---

## Screen Lock / Network Drop Recovery

When a user locks their screen or loses connection mid-analysis:

1. `localStorage.creatorly_inflight` is set **before** the request fires with `{ ts, authToken, recordId? }`
2. On network error, `tryRecoverResult()` polls `/api/result/:id` every 5s for up to 3 minutes
3. `visibilitychange` event fires when screen unlocks — immediately checks for completed result
4. `pageshow` event fires when iOS Safari restores page from bfcache — triggers same recovery flow
5. On page load, `checkPendingOnLoad()` checks for stale in-flight entries (discards if >10 min old)

**Silent recovery (no UI changes):**
- Recovery happens completely in the background
- Original progress UI state is preserved (no "Reconnecting..." messages)
- `pollRecord()` and `pollLatestRecord()` accept a `silent` parameter to suppress UI updates
- User sees the same progress animation continue seamlessly after unlock
- Results appear automatically when analysis completes

**iOS/Android specific fixes:**
- Removed `progressCard.hidden` check from `visibilitychange` handler — recovery works regardless of UI state
- Added `pageshow` event listener to catch iOS back-forward cache restoration
- Both events trigger immediate result check + silent polling if needed

---

## Navigation System

### Desktop (≥1024px) — Left Sidebar
- Fixed 240px sidebar with logo, nav items, and user info at bottom
- **Collapsible**: toggle button collapses to 64px (icons only), state persisted in localStorage
- Top header is hidden on desktop (sidebar has the logo)
- Nav items: Home (→ landing), New Analysis, History
- Active state highlighted with color-coded border

### Mobile (<1024px) — Bottom Navigation
- Fixed bottom nav bar with 3 tabs: Home, Analyse (+), History
- Centre "Analyse" button has elevated purple circle design
- Bottom nav hidden on desktop

### Navigation Logic (`navigateTo()`)
- `'home'` → redirects to landing page (`/`)
- `'analyse'` → shows upload/analysis view (default)
- `'history'` → shows full-page history list, hides hero/main/footer

---

## Analysis History

### Backend (`GET /api/history`)
- Returns last 50 analyses for the authenticated user
- Includes both `completed` and `failed` analyses
- Returns: `id`, `createdAt`, `source`, `status`, `filename`, `score`, `thumbnail`, `niche`, `duration`, `error`

### Frontend (History Page)
- Full-page list view with each item showing: thumbnail/icon, filename, source icon, date, niche badge, score
- Failed analyses shown with red border, ❌ icon, "Failed" badge, and truncated error message
- Clicking a completed item loads full analysis results
- Clicking a failed item shows the error

### Thumbnails
- Extracted during FFmpeg analysis as base64 JPEG (320px wide, first frame)
- Stored in `thumbnail` column of `video_analyses` table
- Shown in history list and next to score ring on results page
- `extractThumbnail()` in `ffmpegHelper.js` — uses `.screenshots()` (terminal method, no `.run()`)

---

## Video Player + Timeline Sync

On the results page, when a video was just uploaded (current session):
- Video player shown above the sync timeline
- Play/pause button with icon toggle
- Time display (current / total)
- Timeline playhead (white vertical line) moves in sync with video playback
- Click anywhere on timeline bar to seek video
- Video stored as Object URL in browser memory (not on server)
- For history items: thumbnail shown, no video playback (file not stored)

---

## Score Breakdown UI

- **Horizontally scrollable chips** — each chip shows icon, score number, and label
- **Detail card below** — shows full detail (sub-scores, strengths, improvements) for the selected metric
- Only one detail card visible at a time
- First chip auto-selected on load
- Active chip highlighted with color-coded border and glow (green/yellow/red)
- 8 metrics: Hook, Retention, Visual, Audio, Content, Editing, Text, Compliance

---

## Frontend Pages

### `/analyser` (index.html + app.js)
- Two tabs: **Upload Reel** and **Instagram Link**
- Submit button always says "Analyse Reel" (disabled until file selected / URL entered)
- Progress card shows 3-step animation during analysis
- Results: score ring + thumbnail, wins/fixes, horizontally scrollable score breakdown with detail card, caption/hashtag analysis, suggested captions, suggested hashtags, video info grid, video player + sync timeline
- Error card with "Try Again" button
- History page (toggled via navigation)
- Desktop: left sidebar (collapsible), no top header
- Mobile: top header + bottom navigation bar

### `/login` (login.html + login.js)
- Split layout: left panel (desktop only) with animated reel mockups + stats
- Right panel: email/password login + signup tabs + Google OAuth button
- Mobile: fixed top bar "Creatorly AI" links to homepage (real HTML element, not CSS pseudo — iOS Safari fix)
- Session persists via localStorage with auto-refresh

### `/` (landing.html + landing.js)
- Marketing landing page with hero, live demo section, how-it-works, features grid, testimonials carousel, CTA

---

## Known Issues / TODO

- **Instagram URL blocking** — Railway IPs are blocked by Instagram. Need RapidAPI or residential proxy solution.
- **yt-dlp-wrap deprecated** — npm warns `yt-dlp-wrap@2.3.12` is no longer supported. Works for now but may need replacing.
- **`fluent-ffmpeg` deprecated** — npm warns about this too. Works fine currently.
- **Google OAuth test users** — while the Google Cloud OAuth app is in "testing" mode, only added test users can sign in with Google. Need to publish the app for all users.
- **Thumbnail column migration** — must run `ALTER TABLE public.video_analyses ADD COLUMN IF NOT EXISTS thumbnail text;` manually in Supabase. Old analyses won't have thumbnails.

---

## Kiro Hooks

A Kiro `agentStop` hook exists at `.kiro/hooks/update-steering-on-stop.kiro.hook` but is **disabled** (`"enabled": false`). Steering file updates are done manually on request.

---

## Coding Conventions

- **No TypeScript** — pure vanilla JS throughout
- **No frontend framework** — plain HTML/CSS/JS
- **CSS variables** for theming — defined in `:root` in each CSS file
- **Mobile-first responsive** — breakpoints at 1024px, 768px, 480px, 390px, 360px
- **iOS Safari fixes** — `viewport-fit=cover`, `font-size: max(16px, ...)` on inputs, `visibilitychange` for background/foreground detection
- **No `&&` in shell commands** — use `;` or `&` (Windows CMD compatibility)
- All API calls from frontend include `Authorization: Bearer <token>` header
- Server extracts user from JWT via `extractUserId(req)` and `extractUserEmail(req)` — no external JWT library
- **fluent-ffmpeg `.screenshots()`** is a terminal method — never chain `.run()` after it
