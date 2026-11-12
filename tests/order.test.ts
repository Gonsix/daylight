import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderBetween, orderedTasks } from '../src/order';
import type { Item } from '../src/model';
const item = (path:string, sortOrder:number|null):Item => ({path,title:path,sortOrder,kind:'task',status:'todo',targetDate:'',start:null,end:null,due:null,projectPath:null,projectLabel:'',archived:false});
test('order positions use configurable gaps and integer midpoint', () => {
  assert.equal(orderBetween(null,null,10000),10000);
  assert.equal(orderBetween(null,10000,10000),0);
  assert.equal(orderBetween(10000,20000,10000),15000);
  assert.equal(orderBetween(20000,null,10000),30000);
  assert.throws(()=>orderBetween(10,11,10000),/間隔が不足/);
  assert.throws(()=>orderBetween(Number.MAX_SAFE_INTEGER,null,10000),/間隔が不足/);
});
test('sorting is stable for ties and unranked cards', () => {
  assert.deepEqual(orderedTasks([item('z',null),item('b',200),item('a',200),item('c',100)]).map(i=>i.path),['c','a','b','z']);
});
