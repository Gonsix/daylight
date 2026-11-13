import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendMemo, carryovers, centeredScrollTop, completedTasks, dateTime, dayKey, dayStart, filterTasks, Item, monthDays, moveDay, moveMonth, notesText, recordTaskCompletion, timeline, timelineCandidates, validDay } from '../src/model';

const item = (patch: Partial<Item> = {}): Item => ({ path: 'notes/test.md', title: 'Test', kind: 'task', status: 'todo',
  targetDate: '2026-11-06', start: null, end: null, due: null, projectPath: null, projectLabel: '', archived: false, ...patch });
const timed = (start: string, end: string, patch: Partial<Item> = {}) => item({ start: dateTime(start), end: dateTime(end), ...patch });

test('local days, month/year boundaries, leap dates and DST transitions', () => {
  assert.equal(dayKey(new Date(2026, 10, 6, 0, 0, 0).getTime()), '2026-11-06');
  assert.equal(dayKey(new Date(2026, 10, 5, 23, 59, 59).getTime()), '2026-11-05');
  assert.equal(dateTime('2026-11-06T13:07:00'), new Date(2026, 10, 6, 13, 7, 0).getTime());
  assert.equal(moveDay('2026-12-31', 1), '2027-01-01');
  assert.equal(moveDay('2026-03-01', -1), '2026-02-28');
  assert.equal(moveDay('2026-11-01', 1), '2026-11-02');
  assert.equal(validDay('2026-02-30'), false);
  assert.equal(validDay('2028-02-29'), true);
  assert.equal(dateTime('2026-11-06T24:00:00'), null);
  assert.equal(dateTime('2026-11-06T12:60:00'), null);
  assert.equal(dateTime('12:00'), null);
});
test('task and event schedules both appear, and unscheduled/inverted dates do not', () => {
  const a = timed('2026-11-06T09:00:00', '2026-11-06T10:00:00');
  const b = timed('2026-11-06T10:00:00', '2026-11-06T11:00:00', { path: 'notes/event.md', kind: 'event' });
  assert.deepEqual(timeline([a,b,item(),timed('2026-11-06T12:00:00','2026-11-06T11:00:00')], '2026-11-06').map(s => s.item.kind), ['task','event']);
});
test('cross-midnight schedules are clipped to the selected day without duplicates', () => {
  const a = timed('2026-11-05T23:00:00', '2026-11-06T01:00:00');
  const slots = timeline([a], '2026-11-06');
  assert.equal(slots.length, 1); assert.equal(slots[0].start, 0); assert.equal(slots[0].end, 60);
  assert.equal(timeline([timed('2026-11-05T23:00:00','2026-11-06T00:00:00')], '2026-11-06').length,0);
});
test('timeline candidates preserve cross-day and running slots while excluding unrelated history', () => {
  const day = '2026-11-06';
  const rows = [
    timed('2026-11-05T23:00:00','2026-11-06T01:00:00',{path:'cross',kind:'event'}),
    timed('2026-10-01T09:00:00','2026-10-01T10:00:00',{path:'old',kind:'event'}),
    item({path:'running',status:'on_going',taskSessions:[{start:dateTime('2026-11-05T23:00:00')!,end:null}]}),
    item({path:'finished',status:'done',taskSessions:[{start:dateTime('2026-11-06T10:00:00')!,end:dateTime('2026-11-06T11:00:00')!}]}),
    item({path:'boundary',status:'done',taskSessions:[{start:dateTime('2026-11-05T23:00:00')!,end:dayStart(day)}]}),
  ];
  const candidates = timelineCandidates(rows, day);
  assert.deepEqual(candidates.map(i=>i.path), ['cross','running','finished']);
  for (const now of [dayStart(day), dateTime('2026-11-06T12:00:00')!]) {
    assert.deepEqual(timeline(candidates, day, now), timeline(rows, day, now));
  }
});
test('overlap components get distinct lanes, reused for later non-overlapping events', () => {
  const list = [timed('2026-11-06T09:00:00','2026-11-06T11:00:00',{path:'a'}),timed('2026-11-06T09:30:00','2026-11-06T10:00:00',{path:'b'}),timed('2026-11-06T10:00:00','2026-11-06T10:30:00',{path:'c'}),timed('2026-11-06T12:00:00','2026-11-06T13:00:00',{path:'d'})];
  const [a,b,c,d] = timeline(list,'2026-11-06');
  assert.equal(a.columns,2); assert.notEqual(a.column,b.column); assert.equal(b.column,c.column); assert.equal(d.columns,1);
});
test('very short events get separate lanes instead of visually overlapping', () => {
  const slots=timeline([timed('2026-11-06T09:00:00','2026-11-06T09:01:00',{path:'a'}),timed('2026-11-06T09:05:00','2026-11-06T09:06:00',{path:'b'})],'2026-11-06');
  assert.equal(slots[0].columns,2);
});
test('today tasks include scheduled tasks even with a different target date', () => {
  const a=timed('2026-11-06T09:00:00','2026-11-06T10:00:00',{targetDate:'2026-11-05'});
  assert.equal(filterTasks([a], '2026-11-06','day').length,1);
  assert.equal(filterTasks([a], '2026-11-06','unscheduled').length,0);
});
test('carryover includes only past todo/ongoing, never current schedules, holds or completed', () => {
  const old=item({targetDate:'2026-11-05'});
  const items=[old,item({targetDate:'2026-11-05',status:'done'}),item({targetDate:'2026-11-05',status:'on_hold'}),item({targetDate:'',status:'on_going'}),timed('2026-11-05T23:00:00','2026-11-06T02:00:00'),timed('2026-11-06T09:00:00','2026-11-06T10:00:00',{targetDate:'2026-11-05'}),item({kind:'event',targetDate:'2026-11-04',status:'on_going'})];
  const result=carryovers(items,'2026-11-06');assert.equal(result.length,2);assert.ok(result.includes(old));
  assert.equal(old.targetDate,'2026-11-05');
});
test('append preserves frontmatter, Notes, and child task section', () => {
  const text='---\nstatus: todo\nproject: "[[P]]"\n---\n\n## Notes\n\n- old\n\n## 派生タスク(Child Tasks)\n\n[[Child]]\n';
  const result=appendMemo(text,'new\nsecond line','2026-11-06 12:00');
  assert.ok(result.startsWith(text.slice(0,text.indexOf('## Notes'))));
  assert.ok(result.includes('- old')); assert.ok(result.includes('- 2026-11-06 12:00 new\n  second line'));
  assert.ok(result.endsWith('## 派生タスク(Child Tasks)\n\n[[Child]]\n'));
  assert.ok(notesText(result).includes('new')); assert.ok(!notesText(result).includes('Child'));
});
test('append adds Notes to events/projects without replacing template sections', () => {
  const text='---\nstatus: todo\n---\n\n## URL\n\n- https://example.org\n';
  const result=appendMemo(text,'memo','2026-11-06 12:00');
  assert.ok(result.includes('## URL\n\n- https://example.org'));
  assert.equal((result.match(/## Notes/g)||[]).length,1);
});
test('headings inside fenced code and frontmatter are not mistaken for Notes sections', () => {
  const text='---\nstatus: todo\n---\n\n```md\n## Notes\n```\n\n## URL\n- x\n';
  const result=appendMemo(text,'memo','now');assert.equal((result.match(/## Notes/g)||[]).length,2);
  assert.equal(notesText(result),'- now memo');
  assert.throws(()=>appendMemo('---\nstatus: todo','memo','now'));
});
test('CRLF files preserve line endings and empty memos are refused', () => {
  const text='---\r\nstatus: todo\r\n---\r\n\r\n## Notes\r\n';
  const result=appendMemo(text,'memo','now');assert.equal(result.replace(/\r\n/g,'').includes('\n'),false);
  assert.throws(()=>appendMemo(text,'  ','now'));
});
test('month picker uses Monday-first six-week grids across year boundaries', () => {
  const days = monthDays('2026-11-06');
  assert.equal(days.length,42);assert.equal(days[0],'2026-10-26');assert.equal(days[41],'2026-12-06');
  assert.equal(new Set(days).size,42);
  const january=monthDays('2027-01-10');assert.equal(january[0],'2026-12-28');
});
test('month navigation clamps long months, handles leap years and year changes', () => {
  assert.equal(moveMonth('2026-01-31',1),'2026-02-28');
  assert.equal(moveMonth('2028-01-31',1),'2028-02-29');
  assert.equal(moveMonth('2026-12-06',1),'2027-01-06');
  assert.equal(moveMonth('2027-01-06',-1),'2026-12-06');
});
test('initial timeline scroll centers the current line and clamps at midnight/day end', () => {
  assert.equal(centeredScrollTop(12*60,650,1440),395);
  assert.equal(centeredScrollTop(5,650,1440),0);
  assert.equal(centeredScrollTop(1439,650,1440),790);
  assert.equal(centeredScrollTop(200,1600,1440),0);
});
test('timeline retains all five statuses including completed, held and cancelled',()=>{
  const list=['todo','on_going','done','on_hold','cancelled'].map((status,i)=>timed('2026-11-06T09:00:00','2026-11-06T10:00:00',{status,path:String(i)}));
  assert.equal(timeline(list,'2026-11-06').length,5);
});
test('completion timestamps use the actual local day and reset only when completion is undone',()=>{
  const fm:Record<string,unknown>={status:'done',target_date:'2026-11-01'};
  recordTaskCompletion(fm,'todo',new Date(2026,10,6,0,7,23).getTime());
  assert.equal(fm['completed at'],'2026-11-06T00:07:23');
  recordTaskCompletion(fm,'done',new Date(2026,10,7,10,0,0).getTime());assert.equal(fm['completed at'],'2026-11-06T00:07:23');
  fm.status='on_hold';recordTaskCompletion(fm,'done');assert.equal(fm['completed at'],null);
  fm.status='done';recordTaskCompletion(fm,'on_hold',new Date(2026,10,7,10,0,0).getTime());assert.equal(fm['completed at'],'2026-11-07T10:00:00');
});
test('completed section uses completion date instead of target date and never guesses missing timestamps',()=>{
  const today=item({path:'done',status:'done',targetDate:'2026-11-01',completedAt:dateTime('2026-11-06T12:03:00')});
  const rows=[today,item({status:'done',targetDate:'2026-11-06'}),item({status:'done',completedAt:dateTime('2026-11-05T23:59:00')}),item({status:'todo',completedAt:dateTime('2026-11-06T12:03:00')}),item({kind:'event',status:'done',completedAt:dateTime('2026-11-06T12:03:00')})];
  assert.deepEqual(completedTasks(rows,'2026-11-06'),[today]);
});
