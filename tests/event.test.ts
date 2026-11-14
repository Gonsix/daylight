import * as i18n from '../src/i18n';
i18n.setLanguage('ja');
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adjustRange, EventInput, rangeDateTimes, renderEvent, selectRange, validateEvent } from '../src/event';

const input: EventInput = { title: '研究ミーティング', start: '2026-11-06T09:03', end: '2026-11-06T10:17', status: 'todo', projectPath: '', memo: '' };
test('drag selections snap outwards in thirty-minute increments in both directions', () => {
  assert.deepEqual(selectRange(543, 608), { start: 540, end: 630 });
  assert.deepEqual(selectRange(608, 543), { start: 540, end: 630 });
  assert.deepEqual(selectRange(540, 540), { start: 540, end: 570 });
  assert.deepEqual(selectRange(-15, 1500), { start: 0, end: 1440 });
  assert.deepEqual(selectRange(1440, 1440), { start: 1410, end: 1440 });
});
test('selection handles resize independently with a minimum thirty-minute duration', () => {
  const range={start:180,end:420};
  assert.deepEqual(adjustRange(range,'start',180,203),{start:210,end:420});
  assert.deepEqual(adjustRange(range,'end',420,457),{start:180,end:450});
  assert.deepEqual(adjustRange(range,'start',180,800),{start:390,end:420});
  assert.deepEqual(adjustRange(range,'end',420,0),{start:180,end:210});
});
test('moving the middle preserves duration and clamps to day boundaries', () => {
  const range={start:180,end:420};
  assert.deepEqual(adjustRange(range,'move',200,253),{start:240,end:480});
  assert.deepEqual(adjustRange(range,'move',200,-500),{start:0,end:240});
  assert.deepEqual(adjustRange(range,'move',200,2000),{start:1200,end:1440});
});
test('midnight selection maps to next day and modal values preserve one-minute precision', () => {
  assert.deepEqual(rangeDateTimes('2026-12-31',{start:1430,end:1440}),{start:'2026-12-31T23:50',end:'2027-01-01T00:00'});
  const result=validateEvent(input);assert.equal(result.start,'2026-11-06T09:03:00');assert.equal(result.end,'2026-11-06T10:17:00');
});
test('invalid titles, missing/inverted dates and sub-minute values cannot be saved', () => {
  for (const patch of [{title:''},{title:'../escape'},{start:''},{end:'2026-11-06T09:00'},{end:'2026-11-06T10:17:01'},{status:'unknown'}]) assert.throws(()=>validateEvent({...input,...patch}));
});
test('real Event template is expanded, attributes preserved and memo appended without altering URL', () => {
  const template=readFileSync('templates/Event.md','utf8')+'\n## URL\n\n- https://example.com/meeting\n';
  let fm:any;
  const result=renderEvent(template,{...input,memo:'打ち合わせの準備'},'[[notes/研究]]','2026-11-06',{
    parse:()=>({tags:['event','meeting'],status:'todo','created at':'', 'last updated':null, custom:'keep'}),
    stringify:value=>{fm=value;return JSON.stringify(value);},
  });
  assert.equal(fm.custom,'keep');assert.equal(fm.status,'todo');assert.equal(fm.target_date,'2026-11-06');
  assert.equal(fm.schedule_start,'2026-11-06T09:03:00');assert.equal(fm.schedule_end,'2026-11-06T10:17:00');
  assert.equal(fm.project,'[[notes/研究]]');assert.equal(fm['created at'],'2026-11-06');assert.deepEqual(fm.tags,['event','meeting']);
  assert.ok(result.includes('## URL'));assert.ok(result.includes('## Notes'));assert.ok(result.includes('打ち合わせの準備'));assert.ok(!result.includes('<%'));
});
test('unknown template code and broken frontmatter are rejected instead of executed', () => {
  const yaml={parse:()=>({}),stringify:JSON.stringify};
  assert.throws(()=>renderEvent('<% arbitrary() %>',input,'','2026-11-06',yaml),/未対応/);
  assert.throws(()=>renderEvent('not frontmatter',input,'','2026-11-06',yaml),/フロントマター/);
});
