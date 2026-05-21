-- ─────────────────────────────────────────────────────────────────────────────
-- Creatorly AI — video_analyses table
-- Run this in Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.video_analyses (

  -- Identity
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,

  -- Request metadata
  status              text not null default 'processing'  -- processing | completed | failed
                        check (status in ('processing', 'completed', 'failed')),
  source              text not null default 'upload'      -- upload | instagram_url
                        check (source in ('upload', 'instagram_url')),
  niche               text,
  original_filename   text,
  instagram_url       text,
  file_size_mb        numeric(8,2),

  -- Timestamps
  created_at          timestamptz not null default now(),
  completed_at        timestamptz,

  -- Error (if failed)
  error_message       text,

  -- ── Scores ──────────────────────────────────────────────────────────────
  overall_score       numeric(4,1),
  hook_score          numeric(4,1),
  retention_score     numeric(4,1),
  visual_score        numeric(4,1),
  audio_score         numeric(4,1),
  editing_score       numeric(4,1),
  content_score       numeric(4,1),
  text_score          numeric(4,1),
  compliance_score    numeric(4,1),
  sync_score          numeric(4,1),
  caption_score       numeric(4,1),
  hashtag_score       numeric(4,1),

  -- ── Predicted performance ────────────────────────────────────────────────
  predicted_performance text,  -- below_average | average | above_average | viral_potential

  -- ── Video metadata ───────────────────────────────────────────────────────
  video_duration      numeric(8,2),
  video_resolution    text,
  video_fps           numeric(6,2),
  is_vertical         boolean,
  has_audio           boolean,
  scene_cuts          integer,
  cuts_per_minute     numeric(6,2),
  silence_gaps        integer,

  -- ── AI outputs ───────────────────────────────────────────────────────────
  overall_summary     text,
  video_summary       text,
  top_3_wins          jsonb default '[]',
  top_3_fixes         jsonb default '[]',
  suggested_captions  jsonb default '[]',
  suggested_hashtags  jsonb default '[]',
  sync_timeline       jsonb default '[]',

  -- Full result blob (for future use / re-rendering)
  full_result         jsonb,

  -- Thumbnail (base64 or URL)
  thumbnail           text

);

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_video_analyses_user_id    on public.video_analyses(user_id);
create index if not exists idx_video_analyses_created_at on public.video_analyses(created_at desc);
create index if not exists idx_video_analyses_status     on public.video_analyses(status);

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table public.video_analyses enable row level security;

-- Users can only read their own analyses
create policy "Users can view own analyses"
  on public.video_analyses for select
  using (auth.uid() = user_id);

-- Only the service role (backend) can insert/update — frontend never writes directly
-- (No insert/update policy for authenticated role — backend uses service_role key)


-- ── Profile Analytics Cache ───────────────────────────────────────────────────
create table if not exists public.profile_analytics_cache (
  username            text primary key,
  profile_data        jsonb not null,
  updated_at          timestamptz not null default now()
);

-- Access policies for profile_analytics_cache
alter table public.profile_analytics_cache enable row level security;

-- Only service role (backend) can write, public can read
create policy "Anyone can read cached profiles"
  on public.profile_analytics_cache for select
  using (true);

