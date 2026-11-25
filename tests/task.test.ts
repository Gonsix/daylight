import * as i18n from '../src/i18n';
i18n.setLanguage('ja');
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTaskProperties, propertyType, serializeSessionDrafts, sessionDraftDuration, sessionDraftsFromProperties, TASK_FIELDS, TaskSnapshot, taskDocument } from '../src/task';

const yaml={parse:JSON.parse,stringify:JSON.stringify};
const properties={tags:['task'],status:'todo',target_date:null,schedule_start:null,schedule_end:null,due:null,project:null,parent_task:null,'created at':'2026-11-06','last updated':null,score:5,flag:true,list:['a'],config:{nested:[1,true]}};
const body='\n## Notes\n\n- keep memo\n\n## 派生タスク(Child Tasks)\n\n[[Child]]\n';
const content=(fm:object=properties)=>`---\n${JSON.stringify(fm)}\n---\n${body}`;
const snapshot:TaskSnapshot={path:'notes/Test TBD.md',properties,types:{}};
test('task properties preserve numbers, false, lists, nested values, null and existing body',()=>{
  const result=mergeTaskProperties(content(),snapshot,{score:0,flag:false,list:['b','c'],config:{nested:[2,false]},project:null},yaml);
  const read=taskDocument(result.content,yaml);
  assert.equal(read.fm.score,0);assert.equal(read.fm.flag,false);assert.deepEqual(read.fm.list,['b','c']);
  assert.deepEqual(read.fm.config,{nested:[2,false]});assert.equal(read.body,body);assert.equal(read.fm['created at'],'2026-11-06');
});
test('due and scheduled period are independent of the optional target date',()=>{
  const result=mergeTaskProperties(content(),snapshot,{due:'2026-11-08T12:07',schedule_start:'2026-11-07T09:03',schedule_end:'2026-11-07T10:09'},yaml);
  assert.equal(result.properties.target_date,null);assert.equal(result.properties.due,'2026-11-08T12:07:00');
  assert.equal(result.properties.schedule_start,'2026-11-07T09:03:00');
  assert.throws(()=>mergeTaskProperties(content(),snapshot,{schedule_start:'2026-11-07T10:00',schedule_end:'2026-11-07T09:00'},yaml),/終了日時/);
  assert.throws(()=>mergeTaskProperties(content(),snapshot,{due:'2026-11-08'},yaml),/日付と時刻/);
});
test('same-field conflicts are refused, while other properties and newly appended body text are merged',()=>{
  assert.throws(()=>mergeTaskProperties(content({...properties,status:'done'}),snapshot,{status:'on_going'},yaml),/更新されています/);
  const latest=content({...properties,score:99})+'\n- external memo\n';
  const result=mergeTaskProperties(latest,snapshot,{status:'on_going'},yaml);
  assert.equal(result.properties.score,99);assert.ok(result.content.endsWith('- external memo\n'));
});
test('task identity and valid date/status constraints are enforced',()=>{
  assert.throws(()=>mergeTaskProperties(content(),snapshot,{tags:['event']},yaml),/タスク/);
  assert.throws(()=>mergeTaskProperties(content(),snapshot,{target_date:'2026-02-30'},yaml),/予定日/);
  assert.throws(()=>mergeTaskProperties(content(),snapshot,{status:'completed'},yaml),/状態/);
  assert.equal(mergeTaskProperties(content(),snapshot,{target_date:''},yaml).properties.target_date,null);
});
test('property controls reflect both registered types and the actual value without coercing numeric text',()=>{
  assert.equal(propertyType('priority',0),'number');assert.equal(propertyType('checked',false),'boolean');
  assert.equal(propertyType('code','001'),'text');assert.equal(propertyType('tags',['task']),'list');
  assert.equal(propertyType('mixed',[1,true]),'yaml');assert.equal(propertyType('config',{a:1}),'yaml');
  assert.equal(propertyType('new',null,'checkbox'),'boolean');assert.equal(propertyType('new',null,'yaml'),'yaml');
  assert.equal(propertyType('due',null),'datetime');assert.equal(propertyType('target_date','TBD'),'text');
});

test('actual work timestamps use datetime controls and reject reversed or missing starts',()=>{
  assert.equal(propertyType('task_start',null),'datetime');assert.equal(propertyType('task_end',null),'datetime');
  assert.equal(propertyType('task_sessions',null),'list');
  const valid=mergeTaskProperties(content(),snapshot,{task_start:'2026-11-09T09:00',task_end:'2026-11-09T10:25'},yaml);
  assert.equal(valid.properties.task_start,'2026-11-09T09:00:00');assert.equal(valid.properties.task_end,'2026-11-09T10:25:00');
  assert.equal(valid.properties.schedule_start,null);
  assert.throws(()=>mergeTaskProperties(content(),snapshot,{task_end:'2026-11-09T10:00'},yaml),/作業開始/);
  assert.throws(()=>mergeTaskProperties(content(),snapshot,{task_start:'2026-11-09T11:00',task_end:'2026-11-09T10:00'},yaml),/作業開始/);
  const sessions=mergeTaskProperties(content(),snapshot,{task_sessions:['2026-11-09T09:00..2026-11-09T09:30','2026-11-09T13:30..']},yaml);
  assert.deepEqual(sessions.properties.task_sessions,['2026-11-09T09:00:00..2026-11-09T09:30:00','2026-11-09T13:30:00..']);
  assert.equal(sessions.properties.task_start,'2026-11-09T09:00:00');
  assert.equal(sessions.properties.task_end,null);
  assert.throws(()=>mergeTaskProperties(content(),snapshot,{task_sessions:['2026-11-09T10:00..2026-11-09T09:00']},yaml),/作業開始/);
  assert.throws(()=>mergeTaskProperties(content(),snapshot,{task_sessions:['2026-11-09T09:00..','2026-11-09T13:00..']},yaml),/終了日時/);
});

test('project field is placed immediately after status in task properties', () => {
  assert.equal(TASK_FIELDS.indexOf('project'), TASK_FIELDS.indexOf('status') + 1);
});

test('session drafts parse multi-session and legacy bounds, sort chronologically, and compute duration', () => {
  assert.deepEqual(sessionDraftsFromProperties({
    task_sessions: ['2026-11-09T09:00:15..2026-11-09T09:30:00', '2026-11-09T13:30:00..'],
  }), [
    { start: '2026-11-09T09:00:15', end: '2026-11-09T09:30' },
    { start: '2026-11-09T13:30', end: '' },
  ]);
  assert.deepEqual(sessionDraftsFromProperties({
    task_start: '2026-11-09T10:00:00',
    task_end: '2026-11-09T11:15:00',
  }), [{ start: '2026-11-09T10:00', end: '2026-11-09T11:15' }]);
  assert.deepEqual(serializeSessionDrafts([
    { start: '2026-11-09T13:30', end: '' },
    { start: '2026-11-09T08:00', end: '2026-11-09T08:45' },
  ]), ['2026-11-09T08:00..2026-11-09T08:45', '2026-11-09T13:30..']);
  assert.deepEqual(serializeSessionDrafts([
    { start: 'invalid', end: '2026-11-09T08:45' },
    { start: '2026-11-09T08:00', end: '2026-11-09T08:45' },
  ]), ['invalid..2026-11-09T08:45', '2026-11-09T08:00..2026-11-09T08:45']);
  assert.equal(sessionDraftDuration([
    { start: '2026-11-09T09:00', end: '2026-11-09T09:30' },
    { start: '2026-11-09T13:00', end: '' },
    { start: '2026-11-09T14:00', end: '2026-11-09T13:00' },
  ]), '00:30');
  assert.equal(sessionDraftDuration([{ start: '2026-11-09T13:00', end: '' }]), null);
});

test('clearing sessions clears legacy task_start/task_end and rejects coupled external edits', () => {
  const legacyProps = { ...properties, task_start: '2026-11-09T09:00:00', task_end: '2026-11-09T10:00:00' };
  const legacySnap: TaskSnapshot = { path: snapshot.path, properties: legacyProps, types: {} };
  const cleared = mergeTaskProperties(content(legacyProps), legacySnap, { task_sessions: null, task_start: null, task_end: null }, yaml);
  assert.equal(cleared.properties.task_sessions, null);
  assert.equal(cleared.properties.task_start, null);
  assert.equal(cleared.properties.task_end, null);

  const sessionProps = { ...properties, task_sessions: ['2026-11-09T09:00:00..2026-11-09T10:00:00'], task_start: '2026-11-09T09:00:00', task_end: '2026-11-09T10:00:00' };
  const sessionSnap: TaskSnapshot = { path: snapshot.path, properties: sessionProps, types: {} };
  const latestWithExternalStartChange = content({ ...sessionProps, task_start: '2026-11-09T08:30:00' });
  assert.throws(() => mergeTaskProperties(latestWithExternalStartChange, sessionSnap, { task_sessions: ['2026-11-09T09:00..2026-11-09T11:00'] }, yaml), /作業開始.*更新されています/);
});
