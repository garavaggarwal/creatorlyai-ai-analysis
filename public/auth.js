/* ── Supabase Auth Module ── */
const SUPABASE_URL = 'https://iqfjyaqgazbcskuworvr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxZmp5YXFnYXpiY3NrdXdvcnZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjQ3MDQsImV4cCI6MjA5NDAwMDcwNH0.kS-mSh26PFPh60_mSa01bgVlEBi40Oj1_WGDCqtgo0c';

/* ── Direct Supabase REST call ── */
async function supabaseRequest(endpoint, method = 'GET', body = null, token = null) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`,
    };
    const res = await fetch(`${SUPABASE_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Invalid server response'); }
    if (!res.ok) {
      const msg = data.error_description || data.msg || data.message || data.error || JSON.stringify(data);
      throw new Error(msg);
    }
    return data;
  } catch (err) {
    if (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('CORS')) {
      throw new Error('Connection failed. Please check your internet and try again.');
    }
    throw err;
  }
}

/* ── Sign Up ── */
async function signUp({ email, password, fullName, instagramHandle, mobile }) {
  const data = await supabaseRequest('/auth/v1/signup', 'POST', {
    email,
    password,
    data: {
      full_name: fullName || '',
      instagram_handle: instagramHandle || '',
      mobile: mobile || '',
    },
  });

  if (data.user || data.id) {
    const user = data.user || data;
    if (data.access_token) saveSession(data);
    return { user };
  }
  throw new Error('Signup failed — please try again');
}

/* ── Sign In ── */
async function signIn({ email, password }) {
  const data = await supabaseRequest(
    '/auth/v1/token?grant_type=password',
    'POST',
    { email, password }
  );
  if (data.access_token) {
    saveSession(data);
    return { user: data.user };
  }
  throw new Error('Invalid email or password');
}

/* ── Google OAuth ── */
async function signInWithGoogle() {
  // Build the redirect URL back to the analyser after OAuth completes
  const redirectTo = encodeURIComponent(window.location.origin + '/analyser');
  const oauthUrl =
    `${SUPABASE_URL}/auth/v1/authorize` +
    `?provider=google` +
    `&redirect_to=${redirectTo}` +
    `&access_type=offline` +   // request refresh_token from Google
    `&prompt=select_account`;  // always show account picker

  window.location.href = oauthUrl;
}

/* ── Handle OAuth callback (hash fragment from Supabase redirect) ── */
function handleOAuthCallback() {
  // Supabase returns tokens in the URL hash: #access_token=...&refresh_token=...
  const hash = window.location.hash;
  if (!hash) return false;

  const params = new URLSearchParams(hash.replace('#', ''));
  const accessToken  = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const expiresIn    = parseInt(params.get('expires_in') || '3600', 10);
  const tokenType    = params.get('token_type');

  if (!accessToken) return false;

  // Fetch user info from Supabase using the token
  supabaseRequest('/auth/v1/user', 'GET', null, accessToken)
    .then(user => {
      saveSession({
        access_token:  accessToken,
        refresh_token: refreshToken,
        expires_in:    expiresIn,
        user,
      });
      // Clean the hash from the URL without a page reload
      history.replaceState(null, '', window.location.pathname);
    })
    .catch(() => {
      // Fallback: save without user object, will be fetched on next load
      saveSession({ access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn, user: null });
      history.replaceState(null, '', window.location.pathname);
    });

  return true;
}

/* ── Refresh session using refresh_token ── */
async function refreshSession() {
  const session = getRawSession();
  if (!session?.refresh_token) return null;

  try {
    const data = await supabaseRequest(
      '/auth/v1/token?grant_type=refresh_token',
      'POST',
      { refresh_token: session.refresh_token }
    );
    if (data.access_token) {
      saveSession(data);
      return data;
    }
  } catch (err) {
    console.warn('Session refresh failed:', err.message);
    clearSession();
  }
  return null;
}

/* ── Sign Out ── */
async function signOut() {
  const session = getRawSession();
  if (session?.access_token) {
    try {
      await supabaseRequest('/auth/v1/logout', 'POST', {}, session.access_token);
    } catch (_) {}
  }
  clearSession();
}

/* ── Session management ── */
function saveSession(data) {
  const session = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token || null,
    // Store absolute expiry — default 1 hour but refresh_token keeps it alive
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    user: data.user || null,
  };
  localStorage.setItem('creatorly_session', JSON.stringify(session));
}

function getRawSession() {
  try {
    const raw = localStorage.getItem('creatorly_session');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function getSession() {
  const session = getRawSession();
  if (!session) return null;

  // Token still valid (with 60s buffer)
  if (Date.now() < session.expires_at - 60000) return session;

  // Token expired — try to refresh silently
  if (session.refresh_token) {
    const refreshed = await refreshSession();
    if (refreshed) return getRawSession();
  }

  clearSession();
  return null;
}

function clearSession() {
  localStorage.removeItem('creatorly_session');
}

function getUser() {
  return getRawSession()?.user || null;
}

function isLoggedIn() {
  const session = getRawSession();
  if (!session) return false;
  // If token is still valid OR we have a refresh_token to renew it, consider logged in
  if (Date.now() < session.expires_at - 60000) return true;
  if (session.refresh_token) return true; // will refresh on next getSession() call
  clearSession();
  return false;
}

function getUserDisplayName(user) {
  if (!user) return '';
  return user.user_metadata?.full_name ||
         user.user_metadata?.name ||
         user.email?.split('@')[0] ||
         'Creator';
}

function getUserInitial(user) {
  return getUserDisplayName(user).charAt(0).toUpperCase();
}

/* ── Auto-refresh: silently renew token 5 min before expiry ── */
(function scheduleAutoRefresh() {
  const session = getRawSession();
  if (!session?.refresh_token) return;

  const msUntilExpiry = session.expires_at - Date.now();
  const refreshIn = Math.max(msUntilExpiry - 5 * 60 * 1000, 10000); // 5 min before expiry, min 10s

  setTimeout(async () => {
    await refreshSession();
    scheduleAutoRefresh(); // reschedule after refresh
  }, refreshIn);
})();

/* ── Redirect to Chatbot Page helper ── */
window.openCreatorlyChat = function (message) {
  window.location.href = '/prompt-generator?prompt=' + encodeURIComponent(message);
};

