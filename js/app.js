/* ═══════════════════════════════════════════
   CALSPACE — app.js
   Main application logic:
   posts, editor, search, profiles, admin
═══════════════════════════════════════════ */

// ── Editor state ──
let currentEditId  = null;
let uploadedPhotos = [];
let currentViewId  = null;
let lastScreen     = 'home';

const COLORS = ['#4285F4','#EA4335','#FBBC05','#34A853','#4285F4','#EA4335','#9c27b0','#34A853'];

// ════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════
(async function init() {
  // Big hero logo
  renderBigLogo('CalSpace');

  // Dates
  const now = new Date();
  document.getElementById('mq-date').textContent    = now.toLocaleDateString('en-AU');
  document.getElementById('foot-year').textContent  = now.getFullYear();
  renderCalendar(now);

  // Hit counter
  try {
    const hits = await db.incrementHits();
    const padded = String(hits).padStart(6, '0');
    document.getElementById('hit-digs').textContent    = padded;
    document.getElementById('hit-marquee').textContent = padded;
  } catch (e) {
    document.getElementById('hit-digs').textContent    = '001337';
    document.getElementById('hit-marquee').textContent = '001337';
  }

  // Init auth (checks for existing session)
  await initAuth();

  // Load posts & stats
  await renderPosts();
  await loadStats();
  if (currentProfile) await loadMembers();
  await loadGuestbook();
})();

// ════════════════════════════════════════════
// SCREEN MANAGEMENT
// ════════════════════════════════════════════
function showScreen(id) {
  if (id !== 'post') lastScreen = id;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  window.scrollTo(0, 0);

  // Load screen-specific data
  if (id === 'admin' && isAdmin) loadAdminPanel();
  if (id === 'search') document.getElementById('search-input')?.focus();
}

function goBackFromPost() {
  showScreen(lastScreen || 'home');
}

function showMyProfile() {
  if (currentProfile) viewProfile(currentProfile.username);
}

// ════════════════════════════════════════════
// HERO LOGO
// ════════════════════════════════════════════
function renderBigLogo(text) {
  const el = document.getElementById('big-logo');
  el.innerHTML = text.split('').map((c, i) =>
    `<span class="ltr" style="color:${COLORS[i % COLORS.length]}">${c}</span>`
  ).join('');
}

// ════════════════════════════════════════════
// CALENDAR
// ════════════════════════════════════════════
function renderCalendar(date) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const m = date.getMonth(), y = date.getFullYear(), td = date.getDate();
  const first = new Date(y, m, 1).getDay();
  const dim   = new Date(y, m + 1, 0).getDate();
  let h = `<strong style="color:#000080;font-size:12px;">${months[m]} ${y}</strong><br>`;
  h += `<span style="color:#666">Su Mo Tu We Th Fr Sa</span><br>`;
  let day = 1;
  for (let r = 0; r < 6; r++) {
    let row = '';
    for (let c = 0; c < 7; c++) {
      const n = r * 7 + c;
      if (n < first || day > dim) {
        row += '<span style="display:inline-block;width:18px">&nbsp;</span>';
      } else {
        const s = day === td ? 'background:#000080;color:#fff;' : '';
        row += `<span style="display:inline-block;width:18px;${s}">${day}</span>`;
        day++;
      }
    }
    h += row + '<br>';
    if (day > dim) break;
  }
  document.getElementById('cal').innerHTML = h;
}

// ════════════════════════════════════════════
// STATS
// ════════════════════════════════════════════
async function loadStats() {
  try {
    const stats = await db.getStats();
    document.getElementById('stat-posts').textContent   = stats.posts;
    document.getElementById('stat-members').textContent = stats.members;
  } catch (e) {
    console.warn('Stats load failed:', e.message);
  }
}

async function loadMembers() {
  try {
    const members = await db.getAllProfiles();
    const el = document.getElementById('members-list');
    el.innerHTML = members.map(m =>
      `<a onclick="viewProfile('${m.username}')">👤 ${m.username}</a>`
    ).join('');
  } catch (e) {
    console.warn('Members load failed:', e.message);
  }
}

// ════════════════════════════════════════════
// POSTS — HOME FEED (Cal's posts only for guests)
// ════════════════════════════════════════════
async function renderPosts() {
  const container = document.getElementById('posts-list');
  container.innerHTML = `<div class="loading-spinner">LOADING...</div>`;

  try {
    let posts;
    if (currentProfile && isAdmin) {
      // Admin sees all published posts from everyone on home feed
      posts = await db.getPublishedPosts();
    } else if (currentUser) {
      // Logged-in users see all published posts
      posts = await db.getPublishedPosts();
    } else {
      posts = await db.getPublishedPosts();
    }

    if (!posts || !posts.length) {
      container.innerHTML = `
        <div class="empty-retro">
          <h3>~ No entries yet! ~</h3>
          <p>The blog is empty. Check back soon!</p>
          ${currentUser ? '<button class="btn-pub" style="width:auto;padding:8px 20px;" onclick="showScreen(\'editor\')">✏️ Write First Entry!</button>' : ''}
        </div>`;
      return;
    }

    container.innerHTML = '';
    posts.forEach(post => container.appendChild(buildPostCard(post)));

    // Update tag cloud
    const allTags = [...new Set(posts.flatMap(p => p.tags || []))];
    if (allTags.length) {
      document.getElementById('tag-cloud').innerHTML =
        allTags.map(t => `<a onclick="searchByTag('${t}')">${t}</a> `).join('');
    }
  } catch (e) {
    container.innerHTML = `<div class="empty-retro"><h3>⚠️ Error</h3><p>${e.message}</p></div>`;
  }
}

function buildPostCard(post) {
  const card = document.createElement('div');
  card.className = 'post-card panel';
  const author = post.profiles?.username || 'unknown';
  const tags   = (post.tags || []).map(t => `<span class="tag-pill">${t}</span>`).join(' ') || '';
  const date   = post.created_at ? new Date(post.created_at).toLocaleDateString('en-AU', { day:'numeric', month:'long', year:'numeric' }) : '';

  card.innerHTML = `
    <div class="post-card-tbar">
      <span>📄 ${post.title}</span>
      <span style="font-size:12px;color:#aad">${date}</span>
    </div>
    <div class="post-card-inner ${post.thumbnail ? '' : 'no-img'}">
      ${post.thumbnail ? `<img class="post-card-thumb" src="${post.thumbnail}" alt="">` : ''}
      <div class="post-card-text">
        <h3>${post.title}</h3>
        <p>${(post.excerpt || '').slice(0, 180)}${(post.excerpt || '').length > 180 ? '...' : ''}</p>
        <div class="post-card-meta">
          <span>✍️ <span class="author-link" onclick="event.stopPropagation();viewProfile('${author}')">${author}</span></span>
          <span>📅 ${date}</span>
          ${tags}
        </div>
        <span class="read-more">Read more &gt;&gt;</span>
      </div>
    </div>`;

  card.querySelector('h3').onclick       = () => viewPost(post.id);
  card.querySelector('.read-more').onclick = () => viewPost(post.id);
  return card;
}

// ════════════════════════════════════════════
// POST VIEW
// ════════════════════════════════════════════
async function viewPost(id) {
  currentViewId = id;
  document.getElementById('pv-body').innerHTML = `<div class="loading-spinner">LOADING...</div>`;
  showScreen('post');

  try {
    const post   = await db.getPost(id);
    if (!post) { showToast('⚠️ Post not found'); showScreen('home'); return; }

    const author = post.profiles?.username || 'unknown';
    const date   = post.created_at ? new Date(post.created_at).toLocaleDateString('en-AU', { day:'numeric', month:'long', year:'numeric'}) : '';

    document.getElementById('pv-tbar').textContent = '📄 ' + post.title;

    // Colourised title
    document.getElementById('pv-title').innerHTML =
      post.title.split('').map((c, i) =>
        c === ' ' ? ' ' : `<span style="color:${COLORS[i % COLORS.length]}">${c}</span>`
      ).join('');

    document.getElementById('pv-author').innerHTML =
      `✍️ <span class="author-link" onclick="viewProfile('${author}')">${author}</span>`;
    document.getElementById('pv-date').textContent = '📅 ' + date;
    document.getElementById('pv-tags').innerHTML =
      (post.tags || []).map(t => `<span class="pv-tag-pill">${t}</span>`).join(' ');

    // Strip editor controls
    const doc = new DOMParser().parseFromString(post.body_html || '', 'text/html');
    doc.querySelectorAll('.float-ctrl,.size-snap,.resize-handle,.del-photo').forEach(el => el.remove());
    doc.querySelectorAll('.photo-block').forEach(b => b.removeAttribute('contenteditable'));
    document.getElementById('pv-body').innerHTML = doc.body.innerHTML;

    // Show edit bar only to post owner or admin
    const editBar = document.getElementById('pv-edit-bar');
    const canEdit = currentUser && (currentUser.id === post.user_id || isAdmin);
    editBar.style.display = canEdit ? 'block' : 'none';

  } catch (e) {
    document.getElementById('pv-body').innerHTML = `<p style="color:red">Error loading post: ${e.message}</p>`;
  }
}

async function deleteCurrentPost() {
  if (!confirm('Delete this post? This cannot be undone.')) return;
  try {
    await db.deletePost(currentViewId);
    showToast('🗑️ Post deleted.');
    showScreen('home');
    await renderPosts();
  } catch (e) {
    showToast('⚠️ ' + e.message);
  }
}

// ════════════════════════════════════════════
// EDITOR
// ════════════════════════════════════════════
function newPost() {
  if (!currentUser) { showScreen('auth'); return; }
  currentEditId  = null;
  uploadedPhotos = [];
  document.getElementById('post-title-input').value = '';
  document.getElementById('editor-body').innerHTML   = '';
  document.getElementById('photo-thumbs').innerHTML  = '';
  document.getElementById('tags-list').innerHTML     = '';
  document.getElementById('tag-input').value         = '';
  document.getElementById('ed-tbar-title').textContent = '✏️ NEW BLOG ENTRY — NOTEPAD.EXE';
  autoResizeTitle(document.getElementById('post-title-input'));
  showScreen('editor');
  setTimeout(() => document.getElementById('post-title-input').focus(), 100);
}

function editCurrentPost() {
  showScreen('editor');
  // Post data already loaded — we'll populate from DB
  loadPostIntoEditor(currentViewId);
}

async function loadPostIntoEditor(id) {
  try {
    const post = await db.getPost(id);
    if (!post) return;
    currentEditId  = post.id;
    uploadedPhotos = post.photos ? [...post.photos] : [];

    document.getElementById('post-title-input').value = post.title;
    document.getElementById('editor-body').innerHTML   = post.body_html || '';
    autoResizeTitle(document.getElementById('post-title-input'));
    document.getElementById('ed-tbar-title').textContent = '✏️ EDITING: ' + post.title.toUpperCase();

    document.getElementById('photo-thumbs').innerHTML = '';
    uploadedPhotos.forEach(p => addThumb(p));

    document.getElementById('tags-list').innerHTML = '';
    (post.tags || []).forEach(t => renderTag(t));

    document.querySelectorAll('#editor-body .photo-block').forEach(b => attachResize(b));
  } catch (e) {
    showToast('⚠️ Could not load post: ' + e.message);
  }
}

function autoResizeTitle(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// ── Formatting ──
function fmt(cmd) { document.getElementById('editor-body').focus(); document.execCommand(cmd, false, null); }
function insertHeading(l) { document.getElementById('editor-body').focus(); document.execCommand('formatBlock', false, 'h' + l); }
function insertBlockquote() { document.getElementById('editor-body').focus(); document.execCommand('formatBlock', false, 'blockquote'); }

// ── Save / Publish ──
function getEditorData() {
  const title    = document.getElementById('post-title-input').value.trim();
  const bodyHTML = document.getElementById('editor-body').innerHTML;
  const bodyText = document.getElementById('editor-body').innerText || '';
  const excerpt  = bodyText.replace(/\n+/g, ' ').slice(0, 220).trim();
  const tags     = getTags();
  const firstImg = document.querySelector('#editor-body .photo-block img');
  return { title, body_html: bodyHTML, excerpt, tags, thumbnail: firstImg ? firstImg.src : null };
}

async function publishPost() {
  if (!currentUser) { showScreen('auth'); return; }
  const data = getEditorData();
  if (!data.title) { showToast('⚠️ Add a title!'); return; }

  // Admin posts go straight to published. User posts go to pending.
  const status = isAdmin ? 'published' : 'pending';
  await savePostData(data, status);

  showScreen('home');
  const msg = isAdmin ? '🚀 Post published!' : '⏳ Post submitted for approval!';
  showToast(msg);
  await renderPosts();
}

async function saveDraft() {
  if (!currentUser) { showScreen('auth'); return; }
  const data = getEditorData();
  if (!data.title) { showToast('⚠️ Add a title!'); return; }
  await savePostData(data, 'draft');
  showScreen('home');
  showToast('💾 Draft saved!');
}

async function savePostData(data, status) {
  const payload = {
    ...data,
    photos:  uploadedPhotos,
    status,
    user_id: currentUser.id,
  };

  try {
    if (currentEditId) {
      await db.updatePost(currentEditId, payload);
    } else {
      await db.createPost(payload);
    }
  } catch (e) {
    showToast('⚠️ Save failed: ' + e.message);
    throw e;
  }
}

function discardPost() {
  if (confirm('Discard changes?')) showScreen('home');
}

// ════════════════════════════════════════════
// PHOTOS
// ════════════════════════════════════════════
function triggerPhoto() { document.getElementById('toolbar-photo-input').click(); }
function handleToolbarPhoto(e) { handleFiles(Array.from(e.target.files)); e.target.value = ''; }
function handlePhotoUpload(e) { handleFiles(Array.from(e.target.files)); e.target.value = ''; }

async function handleFiles(files) {
  if (!currentUser) { showToast('⚠️ Sign in to upload photos.'); return; }
  for (const file of files) {
    const ed = document.getElementById('editor-body');
    const placeholder = document.createElement('p');
    placeholder.innerHTML = '<em style="color:#888">📷 Uploading...</em>';
    ed.appendChild(placeholder);
    try {
      const url = await db.uploadPhoto(file, currentUser.id);
      const ph  = { id: 'ph_' + Date.now() + '_' + Math.random().toString(36).slice(2), name: file.name, dataUrl: url };
      uploadedPhotos.push(ph);
      addThumb(ph);
      placeholder.replaceWith(createPhotoBlock(ph, 50));
    } catch (e) {
      placeholder.remove();
      showToast('⚠️ Upload failed: ' + e.message);
    }
  }
}

function addThumb(ph) {
  const t = document.getElementById('photo-thumbs');
  const d = document.createElement('div');
  d.className = 'thumb-item';
  d.innerHTML = `<img src="${ph.dataUrl}" alt=""><span>${ph.name.slice(0,14)}</span><button class="thumb-insert" onclick="insertPhotoById('${ph.id}')">↓</button>`;
  t.appendChild(d);
}

function insertPhotoById(id) { const p = uploadedPhotos.find(p => p.id === id); if (p) insertPhotoAtCursor(p); }

function insertPhotoAtCursor(ph) {
  const ed = document.getElementById('editor-body'); ed.focus();
  const block = createPhotoBlock(ph, 50);
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    const br = document.createElement('p'); r.insertNode(br); r.setStartAfter(br); r.collapse(true); r.insertNode(block);
    const nr = document.createRange(); const after = document.createElement('p'); after.innerHTML = '<br>';
    block.after(after); nr.setStart(after, 0); nr.collapse(true); sel.removeAllRanges(); sel.addRange(nr);
  } else { ed.appendChild(block); }
}

function createPhotoBlock(ph, pct) {
  const b = document.createElement('div');
  b.className = 'photo-block float-none'; b.dataset.pid = ph.id; b.style.width = pct + '%'; b.contentEditable = 'false';
  b.innerHTML = `
    <div class="float-ctrl">
      <button onclick="setFloat(this,'float-left')">◧ L</button>
      <button onclick="setFloat(this,'float-none')" class="active">▣ Full</button>
      <button onclick="setFloat(this,'float-right')">◨ R</button>
    </div>
    <div class="size-snap">
      <button class="snap-btn" onclick="setW(this,25)">¼</button>
      <button class="snap-btn" onclick="setW(this,33)">⅓</button>
      <button class="snap-btn active" onclick="setW(this,50)">½</button>
      <button class="snap-btn" onclick="setW(this,66)">⅔</button>
      <button class="snap-btn" onclick="setW(this,100)">Full</button>
    </div>
    <img src="${ph.dataUrl}" alt="${ph.name}" draggable="false">
    <div class="resize-handle"></div>
    <button class="del-photo" onclick="this.closest('.photo-block').remove()">✕</button>`;
  attachResize(b);
  return b;
}

function attachResize(b) {
  const h = b.querySelector('.resize-handle'); if (!h) return;
  let sx, sw;
  h.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation(); sx = e.clientX; sw = b.offsetWidth;
    const mv = e => { const pw = b.parentElement ? b.parentElement.offsetWidth : 700; b.style.width = Math.min(100, Math.max(15, Math.round(((sw + e.clientX - sx) / pw) * 100))) + '%'; };
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  });
}

function setFloat(btn, cls) {
  const b = btn.closest('.photo-block');
  b.classList.remove('float-left','float-right','float-none'); b.classList.add(cls);
  if (cls !== 'float-none' && parseFloat(b.style.width) > 60) b.style.width = '40%';
  if (cls === 'float-none') b.style.width = '100%';
  b.querySelectorAll('.float-ctrl button').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
}

function setW(btn, pct) {
  const b = btn.closest('.photo-block'); b.style.width = pct + '%';
  if (pct === 100) { b.classList.remove('float-left','float-right'); b.classList.add('float-none'); }
  b.querySelectorAll('.snap-btn').forEach(x => x.classList.remove('active')); btn.classList.add('active');
}

// ════════════════════════════════════════════
// TAGS
// ════════════════════════════════════════════
function tagKeydown(e) { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }
function addTag() { const i = document.getElementById('tag-input'), v = i.value.trim(); if (!v) return; renderTag(v); i.value = ''; }
function renderTag(t) { const l = document.getElementById('tags-list'), c = document.createElement('div'); c.className = 'tag-chip'; c.innerHTML = `${t}<button onclick="this.parentElement.remove()">×</button>`; l.appendChild(c); }
function getTags() { return Array.from(document.querySelectorAll('#tags-list .tag-chip')).map(c => c.textContent.replace('×','').trim()); }

// ════════════════════════════════════════════
// USER PROFILES
// ════════════════════════════════════════════
async function viewProfile(username) {
  document.getElementById('profile-posts-list').innerHTML = `<div class="loading-spinner">LOADING...</div>`;
  showScreen('profile');

  try {
    const profile = await db.getProfileByUsername(username);
    if (!profile) { showToast('⚠️ User not found'); return; }

    document.getElementById('profile-tbar').textContent  = '👤 ' + username + "'s SPACE";
    document.getElementById('profile-avatar').textContent = '😎';
    document.getElementById('profile-username').textContent = username;
    document.getElementById('profile-bio').textContent    = profile.bio || 'No bio yet!';
    document.getElementById('profile-joined').textContent = 'Member since: ' + new Date(profile.created_at).toLocaleDateString('en-AU', { month:'long', year:'numeric' });
    document.getElementById('profile-posts-header').textContent = `📝 ${username}'s POSTS`;

    const posts = await db.getPublishedPosts(profile.id);
    const list  = document.getElementById('profile-posts-list');

    if (!posts || !posts.length) {
      list.innerHTML = `<div class="empty-retro"><h3>No posts yet!</h3><p>${username} hasn't written anything yet.</p></div>`;
      return;
    }

    list.innerHTML = '';
    posts.forEach(p => list.appendChild(buildPostCard(p)));
  } catch (e) {
    document.getElementById('profile-posts-list').innerHTML = `<p style="color:red;padding:16px">Error: ${e.message}</p>`;
  }
}

// ════════════════════════════════════════════
// SEARCH
// ════════════════════════════════════════════
function searchKeydown(e) { if (e.key === 'Enter') doSearch(); }

async function doSearch() {
  if (!currentUser) { showScreen('auth'); return; }
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;

  const results = document.getElementById('search-results');
  results.innerHTML = `<div class="loading-spinner">SEARCHING...</div>`;

  try {
    const posts = await db.searchPosts(q);
    if (!posts || !posts.length) {
      results.innerHTML = `<div class="empty-retro"><h3>No results found!</h3><p>Try different keywords.</p></div>`;
      return;
    }
    results.innerHTML = '';
    posts.forEach(post => {
      const author = post.profiles?.username || 'unknown';
      const date   = post.created_at ? new Date(post.created_at).toLocaleDateString('en-AU') : '';
      const r = document.createElement('div');
      r.className = 'search-result';
      r.innerHTML = `
        <h4>${post.title}</h4>
        <p>${(post.excerpt || '').slice(0, 160)}...</p>
        <div class="sr-meta">✍️ ${author} · 📅 ${date}</div>`;
      r.onclick = () => { showScreen('post'); viewPost(post.id); };
      results.appendChild(r);
    });
  } catch (e) {
    results.innerHTML = `<p style="color:red;padding:16px">Search error: ${e.message}</p>`;
  }
}

function searchByTag(tag) {
  if (!currentUser) { showScreen('auth'); return; }
  document.getElementById('search-input').value = tag;
  showScreen('search');
  doSearch();
}

// ════════════════════════════════════════════
// ADMIN PANEL
// ════════════════════════════════════════════
async function loadAdminPanel() {
  if (!isAdmin) return;
  loadAdminPending();
  loadAdminMembers();
  loadAdminPosts();
}

async function loadAdminPending() {
  const el = document.getElementById('admin-pending');
  el.innerHTML = `<div class="loading-spinner">LOADING...</div>`;
  try {
    const posts = await db.getPendingPosts();
    if (!posts.length) { el.innerHTML = `<div class="admin-row"><div class="admin-row-info">✅ No posts pending approval</div></div>`; return; }
    el.innerHTML = '';
    posts.forEach(post => {
      const author = post.profiles?.username || 'unknown';
      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `
        <div class="admin-row-info">📄 <strong>${post.title}</strong> by ${author}</div>
        <div class="admin-row-actions">
          <button class="btn-approve" onclick="approvePost('${post.id}')">✅ Approve</button>
          <button class="btn-danger"  onclick="rejectPost('${post.id}')">❌ Reject</button>
        </div>`;
      el.appendChild(row);
    });
  } catch (e) { el.innerHTML = `<p style="color:red">${e.message}</p>`; }
}

async function loadAdminMembers() {
  const el = document.getElementById('admin-members');
  el.innerHTML = `<div class="loading-spinner">LOADING...</div>`;
  try {
    const members = await db.getAllProfiles();
    el.innerHTML = '';
    members.forEach(m => {
      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `
        <div class="admin-row-info">👤 <strong>${m.username}</strong> — ${m.role} — joined ${new Date(m.created_at).toLocaleDateString('en-AU')}</div>
        <div class="admin-row-actions">
          <button class="btn-save" onclick="viewProfile('${m.username}')">View</button>
        </div>`;
      el.appendChild(row);
    });
  } catch (e) { el.innerHTML = `<p style="color:red">${e.message}</p>`; }
}

async function loadAdminPosts() {
  const el = document.getElementById('admin-posts');
  el.innerHTML = `<div class="loading-spinner">LOADING...</div>`;
  try {
    const posts = await db.getAllPostsAdmin();
    el.innerHTML = '';
    posts.forEach(post => {
      const author = post.profiles?.username || 'unknown';
      const status = post.status;
      const statusColor = status === 'published' ? '#004400' : status === 'pending' ? '#664400' : '#555';
      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `
        <div class="admin-row-info">
          📄 <strong>${post.title}</strong> by ${author}
          <span style="color:${statusColor};margin-left:8px">[${status}]</span>
        </div>
        <div class="admin-row-actions">
          <button class="btn-save" onclick="viewPost('${post.id}');showScreen('post')">View</button>
          <button class="btn-danger" onclick="adminDeletePost('${post.id}')">🗑️</button>
        </div>`;
      el.appendChild(row);
    });
  } catch (e) { el.innerHTML = `<p style="color:red">${e.message}</p>`; }
}

async function approvePost(id) {
  try {
    await db.updatePost(id, { status: 'published' });
    showToast('✅ Post approved!');
    loadAdminPending();
    loadAdminPosts();
    renderPosts();
  } catch (e) { showToast('⚠️ ' + e.message); }
}

async function rejectPost(id) {
  if (!confirm('Reject and delete this post?')) return;
  try {
    await db.deletePost(id);
    showToast('❌ Post rejected and deleted.');
    loadAdminPending();
    loadAdminPosts();
  } catch (e) { showToast('⚠️ ' + e.message); }
}

async function adminDeletePost(id) {
  if (!confirm('Permanently delete this post?')) return;
  try {
    await db.deletePost(id);
    showToast('🗑️ Post deleted.');
    loadAdminPanel();
    renderPosts();
  } catch (e) { showToast('⚠️ ' + e.message); }
}

// ════════════════════════════════════════════
// GUESTBOOK
// ════════════════════════════════════════════
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadGuestbook() {
  const el = document.getElementById('guestbook-entries');
  if (!el) return;
  try {
    const entries = await db.getGuestbook();
    if (!entries || !entries.length) {
      el.innerHTML = '<div style="color:#999;font-size:10px;">No entries yet — be the first!</div>';
      return;
    }
    el.innerHTML = entries.map(e => `
      <div style="padding:4px 0;border-bottom:1px dotted #ddd;position:relative;padding-right:${isAdmin ? '16px' : '0'}">
        <strong>${escapeHtml(e.name)}</strong>: ${escapeHtml(e.message)}
        <br><span style="font-size:9px;color:#aaa">${new Date(e.created_at).toLocaleDateString('en-AU')}</span>
        ${isAdmin ? `<button onclick="deleteGuestbookEntry('${e.id}')" style="position:absolute;right:0;top:4px;background:none;border:none;cursor:pointer;color:#c00;font-size:10px;padding:0;">✕</button>` : ''}
      </div>`
    ).join('');
  } catch (e) {
    el.innerHTML = '<div style="color:#999;font-size:10px;">Guestbook unavailable</div>';
  }
}

async function submitGuestbook() {
  const name    = document.getElementById('gb-name').value.trim();
  const message = document.getElementById('gb-message').value.trim();
  if (!name || !message) { showToast('⚠️ Name and message required!'); return; }
  try {
    await db.addGuestbookEntry(name, message);
    document.getElementById('gb-name').value    = '';
    document.getElementById('gb-message').value = '';
    showToast('✨ Guestbook signed!');
    await loadGuestbook();
  } catch (e) {
    showToast('⚠️ ' + e.message);
  }
}

async function deleteGuestbookEntry(id) {
  if (!confirm('Delete this entry?')) return;
  try {
    await db.deleteGuestbookEntry(id);
    showToast('🗑️ Entry deleted.');
    await loadGuestbook();
  } catch (e) {
    showToast('⚠️ ' + e.message);
  }
}

// ════════════════════════════════════════════
// DRAG & DROP UPLOAD ZONE
// ════════════════════════════════════════════
const uz = document.getElementById('upload-zone');
uz.addEventListener('dragover', e => { e.preventDefault(); uz.style.borderColor='#000080'; uz.style.background='#eef4ff'; });
uz.addEventListener('dragleave', () => { uz.style.borderColor=''; uz.style.background=''; });
uz.addEventListener('drop', e => {
  e.preventDefault(); uz.style.borderColor=''; uz.style.background='';
  handleFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
});

// ════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}
