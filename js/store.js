// Taskfront store: the only module that talks to the db (or its localStorage fallback).
// Screens read state through subscribe() and change it through the write functions below.
import { todayISO, addDays } from './model.js';

// Access rules declared at publish (kept here as the record of what the artifact declares).
export const RULES = [
  { path: '', read: 'interact', write: 'interact' },
  { path: 'xp', read: 'interact', write: 'admin' },
  { path: 'xp/{self}', write: 'interact' }
];

const LS_KEY = 'taskfront.v1';
const THEME_KEY = 'taskfront.theme';

// Sample people on the seeded shared lists. They are not real accounts; real teammates are stored by user id.
const DEMO_PEOPLE = {
  'demo-sara': { name: 'Sara K.', initial: 'S', cls: 'a2' },
  'demo-omar': { name: 'Omar H.', initial: 'O', cls: 'a3' },
  'demo-dev': { name: 'Dev R.', initial: 'D', cls: 'a4' }
};

const SEED_LISTS = [
  ['work', 'Work', 'Y,S,O'], ['personal', 'Personal', ''], ['home', 'Home', ''], ['health', 'Health', ''],
  ['learning', 'Learning', ''], ['side', 'Side project', 'Y,D'], ['errands', 'Errands', '']
];
// id | title | list | status | due (days from today, null = no date) | effort | priority | people
const SEED_TASKS = [
  ['q3', 'Q3 ops review deck', 'work', 'doing', -1, 5, 'hi', 'Y,S'],
  ['vendor', 'Vendor contract renewal', 'work', 'todo', 2, 3, 'hi', 'O'],
  ['migrate', 'Migrate reports to new BI', 'work', 'doing', 14, 13, 'hi', 'Y'],
  ['hiring', 'Hiring loop: data analyst', 'work', 'blocked', 7, 3, 'med', 'S'],
  ['lag', 'Fix dashboard refresh lag', 'work', 'done', -8, 2, 'hi', 'Y'],
  ['retro', 'Team retro', 'work', 'done', -5, 1, 'med', 'Y,S,O'],
  ['planning', 'Quarterly planning notes', 'work', 'todo', 21, 2, 'low', 'Y,O,S'],
  ['security', 'Security review prep', 'work', 'todo', 28, 8, 'med', 'O'],
  ['onboard', 'Onboarding guide v2', 'work', 'todo', 35, 5, 'low', 'S'],
  ['dsguide', 'Dashboard style guide', 'work', 'backlog', null, 3, 'low', 'Y'],
  ['passport', 'Renew passport', 'personal', 'todo', 3, 2, 'hi', ''],
  ['trip', 'Plan November trip', 'personal', 'todo', 17, 3, 'med', ''],
  ['grandma', 'Call grandma', 'personal', 'done', -3, 1, 'low', ''],
  ['gift', 'Birthday gift for Lina', 'personal', 'todo', 12, 1, 'med', ''],
  ['photos', 'Back up phone photos', 'personal', 'todo', 31, 2, 'low', ''],
  ['tap', 'Fix leaking tap', 'home', 'todo', -4, 2, 'med', ''],
  ['ac', 'Book AC service', 'home', 'todo', 4, 1, 'med', ''],
  ['utilities', 'Pay utilities', 'home', 'done', -2, 1, 'hi', ''],
  ['declutter', 'Declutter storage room', 'home', 'todo', 23, 5, 'low', ''],
  ['paint', 'Paint the balcony', 'home', 'todo', 37, 8, 'low', ''],
  ['garden', 'Garden irrigation', 'home', 'backlog', null, 5, 'med', ''],
  ['checkup', 'Annual check-up', 'health', 'todo', 6, 1, 'hi', ''],
  ['run5k', 'Run 5k under 30 min', 'health', 'doing', 33, 8, 'med', ''],
  ['meal', 'Meal prep', 'health', 'doing', 1, 1, 'low', ''],
  ['dentist', 'Dentist', 'health', 'done', -7, 1, 'med', ''],
  ['course', 'Finish ClickHouse course', 'learning', 'doing', 9, 8, 'med', ''],
  ['ddia', 'Read DDIA ch. 7', 'learning', 'todo', 2, 3, 'low', ''],
  ['callig', 'Calligraphy class', 'learning', 'todo', 19, 2, 'low', ''],
  ['blog', 'Write blog post on CDC', 'learning', 'todo', 26, 5, 'none', ''],
  ['quiz', 'Quiz ch. 6', 'learning', 'done', -6, 1, 'low', ''],
  ['rust', 'Learn Rust basics', 'learning', 'backlog', null, 13, 'none', ''],
  ['landing', 'Landing page copy', 'side', 'doing', -2, 3, 'hi', 'Y'],
  ['auth', 'Auth flow', 'side', 'blocked', 11, 8, 'hi', 'D'],
  ['beta', 'Beta invite list', 'side', 'todo', 16, 2, 'none', 'Y'],
  ['icons', 'App icon sketches', 'side', 'todo', 25, 3, 'med', 'D'],
  ['pricing', 'Pricing research', 'side', 'todo', 40, 5, 'low', 'Y,D'],
  ['podcast', 'Podcast idea', 'side', 'backlog', null, 2, 'none', ''],
  ['car', 'Car registration', 'errands', 'todo', -1, 2, 'hi', ''],
  ['groceries', 'Groceries', 'errands', 'done', 0, 1, 'low', ''],
  ['headph', 'Return headphones', 'errands', 'todo', 1, 1, 'med', ''],
  ['dry', 'Pick up dry cleaning', 'errands', 'todo', 7, 1, 'low', ''],
  ['shoes', 'New running shoes', 'errands', 'todo', null, 1, 'low', '']
];

// Level 23 with 1,240 XP into it, as in the design.
const SEED_XP = 19885;

let db = null;
let userCap = null;
const unsubs = [];
const subs = new Set();

// mode: "loading" | "synced" | "local" | "error"
const state = { ready: false, mode: 'loading', error: null, uid: 'me', lists: {}, tasks: {}, profile: defaultProfile() };

export function getState() { return state; }
export function subscribe(fn) { subs.add(fn); fn(state); return () => subs.delete(fn); }
function emit() { for (const fn of subs) { try { fn(state); } catch (e) { console.error(e); } } }

export function defaultProfile() {
  return {
    theme: readCachedTheme(), gameOn: true, showTitles: true,
    range: { before: 2, after: 6 }, focus: [],
    xp: 0, prestige: 0, streak: 0, lastDoneDay: null, undo: []
  };
}

/* ---------- Boot ---------- */
export async function init() {
  const c = window.claude;
  if (c && typeof c.use === 'function') {
    try { [db, userCap] = await Promise.all([c.use('db'), c.use('user')]); } catch (e) { db = null; }
  }
  if (userCap) { try { state.uid = (await userCap.id()) || 'me'; } catch (e) { /* keep "me" */ } }
  if (db) return initDb();
  return initLocal();
}

function initLocal() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { data = null; }
  if (!data || !data.lists || !Object.keys(data.lists).length) {
    const seed = buildSeed(state.uid);
    data = { lists: seed.lists, tasks: seed.tasks, profile: seed.profile };
  }
  state.lists = data.lists;
  state.tasks = data.tasks || {};
  state.profile = { ...defaultProfile(), ...(data.profile || {}) };
  state.mode = 'local';
  state.ready = true;
  saveLocal();
  emit();
}

function saveLocal() {
  if (state.mode !== 'local') return;
  try { localStorage.setItem(LS_KEY, JSON.stringify({ lists: state.lists, tasks: state.tasks, profile: state.profile })); } catch (e) { /* storage blocked: keep in memory */ }
}

async function initDb() {
  const profileRef = hasOwnProfile() ? db.doc('data/users/' + state.uid + '/profile') : null;
  try { await seedIfEmpty(); } catch (e) { console.warn('Seed skipped', e); }
  if (profileRef) {
    try {
      const snap = await profileRef.get();
      if (!snap.exists) await profileRef.set(state.seededProfile || defaultProfile());
    } catch (e) { console.warn('Profile not created', e); }
  } else {
    try { state.profile = { ...defaultProfile(), ...JSON.parse(localStorage.getItem(LS_KEY + '.profile') || '{}') }; } catch (e) { /* defaults */ }
  }

  const waiting = new Set(['lists', 'tasks']);
  const arrived = (key) => {
    if (!waiting.delete(key) || waiting.size) return;
    state.ready = true;
    if (state.mode !== 'error') state.mode = 'synced';
  };
  const onErr = (e) => { state.mode = 'error'; state.error = (e && e.code) || 'unavailable'; state.ready = true; emit(); };
  const toMap = (snap) => Object.fromEntries(snap.docs.map((d) => [d.id, { ...d.data(), id: d.id }]));

  unsubs.push(db.collection('lists').onSnapshot((s) => { state.lists = toMap(s); arrived('lists'); emit(); }, onErr));
  unsubs.push(db.collection('tasks').onSnapshot((s) => { state.tasks = toMap(s); arrived('tasks'); emit(); }, onErr));
  if (profileRef) {
    unsubs.push(profileRef.onSnapshot((d) => {
      if (d.exists) { state.profile = { ...defaultProfile(), ...d.data() }; cacheTheme(state.profile.theme); emit(); }
    }, onErr));
  }
}

function hasOwnProfile() { return !!state.uid && state.uid !== 'me'; }

// Writes the sample data once, guarded by a short lease so two first viewers don't both seed.
async function seedIfEmpty() {
  const existing = await db.collection('lists').limit(1).get();
  if (!existing.empty) return;
  const metaRef = db.doc('meta/seed');
  const lease = await metaRef.acquire({ holder: state.uid + ':' + Math.random().toString(36).slice(2), ttlMs: 60000 });
  if (!lease.acquired) return;
  const meta = await metaRef.get();
  if (meta.exists && meta.data().done) return;
  const seed = buildSeed(state.uid);
  const writes = [
    ...Object.values(seed.lists).map((l) => () => db.doc('lists/' + l.id).set(strip(l))),
    ...Object.values(seed.tasks).map((t) => () => db.doc('tasks/' + t.id).set(strip(t)))
  ];
  for (let i = 0; i < writes.length; i += 8) await Promise.all(writes.slice(i, i + 8).map((w) => w()));
  await metaRef.set({ done: true, at: new Date().toISOString(), by: state.uid });
  state.seededProfile = seed.profile;
}

function strip(o) { const { id, ...rest } = o; return rest; }

function buildSeed(meId) {
  const today = todayISO();
  const now = new Date().toISOString();
  const who = { Y: meId, S: 'demo-sara', O: 'demo-omar', D: 'demo-dev' };
  const ids = (s) => (s ? s.split(',').map((c) => who[c]) : []);
  const lists = {};
  SEED_LISTS.forEach(([id, name, people], order) => {
    lists[id] = { id, name, order, members: ids(people), createdBy: meId, createdAt: now };
  });
  const tasks = {};
  for (const [id, title, listId, status, r, effort, priority, people] of SEED_TASKS) {
    const due = r === null ? null : addDays(today, r);
    const done = status === 'done';
    tasks[id] = {
      id, title, listId, status, assignees: ids(people), due, effort, priority, notes: '',
      createdBy: meId, createdAt: now, updatedAt: now, updatedBy: meId,
      doneAt: done ? due + 'T12:00:00.000Z' : null, doneBy: done ? meId : null, deleted: false
    };
  }
  const profile = {
    ...defaultProfile(), xp: SEED_XP, streak: 9, lastDoneDay: today,
    focus: ['q3', 'vendor', 'landing', 'passport']
  };
  return { lists, tasks, profile };
}

/* ---------- Reads ---------- */
export function listsInOrder() {
  return Object.values(state.lists).filter((l) => !l.deleted).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
export function liveTasks() { return Object.values(state.tasks).filter((t) => !t.deleted); }
export function tasksIn(listId) { return liveTasks().filter((t) => t.listId === listId); }

// Display info for people ids. Names are resolved at render time, never stored.
export async function people(ids) {
  const out = {};
  const real = ids.filter((id) => id && !DEMO_PEOPLE[id] && id !== state.uid && id !== 'me');
  let profiles = {};
  if (userCap && real.length) { try { profiles = await userCap.profiles(real); } catch (e) { profiles = {}; } }
  ids.forEach((id, i) => {
    if (id === state.uid || id === 'me') out[id] = { id, name: 'You', initial: 'Y', cls: 'a1' };
    else if (DEMO_PEOPLE[id]) out[id] = { id, ...DEMO_PEOPLE[id] };
    else {
      const name = (profiles[id] && profiles[id].name) || 'Someone';
      out[id] = { id, name, initial: name.charAt(0).toUpperCase(), cls: 'a' + (2 + (i % 3)) };
    }
  });
  return out;
}

/* ---------- Writes ---------- */
// Every write returns a promise; failures flip the sync status so the header shows it.
async function write(fn) {
  if (state.mode === 'local' || !db) { saveLocal(); emit(); return; }
  emit();
  try { await fn(); } catch (e) {
    state.mode = 'error'; state.error = (e && e.code) || 'unavailable'; emit();
    throw e;
  }
}
const stamp = () => ({ updatedAt: new Date().toISOString(), updatedBy: state.uid });

export function putTask(task) {
  const t = { ...task, ...stamp() };
  state.tasks = { ...state.tasks, [t.id]: t };
  return write(() => db.doc('tasks/' + t.id).set(strip(t)));
}
export function updateTask(id, patch) {
  if (!state.tasks[id]) return Promise.resolve();
  const p = { ...patch, ...stamp() };
  state.tasks = { ...state.tasks, [id]: { ...state.tasks[id], ...p } };
  return write(() => db.doc('tasks/' + id).update(p));
}
export function deleteTask(id) { return updateTask(id, { deleted: true }); }

export function putList(list) {
  state.lists = { ...state.lists, [list.id]: list };
  return write(() => db.doc('lists/' + list.id).set(strip(list)));
}
export function updateList(id, patch) {
  if (!state.lists[id]) return Promise.resolve();
  state.lists = { ...state.lists, [id]: { ...state.lists[id], ...patch } };
  return write(() => db.doc('lists/' + id).update(patch));
}

export function updateProfile(patch) {
  state.profile = { ...state.profile, ...patch };
  if ('theme' in patch) cacheTheme(patch.theme);
  if (state.mode !== 'local' && db && hasOwnProfile()) {
    return write(() => db.doc('data/users/' + state.uid + '/profile').update(patch));
  }
  // No private subtree this visit (signed out or no id): keep it on this device.
  try { localStorage.setItem(LS_KEY + '.profile', JSON.stringify(state.profile)); } catch (e) { /* ignore */ }
  saveLocal(); emit();
  return Promise.resolve();
}

export function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ---------- Theme cache (so the first paint uses the right theme) ---------- */
function readCachedTheme() { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; } }
function cacheTheme(t) { try { localStorage.setItem(THEME_KEY, t || 'auto'); } catch (e) { /* ignore */ } }
