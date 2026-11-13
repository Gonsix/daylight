import { t } from './i18n';
import { appendMemo, dateTime, dayKey, dayStart, isStatus, Status, timeLabel, validDay } from './model';

export interface TimeRange { start: number; end: number; }
export const TIME_STEP = 30;
/** Outward snapping, with a minimum thirty-minute selection, in minutes of a day. */
export function selectRange(anchor: number, current: number): TimeRange {
  const a = Math.max(0, Math.min(1439.999, anchor));
  const b = Math.max(0, Math.min(1440, current));
  const start = Math.min(1440 - TIME_STEP, Math.floor(Math.min(a, b) / TIME_STEP) * TIME_STEP);
  return { start, end: Math.min(1440, Math.max(start + TIME_STEP, Math.ceil(Math.max(a, b) / TIME_STEP) * TIME_STEP)) };
}
export type RangeAction = 'create' | 'move' | 'start' | 'end';
export function adjustRange(range: TimeRange, action: RangeAction, anchor: number, current: number): TimeRange {
  if (action === 'create') return selectRange(anchor, current);
  const snapped = Math.round(current / TIME_STEP) * TIME_STEP;
  if (action === 'start') return { start: Math.max(0, Math.min(range.end - TIME_STEP, snapped)), end: range.end };
  if (action === 'end') return { start: range.start, end: Math.min(1440, Math.max(range.start + TIME_STEP, snapped)) };
  const duration = range.end - range.start;
  const start = Math.max(0, Math.min(1440 - duration, range.start + Math.round((current - anchor) / TIME_STEP) * TIME_STEP));
  return { start, end: start + duration };
}
export function rangeDateTimes(day: string, range: TimeRange) {
  if (!validDay(day)) throw new Error(t("日付を確認してください。"));
  const format = (minute: number) => {
    const time = dayStart(day) + minute * 60000;
    return `${dayKey(time)}T${timeLabel(time)}`;
  };
  return { start: format(range.start), end: format(range.end) };
}
export interface EventInput {
  title: string; start: string; end: string; status: string; projectPath: string; memo: string;
}
export const KEEP_PROJECT = '__keep_original_project__';
export interface EventSnapshot {
  path: string; content: string; input: EventInput; notes: string; projectLabel: string;
}
export function validateEvent(input: EventInput): { title: string; start: string; end: string; status: Status } {
  const title = input.title.trim();
  if (!title) throw new Error(t("タイトルを入力してください。"));
  if (/[\\/:*?"<>|#^\[\]\x00-\x1f]/.test(title) || /\.$/.test(title)) throw new Error(t("タイトルにファイル名で使えない記号が含まれています。"));
  if (title.length > 120) throw new Error(t("タイトルは120文字以内にしてください。"));
  const start = dateTime(input.start), end = dateTime(input.end);
  if (start === null || end === null) throw new Error(t("開始・終了日時を入力してください。"));
  if (start % 60000 || end % 60000) throw new Error(t("時刻は1分単位で指定してください。"));
  if (end <= start) throw new Error(t("終了日時は開始日時より後にしてください。"));
  if (!isStatus(input.status)) throw new Error(t("状態を選択してください。"));
  const format = (time: number) => `${dayKey(time)}T${timeLabel(time)}:00`;
  return { title, start: format(start), end: format(end), status: input.status };
}

export interface YamlAdapter { parse: (source: string) => any; stringify: (value: any) => string; }
export function eventDocument(content: string, yaml: YamlAdapter) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(t("予定ノートのフロントマターを確認してください。"));
  const fm = yaml.parse(match[1]);
  if (!fm || typeof fm !== 'object' || Array.isArray(fm)) throw new Error(t("予定ノートの属性を確認してください。"));
  const tags = (Array.isArray(fm.tags) ? fm.tags : typeof fm.tags === 'string' ? fm.tags.split(/[,\s]+/) : [])
    .filter((t: unknown): t is string => typeof t === 'string').map((t: string) => t.replace(/^#/, ''));
  if (!tags.includes('event') || tags.includes('task') || tags.includes('project')) throw new Error(t("予定ノートではないため編集できません。"));
  return { fm, body: content.slice(match[0].length), newline: content.includes('\r\n') ? '\r\n' : '\n' };
}
export function updateEventDocument(content: string, input: EventInput, project: unknown, yaml: YamlAdapter, stamp: string): string {
  const checked = validateEvent(input), { fm, body, newline } = eventDocument(content, yaml);
  fm.status = checked.status; fm.target_date = checked.start.slice(0, 10);
  fm.schedule_start = checked.start; fm.schedule_end = checked.end; fm.project = project;
  const header = yaml.stringify(fm).trimEnd().replace(/\r?\n/g, newline);
  const updated = `---${newline}${header}${newline}---${newline}${body}`;
  return input.memo.trim() ? appendMemo(updated, input.memo, stamp) : updated;
}
/** Expand only the known template tokens; never execute Templater JavaScript. */
export function renderEvent(template: string, input: EventInput, projectLink: string, createdDay: string, yaml: YamlAdapter): string {
  const value = validateEvent(input);
  const expanded = template
    .replace(/<%\s*(["'])---\1\s*%>/g, '---')
    .replace(/<%\s*tp\.file\.creation_date\((["'])YYYY-MM-DD\1\)\s*%>/g, createdDay);
  if (expanded.includes('<%')) throw new Error(t("Eventテンプレートに未対応のTemplater式があります。"));
  const match = expanded.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(t("Eventテンプレートのフロントマターを確認してください。"));
  const fm = yaml.parse(match[1]);
  if (!fm || typeof fm !== 'object' || Array.isArray(fm)) throw new Error(t("Eventテンプレートの属性を確認してください。"));
  const tags = Array.isArray(fm.tags) ? fm.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : typeof fm.tags === 'string' ? fm.tags.split(/[,\s]+/) : [];
  fm.tags = Array.from(new Set([...tags.filter((tag: string) => !['task', 'project', '#task', '#project'].includes(tag)), 'event']));
  fm['created at'] = createdDay;
  fm.status = value.status;
  fm.target_date = value.start.slice(0, 10);
  fm.schedule_start = value.start; fm.schedule_end = value.end;
  fm.project = projectLink || null;
  const body = expanded.slice(match[0].length);
  let content = `---\n${yaml.stringify(fm).trimEnd()}\n---\n${body}`;
  if (input.memo.trim()) content = appendMemo(content, input.memo, createdDay);
  return content;
}
