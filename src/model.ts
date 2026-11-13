export const STATUS = {
  todo: { label: '未着手', color: '#94a3b8' },
  on_going: { label: '進行中', color: '#22d3ee' },
  done: { label: '完了', color: '#34d399' },
  on_hold: { label: '保留', color: '#fbbf24' },
  cancelled: { label: '中止', color: '#fb7185' },
} as const;
export type Status = keyof typeof STATUS;
export type Kind = 'task' | 'event' | 'project';
export interface WorkSession { start: number; end: number | null; }
export interface Item {
  path: string; title: string; kind: Kind; status: string; targetDate: string; sortOrder?: number | null;
  start: number | null; end: number | null; due: number | null;
  projectPath: string | null; projectLabel: string; archived: boolean;
  parentTaskPath?: string | null; parentTaskLabel?: string;
  completedAt?: number | null;
  taskStart?: number | null; taskEnd?: number | null;
  taskSessions?: WorkSession[];
}
export const isStatus = (value: string): value is Status => Object.hasOwn(STATUS, value);
export const isActive = (item: Item) => !['done', 'cancelled'].includes(item.status);
function dayParts(day: string): [number, number, number] | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [y, m, d] = day.split('-').map(Number);
  return [y, m, d];
}
export function dayKey(time = Date.now()): string {
  const d = new Date(time);
  if (!Number.isFinite(d.getTime())) return '';
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function validDay(value: string): boolean {
  const parts = dayParts(value);
  if (!parts) return false;
  const [y, m, d] = parts;
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCFullYear(y);
  return utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === d;
}
export function dayStart(day: string): number {
  const parts = dayParts(day);
  if (!parts || !validDay(day)) return NaN;
  const [y, m, d] = parts;
  const local = new Date(y, m - 1, d, 0, 0, 0, 0);
  local.setFullYear(y);
  return local.getTime();
}
export function centeredScrollTop(position: number, viewportHeight: number, contentHeight: number): number {
  return Math.max(0, Math.min(Math.max(0, contentHeight - viewportHeight), position - viewportHeight / 2));
}
export function moveDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCFullYear(y);
  utc.setUTCDate(utc.getUTCDate() + delta);
  return `${String(utc.getUTCFullYear()).padStart(4, '0')}-${String(utc.getUTCMonth() + 1).padStart(2, '0')}-${String(utc.getUTCDate()).padStart(2, '0')}`;
}
export function moveMonth(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + delta, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${String(first.getUTCFullYear()).padStart(4, '0')}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(date, last)).padStart(2, '0')}`;
}
export function monthDays(day: string): string[] {
  const first = day.slice(0, 7) + '-01';
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const mondayOffset = (weekday + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => moveDay(first, i - mondayOffset));
}
export function dateValue(value: unknown): string {
  if (value instanceof Date) return dayKey(value.getTime());
  return typeof value === 'string' && validDay(value) ? value : '';
}
export function dateTime(value: unknown): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const [day, time] = value.split('T');
  const [h, m, s = 0] = time.split(':').map(Number);
  if (!validDay(day) || h > 23 || m > 59 || s > 59) return null;
  const [y, mo, d] = day.split('-').map(Number);
  const local = new Date(y, mo - 1, d, h, m, s, 0);
  local.setFullYear(y);
  return Number.isFinite(local.getTime()) ? local.getTime() : null;
}
export function timeLabel(time: number): string {
  const d = new Date(time);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function localTimestamp(time=Date.now()):string {
  return `${dayKey(time)}T${timeLabel(time)}:${String(new Date(time).getSeconds()).padStart(2,'0')}`;
}
export function parseSessionEntry(entry: unknown): WorkSession | null {
  if (typeof entry !== 'string') return null;
  const parts = entry.split('..');
  if (parts.length !== 2) return null;
  const start = dateTime(parts[0].trim());
  if (start === null) return null;
  const rawEnd = parts[1].trim();
  if (!rawEnd) return { start, end: null };
  const end = dateTime(rawEnd);
  if (end === null || end < start) return null;
  return { start, end };
}
export function parseWorkSessions(rawSessions: unknown, rawStart: unknown, rawEnd: unknown): WorkSession[] {
  if (Array.isArray(rawSessions)) return rawSessions.map(parseSessionEntry).filter((s): s is WorkSession => s !== null);
  const start = dateTime(rawStart);
  if (start === null) return [];
  const end = dateTime(rawEnd);
  return [{ start, end: end !== null && end >= start ? end : null }];
}
export function itemSessions(item: Item): WorkSession[] {
  if (item.taskSessions) return item.taskSessions;
  return item.taskStart != null ? [{ start: item.taskStart, end: item.taskEnd ?? null }] : [];
}
export function formatDuration(minutes: number): string {
  const whole = Math.max(0, Math.floor(minutes));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}
export function recordTaskCompletion(properties:Record<string,unknown>,previousStatus:unknown,now=Date.now()):void {
  if(properties.status==='done'&&previousStatus!=='done')properties['completed at']=localTimestamp(now);
  else if(properties.status!=='done'&&previousStatus==='done')properties['completed at']=null;
}
export function completedTasks(items:Item[],day:string):Item[] {
  return items.filter(i=>i.kind==='task'&&i.status==='done'&&i.completedAt!=null&&dayKey(i.completedAt)===day)
    .sort((a,b)=>b.completedAt!-a.completedAt!||a.title.localeCompare(b.title));
}
export function titleFor(name: string, kind: Kind): string {
  return kind === 'project' ? name : name.replace(/ (?:\d{4}-\d{2}-\d{2}|TBD)(?: \d+)?$/, '');
}
export const hasSchedule = (item: Item) => item.start !== null && item.end !== null && item.end > item.start;
export interface Slot { item: Item; start: number; end: number; column: number; columns: number; source: 'schedule' | 'actual'; from: number; to: number; running: boolean; }
/** Minutes in the selected local day. Connected overlaps share a lane count. */
export function timeline(items: Item[], day: string, now = Date.now()): Slot[] {
  const start = dayStart(day), end = dayStart(moveDay(day, 1));
  const slots: Slot[] = items.flatMap(item => {
    if (item.kind === 'project') return [];
    const ranges: {source:'schedule'|'actual';from:number;to:number;running:boolean}[] = [];
    if (hasSchedule(item)) ranges.push({source:'schedule',from:item.start!,to:item.end!,running:false});
    if (item.kind === 'task') {
      const sessions = itemSessions(item);
      for (let idx = 0; idx < sessions.length; idx++) {
        const session = sessions[idx];
        const running = item.status === 'on_going' && session.end == null && idx === sessions.length - 1;
        const to = session.end ?? (running ? now : null);
        if (to !== null && to >= session.start) ranges.push({ source: 'actual', from: session.start, to, running });
      }
    }
    return ranges.filter(r => r.from < end && (r.to > start || (r.running && r.to === start))).map(range => ({
      item,...range,start:Math.max(0,(range.from-start)/60000),end:Math.min(1440,(range.to-start)/60000),column:0,columns:1,
    }));
  }).sort((a,b) => a.start-b.start || b.end-a.end || a.item.path.localeCompare(b.item.path));
  let group: Slot[] = [], laneEnds: number[] = [], groupEnd = -1;
  const finish = () => { for (const slot of group) slot.columns = laneEnds.length; group = []; laneEnds = []; };
  for (const slot of slots) {
    if (slot.start >= groupEnd) { finish(); groupEnd = -1; }
    let lane = laneEnds.findIndex(e => e <= slot.start);
    if (lane < 0) lane = laneEnds.length;
    const displayEnd = Math.min(1440, Math.max(slot.end, slot.start + (slot.source === 'actual' ? 2 : 26)));
    laneEnds[lane] = displayEnd; slot.column = lane; group.push(slot);
    groupEnd = Math.max(groupEnd, displayEnd);
  }
  finish(); return slots;
}
function hasWorkOnDay(item: Item, day: string): boolean {
  const start = dayStart(day), nextStart = dayStart(moveDay(day, 1));
  return itemSessions(item).some((session, idx, all) => {
    const running = item.status === 'on_going' && session.end == null && idx === all.length - 1;
    const end = session.end ?? (running ? Date.now() : session.start);
    return dayKey(session.start) === day || (session.start < nextStart && end > start);
  });
}
export type TaskTab = 'day' | 'ongoing' | 'unscheduled' | 'all';
export function filterTasks(items: Item[], day: string, tab: TaskTab): Item[] {
  const nextStart = dayStart(moveDay(day, 1)), start = dayStart(day);
  return items.filter(i => i.kind === 'task' && (
    tab === 'all' || (tab === 'ongoing' && i.status === 'on_going') ||
    (tab === 'unscheduled' && !i.targetDate && !hasSchedule(i)) ||
    (tab === 'day' && (i.targetDate === day || hasWorkOnDay(i,day) || (hasSchedule(i) && i.start! < nextStart && i.end! > start)))
  )).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity) || a.title.localeCompare(b.title));
}

export function carryovers(items: Item[], day: string): Item[] {
  const start = dayStart(day);
  return items.filter(i => {
    if (i.kind === 'project' || !['todo', 'on_going'].includes(i.status)) return false;
    if (hasSchedule(i)) return i.end! <= start;
    return (i.targetDate && i.targetDate < day) || (i.start !== null && i.start < start);
  }).sort((a, b) => (a.targetDate || dayKey(a.start ?? start)).localeCompare(b.targetDate || dayKey(b.start ?? start)));
}

/** Append inside the real Notes section, without changing frontmatter or other sections. */
export function appendMemo(content: string, memo: string, stamp: string): string {
  const trimmed = memo.trim();
  if (!trimmed) throw new Error('メモを入力してください。');
  const nl = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  let frontmatter = lines[0] === '---', fence = '', start = -1, end = lines.length;
  for (let i = frontmatter ? 1 : 0; i < lines.length; i++) {
    const line = lines[i];
    if (frontmatter) { if (line === '---' || line === '...') frontmatter = false; continue; }
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = '';
      continue;
    }
    if (fence) continue;
    if (start < 0 && /^##\s+Notes\s*#*\s*$/i.test(line)) start = i;
    else if (start >= 0 && /^#{1,2}\s/.test(line)) { end = i; break; }
  }
  if (frontmatter) throw new Error('フロントマターの終端を確認してください。');
  const entry = `- ${stamp} ${trimmed.split(/\r?\n/).join(nl + '  ')}`;
  if (start < 0) return content.replace(/\s*$/, '') + nl + nl + '## Notes' + nl + nl + entry + nl;
  const before = lines.slice(0, end).join(nl).replace(/\s*$/, '');
  const after = lines.slice(end).join(nl);
  return before + nl + nl + entry + nl + (after ? nl + after : '');
}

export function notesText(content: string): string {
  const lines = content.split(/\r?\n/); let found = false, fence = '', fm = lines[0] === '---'; const result: string[] = [];
  for (let i = fm ? 1 : 0; i < lines.length; i++) {
    const line = lines[i];
    if (fm) { if (line === '---' || line === '...') fm = false; continue; }
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) { if (!fence) fence = marker[1]; else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = ''; }
    if (!fence && /^##\s+Notes\s*#*\s*$/i.test(line)) { found = true; continue; }
    if (found && !fence && /^#{1,2}\s/.test(line)) break;
    if (found) result.push(line);
  }
  return result.join('\n').trim();
}
