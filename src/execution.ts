import { dateTime, formatDuration, Item, itemSessions, localTimestamp, parseWorkSessions, recordTaskCompletion, WorkSession } from './model';

export function isFrontmatterRunning(fm: Record<string, unknown>): boolean {
  const sessions = parseWorkSessions(fm.task_sessions, fm.task_start, fm.task_end);
  const last = sessions[sessions.length - 1];
  return !!last && last.end === null;
}
export function isTaskRunning(item: Item): boolean {
  if (item.kind !== 'task' || item.status !== 'on_going') return false;
  const sessions = itemSessions(item);
  const last = sessions[sessions.length - 1];
  return !!last && last.end === null;
}
export function workDuration(item: Item): string | null {
  if (item.kind !== 'task') return null;
  const completed = itemSessions(item).filter((s): s is { start: number; end: number } => s.end != null && s.end >= s.start);
  if (!completed.length) return null;
  const totalMs = completed.reduce((sum, s) => sum + (s.end - s.start), 0);
  return formatDuration(totalMs / 60000);
}
export function serializeWorkSessions(sessions: WorkSession[]): string[] {
  return sessions.map(s => `${localTimestamp(s.start)}..${s.end != null ? localTimestamp(s.end) : ''}`);
}
export function syncWorkFields(fm: Record<string, unknown>, sessions: WorkSession[]) {
  if (!sessions.length) {
    fm.task_start = null; fm.task_end = null;
    if (Object.hasOwn(fm, 'task_sessions')) fm.task_sessions = null;
    return;
  }
  fm.task_sessions = serializeWorkSessions(sessions);
  fm.task_start = localTimestamp(sessions[0].start);
  const last = sessions[sessions.length - 1];
  fm.task_end = last.end != null ? localTimestamp(last.end) : null;
}
export function pauseWork(fm: Record<string, unknown>, now = Date.now()) {
  const sessions = parseWorkSessions(fm.task_sessions, fm.task_start, fm.task_end);
  const last = sessions[sessions.length - 1];
  const fmStart = dateTime(fm.task_start);
  if (!last || last.end !== null) throw new Error('実行中のタスクを選び直してください。');
  if (now < last.start || (fmStart !== null && now < fmStart)) throw new Error('作業終了が開始時刻より前になっています。');
  last.end = now;
  syncWorkFields(fm, sessions);
}
/** Keep actual work sessions and timestamps consistent with status transitions. */
export function recordWorkStatus(fm: Record<string, unknown>, previous: unknown, now = Date.now()) {
  if (fm.status === 'todo') {
    syncWorkFields(fm, []);
  } else if (fm.status === 'on_going') {
    const sessions = parseWorkSessions(fm.task_sessions, fm.task_start, fm.task_end);
    const last = sessions[sessions.length - 1];
    const fmStart = dateTime(fm.task_start);
    if (last && last.end === null) {
      if (last.start > now || (fmStart !== null && fmStart > now)) throw new Error('作業開始が現在より後になっています。');
    } else {
      sessions.push({ start: now, end: null });
    }
    syncWorkFields(fm, sessions);
  } else {
    const sessions = parseWorkSessions(fm.task_sessions, fm.task_start, fm.task_end);
    const last = sessions[sessions.length - 1];
    const fmStart = dateTime(fm.task_start);
    if (last && last.end === null) {
      if (now < last.start || (fmStart !== null && now < fmStart)) throw new Error('作業終了が開始時刻より前になっています。');
      last.end = now;
      syncWorkFields(fm, sessions);
    } else if (sessions.length > 0) {
      syncWorkFields(fm, sessions);
    } else if (fm.status === 'done' && previous !== 'done') {
      fm.task_end = localTimestamp(now);
    }
  }
  recordTaskCompletion(fm, previous, now);
}
