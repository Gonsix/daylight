import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { dateTime, Item } from '../src/model';

test('React renders timeline, inline state menus, project and carryover without network or Obsidian runtime', async () => {
  const result = await build({entryPoints:[path.resolve('src/Dashboard.tsx')], bundle:true, write:false, format:'cjs', platform:'node', external:['obsidian','react','react/*','react-dom/*']});
  const module={exports:{} as any};const require=createRequire(path.join(process.cwd(),'package.json'));
  vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require:(id:string)=>id==='obsidian'?{Notice:class{},Modal:class{}}:require(id),console,Intl,Date});
  const base:Item={path:'notes/T.md',title:'実装タスク',kind:'task',status:'on_going',targetDate:'2026-11-06',start:dateTime('2026-11-06T09:00:00'),end:dateTime('2026-11-06T10:00:00'),due:null,projectPath:'notes/P.md',projectLabel:'研究',archived:false};
  const rows=[base,{...base,path:'notes/E.md',kind:'event',title:'研究ミーティング'}, {...base,path:'notes/P.md',title:'研究',kind:'project',start:null,end:null}, {...base,path:'notes/Old.md',title:'前日のタスク',targetDate:'2026-11-05',start:null,end:null},
    {...base,path:'notes/Done.md',title:'本日完了したタスク',status:'done',targetDate:'2026-11-01',completedAt:dateTime('2026-11-06T12:07:00')},
    {...base,path:'notes/Cancelled.md',kind:'event',title:'中止した予定',status:'cancelled'}, {...base,path:'notes/Hold.md',kind:'event',title:'保留した予定',status:'on_hold'}];
  const store={subscribe:()=>()=>{},snapshot:()=>1,items:()=>rows};
  const html=renderToStaticMarkup(React.createElement(module.exports.Dashboard,{store,initialDate:'2026-11-06'}));
  for(const text of ['タイムライン','研究ミーティング','実装タスク','持ち越し','前日のタスク','プロジェクト','進行中','保留']) assert.ok(html.includes(text),text);
  assert.ok(html.includes('aria-label="タスクを追加"'));
  assert.ok(html.includes('aria-label="プロジェクトを追加"'));
  assert.ok(html.includes('vd-slot-task'));assert.ok(html.includes('vd-slot-event'));
  assert.ok(html.includes('aria-label="日付を選択"'));
  assert.ok(html.includes('aria-haspopup="dialog"'));
  assert.ok(!html.includes('type="date"'));
  assert.ok(!html.includes('iframe'));assert.ok(!html.includes('<script'));
  assert.ok(html.includes('中止した予定'));assert.ok(html.includes('保留した予定'));
  assert.ok(html.includes('完了したタスク'));assert.ok(html.includes('本日完了したタスク'));
  assert.ok(html.indexOf('>持ち越し</h3>')<html.indexOf('>完了したタスク</h3>'));
});


test('task and project composers render the appropriate fields with Command+Enter submit', async () => {
  const result = await build({entryPoints:[path.resolve('src/CreateModal.tsx')],bundle:true,write:false,format:'cjs',platform:'node',external:['obsidian','react','react/*','react-dom/*']});
  const module={exports:{} as any}, require=createRequire(path.join(process.cwd(),'package.json'));
  vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require:(id:string)=>id==='obsidian'?{Notice:class{},Modal:class{}}:require(id),console,Intl,Date});
  const store={items:()=>[]};
  const task=renderToStaticMarkup(React.createElement(module.exports.CreateForm,{store,kind:'task',day:'2026-11-08',close:()=>{}}));
  for(const label of ['予定日（空欄で未定）','開始','終了','締切','親タスク','作成','キャンセル']) assert.ok(task.includes(label),label);
  assert.ok(task.includes('value="2026-11-08"')); assert.ok(task.includes('aria-keyshortcuts="Meta+Enter"'));
  const project=renderToStaticMarkup(React.createElement(module.exports.CreateForm,{store,kind:'project',close:()=>{}}));
  for(const label of ['親プロジェクト','作業場所','ゴール','メモ']) assert.ok(project.includes(label),label);
  assert.ok(!project.includes('datetime-local'));
});

test('kanban is controlled only by settings, hides hold/cancelled columns, and preserves task scope', async () => {
  const result=await build({entryPoints:[path.resolve('src/Dashboard.tsx'),path.resolve('src/Kanban.tsx')],outdir:'unused',bundle:true,write:false,format:'cjs',platform:'node',external:['obsidian','react','react/*','react-dom/*']});
  const require=createRequire(path.join(process.cwd(),'package.json'));
  const modules=result.outputFiles.map(output=>{const module={exports:{} as any};vm.runInNewContext(output.text,{module,exports:module.exports,require:(id:string)=>id==='obsidian'?{Notice:class{},Modal:class{}}:require(id),console,Intl,Date});return module.exports;});
  const base:Item={path:'notes/A.md',title:'作業A',kind:'task',status:'todo',targetDate:'2026-11-08',start:null,end:null,due:null,projectPath:null,projectLabel:'',archived:false};
  const rows=[base,{...base,path:'notes/B.md',status:'on_going'}, {...base,path:'notes/C.md',status:'done',completedAt:dateTime('2026-11-08T10:00:00')}, {...base,path:'notes/H.md',status:'on_hold'}, {...base,path:'notes/X.md',status:'cancelled'}, {...base,path:'notes/Old.md',targetDate:'2026-11-07'}, {...base,path:'notes/Event.md',kind:'event'}] as Item[];
  const store={subscribe:()=>()=>{},snapshot:()=>1,items:()=>rows,kanbanEnabled:true};
  const html=renderToStaticMarkup(React.createElement(modules[0].Dashboard,{store,initialDate:'2026-11-08'}));
  for(const label of ['未着手のタスク','進行中のタスク','完了のタスク','保留・中止を表示']) assert.ok(html.includes(label),label);
  assert.ok(!html.includes('aria-label="保留のタスク"')); assert.ok(!html.includes('aria-label="中止のタスク"'));
  assert.ok(!html.includes('vd-view-switch')); assert.ok(!html.includes('タスクの表示形式'));
  const list=renderToStaticMarkup(React.createElement(modules[0].Dashboard,{store:{...store,kanbanEnabled:false},initialDate:'2026-11-08'}));
  assert.ok(!list.includes('aria-label="タスクのカンバン"')); assert.ok(list.includes('vd-task-list'));
  const day=modules[1].kanbanTasks(rows,'2026-11-08','day');
  assert.equal(day.length,6); assert.equal(new Set(day.map((i:Item)=>i.path)).size,6); assert.ok(!day.some((i:Item)=>i.kind==='event'));
  assert.equal(modules[1].kanbanTasks(rows,'2026-11-08','ongoing').length,1);
});

test('kanban exposes play/stop and only completed work has an HH:mm duration',async()=>{
  const result=await build({entryPoints:[path.resolve('src/Kanban.tsx')],bundle:true,write:false,format:'cjs',platform:'node',external:['obsidian','react','react/*','react-dom/*']});
  const module={exports:{} as any},require=createRequire(path.join(process.cwd(),'package.json'));
  vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require:(id:string)=>id==='obsidian'?{Notice:class{}}:require(id),console,Intl,Date});
  const base:Item={path:'notes/T.md',title:'開始前',kind:'task',status:'todo',targetDate:'',start:null,end:null,due:null,projectPath:null,projectLabel:'研究',archived:false};
  const items=[base,{...base,path:'notes/R.md',title:'実行中',status:'on_going',taskStart:dateTime('2026-11-09T09:00:00'),taskEnd:null}, {...base,path:'notes/D.md',title:'作業済み',status:'done',taskStart:dateTime('2026-11-09T09:00:00'),taskEnd:dateTime('2026-11-09T10:25:59')}];
  const html=renderToStaticMarkup(React.createElement(module.exports.Kanban,{items,store:{},onSelect:()=>{}}));
  assert.ok(html.includes('開始前の作業を開始'));assert.ok(html.includes('実行中の作業を終了'));assert.ok(!html.includes('作業済みの作業を開始'));
  assert.equal((html.match(/作業時間/g)||[]).length,1);assert.ok(html.includes('作業時間 01:25'));assert.ok(!html.includes('経過時間'));
});
