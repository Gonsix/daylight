import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTaskRunning, recordWorkStatus, workDuration } from '../src/execution';
import { dateTime, filterTasks, Item, timeline } from '../src/model';
const item=(patch:Partial<Item>={}):Item=>({path:'notes/Task TBD.md',title:'Task',kind:'task',status:'on_going',targetDate:'',start:null,end:null,due:null,projectPath:null,projectLabel:'',archived:false,taskStart:dateTime('2026-11-09T09:00:00'),taskEnd:null,...patch});
test('running tasks appear without a scheduled end and grow only to the supplied current time',()=>{
  const running=item(), early=timeline([running],'2026-11-09',dateTime('2026-11-09T09:15:00')!);
  assert.equal(early.length,1); assert.equal(early[0].source,'actual'); assert.equal(early[0].start,540);assert.equal(early[0].end,555);assert.equal(early[0].running,true);
  const later=timeline([running],'2026-11-09',dateTime('2026-11-09T09:40:00')!);
  assert.equal(later[0].end,580); assert.equal(isTaskRunning(running),true);assert.equal(workDuration(running),null);
  assert.equal(timeline([running],'2026-11-09',running.taskStart!)[0].end,540);
});
test('actual work retains the scheduled block and ends at the saved finish, including midnight clipping',()=>{
  const finished=item({status:'done',taskStart:dateTime('2026-11-08T23:30:00'),taskEnd:dateTime('2026-11-09T01:05:59'),start:dateTime('2026-11-09T10:00:00'),end:dateTime('2026-11-09T11:00:00')});
  const slots=timeline([finished],'2026-11-09',dateTime('2026-11-09T12:00:00')!);
  assert.equal(slots.length,2);assert.equal(slots[0].source,'actual');assert.equal(slots[0].start,0);assert.equal(slots[0].end,65+59/60);
  assert.equal(slots[1].source,'schedule');assert.equal(workDuration(finished),'01:35');assert.equal(isTaskRunning(finished),false);
  assert.equal(filterTasks([finished],'2026-11-09','day').length,1);
  assert.equal(filterTasks([item({taskStart:dateTime('2026-11-08T20:00:00'),taskEnd:dateTime('2026-11-08T22:00:00'),status:'on_hold'})],'2026-11-09','day').length,0);
});
test('duration is shown only for complete valid work and does not wrap after 24 hours',()=>{
  assert.equal(workDuration(item({status:'done',taskEnd:dateTime('2026-11-10T10:25:45')})),'25:25');
  assert.equal(workDuration(item({status:'done',taskEnd:dateTime('2026-11-09T09:00:30')})),'00:00');
  assert.equal(workDuration(item({status:'done'})),null);
  assert.equal(workDuration(item({status:'done',taskEnd:dateTime('2026-11-09T08:00:00')})),null);
});
test('hold/cancel/done stop an open work block while only done records completion',()=>{
  const now=dateTime('2026-11-09T10:00:00')!;
  for(const status of ['on_hold','cancelled','done']) {
    const fm:Record<string,unknown>={status,task_start:'2026-11-09T09:00:00',task_end:null};
    recordWorkStatus(fm,'on_going',now);
    assert.equal(fm.task_end,'2026-11-09T10:00:00');assert.equal(!!fm['completed at'],status==='done');
  }
  const old={status:'done',task_start:'2026-11-09T09:00:00',task_end:'2026-11-09T09:30:00'};
  recordWorkStatus(old,'on_hold',now);assert.equal(old.task_end,'2026-11-09T09:30:00');
});
