import { isRecord, stringList } from './value';
import { t } from './i18n';
import { dateTime, dayKey, isStatus, localTimestamp, parseWorkSessions, timeLabel, validDay, WorkSession } from './model';
import { recordWorkStatus, serializeWorkSessions, syncWorkFields } from './execution';
import { YamlAdapter } from './event';

export interface TaskSnapshot { path: string; properties: Record<string, unknown>; types: Record<string,string>; }
export type PropertyChanges = Record<string, unknown>;
export const TASK_FIELDS = ['status','completed at','target_date','schedule_start','schedule_end','task_start','task_end','task_sessions','due','project','parent_task'];
export const PROPERTY_LABELS: Record<string,string> = {
  get status() { return t("状態"); },get target_date() { return t("予定日"); },get schedule_start() { return t("開始"); },get schedule_end() { return t("終了"); },get due() { return t("締切"); },get project() { return t("プロジェクト"); },get parent_task() { return t("親タスク"); },
  get tags() { return t("タグ"); },get aliases() { return t("別名"); },get 'created at'() { return t("作成日"); },get 'last updated'() { return t("更新日時"); },
  get 'completed at'() { return t("完了日時"); }, get task_start() { return t("作業開始"); }, get task_end() { return t("作業終了"); }, get task_sessions() { return t("作業セッション"); },
};
export function taskDocument(content: string, yaml: YamlAdapter) {
  const match=content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if(!match)throw new Error(t("タスクのフロントマターを確認してください。"));
  const fm=yaml.parse(match[1]);
  if(!isRecord(fm))throw new Error(t("タスクの属性を確認してください。"));
  const tags=stringList(fm.tags).map((t:string)=>t.replace(/^#/,''));
  if(!tags.includes('task')||tags.includes('event')||tags.includes('project'))throw new Error(t("タスクノートではないため編集できません。"));
  return {fm:fm,body:content.slice(match[0].length),newline:content.includes('\r\n')?'\r\n':'\n'};
}
export function localDateTime(value: unknown): string {
  const time=dateTime(value);if(time===null)return '';
  const seconds=Math.floor(time%60000/1000);
  return `${dayKey(time)}T${timeLabel(time)}${seconds?':'+String(seconds).padStart(2,'0'):''}`;
}
export function propertyType(key:string,value:unknown,declared=''):string {
  if(['project','parent_task','status'].includes(key))return key;
  if(Array.isArray(value))return value.every(v=>typeof v==='string')?'list':'yaml';
  if(value instanceof Date)return 'datetime';
  if(value!==null && typeof value==='object' && !(value instanceof Date))return 'yaml';
  if(typeof value==='boolean')return 'boolean';
  if(typeof value==='number')return 'number';
  let type=declared;
  if(['schedule_start','schedule_end','task_start','task_end','due','last updated','completed at'].includes(key))type='datetime';
  if(key==='target_date')type='date';
  if(key==='created at')type=typeof value==='string'&&value.includes('T')?'datetime':'date';
  if(['tags','aliases','task_sessions'].includes(key)||['tags','aliases','multitext'].includes(type))return 'list';
  if(type==='checkbox')return 'boolean';
  if(['yaml','list','boolean'].includes(type))return type;
  if(type==='date')return !value || (typeof value==='string' && validDay(value)) || value instanceof Date?'date':'text';
  if(type==='datetime')return !value || dateTime(value)!==null?'datetime':'text';
  if(['number','text'].includes(type))return type;
  return 'text';
}
export function mergeTaskProperties(content:string,snapshot:TaskSnapshot,changes:PropertyChanges,yaml:YamlAdapter):{content:string;properties:Record<string,unknown>;changed:string[]} {
  const {fm,body,newline}=taskDocument(content,yaml);
  const equal=(a:unknown,b:unknown)=>yaml.stringify({value:a})===yaml.stringify({value:b});
  const keys=Object.keys(changes).filter(k=>!equal(changes[k],snapshot.properties[k]));
  for(const key of keys) {
    if(!key.trim()||/[\r\n\0]/.test(key))throw new Error(t("プロパティ名を確認してください。"));
    if(!equal(fm[key],snapshot.properties[key]))throw new Error(t("{0}が更新されています。再読み込みしてください。", PROPERTY_LABELS[key]||key));
  }
  const next: Record<string, unknown> = { ...fm };
  for (const key of keys) next[key] = changes[key];
  if(keys.includes('status') && (typeof next.status!=='string'||!isStatus(next.status)))throw new Error(t("状態を選択してください。"));
  if(keys.includes('target_date')) {
    if(next.target_date===null||next.target_date==='')next.target_date=null;
    else if(typeof next.target_date!=='string'||!validDay(next.target_date))throw new Error(t("予定日を確認してください。"));
  }
  for(const key of ['schedule_start','schedule_end','task_start','task_end','due','completed at'])if(keys.includes(key)) {
    if(next[key]===null||next[key]==='')next[key]=null;
    else {
      const time=dateTime(next[key]);if(time===null)throw new Error(t("{0}は日付と時刻を指定してください。", PROPERTY_LABELS[key]));
      const seconds=Math.floor(time%60000/1000);
      next[key]=`${dayKey(time)}T${timeLabel(time)}:${String(seconds).padStart(2,'0')}`;
    }
  }
  if(keys.some(k=>['schedule_start','schedule_end'].includes(k))) {
    const start=dateTime(next.schedule_start),end=dateTime(next.schedule_end);
    if(start!==null&&end!==null&&end<=start)throw new Error(t("終了日時は開始日時より後にしてください。"));
  }
  if (keys.includes('task_sessions')) {
    const raw = next.task_sessions;
    if (raw === null || raw === undefined || (Array.isArray(raw) && raw.length === 0)) {
      next.task_sessions = null;
      if (!keys.includes('task_start')) next.task_start = null;
      if (!keys.includes('task_end')) next.task_end = null;
    } else {
      if (!Array.isArray(raw)) throw new Error(t("作業セッションはリスト形式で入力してください。"));
      const parsed: WorkSession[] = [];
      for (const entry of raw) {
        if (typeof entry !== 'string') throw new Error(t("作業セッションは「開始..終了」の形式で入力してください。"));
        const parts = entry.split('..');
        if (parts.length !== 2) throw new Error(t("作業セッションは「開始..終了」の形式で入力してください。"));
        const start = dateTime(parts[0].trim());
        if (start === null) throw new Error(t("作業セッションの開始日時を確認してください。"));
        const rawEnd = parts[1].trim();
        if (!rawEnd) { parsed.push({ start, end: null }); continue; }
        const end = dateTime(rawEnd);
        if (end === null) throw new Error(t("作業セッションの終了日時を確認してください。"));
        if (end < start) throw new Error(t("作業終了は作業開始以降の日時にしてください。"));
        parsed.push({ start, end });
      }
      if (parsed.slice(0, -1).some(s => s.end === null)) throw new Error(t("途中の作業セッションには終了日時が必要です。"));
      next.task_sessions = serializeWorkSessions(parsed);
      if (!keys.includes('task_start')) next.task_start = localTimestamp(parsed[0].start);
      if (!keys.includes('task_end')) {
        const last = parsed[parsed.length - 1];
        next.task_end = last.end != null ? localTimestamp(last.end) : null;
      }
    }
  } else if (keys.some(k => ['task_start','task_end'].includes(k))) {
    const start=dateTime(next.task_start),end=dateTime(next.task_end);
    if(end!==null&&(start===null||end<start))throw new Error(t("作業終了は作業開始以降の日時にしてください。"));
    if (start === null && end === null) {
      if (Object.hasOwn(next, 'task_sessions')) next.task_sessions = null;
    } else if (start !== null) {
      const existing = parseWorkSessions(next.task_sessions, fm.task_start, fm.task_end);
      if (existing.length <= 1) {
        if (Object.hasOwn(next, 'task_sessions') || existing.length === 1) syncWorkFields(next, [{ start, end }]);
      } else {
        existing[0].start = start;
        if (existing[0].end !== null && existing[0].end < start) throw new Error(t("作業終了は作業開始以降の日時にしてください。"));
        const last = existing[existing.length - 1];
        last.end = end;
        if (end !== null && end < last.start) throw new Error(t("作業終了は作業開始以降の日時にしてください。"));
        syncWorkFields(next, existing);
      }
    }
  }
  if(keys.includes('status'))recordWorkStatus(next,fm.status);
  const header=yaml.stringify(next).trimEnd().replace(/\r?\n/g,newline);
  const result=`---${newline}${header}${newline}---${newline}${body}`;
  // Keep the task identity valid even when the tag list itself is edited.
  taskDocument(result,yaml);
  return {content:result,properties:next,changed:keys};
}
