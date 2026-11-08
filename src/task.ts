import { dateTime, dayKey, isStatus, recordTaskCompletion, timeLabel, validDay } from './model';
import { YamlAdapter } from './event';

export interface TaskSnapshot { path: string; properties: Record<string, unknown>; types: Record<string,string>; }
export type PropertyChanges = Record<string, unknown>;
export const TASK_FIELDS = ['status','completed at','target_date','schedule_start','schedule_end','due','project','parent_task'];
export const PROPERTY_LABELS: Record<string,string> = {
  status:'状態',target_date:'予定日',schedule_start:'開始',schedule_end:'終了',due:'締切',project:'プロジェクト',parent_task:'親タスク',
  tags:'タグ',aliases:'別名','created at':'作成日','last updated':'更新日時',
  'completed at':'完了日時',
};
export function taskDocument(content: string, yaml: YamlAdapter) {
  const match=content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if(!match)throw new Error('タスクのフロントマターを確認してください。');
  const fm=yaml.parse(match[1]);
  if(!fm || typeof fm!=='object' || Array.isArray(fm))throw new Error('タスクの属性を確認してください。');
  const tags=(Array.isArray(fm.tags)?fm.tags:typeof fm.tags==='string'?fm.tags.split(/[,\s]+/):[])
    .filter((t:unknown):t is string=>typeof t==='string').map((t:string)=>t.replace(/^#/,''));
  if(!tags.includes('task')||tags.includes('event')||tags.includes('project'))throw new Error('タスクノートではないため編集できません。');
  return {fm:fm as Record<string,unknown>,body:content.slice(match[0].length),newline:content.includes('\r\n')?'\r\n':'\n'};
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
  if(['schedule_start','schedule_end','due','last updated','completed at'].includes(key))type='datetime';
  if(key==='target_date')type='date';
  if(key==='created at')type=typeof value==='string'&&value.includes('T')?'datetime':'date';
  if(['tags','aliases'].includes(key)||['tags','aliases','multitext'].includes(type))return 'list';
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
    if(!key.trim()||/[\r\n\0]/.test(key))throw new Error('プロパティ名を確認してください。');
    if(!equal(fm[key],snapshot.properties[key]))throw new Error(`${PROPERTY_LABELS[key]||key}が更新されています。再読み込みしてください。`);
  }
  const next=Object.fromEntries([...Object.entries(fm),...keys.map(key=>[key,changes[key]])]);
  if(keys.includes('status') && (typeof next.status!=='string'||!isStatus(next.status)))throw new Error('状態を選択してください。');
  if(keys.includes('target_date')) {
    if(next.target_date===null||next.target_date==='')next.target_date=null;
    else if(typeof next.target_date!=='string'||!validDay(next.target_date))throw new Error('予定日を確認してください。');
  }
  for(const key of ['schedule_start','schedule_end','due','completed at'])if(keys.includes(key)) {
    if(next[key]===null||next[key]==='')next[key]=null;
    else {
      const time=dateTime(next[key]);if(time===null)throw new Error(`${PROPERTY_LABELS[key]}は日付と時刻を指定してください。`);
      const seconds=Math.floor(time%60000/1000);
      next[key]=`${dayKey(time)}T${timeLabel(time)}:${String(seconds).padStart(2,'0')}`;
    }
  }
  if(keys.some(k=>['schedule_start','schedule_end'].includes(k))) {
    const start=dateTime(next.schedule_start),end=dateTime(next.schedule_end);
    if(start!==null&&end!==null&&end<=start)throw new Error('終了日時は開始日時より後にしてください。');
  }
  if(keys.includes('status'))recordTaskCompletion(next,fm.status);
  const header=yaml.stringify(next).trimEnd().replace(/\r?\n/g,newline);
  const result=`---${newline}${header}${newline}---${newline}${body}`;
  // Keep the task identity valid even when the tag list itself is edited.
  taskDocument(result,yaml);
  return {content:result,properties:next,changed:keys};
}
