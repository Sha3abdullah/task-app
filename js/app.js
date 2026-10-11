// Taskfront app: boot, hash router (#timeline, #list, #focus, #me), theme, phone shell views.
import * as store from './store.js';
import { PRIORITY, EFFORTS, EFFORT_PX, todayISO, counts, timing, buffer, doneRecently, levelInfo, fint } from './model.js';
import { taskCircle, circle, miniIcon } from './ui/circle.js';

const ROUTES = ['timeline', 'list', 'focus', 'me'];
const $ = (id) => document.getElementById(id);
const main = $('main');
const peopleCache = {};
let lastRoute = null;

/* ---------- Tiny DOM helper ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
// Static, trusted icon markup only.
function icon(paths, cls = 'ico') {
  const t = document.createElement('template');
  t.innerHTML = '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true">' + paths + '</svg>';
  return t.content.firstChild;
}
const ICON = {
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  star: '<path d="m12 3 2.7 5.6 6.2.9-4.5 4.4 1 6.1L12 17.1 6.6 20l1-6.1L3.1 9.5l6.2-.9z"/>'
};
const card = (label, title, note, ...kids) =>
  h('section', { class: 'card', 'aria-label': label }, h('div', { class: 'card-h' }, h('h3', null, title), note ? h('span', { class: 'note' }, note) : null), kids);

/* ---------- Toast (errors only in this phase; undo toasts arrive with undo.js) ---------- */
export function toast(msg, kind) {
  const host = $('toasts');
  host.replaceChildren(h('div', { class: 'toast' + (kind === 'err' ? ' err' : ''), role: 'status' }, h('span', null, msg)));
  clearTimeout(toast._t);
  toast._t = setTimeout(() => host.replaceChildren(), 5000);
}

/* ---------- Theme ---------- */
function systemDark() {
  const a = document.documentElement.getAttribute('data-theme');
  if (a === 'dark' || a === 'light') return a === 'dark';
  return matchMedia('(prefers-color-scheme: dark)').matches;
}
function applyTheme() {
  const t = store.getState().profile.theme || 'auto';
  const dark = t === 'dark' || (t === 'auto' && systemDark());
  document.documentElement.classList.add('tf');
  document.documentElement.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/* ---------- Router ---------- */
function route() {
  const r = location.hash.slice(1);
  return ROUTES.includes(r) ? r : 'timeline';
}
window.addEventListener('hashchange', () => render(true));

/* ---------- Header ---------- */
function renderHeader(s) {
  const sync = $('sync');
  const text = { loading: 'Connecting', synced: 'Synced', local: 'Saved on this device only', error: 'Not synced' }[s.mode];
  sync.classList.toggle('off', s.mode !== 'synced');
  $('sync-t').textContent = text;
  const lv = levelInfo(s.profile.xp);
  const badge = $('lvl-badge');
  badge.style.setProperty('--b1', lv.badge.b1);
  badge.style.setProperty('--b2', lv.badge.b2);
  badge.firstElementChild.textContent = lv.badge.label;
  badge.firstElementChild.style.color = lv.badge.nc;
  $('lvl').setAttribute('aria-label', 'Level ' + lv.level + ', ' + lv.title + '. Open your profile');
  $('lvl').hidden = s.profile.gameOn === false;
  const r = route();
  document.querySelectorAll('.tabbar a').forEach((a) => {
    const on = a.dataset.route === r;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

/* ---------- Timeline (P1: encoding test strip + data check) ---------- */
function legendCard() {
  const c = (cls, k, aria) => circle('tc ' + cls, { k, aria });
  const rows = [
    ['Colour = priority', 'Red High · orange Medium · grey Low · outline None. Used for nothing else.',
      [c('p-hi e2', 1.2, 'High'), c('p-med e2', 1.2, 'Medium'), c('p-low e2', 1.2, 'Low'), c('p-none e2', 1.2, 'No priority')]],
    ['Size = effort', '1 → 13 points maps to 14 → 46 px. Bigger circle, more work.',
      [c('p-med e1', 1, '1 point'), c('p-med e3', 1, '3 points'), c('p-med e8', 1, '8 points')]],
    ['Solid dark ring = overdue', 'Buffer below zero: the due date can no longer absorb the effort.', [c('p-hi e3 overdue', 1.6, 'Overdue')]],
    ['Dashed ring = tight', 'Buffer under 3 days. Buffer = days left − effort ÷ 2.', [c('p-hi e3 tight', 1.6, 'Tight')]],
    ['Hollow centre = in progress', 'Status Doing. Ring is 27% of the diameter.', [c('p-hi e3 doing', 1.6, 'Doing')]],
    ['Slash = blocked', 'Diagonal bar in ring ink; priority fill stays visible.', [c('p-med e3 blocked', 1.6, 'Blocked')]],
    ['Bullseye + hit mark = done', 'Concentric rings with a star hit. Low and None go grey.', [c('p-hi e3 done', 1.6, 'Done')]]
  ];
  return card('Encoding legend', 'Encoding legend', 'One circle carries five facts',
    rows.map(([t1, t2, ex]) => h('div', { class: 'lg-row' }, h('div', { class: 'lg-ex' }, ex), h('div', null, h('div', { class: 'lg-t1' }, t1), h('div', { class: 'lg-t2' }, t2)))));
}

function matrixCard() {
  const cols = [['To do', ''], ['Doing', ' doing'], ['Blocked', ' blocked'], ['Done', ' done'], ['Overdue', ' overdue'], ['Tight', ' tight'], ['Doing + overdue', ' doing overdue'], ['Blocked + tight', ' blocked tight']];
  const grid = h('div', { class: 'mx', role: 'table', 'aria-label': 'Priority by state' },
    h('div', { class: 'ch', role: 'columnheader' }),
    cols.map(([n]) => h('div', { class: 'ch lbl cap', role: 'columnheader' }, n)),
    Object.values(PRIORITY).map((p) => [
      h('div', { class: 'rh', role: 'rowheader' }, h('b', null, p.label), h('span', null, p.cls)),
      cols.map(([n, m]) => h('div', { class: 'cl', role: 'cell' }, circle('tc e5 ' + p.cls + m, { k: 1.25, aria: p.label + ' priority, ' + n })))
    ]));
  return card('State matrix', 'Priority × state', 'e5 · status inside, deadline outside',
    h('div', { class: 'mx-scroll' }, grid),
    h('p', null, 'Done ignores deadline rings. Low and None turn grey when done. Swipe the table sideways to see every state.'));
}

function sizesCard() {
  return card('Size scale', 'Size = effort', '1 point ≈ half a day',
    h('div', { class: 'szs' }, EFFORTS.map((e) => h('div', { class: 'sz' },
      circle('tc p-med e' + e, { aria: e + (e === 1 ? ' point' : ' points') }),
      h('span', { class: 'num' }, e), h('span', { class: 'px' }, EFFORT_PX[e] + ' px')))));
}

function statesCard() {
  const base = 'tc p-hi e3 tight';
  const cell = (label, el, ring) => h('div', { class: 'st-cell' },
    h('span', { class: 'tcw' }, el, ring ? h('span', { class: 'selring' }) : null), h('span', { class: 'd' }, label));
  return card('Interaction states', 'Interaction states', 'Used by drag and selection',
    h('div', { class: 'sts' },
      cell('Default', circle(base, { aria: 'Default' })),
      cell('Selected', circle(base, { aria: 'Selected' }), true),
      cell('Dragging', circle(base + ' lift', { aria: 'Dragging' })),
      cell('Drag origin', circle('tc p-hi e3 ghost', { aria: 'Drag origin' })),
      cell('Disabled', circle(base + ' disabled', { aria: 'Disabled' }))));
}

function dataCard(s) {
  const today = todayISO();
  const tasks = store.liveTasks();
  const c = counts(tasks, today);
  const stat = (n, label, ic) => h('div', { class: 'stat' }, h('b', null, n), h('span', null, miniIcon(ic), label));
  const lists = store.listsInOrder();
  if (!lists.length) {
    return card('Your tasks', 'Your tasks', null, h('div', { class: 'empty' }, icon(ICON.list),
      h('h3', null, 'No lists yet'),
      h('p', null, s.mode === 'error' ? 'Taskfront could not reach your data. Check your connection and reload.' : 'Your lists and tasks will appear here. Adding tasks arrives with the + button in the next update.')));
  }
  const memberIds = [...new Set(lists.flatMap((l) => l.members || []))];
  resolvePeople(memberIds);
  return card('Your tasks', 'Your tasks', tasks.length + ' tasks from the store',
    h('div', { class: 'stats' }, stat(c.overdue, 'Overdue', 'overdue'), stat(c.tight, 'Tight', 'tight'), stat(c.blocked, 'Blocked', 'blocked'), stat(c.doing, 'Active', 'doing')),
    lists.map((l) => {
      const all = store.tasksIn(l.id);
      const od = all.filter((t) => timing(t, today) === 'overdue').length;
      const sorted = all.slice().sort((a, b) => order(a, today) - order(b, today));
      const people = (l.members || []).map((id) => peopleCache[id]).filter(Boolean);
      return h('div', { class: 'dl', role: 'group', 'aria-label': l.name },
        h('div', { class: 'dl-h' },
          h('span', { class: 'rn' }, l.name), h('span', { class: 'rc num' }, all.length),
          od ? h('span', { class: 'rod' }, od + ' overdue') : null,
          people.length ? h('span', { class: 'avs' }, people.map((p) => h('span', { class: 'av s ' + p.cls, title: p.name, 'aria-label': p.name }, p.initial))) : null),
        h('div', { class: 'dl-c' }, sorted.map((t) => taskCircle(t, { today }))));
    }));
}
// Open tasks by buffer first (no date after dated), done last.
function order(t, today) {
  if (t.status === 'done') return 1e6;
  const b = buffer(t, today);
  return b === null ? 1e5 : b;
}

function resolvePeople(ids) {
  const missing = ids.filter((id) => !(id in peopleCache));
  if (!missing.length) return;
  missing.forEach((id) => { peopleCache[id] = null; });
  store.people(missing).then((m) => { Object.assign(peopleCache, m); render(); });
}

function viewTimeline(s) {
  return [
    h('div', { class: 'vh' }, h('h2', null, 'Timeline'), h('span', { class: 'note' }, 'Circle check · board coming next')),
    legendCard(), matrixCard(), sizesCard(), statesCard(), dataCard(s)
  ];
}

/* ---------- Placeholder tabs ---------- */
function soon(title, iconPaths, heading, text) {
  return [h('div', { class: 'vh' }, h('h2', null, title)),
    h('section', { class: 'card' }, h('div', { class: 'empty' }, icon(iconPaths), h('h3', null, heading), h('p', null, text)))];
}

/* ---------- Me ---------- */
function viewMe(s) {
  const p = s.profile;
  const lv = levelInfo(p.xp);
  const today = todayISO();
  const theme = p.theme || 'auto';
  const seg = h('div', { class: 'seg ph', role: 'radiogroup', 'aria-label': 'Theme' },
    [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']].map(([k, n]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(theme === k), class: theme === k ? 'on' : '',
      onclick: () => { if (theme !== k) store.updateProfile({ theme: k }).catch(() => toast('Theme not saved. Check your connection.', 'err')); }
    }, n)));
  const kv = (n, label) => h('div', { class: 'stat' }, h('b', null, n), h('span', null, label));
  const storage = s.mode === 'local' ? 'Saved on this device only. Other people and devices will not see these tasks.'
    : s.mode === 'synced' ? 'Synced. People you share lists with see changes live.'
    : s.mode === 'error' ? 'Not synced. Changes may not reach the server; reload to reconnect.' : 'Connecting…';
  const game = p.gameOn === false ? null : card('Your level', 'Your level', null,
    h('div', { class: 'prof' },
      h('span', { class: 'badge l', style: '--b1:' + lv.badge.b1 + ';--b2:' + lv.badge.b2, role: 'img', 'aria-label': 'Level ' + lv.level + ' badge' },
        h('b', { style: 'color:' + lv.badge.nc }, lv.badge.label)),
      h('div', { style: 'flex:1;min-width:0' },
        h('div', { class: 'lv' }, 'Level ' + lv.level), h('div', { class: 'ti' }, lv.title),
        lv.next ? h('div', { class: 'xpt' }, h('b', null, fint(lv.into)), ' / ' + fint(lv.need) + ' XP to ' + lv.next) : h('div', { class: 'xpt' }, 'Top rank reached'),
        h('div', { class: 'xp l', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(lv.need), 'aria-valuenow': String(lv.into), 'aria-label': 'XP progress' },
          h('i', { style: 'width:' + lv.pct.toFixed(1) + '%' })))),
    h('div', { class: 'kv' }, kv(fint(p.xp || 0), 'Total XP'), kv(doneRecently(store.liveTasks(), today), 'Done, 7 days'), kv(p.streak || 0, 'Day streak')));
  return [
    h('div', { class: 'vh' }, h('h2', null, 'Me')),
    game,
    card('Settings', 'Settings', null,
      h('div', { class: 'set-row' }, h('div', null, h('div', { class: 't1' }, 'Theme'), h('div', { class: 't2' }, 'Auto follows your device')), seg),
      h('div', { class: 'set-row' }, h('div', null, h('div', { class: 't1' }, 'Storage'), h('div', { class: 't2' }, storage))))
  ];
}

/* ---------- Loading ---------- */
function viewLoading() {
  return [h('div', { class: 'vh' }, h('h2', null, 'Loading your tasks')),
    h('section', { class: 'card', 'aria-busy': 'true' }, [80, 60, 92, 45].map((w) => h('div', { class: 'skel skel-row', style: 'width:' + w + '%' })))];
}

/* ---------- Render ---------- */
function render(navigated) {
  const s = store.getState();
  applyTheme();
  renderHeader(s);
  const r = route();
  const keep = !navigated && r === lastRoute ? main.scrollTop : 0;
  let content;
  if (!s.ready) content = viewLoading();
  else if (r === 'list') content = soon('List', ICON.list, 'Every task in one list', 'Search, sort by due date, buffer or priority, and see what needs attention first. Coming in a later update.');
  else if (r === 'focus') content = soon('Focus', ICON.star, 'Your focus list', 'Pick the few tasks that matter today and run a 25 or 50 minute timer on them. Coming in a later update.');
  else if (r === 'me') content = viewMe(s);
  else content = viewTimeline(s);
  main.replaceChildren(...content.filter(Boolean));
  main.scrollTop = keep;
  if (navigated && lastRoute !== null) main.focus({ preventScroll: true });
  lastRoute = r;
}

let queued = false;
store.subscribe(() => {
  if (queued) return;
  queued = true;
  Promise.resolve().then(() => { queued = false; render(); });
});
store.init().catch((e) => { console.error(e); toast('Taskfront could not start. Reload to try again.', 'err'); });
