// Task circle: renders the fixed encoding classes from styles/tokens.css.
// colour = priority (p-*), size = effort (e*), inside = status (doing/blocked/done),
// outside ring = deadline (overdue solid, tight dashed). Colour is never the only signal:
// every circle carries an aria-label that says all of it in words.
import { PRIORITY, STATUS, effortOf, timing, bufferText, fmtDay, todayISO } from '../model.js';

const STATUS_CLASS = { doing: 'doing', blocked: 'blocked', done: 'done' };

// "tc p-hi e5 doing overdue"
export function circleClass(task, today = todayISO()) {
  const p = PRIORITY[task.priority] || PRIORITY.none;
  const parts = ['tc', p.cls, 'e' + effortOf(task)];
  if (STATUS_CLASS[task.status]) parts.push(STATUS_CLASS[task.status]);
  const t = timing(task, today);
  if (t === 'overdue') parts.push('overdue');
  else if (t === 'tight') parts.push('tight');
  return parts.join(' ');
}

// "Q3 ops review deck, High priority, 5 points, Doing, due Sat 10 Oct, −3.5 d overdue"
export function describe(task, today = todayISO()) {
  const p = PRIORITY[task.priority] || PRIORITY.none;
  const s = STATUS[task.status] || STATUS.todo;
  const pr = p.key === 'none' ? 'no priority' : p.label + ' priority';
  const e = effortOf(task);
  const due = task.due ? 'due ' + fmtDay(task.due) : 'no due date';
  return [task.title, pr, e + (e === 1 ? ' point' : ' points'), s.label, due, bufferText(task, today)].join(', ');
}

// A bare circle from a class string. opts: { k, bgc, aria }
export function circle(cls, opts = {}) {
  const el = document.createElement('span');
  el.className = cls.startsWith('tc') ? cls : 'tc ' + cls;
  if (opts.k != null) el.style.setProperty('--k', String(opts.k));
  if (opts.bgc) el.style.setProperty('--bgc', opts.bgc);
  if (opts.aria) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', opts.aria); }
  else el.setAttribute('aria-hidden', 'true');
  return el;
}

// The circle for a task. opts: { k, bgc, today, aria (false = decorative), extra (e.g. "ghost") }
export function taskCircle(task, opts = {}) {
  const today = opts.today || todayISO();
  const cls = circleClass(task, today) + (opts.extra ? ' ' + opts.extra : '');
  const aria = opts.aria === false ? null : (opts.aria || describe(task, today));
  return circle(cls, { k: opts.k, bgc: opts.bgc, aria });
}

// Mini neutral icon used inside pills and status buttons: "overdue" | "tight" | "blocked" | "doing" | "done".
export function miniIcon(state) {
  return circle('tc e1 p-neutral ' + state);
}
