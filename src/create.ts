import { appendMemo, dateTime, dayKey, isStatus, recordTaskCompletion, timeLabel, validDay } from './model';
import { YamlAdapter } from './event';

export interface TaskInput {
  title: string; status: string; targetDate: string; start: string; end: string; due: string;
  projectPath: string; parentPath: string; memo: string;
}
export interface ProjectInput {
  title: string; status: string; parentPath: string; workingFolder: string; goal: string; memo: string;
}
export function validateTitle(raw: string): string {
  const title = raw.trim();
  if (!title) throw new Error('タイトルを入力してください。');
  if (/[\\/:*?"<>|#^\[\]\x00-\x1f]/.test(title) || /\.$/.test(title)) throw new Error('タイトルにファイル名で使えない記号が含まれています。');
  if (title.length > 120) throw new Error('タイトルは120文字以内にしてください。');
  return title;
}
function timestamp(value: string, label: string): string | null {
  if (!value) return null;
  const time = dateTime(value);
  if (time === null || time % 60000) throw new Error(`${label}は日付と時刻を1分単位で指定してください。`);
  return `${dayKey(time)}T${timeLabel(time)}:00`;
}
export function taskValues(input: TaskInput) {
  const title = validateTitle(input.title);
  if (!isStatus(input.status)) throw new Error('状態を選択してください。');
  if (input.targetDate && !validDay(input.targetDate)) throw new Error('予定日を確認してください。');
  const start = timestamp(input.start, '開始'), end = timestamp(input.end, '終了'), due = timestamp(input.due, '締切');
  if (!!start !== !!end) throw new Error('開始と終了は両方指定するか、両方空欄にしてください。');
  if (start && end && dateTime(end)! <= dateTime(start)!) throw new Error('終了日時は開始日時より後にしてください。');
  return { title, status: input.status, target_date: input.targetDate || null, schedule_start: start, schedule_end: end, due };
}
export function projectValues(input: ProjectInput) {
  const title = validateTitle(input.title);
  if (!isStatus(input.status)) throw new Error('状態を選択してください。');
  return { title, status: input.status };
}
/** Preserve the current template and expand only known, non-executable tokens. */
export function renderCreatedNote(template: string, kind: 'task' | 'project', properties: Record<string, unknown>, memo: string, day: string, yaml: YamlAdapter, goal = '') {
  const label = kind === 'task' ? 'Task' : 'Project';
  const expanded = template.replace(/<%\s*(["'])---\1\s*%>/g, '---')
    .replace(/<%\s*tp\.file\.creation_date\((["'])YYYY-MM-DD\1\)\s*%>/g, day);
  if (expanded.includes('<%')) throw new Error(`${label}テンプレートに未対応のTemplater式があります。`);
  const match = expanded.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${label}テンプレートのフロントマターを確認してください。`);
  const fm = yaml.parse(match[1]);
  if (!fm || typeof fm !== 'object' || Array.isArray(fm)) throw new Error(`${label}テンプレートの属性を確認してください。`);
  const tags = (Array.isArray(fm.tags) ? fm.tags : typeof fm.tags === 'string' ? fm.tags.split(/[,\s]+/) : [])
    .filter((t: unknown): t is string => typeof t === 'string');
  fm.tags = [...new Set([...tags.filter((t: string) => !['task','project','event'].includes(t.replace(/^#/,''))), kind])];
  Object.assign(fm, properties, { 'created at': day });
  if (kind === 'task') recordTaskCompletion(fm, 'todo');
  let body = expanded.slice(match[0].length);
  if (goal.trim()) {
    if (!/^## ゴール\s*$/m.test(body)) throw new Error('Projectテンプレートのゴール見出しが見つかりません。');
    body = body.replace(/^## ゴール[^\S\r\n]*(?:\r?\n|$)/m, heading => `${heading.trimEnd()}\n\n${goal.trim()}\n`);
  }
  let result = `---\n${yaml.stringify(fm).trimEnd()}\n---\n${body}`;
  if (memo.trim()) result = appendMemo(result, memo, day);
  return result;
}
