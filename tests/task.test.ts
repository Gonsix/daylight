import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTaskProperties, propertyType, TaskSnapshot, taskDocument } from '../src/task';

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
