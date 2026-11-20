export function dateKey(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value) => String(value).padStart(2, '0')).join('-');
}

export function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function periodRange(date, mode) {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (mode === 'month') return [new Date(year, month, 1), new Date(year, month + 1, 1)];
  if (mode === 'week') {
    const monday = addDays(date, -((date.getDay() + 6) % 7));
    return [monday, addDays(monday, 7)];
  }
  return [addDays(date, 0), addDays(date, 1)];
}

export function shiftPeriod(date, mode, direction) {
  if (mode === 'month') return new Date(date.getFullYear(), date.getMonth() + direction, 1);
  return addDays(date, direction * (mode === 'week' ? 7 : 1));
}

export function taskStats(tasks, start, end) {
  const first = dateKey(start);
  const last = dateKey(end);
  const planned = tasks.filter((task) => task.date >= first && task.date < last);
  const done = planned.filter((task) => task.done).length;
  return { planned, done, percent: planned.length ? Math.round(done * 100 / planned.length) : 0 };
}

export function noteDraftFromLink(url) {
  if (typeof url !== 'string' || !url.startsWith('ritmplanner://note?text=')) return null;
  try {
    return decodeURIComponent(url.slice('ritmplanner://note?text='.length).split('&')[0]).trim().slice(0, 4000) || null;
  } catch {
    return null;
  }
}