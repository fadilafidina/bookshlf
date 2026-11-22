// bookshlf — renders a Goodreads shelf as a wall of book spines.

const DEFAULT_USER = '22395023-dila';
const SHELF_NAMES = { read: 'Read', 'currently-reading': 'Reading now', 'to-read': 'To read' };

// Cloth-binding colours, ordered roughly by hue so "shelve by colour" reads as a gradient.
const BINDINGS = [
  { name: 'Reds',    fg: '#f3e6d0', bgs: ['#8c2f2b', '#a8432f', '#6e2323', '#b5523b'] },
  { name: 'Ochres',  fg: '#2a1d10', bgs: ['#c79a3b', '#d9a441', '#b7832c', '#e0b85c'] },
  { name: 'Creams',  fg: '#3a2c20', bgs: ['#e9dcc0', '#d8c7a3', '#efe3cb', '#cdb991'] },
  { name: 'Greens',  fg: '#efe8d4', bgs: ['#2f4f3e', '#4d6b4a', '#6f8456', '#244034'] },
  { name: 'Teals',   fg: '#e8f0ea', bgs: ['#285e63', '#3c7a78', '#1f4a52', '#4f8a83'] },
  { name: 'Blues',   fg: '#e9e6dc', bgs: ['#243a5e', '#34507a', '#1b2c48', '#4a6a96'] },
  { name: 'Plums',   fg: '#f1e2e6', bgs: ['#5a2f4e', '#734063', '#45233c', '#8a5574'] },
  { name: 'Darks',   fg: '#d9cdb8', bgs: ['#2b2724', '#3b332d', '#1f1c1a', '#4a4038'] },
];
const DETAILS = ['', 'bands', 'label', 'heel', '', 'bands'];

const $ = (s) => document.querySelector(s);
const state = { user: DEFAULT_USER, shelf: 'read', by: 'year', data: null, books: [] };
let loadToken = 0;

// ---------- routing ----------
function readUrl() {
  const parts = location.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('bookshelf');
  const user = i >= 0 && parts[i + 1] ? decodeURIComponent(parts[i + 1]) : DEFAULT_USER;
  const q = new URLSearchParams(location.search);
  state.user = user;
  state.shelf = SHELF_NAMES[q.get('shelf')] ? q.get('shelf') : 'read';
  state.by = ['year', 'rating', 'colour'].includes(q.get('by')) ? q.get('by') : defaultBy(state.shelf);
}
function defaultBy(shelf) { return shelf === 'read' ? 'year' : 'colour'; }
function writeUrl(push = true) {
  const q = new URLSearchParams();
  if (state.shelf !== 'read') q.set('shelf', state.shelf);
  if (state.by !== defaultBy(state.shelf)) q.set('by', state.by);
  const path = state.user === DEFAULT_USER ? '/bookshelf' : `/bookshelf/${encodeURIComponent(state.user)}`;
  const url = path + (q.toString() ? `?${q}` : '');
  history[push ? 'pushState' : 'replaceState'](null, '', url);
}

// ---------- data ----------
async function load() {
  const token = ++loadToken;
  renderLoading();
  try {
    const r = await fetch(`/api/shelf?user=${encodeURIComponent(state.user)}&shelf=${state.shelf}`);
    const body = await r.json().catch(() => ({ error: 'Unexpected response.' }));
    if (token !== loadToken) return;
    if (!r.ok) throw new Error(body.error || `Request failed (${r.status})`);
    state.data = body;
    state.books = body.books.map(decorate);
    render();
  } catch (err) {
    if (token !== loadToken) return;
    renderError(err.message);
  }
}

// Deterministic "binding" per book so a spine always looks the same.
function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function decorate(b) {
  const h = hash(b.id + b.title);
  const fam = h % BINDINGS.length;
  const binding = BINDINGS[fam];
  const pages = b.pages || 260;
  return {
    ...b,
    family: fam,
    bg: binding.bgs[(h >>> 4) % binding.bgs.length],
    fg: binding.fg,
    detail: DETAILS[(h >>> 8) % DETAILS.length],
    width: Math.round(Math.min(58, Math.max(17, pages / 13))),
    heightPct: 0.72 + ((h >>> 12) % 26) / 100, // 72%–97% of the shelf
    tilt: (h >>> 16) % 23 === 0 ? -5 : 0,     // the odd book leans
  };
}

// ---------- grouping ----------
function groups() {
  const books = state.books;
  if (state.by === 'rating') {
    const map = new Map();
    for (const b of [...books].sort((a, z) => z.rating - a.rating || dateOf(z) - dateOf(a))) {
      const k = b.rating ? '★'.repeat(b.rating) : 'Unrated';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(b);
    }
    return [...map];
  }
  if (state.by === 'colour') {
    const map = new Map();
    for (const b of [...books].sort((a, z) => a.family - z.family || a.bg.localeCompare(z.bg))) {
      const k = BINDINGS[b.family].name;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(b);
    }
    // one long rainbow shelf reads better than eight tiny ones
    return [[`${books.length} spines, by colour`, [...map.values()].flat()]];
  }
  const map = new Map();
  for (const b of [...books].sort((a, z) => dateOf(z) - dateOf(a))) {
    const d = b.readAt || b.addedAt;
    const k = d ? String(new Date(d).getFullYear()) : 'Undated';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(b);
  }
  return [...map];
}
const dateOf = (b) => new Date(b.readAt || b.addedAt || 0).getTime();

// ---------- render ----------
function rowHeight() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row')) || 212;
}

function render() {
  const { data, books } = state;
  const who = data.user.name;
  $('#title').textContent = who ? `${who}’s bookshelf` : 'A bookshelf';
  document.title = who ? `${who}’s bookshelf` : 'Bookshelf';
  const pages = books.reduce((n, b) => n + (b.pages || 0), 0);
  $('#stats').textContent = `${books.length} book${books.length === 1 ? '' : 's'} · ${SHELF_NAMES[state.shelf].toLowerCase()}` +
    (pages ? ` · ${pages.toLocaleString()} pages` : '');
  syncControls();

  const wall = $('#wall');
  wall.replaceChildren();
  if (!books.length) {
    wall.innerHTML = `<div class="notice"><strong>An empty shelf.</strong>Nothing on “${SHELF_NAMES[state.shelf]}” yet.</div>`;
    return;
  }
  const spineMax = rowHeight() - 14 - 12;
  for (const [label, list] of groups()) {
    const section = document.createElement('section');
    section.className = 'shelf';
    const pg = list.reduce((n, b) => n + (b.pages || 0), 0);
    section.innerHTML = `<div class="shelf-head"><h2></h2><span></span></div><div class="rows"></div>`;
    section.querySelector('h2').textContent = label;
    section.querySelector('span').textContent = state.by === 'colour' ? '' :
      `${list.length} book${list.length === 1 ? '' : 's'}${pg ? ` · ${pg.toLocaleString()} pp` : ''}`;
    const rows = section.querySelector('.rows');
    for (const b of list) rows.append(spineCell(b, spineMax));
    wall.append(section);
  }
}

function spineCell(b, spineMax) {
  const cell = document.createElement('div');
  cell.className = 'cell' + (b.tilt ? ' lean' : '');
  const btn = document.createElement('button');
  btn.className = `spine ${b.detail}${b.width >= 40 ? ' wide' : ''}`;
  btn.style.cssText = `--w:${b.width}px;--h:${Math.round(spineMax * b.heightPct)}px;--bg:${b.bg};--fg:${b.fg};--tilt:${b.tilt}deg`;
  btn.setAttribute('aria-label', `${b.title} by ${b.author}`);
  btn.title = `${b.title} — ${b.author}`;
  const t = document.createElement('span');
  t.className = 't';
  t.textContent = shortTitle(b.title);
  btn.append(t);
  btn.addEventListener('click', () => openBook(b));
  cell.append(btn);
  return cell;
}

// Drop series info like "(The Expanse, #1)" and long subtitles — spines are narrow.
function shortTitle(t) {
  return t.replace(/\s*\([^)]*#[^)]*\)\s*$/, '').replace(/:\s.*$/, '');
}

function renderLoading() {
  $('#stats').textContent = 'Taking books off the cart…';
  syncControls();
  const wall = $('#wall');
  wall.replaceChildren();
  const section = document.createElement('section');
  section.className = 'shelf';
  section.innerHTML = '<div class="shelf-head"><h2>&nbsp;</h2></div><div class="rows"></div>';
  const rows = section.querySelector('.rows');
  const max = rowHeight() - 26;
  for (let i = 0; i < 28; i++) {
    const h = hash('ghost' + i);
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.innerHTML = `<span class="spine ghost" style="--w:${18 + (h % 26)}px;--h:${Math.round(max * (0.7 + (h >>> 5) % 28 / 100))}px;animation-delay:${(i % 7) * 90}ms"></span>`;
    rows.append(cell);
  }
  wall.append(section);
}

function renderError(msg) {
  $('#title').textContent = 'Hm, no shelf';
  $('#stats').innerHTML = '&nbsp;';
  const wall = $('#wall');
  wall.innerHTML = `<div class="notice"><strong>Couldn’t build this shelf.</strong><span></span><br/><br/>
    Paste a public Goodreads profile link above — it looks like <code>goodreads.com/user/show/12345-name</code>.</div>`;
  wall.querySelector('span').textContent = msg;
}

function syncControls() {
  for (const b of document.querySelectorAll('#shelf-tabs button')) b.setAttribute('aria-selected', b.dataset.shelf === state.shelf);
  for (const b of document.querySelectorAll('#group-tabs button')) {
    b.setAttribute('aria-pressed', b.dataset.by === state.by);
    b.setAttribute('aria-selected', b.dataset.by === state.by);
    b.hidden = b.dataset.by === 'year' && state.shelf !== 'read';
  }
}

// ---------- pulled-out book ----------
function openBook(b) {
  const dlg = $('#book');
  $('#book-title').textContent = b.title;
  $('#book-author').textContent = b.author;
  $('#book-stars').textContent = b.rating ? '★'.repeat(b.rating) + '☆'.repeat(5 - b.rating) : '';
  const cover = $('#book-cover');
  cover.replaceChildren();
  const fallback = () => {
    const f = document.createElement('div');
    f.className = 'cover-fallback';
    f.style.cssText = `background:${b.bg};color:${b.fg}`;
    f.textContent = shortTitle(b.title);
    cover.replaceChildren(f);
  };
  if (b.cover) {
    const img = new Image();
    img.alt = `Cover of ${b.title}`;
    img.referrerPolicy = 'no-referrer';
    img.onerror = fallback;
    img.src = b.cover;
    cover.append(img);
  } else fallback();

  const facts = [];
  const fmt = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  if (b.readAt) facts.push(['Finished', fmt(b.readAt)]);
  else if (b.addedAt) facts.push(['Shelved', fmt(b.addedAt)]);
  if (b.pages) facts.push(['Pages', b.pages.toLocaleString()]);
  if (b.published) facts.push(['Published', b.published]);
  if (b.avgRating) facts.push(['Goodreads avg', b.avgRating.toFixed(2)]);
  const dl = $('#book-facts');
  dl.replaceChildren();
  for (const [k, v] of facts) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
  $('#book-review').textContent = b.review || '';
  $('#book-link').href = b.link;
  dlg.showModal();
}
$('#book-close').addEventListener('click', () => $('#book').close());
$('#book').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

// ---------- controls ----------
$('#shelf-tabs').addEventListener('click', (e) => {
  const s = e.target.closest('button')?.dataset.shelf;
  if (!s || s === state.shelf) return;
  state.shelf = s;
  state.by = defaultBy(s);
  writeUrl();
  load();
});
$('#group-tabs').addEventListener('click', (e) => {
  const by = e.target.closest('button')?.dataset.by;
  if (!by || by === state.by) return;
  state.by = by;
  writeUrl(false);
  if (state.data) render();
});
$('#build-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const user = parseUserInput($('#build-input').value);
  if (!user) return;
  state.user = user;
  state.shelf = 'read';
  state.by = 'year';
  $('#build-input').value = '';
  writeUrl();
  load();
});
window.addEventListener('popstate', () => { readUrl(); load(); });

// "https://www.goodreads.com/user/show/22395023-dila" → "22395023-dila"
function parseUserInput(v) {
  v = v.trim();
  const m = v.match(/goodreads\.com\/(?:user\/show|review\/list(?:_rss)?)\/(\d+(?:-[\w-]+)?)/i);
  if (m) return m[1];
  return v.replace(/^https?:\/\/(www\.)?goodreads\.com\//i, '').replace(/[/?#].*$/, '') || null;
}

readUrl();
writeUrl(false);
load();
