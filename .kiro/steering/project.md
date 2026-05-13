# Creatorly AI — Project Steering File

This file gives full context to any Kiro instance working on this project. Read it before making any changes.

---

## What This Project Is

**Creatorly AI** is a "Video Lab" SaaS tool for Indian Instagram/Reels creators. Users upload a video (or paste an Instagram URL) and get a deep AI-powered analysis — hook strength, retention, audio sync, editing quality, trend-fit score, suggested captions, hashtags, and a sync timeline. The result is called the **Creatorly Score**.

**Live URLs:**
- Frontend: `https://creatorlyai.in` (Vercel)
- Backend API: `https://web-production-7bc95.up.railway.app` (Railway)
- Backend API (custom domain, for Indian ISPs): `https://api.creatorlyai.in` → Railway (CNAME setup in progress)
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
│   ├── login.js               # Login/signup form logic
│   ├── profile.html           # Profile analytics page
│   ├── profile.css            # Profile page styles
│   └── profile.js             # Profile analytics frontend logic
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
| `POST` | `/api/profile-analytics` | Fetch Instagram profile metrics via Apify |
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

**Gemini model** is configurable via `GEMINI_MODEL` env var on Railway. Current recommended: `gemini-2.5-flash-preview-05-20`. Falls back through `gemini-1.5-flash` → `gemini-1.5-flash-8b` → `gemini-1.5-pro` if unavailable. The text analyser also uses `GEMINI_MODEL` (previously hardcoded to `gemini-1.5-flash` which returned 404).

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
| `APIFY_API_TOKEN` | Apify API token for Instagram reel download (primary strategy) |

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

Four strategies tried in order (server.js `downloadInstagramReel`):
1. **Apify** (`apify/instagram-scraper` actor) — primary strategy, uses residential proxies that Instagram doesn't block. Requires `APIFY_API_TOKEN` env var. Extracts video CDN URL from reel, then downloads locally. ~$0.05–0.10 per reel. Free tier ($5/month) = ~50–100 reels.
2. **Cobalt API** (`api.cobalt.tools`) — tried twice with 2s pause (fallback)
3. **yt-dlp** — binary resolved at startup from `/app/bin/yt-dlp` (installed by postinstall script)
4. **yt-dlp-wrap** npm package — self-downloads binary from GitHub as last resort

**Dependencies:** `apify-client` npm package added for Strategy 1.

**Known issue:** Strategies 2–4 often fail because Instagram blocks Railway datacenter IPs. Apify (Strategy 1) resolves this by running on proxied infrastructure.

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
- Nav items: Home (→ landing), New Analysis, History, Profile (→ `/profile`)
- Active state highlighted with color-coded border

### Mobile (<1024px) — Bottom Navigation
- Fixed bottom nav bar with 4 items: Home, Analyse (+), History, Profile
- Centre "Analyse" button has elevated purple circle design
- Profile link navigates to `/profile` page
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
- Returns: `id`, `createdAt`, `source`, `status`, `filename`, `score`, `thumbnail`, `summary`, `niche`, `duration`, `error`
- `summary` is derived from `overall_summary` or `video_summary` (Gemini-generated one-liner)

### Frontend (History Page)
- Full-page list view with each item showing: thumbnail, 3-5 word video description, date, niche badge, score
- **Re-fetches history from API every time the History tab is opened** (fixes stale data / Railway cold start issues)
- Thumbnail shown as actual video screenshot (base64 JPEG from first frame)
- Description shows first 3-5 words of the video summary (not the raw filename)
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
- **Caption Analysis and Hashtag Analysis cards have been removed** from the results page (suggested captions/hashtags still shown)

---

## Profile Analytics (`/profile`)

A dedicated page for Instagram creator profile metrics. Uses Apify's `instagram-profile-scraper` actor.

### Endpoint: `POST /api/profile-analytics`
- Input: `{ username: "virat.kohli" }`
- Requires `APIFY_API_TOKEN` env var
- Returns profile data + calculated metrics (~15–30 seconds)

### 8 Metrics Calculated (from last 10 reels):
1. **Avg Reel Views** — mean views across last 10 reels
2. **Avg Likes** — mean likes across last 10 reels
3. **Avg Comments** — mean comments across last 10 reels
4. **Avg Shares** — mean shares across last 10 reels (virality indicator)
5. **Avg Saves** — mean saves across last 10 reels (content value signal)
6. **ER by Followers (%)** — (Likes+Comments+Shares+Saves) ÷ Followers × 100
7. **ER by Views (%)** — (Likes+Comments+Shares+Saves) ÷ Views × 100
8. **Reach Efficiency** — Views ÷ Followers (shows as multiplier like 2.5x)

### Frontend Components:
- **Blurred preview + unlock card** — shown on first visit (no username saved)
- **Skeleton loading** — pulsing card placeholders while data loads (no spinner)
- Profile header (avatar fallback, name, bio, verified badge, niche tag, edit button)
- Stats row (followers + total posts only, no following)
- Key metrics grid (8 metric cards with color-coded values)
- Views & likes trend bar chart (last 10 posts)
- Recent posts grid with emoji fallbacks (Instagram CDN blocks cross-origin images) — clickable → opens Instagram
- **Change username popup** — edit icon next to profile name opens a modal with blurred backdrop, input for new username, Update button, and ✕ close button

### Niche Detection:
- Auto-detected from bio text + recent captions using keyword matching
- 12 categories: Fitness, Travel, Food, Tech, Fashion, Beauty, Comedy, Education, Business, Music, Photography, Lifestyle
- Falls back to Instagram business category if available

### Username Persistence:
- Saved in `localStorage` as `creatorly_ig_username`
- Auto-fetches on return visits (shows skeleton loading)
- Change via edit popup → saves new username → re-fetches

### Files:
- `public/profile.html` — page structure (blurred preview, skeleton, results, popup)
- `public/profile.css` — profile-specific styles (skeleton animation, popup overlay)
- `public/profile.js` — fetch + render logic

### CSS Note:
- `.popup-overlay[hidden] { display: none }` — required because `display: flex` overrides the HTML `hidden` attribute

---

## Frontend Pages

### `/analyser` (index.html + app.js)
- Two tabs: **Upload Reel** and **Instagram Link**
- **Credits bar** at top showing "X used / 5 available" with purple gradient progress bar (fetches from `/api/usage`)
- Submit button always says "Analyse Reel" (disabled until file selected / URL entered)
- Progress card shows 3-step animation during analysis
- Results: score ring + thumbnail, wins/fixes, horizontally scrollable score breakdown with detail card, suggested captions, suggested hashtags, sync timeline + video player, video info grid
- **Section order**: Score ring → Wins/Fixes → Score Breakdown → Suggested Captions/Hashtags → Sync Timeline (above Video Info) → Video Info → Analyse Another
- Error card with "Try Again" button
- History page (toggled via navigation, re-fetches on every open)
- Desktop: left sidebar (collapsible), no top header
- Mobile: top header + bottom navigation bar

### `/login` (login.html + login.js)
- Split layout: left panel (desktop only) with animated reel mockups + stats
- Right panel: email/password login + signup tabs + Google OAuth button
- Mobile: fixed top bar "Creatorly AI" links to homepage (real HTML element, not CSS pseudo — iOS Safari fix)
- Session persists via localStorage with auto-refresh

### `/` (landing.html + landing.js)
- Marketing landing page with hero, live demo section, how-it-works, features grid, testimonials carousel, CTA

### `/profile` (profile.html + profile.js + profile.css)
- Instagram profile analytics page
- User enters Instagram username → Apify scrapes profile data → renders analytics
- **Profile photo** loaded via `/api/image-proxy` to bypass Instagram CDN CORS
- **Reel thumbnails** also loaded via image proxy with fallback to emoji icons
- Key metrics: Avg Views, Avg Likes, Avg Comments, Avg Shares, Avg Saves, ER by Followers, ER by Views, Reach Efficiency
- Views/Likes trend chart (bar chart, last 10 posts)
- Recent posts grid with thumbnails, likes, comments
- Bottom nav: Home, Analyse, History, Profile (consistent with analyser page)
- Username saved in localStorage for persistence across sessions

---

## Image Proxy (`GET /api/image-proxy`)

- Proxies external image URLs through the server to bypass CORS
- Used for Instagram profile photos and reel thumbnails
- Accepts `?url=<encoded_url>` query parameter
- Sets `Cache-Control: public, max-age=86400` (24h cache)
- Falls back gracefully on error

### `/profile` (profile.html + profile.js + profile.css)
- First visit: blurred preview cards + unlock overlay (enter username)
- Return visits: skeleton loading animation → auto-fetches saved username
- Displays: profile header (with edit button), 8 key metrics, views/likes trend chart, recent posts (clickable → Instagram)
- Change username popup: edit icon → blurred modal → enter new username → Update
- Bottom nav with Profile tab active
- Auth required (redirects to login if not logged in)

---

## Known Issues / TODO

- **Indian ISP blocking Railway** — Many Indian ISPs (Jio, Airtel, Vi) block `*.up.railway.app` domains. Custom domain `api.creatorlyai.in` is being set up (CNAME → `i1uwfu0h.up.railway.app`) to bypass this. Once DNS propagates, `API_BASE` in `app.js` must be switched to `https://api.creatorlyai.in`.
- **Railway idle timeout** — Container sleeps after ~17 seconds of inactivity on the hobby plan ($5/month credit). Wakes on request but Indian users can't trigger wake-up due to ISP blocking.
- **Instagram URL blocking** — ~~Railway IPs are blocked by Instagram.~~ **Resolved** by adding Apify as primary download strategy (uses residential proxies). Cobalt/yt-dlp remain as fallbacks.
- **yt-dlp-wrap deprecated** — npm warns `yt-dlp-wrap@2.3.12` is no longer supported. Works for now but may need replacing.
- **`fluent-ffmpeg` deprecated** — npm warns about this too. Works fine currently.
- **Google OAuth test users** — while the Google Cloud OAuth app is in "testing" mode, only added test users can sign in with Google. Need to publish the app for all users.
- **Thumbnail column migration** — must run `ALTER TABLE public.video_analyses ADD COLUMN IF NOT EXISTS thumbnail text;` manually in Supabase. Old analyses won't have thumbnails.

---

## Kiro Hooks

No active hooks. The `agentStop` hook for auto-updating the steering file has been removed. Steering file updates are done manually on request only.

---

## Credits Bar (Analyser Page)

- Shown at the top of the analyser page, above the upload card
- Displays "X used / 5 available" with a purple gradient progress bar
- Fetches data from `GET /api/usage` on page load
- Only visible when user is logged in
- Bar fills proportionally (1/5 = 20%, 2/5 = 40%, etc.)
- Hidden until usage data is successfully fetched

---

## Custom Domain Setup (api.creatorlyai.in)

Indian ISPs block `*.up.railway.app`. To fix this:
1. Railway custom domain added: `api.creatorlyai.in` → port 8080
2. DNS records needed on GoDaddy:
   - CNAME: `api` → `i1uwfu0h.up.railway.app` (TTL: 1/2 hour)
   - TXT: `_railway-verify.api` → `railway-verify=2b07ca81be3600b0e24afefea4...` (from Railway)
3. Once verified, update `API_BASE` in `public/app.js` to `https://api.creatorlyai.in`
4. Also update CORS allowed origins in `server.js` (already added `https://api.creatorlyai.in`)

**Status:** CNAME added on GoDaddy, waiting for Railway DNS verification (yellow triangle → green).

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
- **All CSS/JS references in HTML use relative paths** (`/landing.css`, `/auth.js`) — never absolute Railway URLs
- **`vercel.json`** must have routes for every static file referenced from HTML (including `auth.js`)
