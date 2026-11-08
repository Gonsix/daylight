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
