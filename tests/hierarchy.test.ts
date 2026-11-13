import * as i18n from '../src/i18n';
i18n.setLanguage('ja');
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canParent, childTasks } from '../src/hierarchy';
import { Item } from '../src/model';
const task=(path:string,parentTaskPath:string|null=null):Item=>({path,title:path,kind:'task',status:'todo',targetDate:'',start:null,end:null,due:null,projectPath:null,projectLabel:'',archived:false,parentTaskPath});
test('children include only direct parent links, regardless of status or date',()=>{
  const parent=task('p'),child=task('c','p'),grandchild=task('g','c'),unrelated=task('u'),self=task('s','s');
  const index=childTasks([parent,{...child,status:'done'},grandchild,unrelated,self,{...task('event','p'),kind:'event'}]);
  assert.deepEqual(index.get('p')?.map(i=>i.path),['c']);assert.deepEqual(index.get('c')?.map(i=>i.path),['g']);assert.equal(index.has('s'),false);
});
test('parent choices reject self, descendants, missing tasks and existing cycles',()=>{
  const rows=[task('p'),task('c','p'),task('g','c'),task('u'),task('a','b'),task('b','a')];
  assert.equal(canParent(rows,'p','p'),false);assert.equal(canParent(rows,'p','g'),false);assert.equal(canParent(rows,'g','p'),true);assert.equal(canParent(rows,'c','u'),true);assert.equal(canParent(rows,'c','missing'),false);assert.equal(canParent(rows,'c','a'),false);
});
