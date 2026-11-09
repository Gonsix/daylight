import { dateTime, Item, localTimestamp, recordTaskCompletion } from './model';

export function isTaskRunning(item: Item): boolean {
  return item.kind === 'task' && item.status === 'on_going' && item.taskStart != null && item.taskEnd == null;
}
export function workDuration(item: Item): string | null {
  if (item.kind !== 'task' || item.status !== 'done' || item.taskStart == null || item.taskEnd == null || item.taskEnd < item.taskStart) return null;
  const minutes = Math.floor((item.taskEnd - item.taskStart) / 60000);
  return `${String(Math.floor(minutes / 60)).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}`;
}
/** Finish/hold/cancel an open work interval through any status control. */
export function recordWorkStatus(fm: Record<string,unknown>, previous: unknown, now = Date.now()) {
  if (fm.status !== 'on_going' && dateTime(fm.task_start) !== null && !fm.task_end) {
    const start = dateTime(fm.task_start)!;
    if (now < start) throw new Error('作業終了が開始時刻より前になっています。');
    fm.task_end = localTimestamp(now);
  }
  recordTaskCompletion(fm,previous,now);
}
