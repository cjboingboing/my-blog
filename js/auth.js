/* ═══════════════════════════════════════════
   CALSPACE — auth.js
   Authentication: login, signup, logout,
   session detection, admin secret access
═══════════════════════════════════════════ */

// ── State ──
let currentUser    = null;   // Supabase auth user
let currentProfile = null;   // Our profiles table row
let isAdmin        = false;

// Admin is detected by role in profiles table
// AND verified against the secret password locally
const ADMIN_USER_ID = 'YOUR_ADMIN_UUID_HERE'; // Fill this in after first signup

// Logo click counter for secret admin modal
let logoClickCount = 0;
let logoClickTimer = null;

// ════════════════════════════════════════════
// INIT — called by app.js on page load
// ════════════════════════════════════════════
async function initAuth() {
  const session = db.getSession();
  if (!session) {
    updateNavForGuest();
    return;
  }

  try {
    currentUser = session.user;
    currentProfile = await db.getProfile(currentUser.id);
    isAdmin = currentProfile?.role === 'admin';
    updateNavForUser();
  } catch (e) {
    // Session expired or invalid
    await db.signOut();
    currentUser = null;
    currentProfile = null;
    isAdmin = false;
    updateNavForGuest();
  }
}

// ════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════
async function login() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl  = document.getElementById('login-error');
  errorEl.textContent = '';

  if (!email || !password) {
    errorEl.textContent = '⚠️ Please fill in all fields.';
    return;
  }

  try {
    const session = await db.signIn(email, password);
    currentUser    = session.user;
    currentProfile = await db.getProfile(currentUser.id);

    // Create profile if first login somehow missed it
    if (!currentProfile) {
      const username = email.split('@')[0];
      await db.createProfile(currentUser.id, username);
      currentProfile = await db.getProfile(currentUser.id);
    }

    isAdmin = currentProfile?.role === 'admin';
    updateNavForUser();
    showScreen('home');
    showToast('🎉 Welcome back, ' + currentProfile.username + '!');
    await renderPosts();
  } catch (e) {
    errorEl.textContent = '⚠️ ' + (e.message || 'Login failed. Check your details.');
  }
}

// ════════════════════════════════════════════
// SIGNUP
// ════════════════════════════════════════════
async function signup() {
  const username = document.getElementById('signup-username').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errorEl  = document.getElementById('signup-error');
  errorEl.textContent = '';

  if (!username || !email || !password) {
    errorEl.textContent = '⚠️ Please fill in all fields.';
    return;
  }
  if (username.length < 3) {
    errorEl.textContent = '⚠️ Username must be at least 3 characters.';
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errorEl.textContent = '⚠️ Username can only contain letters, numbers and underscores.';
    return;
  }
  if (password.length < 6) {
    errorEl.textContent = '⚠️ Password must be at least 6 characters.';
    return;
  }

  try {
    // Check username isn't taken
    const existing = await db.getProfileByUsername(username);
    if (existing) {
      errorEl.textContent = '⚠️ That username is already taken!';
      return;
    }

    const session = await db.signUp(email, password);
    currentUser = session.user;

    // Create profile row
    await db.createProfile(currentUser.id, username);
    currentProfile = await db.getProfile(currentUser.id);
    isAdmin = false;

    updateNavForUser();
    showScreen('home');
    showToast('✨ Welcome to CalSpace, ' + username + '!');
    await renderPosts();
  } catch (e) {
    errorEl.textContent = '⚠️ ' + (e.message || 'Signup failed. Please try again.');
  }
}

// ════════════════════════════════════════════
// LOGOUT
// ════════════════════════════════════════════
async function logout() {
  await db.signOut();
  currentUser    = null;
  currentProfile = null;
  isAdmin        = false;
  updateNavForGuest();
  showScreen('home');
  showToast('👋 Logged out. See you next time!');
  await renderPosts();
}

// ════════════════════════════════════════════
// AUTH TAB SWITCHER
// ════════════════════════════════════════════
function switchAuthTab(tab) {
  document.getElementById('auth-login').style.display  = tab === 'login'  ? 'block' : 'none';
  document.getElementById('auth-signup').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('tab-login').classList.toggle('active',  tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('auth-tbar-title').textContent =
    tab === 'login' ? '🔑 SIGN IN — CALSPACE' : '✨ JOIN CALSPACE';
}

// ════════════════════════════════════════════
// NAV STATE
// ════════════════════════════════════════════
function updateNavForGuest() {
  document.getElementById('nav-login').style.display   = 'inline-block';
  document.getElementById('nav-logout').style.display  = 'none';
  document.getElementById('nav-search').style.display  = 'none';
  document.getElementById('nav-profile').style.display = 'none';
  document.getElementById('nav-admin').style.display   = 'none';

  document.getElementById('nav-link-search').style.display  = 'none';
  document.getElementById('nav-link-profile').style.display = 'none';
  document.getElementById('nav-link-write').style.display   = 'none';

  document.getElementById('hero-cta').style.display   = 'block';
  document.getElementById('write-widget').style.display = 'none';
  document.getElementById('members-widget').style.display = 'none';
}

function updateNavForUser() {
  document.getElementById('nav-login').style.display   = 'none';
  document.getElementById('nav-logout').style.display  = 'inline-block';
  document.getElementById('nav-search').style.display  = 'inline-block';
  document.getElementById('nav-profile').style.display = 'inline-block';
  document.getElementById('nav-admin').style.display   = isAdmin ? 'inline-block' : 'none';

  document.getElementById('nav-link-search').style.display  = 'block';
  document.getElementById('nav-link-profile').style.display = 'block';
  document.getElementById('nav-link-write').style.display   = 'block';

  document.getElementById('hero-cta').style.display    = 'none';
  document.getElementById('write-widget').style.display = 'block';
  document.getElementById('members-widget').style.display = 'block';
}

// ════════════════════════════════════════════
// SECRET ADMIN LOGIN (triple-click logo)
// ════════════════════════════════════════════
function handleLogoClick() {
  // If already logged in as admin just go home
  if (isAdmin) { showScreen('home'); return; }
  // If logged in as regular user, just go home
  if (currentUser) { showScreen('home'); return; }

  logoClickCount++;
  clearTimeout(logoClickTimer);
  logoClickTimer = setTimeout(() => { logoClickCount = 0; }, 1500);

  if (logoClickCount >= 5) {
    logoClickCount = 0;
    openAdminModal();
  }
}

function openAdminModal() {
  const modal = document.getElementById('admin-modal');
  modal.style.display = 'flex';
  document.getElementById('admin-password-input').value = '';
  document.getElementById('admin-error').textContent = '';
  setTimeout(() => document.getElementById('admin-password-input').focus(), 100);
}

function closeAdminModal() {
  document.getElementById('admin-modal').style.display = 'none';
}

function adminKeydown(e) {
  if (e.key === 'Enter') submitAdminLogin();
  if (e.key === 'Escape') closeAdminModal();
}

async function submitAdminLogin() {
  // Admin logs in via email/password like everyone else
  // The secret is: click logo 5 times to reveal this panel
  // Then they enter their actual admin email + password
  const password = document.getElementById('admin-password-input').value;
  const errorEl  = document.getElementById('admin-error');
  errorEl.textContent = '';

  if (!password) {
    errorEl.textContent = '⚠️ Enter password.';
    return;
  }

  // Prompt for email too — show a quick inline form
  const email = prompt('Admin email:');
  if (!email) return;

  try {
    const session = await db.signIn(email, password);
    currentUser    = session.user;
    currentProfile = await db.getProfile(currentUser.id);
    isAdmin = currentProfile?.role === 'admin';

    if (!isAdmin) {
      await db.signOut();
      currentUser = null; currentProfile = null;
      errorEl.textContent = '⚠️ Not an admin account.';
      return;
    }

    closeAdminModal();
    updateNavForUser();
    showScreen('home');
    showToast('🔐 Admin access granted. Welcome back!');
    await renderPosts();
  } catch (e) {
    errorEl.textContent = '⚠️ ' + (e.message || 'Login failed.');
  }
}
