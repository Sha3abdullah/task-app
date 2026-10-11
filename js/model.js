// Taskfront model: pure logic only (no DOM, no storage).
// Dates are "YYYY-MM-DD" strings handled in UTC so DST never shifts a day.

export const PRIORITY = {
  hi:   { key: 'hi',   label: 'High',   value: 3, cls: 'p-hi' },
  med:  { key: 'med',  label: 'Medium', value: 2, cls: 'p-med' },
  low:  { key: 'low',  label: 'Low',    value: 1, cls: 'p-low' },
  none: { key: 'none', label: 'None',   value: 1, cls: 'p-none' }
};
export const PRIORITY_ORDER = ['hi', 'med', 'low', 'none'];

export const EFFORTS = [1, 2, 3, 5, 8, 13];
export const EFFORT_PX = { 1: 14, 2: 18, 3: 22, 5: 28, 8: 36, 13: 46 };

export const STATUS = {
  backlog: { key: 'backlog', label: 'Backlog' },
  todo:    { key: 'todo',    label: 'To do' },
  doing:   { key: 'doing',   label: 'Doing' },
  blocked: { key: 'blocked', label: 'Blocked' },
  done:    { key: 'done',    label: 'Done' }
};
export const STATUS_ORDER = ['backlog', 'todo', 'doing', 'blocked', 'done'];

// Buffer under this many days counts as tight.
export const TIGHT_DAYS = 3;

/* ---------- Dates ---------- */
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 864e5;

const pad = (n) => String(n).padStart(2, '0');
const toUTC = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };

export function todayISO(now = new Date()) {
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
}
export function addDays(s, n) { return new Date(toUTC(s) + n * DAY).toISOString().slice(0, 10); }
export function daysBetween(a, b) { return Math.round((toUTC(b) - toUTC(a)) / DAY); }
export function weekday(s) { return new Date(toUTC(s)).getUTCDay(); }
// Weeks start Sunday; weekend = Friday + Saturday (Riyadh locale).
export function weekStart(s) { return addDays(s, -weekday(s)); }
export function isWeekend(s) { const d = weekday(s); return d === 5 || d === 6; }
export function fmtDay(s) {
  if (!s) return 'No date';
  const d = new Date(toUTC(s));
  return WD[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MO[d.getUTCMonth()];
}

/* ---------- Numbers ---------- */
// Real minus sign, as in the designs.
export function fnum(n) { return (n < 0 ? '−' : '') + String(Math.abs(n)); }
export function fint(n) { return Math.round(n).toLocaleString('en-US'); }

/* ---------- Task logic ---------- */
export function effortOf(task) {
  const e = Number(task && task.effort) || 1;
  if (EFFORTS.includes(e)) return e;
  return EFFORTS.reduce((best, v) => (Math.abs(v - e) < Math.abs(best - e) ? v : best), 1);
}

// Days until due minus effort / 2 (1 point is about half a day). Null without a due date.
export function buffer(task, today = todayISO()) {
  if (!task || !task.due) return null;
  return daysBetween(today, task.due) - effortOf(task) / 2;
}

// "done" | "nodate" | "overdue" | "tight" | "ok"
export function timing(task, today = todayISO()) {
  if (task.status === 'done') return 'done';
  const b = buffer(task, today);
  if (b === null) return 'nodate';
  if (b < 0) return 'overdue';
  if (b < TIGHT_DAYS) return 'tight';
  return 'ok';
}

export function bufferText(task, today = todayISO()) {
  const t = timing(task, today);
  if (t === 'done') return 'done';
  if (t === 'nodate') return 'no date';
  const b = buffer(task, today);
  if (t === 'overdue') return fnum(b) + ' d overdue';
  if (t === 'tight') return fnum(b) + ' d buffer, tight';
  return fnum(b) + ' d buffer';
}

export function isOpen(task) { return !task.deleted && task.status !== 'done'; }

// Header pills: Overdue · Tight · Blocked · Active (Doing).
export function counts(tasks, today = todayISO()) {
  const c = { overdue: 0, tight: 0, blocked: 0, doing: 0 };
  for (const t of tasks) {
    if (t.deleted) continue;
    const m = timing(t, today);
    if (m === 'overdue') c.overdue++;
    if (m === 'tight') c.tight++;
    if (t.status === 'blocked') c.blocked++;
    if (t.status === 'doing') c.doing++;
  }
  return c;
}

// Finished in the last 7 days, today included.
export function doneRecently(tasks, today = todayISO(), days = 7) {
  const from = addDays(today, -(days - 1));
  return tasks.filter((t) => !t.deleted && t.status === 'done' && t.doneAt && t.doneAt.slice(0, 10) >= from).length;
}

/* ---------- XP and levels ---------- */
export function xpFor(task) {
  const p = PRIORITY[task.priority] || PRIORITY.none;
  return p.value * effortOf(task);
}

// One curve, kept here: level 23 needs 1,595 XP to reach 24.
export function xpToNext(level) { return 100 + 65 * level; }

export const MAX_LEVEL = 55;
export const MAX_PRESTIGE = 10;
export const TITLES = ['Rookie', 'Plinker', 'Spotter', 'Marksman', 'Sharpshooter', 'Deadeye', 'Ace', 'Sniper', 'Elite', 'Master', 'Legend'];
// Badge rim / face / number colours per title band, from design/DS-Badges.
export const BADGE_COLORS = [
  ['#7A5C45', '#B08A68'], ['#8E5F33', '#C99260'], ['#5E6B7B', '#9AA7B6'], ['#7C8898', '#D0D7E0'],
  ['#B68A16', '#E7C04F'], ['#1D6F62', '#4FB7A2'], ['#2C4FB0', '#7392E8'], ['#5B3BA6', '#A386E8'],
  ['#83346A', '#CB7AB0'], ['#1E2436', '#56617D', '#F1D27A'], ['#E4B53F', '#1B2340', '#F1D27A']
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// Total XP for reaching the start of a level (level 1 = 0).
export function xpAtLevel(level) {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += xpToNext(l);
  return sum;
}

export function levelInfo(totalXp) {
  let left = Math.max(0, Math.floor(Number(totalXp) || 0));
  let level = 1;
  while (level < MAX_LEVEL && left >= xpToNext(level)) { left -= xpToNext(level); level++; }
  let prestige = 0;
  if (level === MAX_LEVEL) {
    const cost = xpToNext(MAX_LEVEL);
    while (prestige < MAX_PRESTIGE && left >= cost) { left -= cost; prestige++; }
  }
  const maxed = level === MAX_LEVEL && prestige === MAX_PRESTIGE;
  const need = maxed ? 0 : xpToNext(level);
  const band = Math.min(TITLES.length - 1, Math.floor((level - 1) / 5));
  const [b1, b2, nc] = BADGE_COLORS[band];
  const title = TITLES[band] + (prestige ? ' · Prestige ' + ROMAN[prestige - 1] : '');
  return {
    level, prestige, title, rank: ((level - 1) % 5) + 1,
    into: maxed ? 0 : left, need, pct: maxed ? 100 : Math.min(100, (left / need) * 100),
    next: level < MAX_LEVEL ? 'level ' + (level + 1) : (maxed ? null : 'Prestige ' + ROMAN[prestige]),
    badge: { b1, b2, nc: nc || '#1B1405', label: prestige ? ROMAN[prestige - 1] : String(level) }
  };
}
