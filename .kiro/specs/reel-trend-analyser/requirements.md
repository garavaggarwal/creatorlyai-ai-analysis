# Requirements Document

## Introduction

The Reel Trend Analyser is an enhancement to the existing Creatorly Video Lab API that makes video analysis trend-aware. Currently, when a creator submits a reel for analysis, the system evaluates it against static best-practice criteria. This feature adds a trend intelligence layer so that every analysis is contextualised against what is currently performing well on short-form video platforms (Instagram Reels, TikTok). The system will maintain a configurable trend knowledge base, inject relevant trend signals into the Gemini AI prompt, and return a structured trend-fit report alongside the existing analysis scores — giving creators actionable, timely feedback rather than generic advice.

---

## Glossary

- **Trend_Analyser**: The new module responsible for fetching, storing, and serving trend data to the rest of the system.
- **Trend_Store**: The persistent or in-memory store that holds the current trend knowledge base (formats, audio styles, visual styles, niche-specific patterns).
- **Trend_Profile**: A structured object describing a single trend — its name, niche tags, signals (audio, visual, format), and an expiry timestamp.
- **Gemini_Analyser**: The existing `analysers/geminiAnalyser.js` module that sends frames and a prompt to the Gemini Vision API.
- **Text_Analyser**: The existing `analysers/textAnalyser.js` module that evaluates captions and hashtags.
- **Trend_Fit_Score**: A numeric score (0–10) representing how well a submitted reel aligns with currently active trends for its niche.
- **Trend_Report**: The structured output object containing the Trend_Fit_Score, matched trends, missed opportunities, and trend-specific recommendations.
- **Niche**: The content category provided by the creator at submission time (e.g., "fitness", "food", "tech", "aesthetic").
- **Admin_API**: A set of protected HTTP endpoints used to manage the Trend_Store (add, update, delete trend profiles).
- **API_Server**: The existing Express application in `server.js`.

---

## Requirements

### Requirement 1: Trend Knowledge Base Management

**User Story:** As a platform administrator, I want to manage a library of current social media trends, so that the analysis engine always reflects what is actually trending right now.

#### Acceptance Criteria

1. THE Trend_Store SHALL persist Trend_Profile objects that each contain: a unique `id`, a human-readable `name`, an array of `nicheTags`, a `signals` object (with `audioKeywords`, `visualKeywords`, `formatHints` arrays), a `platformRelevance` array (e.g., `["instagram", "tiktok"]`), and an ISO-8601 `expiresAt` timestamp.
2. WHEN an administrator sends a valid `POST /api/admin/trends` request with a complete Trend_Profile payload, THE Admin_API SHALL store the Trend_Profile in the Trend_Store and return the stored object with HTTP 201.
3. WHEN an administrator sends a `PUT /api/admin/trends/:id` request with updated fields, THE Admin_API SHALL update the matching Trend_Profile in the Trend_Store and return the updated object with HTTP 200.
4. WHEN an administrator sends a `DELETE /api/admin/trends/:id` request, THE Admin_API SHALL remove the matching Trend_Profile from the Trend_Store and return HTTP 204.
5. IF a `POST` or `PUT` request is missing required fields (`name`, `nicheTags`, `signals`, `expiresAt`), THEN THE Admin_API SHALL return HTTP 400 with a descriptive error message identifying the missing fields.
6. WHEN a `GET /api/admin/trends` request is received, THE Admin_API SHALL return all Trend_Profiles currently in the Trend_Store as a JSON array.
7. WHERE an `ADMIN_API_KEY` environment variable is set, THE Admin_API SHALL require a matching `x-admin-key` header on all `/api/admin/trends` routes and return HTTP 401 if the header is absent or incorrect.

---

### Requirement 2: Trend Retrieval and Expiry

**User Story:** As the analysis engine, I want to retrieve only active, niche-relevant trends at analysis time, so that expired or irrelevant trends do not pollute the results.

#### Acceptance Criteria

1. WHEN the Trend_Analyser is asked for trends for a given niche, THE Trend_Analyser SHALL return only Trend_Profiles whose `expiresAt` is in the future at the time of the call.
2. WHEN the Trend_Analyser is asked for trends for a given niche, THE Trend_Analyser SHALL return only Trend_Profiles whose `nicheTags` array contains the requested niche (case-insensitive match) or contains the value `"general"`.
3. IF no active Trend_Profiles match the requested niche, THEN THE Trend_Analyser SHALL return an empty array without throwing an error.
4. THE Trend_Store SHALL support a maximum of 200 concurrent Trend_Profiles; IF an add operation would exceed this limit, THEN THE Admin_API SHALL return HTTP 422 with the message `"Trend store capacity reached"`.

---

### Requirement 3: Trend-Aware Gemini Prompt Injection

**User Story:** As a creator, I want the AI analysis to know what is trending in my niche, so that the feedback I receive is relevant to the current social media landscape rather than generic best practices.

#### Acceptance Criteria

1. WHEN the Gemini_Analyser builds the analysis prompt, THE Gemini_Analyser SHALL include a `### CURRENT TRENDS` section that lists the `name` and `signals` of each active Trend_Profile returned by the Trend_Analyser for the submitted niche.
2. WHEN no active trends are available for the submitted niche, THE Gemini_Analyser SHALL build the prompt without a `### CURRENT TRENDS` section and SHALL NOT alter any other part of the prompt.
3. THE Gemini_Analyser SHALL instruct Gemini to evaluate the reel against the listed trends and populate a `trend_fit` object in its JSON response.
4. THE Gemini_Analyser SHALL include in the prompt the instruction that the `trend_fit` object MUST contain: `score` (0–10 integer), `matched_trends` (array of trend names the reel aligns with), `missed_trends` (array of active trend names the reel does not leverage), and `trend_recommendations` (array of concise, niche-specific action items of 10 words or fewer each).
5. IF Gemini returns a response that does not include a valid `trend_fit` object, THEN THE Gemini_Analyser SHALL set `trend_fit` to `null` in the final result without failing the overall analysis.

---

### Requirement 4: Trend Fit Score in Analysis Response

**User Story:** As a creator, I want to see a clear trend-fit score and specific recommendations in my analysis results, so that I know exactly how to adjust my content to ride current trends.

#### Acceptance Criteria

1. WHEN the `/api/analyse` endpoint returns a successful response, THE API_Server SHALL include the `trend_fit` object (or `null`) from the Gemini analysis in the top-level `results` object.
2. WHEN `trend_fit.score` is a valid integer between 0 and 10, THE API_Server SHALL include `trend_fit.score` in the weighted overall score calculation with a weight of 0.10, reducing the `compliance` weight from 0.03 to 0.03 and adding `trend_fit` as a new weighted dimension.
3. THE API_Server SHALL include a `trends_used` array in the `results` object listing the `name` and `expiresAt` of each Trend_Profile that was injected into the analysis prompt, so the creator knows which trends were considered.
4. IF `trend_fit` is `null` (no trends available or Gemini parse failure), THEN THE API_Server SHALL compute `overall_score` using the existing weights without the trend dimension and SHALL set `trends_used` to an empty array.

---

### Requirement 5: Trend-Aware Caption and Hashtag Suggestions

**User Story:** As a creator, I want my caption and hashtag analysis to reflect trending keywords and tags for my niche, so that my post metadata helps the algorithm surface my content to the right audience.

#### Acceptance Criteria

1. WHEN the Text_Analyser analyses hashtags, THE Text_Analyser SHALL compare the submitted hashtags against the `audioKeywords` and `visualKeywords` signals of active Trend_Profiles for the submitted niche.
2. WHEN one or more active trend signals match submitted hashtags (case-insensitive), THE Text_Analyser SHALL include a `trending_hashtags_used` array in the hashtag result listing the matched tags.
3. WHEN active trend signals exist but none of the submitted hashtags match them, THE Text_Analyser SHALL include a `trending_hashtag_suggestions` array in the hashtag result containing up to 5 suggested hashtags derived from the active trend signals.
4. IF no active trends are available for the niche, THEN THE Text_Analyser SHALL set both `trending_hashtags_used` and `trending_hashtag_suggestions` to empty arrays without altering any other part of the hashtag analysis.

---

### Requirement 6: Trend Data Seeding

**User Story:** As a developer deploying the system, I want the Trend_Store to be pre-populated with a baseline set of trends on first startup, so that the system provides useful trend-aware analysis immediately without requiring manual admin setup.

#### Acceptance Criteria

1. WHEN the API_Server starts and the Trend_Store contains zero Trend_Profile entries, THE API_Server SHALL load and insert a set of seed Trend_Profiles from a `trends.seed.json` file located in the project root.
2. THE seed file SHALL contain at least 10 Trend_Profiles covering a minimum of 5 distinct niches (e.g., fitness, food, tech, aesthetic, comedy).
3. IF the `trends.seed.json` file is absent or contains invalid JSON, THEN THE API_Server SHALL log a warning and continue startup without crashing.
4. WHEN the Trend_Store already contains one or more Trend_Profile entries at startup, THE API_Server SHALL skip the seeding step entirely.

---

### Requirement 7: Trend Store Health and Observability

**User Story:** As a developer operating the system, I want to monitor the state of the Trend_Store, so that I can detect when trends are stale or the store is empty and take corrective action.

#### Acceptance Criteria

1. WHEN a `GET /health` request is received, THE API_Server SHALL include a `trends` object in the health response containing: `total` (total Trend_Profile count), `active` (count of non-expired profiles), and `expiringSoon` (count of profiles expiring within 24 hours).
2. WHEN the count of active Trend_Profiles drops to zero, THE API_Server SHALL log a warning message `"[TrendStore] WARNING: No active trends available. Analysis will proceed without trend context."` at the WARNING log level.
3. THE API_Server SHALL expose a `GET /api/trends/public` endpoint that returns the `name`, `nicheTags`, and `expiresAt` of all active Trend_Profiles without exposing `signals` or internal fields, requiring no authentication.
