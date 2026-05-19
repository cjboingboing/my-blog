/* ═══════════════════════════════════════════
   CALSPACE — supabase.js
   Database connection + query helpers
   Replace SUPABASE_URL and SUPABASE_ANON_KEY
   with your values from Supabase → Settings → API
═══════════════════════════════════════════ */

const SUPABASE_URL      = 'https://thwhgwgrchpzdknwjblg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_399M4c7UcSh7qdwV1Qg8iQ_pZSEEgKm';

// ── Lightweight fetch wrapper around the Supabase REST API ──
// (No npm needed — works in a plain HTML file)

const db = {

  // ── Generic request helper ──
  async _request(path, options = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${db._getToken() || SUPABASE_ANON_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        options.prefer || 'return=representation',
        ...options.headers,
      },
      ...options,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || 'Database error');
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  // ── Auth token from session ──
  _getToken() {
    const session = localStorage.getItem('calspace_session');
    return session ? JSON.parse(session).access_token : null;
  },

  // ════════════════════════════════════
  // AUTH
  // ════════════════════════════════════

  async signUp(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || data.error_description || 'Signup failed');
    return data;
  },

  async signIn(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || 'Login failed');
    localStorage.setItem('calspace_session', JSON.stringify(data));
    return data;
  },

  async signOut() {
    const token = db._getToken();
    if (token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem('calspace_session');
  },

  getSession() {
    const s = localStorage.getItem('calspace_session');
    if (!s) return null;
    const session = JSON.parse(s);
    // Check expiry
    if (session.expires_at && Date.now() / 1000 > session.expires_at) {
      localStorage.removeItem('calspace_session');
      return null;
    }
    return session;
  },

  // ════════════════════════════════════
  // PROFILES
  // ════════════════════════════════════

  async getProfile(userId) {
    const data = await db._request(`profiles?id=eq.${userId}&select=*`);
    return data?.[0] || null;
  },

  async getProfileByUsername(username) {
    const data = await db._request(`profiles?username=eq.${encodeURIComponent(username)}&select=*`);
    return data?.[0] || null;
  },

  async createProfile(userId, username) {
    return db._request('profiles', {
      method: 'POST',
      body: JSON.stringify({ id: userId, username, role: 'user' }),
    });
  },

  async getAllProfiles() {
    return db._request('profiles?select=*&order=created_at.asc');
  },

  // ════════════════════════════════════
  // POSTS
  // ════════════════════════════════════

  async getPublishedPosts(userId = null) {
    let query = 'posts?status=eq.published&select=*,profiles(username)&order=created_at.desc';
    if (userId) query += `&user_id=eq.${userId}`;
    return db._request(query);
  },

  async getAllPostsAdmin() {
    return db._request('posts?select=*,profiles(username)&order=created_at.desc');
  },

  async getPendingPosts() {
    return db._request('posts?status=eq.pending&select=*,profiles(username)&order=created_at.desc');
  },

  async getPost(id) {
    const data = await db._request(`posts?id=eq.${id}&select=*,profiles(username)`);
    return data?.[0] || null;
  },

  async createPost(postData) {
    return db._request('posts', {
      method: 'POST',
      body: JSON.stringify(postData),
    });
  },

  async updatePost(id, postData) {
    return db._request(`posts?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(postData),
    });
  },

  async deletePost(id) {
    return db._request(`posts?id=eq.${id}`, {
      method: 'DELETE',
      prefer: 'return=minimal',
    });
  },

  async searchPosts(query) {
    // Full text search across title and excerpt
    const q = encodeURIComponent(query);
    return db._request(
      `posts?status=eq.published&or=(title.ilike.*${q}*,excerpt.ilike.*${q}*)&select=*,profiles(username)&order=created_at.desc`
    );
  },

  // ════════════════════════════════════
  // STATS
  // ════════════════════════════════════

  async getStats() {
    const [postsRes, membersRes] = await Promise.all([
      db._request('posts?status=eq.published&select=id', { prefer: '' }),
      db._request('profiles?select=id', { prefer: '' }),
    ]);
    return {
      posts:   Array.isArray(postsRes)   ? postsRes.length   : 0,
      members: Array.isArray(membersRes) ? membersRes.length : 0,
    };
  },

  // ════════════════════════════════════════════
  // STORAGE
  // ════════════════════════════════════════════

  async uploadPhoto(file, userId) {
    const ext  = file.name.split('.').pop().toLowerCase() || 'jpg';
    const path = `${userId}/${Date.now()}.${ext}`;
    const res  = await fetch(`${SUPABASE_URL}/storage/v1/object/post-images/${path}`, {
      method:  'POST',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${db._getToken() || SUPABASE_ANON_KEY}`,
        'Content-Type':  file.type || 'image/jpeg',
      },
      body: file,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Upload failed');
    }
    return `${SUPABASE_URL}/storage/v1/object/public/post-images/${path}`;
  },

  // ════════════════════════════════════════════
  // HITS
  // ════════════════════════════════════════════

  async incrementHits() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_hits`, {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error('Hit counter failed');
    return res.json();
  },

  // ════════════════════════════════════════════
  // GUESTBOOK
  // ════════════════════════════════════════════

  async getGuestbook() {
    return db._request('guestbook?select=*&order=created_at.desc&limit=50');
  },

  async addGuestbookEntry(name, message) {
    return db._request('guestbook', {
      method: 'POST',
      body: JSON.stringify({ name, message }),
    });
  },

  async deleteGuestbookEntry(id) {
    return db._request(`guestbook?id=eq.${id}`, {
      method: 'DELETE',
      prefer: 'return=minimal',
    });
  },
};
