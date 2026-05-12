// ─── Creatorly AI — App Configuration ────────────────────────────────────────
// Edit these values to change limits without touching business logic.

module.exports = {

  // ── Analysis limits ──────────────────────────────────────────────────────
  // Maximum number of video analyses a user can run (resets never — lifetime cap).
  // Set to 0 for unlimited.
  MAX_ANALYSES_PER_USER: parseInt(process.env.MAX_ANALYSES_PER_USER || '5', 10),

  // ── Future: per-day / per-month limits (set to 0 to disable) ─────────────
  MAX_ANALYSES_PER_DAY:   parseInt(process.env.MAX_ANALYSES_PER_DAY   || '0', 10),
  MAX_ANALYSES_PER_MONTH: parseInt(process.env.MAX_ANALYSES_PER_MONTH || '0', 10),

  // ── Unlimited access emails ───────────────────────────────────────────────
  // These users bypass all limits entirely. Add more emails as needed.
  UNLIMITED_EMAILS: [
    'vansh.2004.vg@gmail.com',
    'hrithikgarg2017@gmail.com',
  ],

};
