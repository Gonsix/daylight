import * as i18n from '../src/i18n';
i18n.setLanguage('ja');
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import path from 'node:path';
import { readFileSync } from 'node:fs';

class File {
  extension = 'md'; basename: string;
  constructor(public path: string) { this.basename = path.split('/').at(-1)!.replace(/\.md$/, ''); }
}
class Folder {
  constructor(public path: string, private files: File[]) {}
  get children(): (File | Folder)[] {
    const prefix = this.path + '/';
    const paths = this.files.filter(f => f.path.startsWith(prefix));
    const dirs = new Set(paths.map(f => f.path.slice(prefix.length).split('/')).filter(parts => parts.length > 1).map(parts => parts[0]));
    return [...paths.filter(f => !f.path.slice(prefix.length).includes('/')), ...[...dirs].map(dir => new Folder(prefix + dir, this.files))];
  }
}
const compiled = build({loader:{'.md':'text'}, entryPoints: [path.resolve('src/store.ts')], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['./i18n', 'obsidian'] });
async function fixture() {
  const module = { exports: {} as any };
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  vm.runInNewContext((await compiled).outputFiles[0].text, { module, exports: module.exports,
    require: (id: string) => id === './i18n' ? i18n : id === 'obsidian' ? { TFile: File, TFolder: Folder,
      parseYaml: (source:string) => source.trim().startsWith('{') ? JSON.parse(source) : ({ tags:['event'],status:'todo','created at':'','last updated':null }),
      stringifyYaml: JSON.stringify,
    } : require(id), Intl, Date, console });
  const project = new File('Daylight/Projects/P.md'), task = new File('Daylight/Tasks/Task 2026-11-06.md'), other = new File('daily_Daylight/Tasks/01_daily/not-a-task.md');
  const fm = new Map<string, any>([
    [project.path, { tags: ['project'], status: 'on_going' }],
    [task.path, { tags: ['task'], status: 'todo', target_date: '2026-11-06', schedule_start: '2026-11-06T09:00:00', schedule_end: '2026-11-06T10:00:00', project: '[[P]]', custom: 'preserve' }],
    [other.path, { tags: ['task'], status: 'todo' }],
  ]);
  const bodies = new Map([[task.path, `---\n${JSON.stringify(fm.get(task.path))}\n---\n\n## Notes\n\n- existing\n\n## 派生タスク(Child Tasks)\n- child\n`]]);
  const files = [project, task, other];
  const trashed = new Map<string,string>(); const renames: string[][] = [];
  const template = new File('Daylight/Templates/Event.md');
  const templates = [template, new File('Daylight/Templates/Task.md'), new File('Daylight/Templates/Project.md')];
  const events = new Map<string, (...args: any[]) => void>();
  const app = {
    metadataCache: { on: (name: string, callback: (...args: any[]) => void) => { events.set('metadata:' + name, callback); return {}; }, getFileCache: (f: File) => ({ frontmatter: fm.get(f.path) }),
      getFirstLinkpathDest: (link: string) => files.find(f=>f.path.replace(/\.md$/,'')===link||f.basename===link)??null },
    vault: { on: (name: string, callback: (...args: any[]) => void) => { events.set('vault:' + name, callback); return {}; }, getMarkdownFiles: () => files,
      getAbstractFileByPath: (p: string): File | Folder | null | undefined => templates.find(f => f.path === p) ?? files.find(f => f.path === p) ?? (files.some(f => f.path.startsWith(p + '/')) ? new Folder(p, files) : null),
      read: async (f: File) => templates.includes(f) ? readFileSync('templates/'+f.path.split('/').at(-1),'utf8') : bodies.get(f.path) ?? '',
      create: async (p:string,content:string) => {
        if (files.some(f=>f.path===p)) throw new Error('File already exists');
        const file=new File(p);files.push(file);bodies.set(p,content);
        fm.set(p,JSON.parse(content.split('\n---\n')[0].slice(4)));return file;
      },
      process: async (f: File, callback: (text: string) => string) => {
        await new Promise(resolve => setTimeout(resolve, 2));
        const content=callback(bodies.get(f.path) ?? '');bodies.set(f.path,content);
        const header=content.match(/^---\n(\{[^\n]*\})\n---/);if(header) fm.set(f.path,JSON.parse(header[1]));
      } },
    fileManager: { processFrontMatter: async (f: File, callback: (data: any) => void) => {
      const next = { ...fm.get(f.path) }; callback(next); fm.set(f.path, next);
      const content=bodies.get(f.path);if(content?.startsWith('---\n{')) bodies.set(f.path,content.replace(/^---\n\{[^\n]*\}\n---/,`---\n${JSON.stringify(next)}\n---`));
    },
      renameFile: async (f:File,destination:string) => {
        if(files.some(x=>x.path===destination)) throw new Error('File already exists');
        renames.push([f.path,destination]);bodies.set(destination,bodies.get(f.path)!);fm.set(destination,fm.get(f.path));
        bodies.delete(f.path);fm.delete(f.path);f.path=destination;f.basename=destination.split('/').at(-1)!.replace(/\.md$/,'');
      },
      trashFile: async (f:File) => {trashed.set(f.path,bodies.get(f.path)!);files.splice(files.indexOf(f),1);fm.delete(f.path);bodies.delete(f.path);},
    },
  };
  const store = new module.exports.DaylightStore(app, { registerEvent() {}, register() {} });
  return { store, fm, bodies, task, project, files, app, trashed, renames, templates, events };
}
test('frontmatter kinds, project resolution, scheduled tasks and scope', async () => {
  const {store, task, project}=await fixture();
  const items=store.items(); assert.equal(items.length,2);
  const row=items.find((i:any)=>i.path===task.path);
  assert.equal(row.kind,'task'); assert.equal(row.projectPath,project.path);
  assert.equal(row.end-row.start,3600000);
});
test('item discovery visits only configured folders including nested notes', async () => {
  const {store, app, files, fm} = await fixture();
  const nested = new File('Daylight/Events/2026/Meeting.md');
  files.push(nested); fm.set(nested.path, {tags:['event'], status:'todo'});
  app.vault.getMarkdownFiles = () => { throw new Error('must not scan the vault'); };
  assert.deepEqual(Array.from(store.items(), (item: any) => item.path).sort(), [
    'Daylight/Events/2026/Meeting.md', 'Daylight/Projects/P.md', 'Daylight/Tasks/Task 2026-11-06.md',
  ]);
});
test('external updates invalidate only relevant files and refresh changed link targets', async () => {
  const {store, app, task, project, files, fm, events} = await fixture();
  store.markReady();
  const first = store.items();
  const revision = store.snapshot();
  events.get('vault:modify')!(files.find(f => f.path.startsWith('daily_')));
  assert.equal(store.snapshot(), revision);
  assert.equal(store.items(), first);
  fm.set(task.path, {...fm.get(task.path), status:'done'});
  events.get('metadata:changed')!(task);
  const changed = store.items();
  assert.equal(changed.find((i:any) => i.path === task.path).status, 'done');
  assert.equal(changed.find((i:any) => i.path === project.path), first.find((i:any) => i.path === project.path));
  files.splice(files.indexOf(project), 1);
  events.get('vault:delete')!(project);
  events.get('metadata:resolved')!();
  assert.equal(store.items().find((i:any) => i.path === task.path).projectPath, null);
});
test('status saves preserve unrelated properties and refuse stale edits', async () => {
  const {store,task,fm}=await fixture();
  const row=store.items().find((i:any)=>i.path===task.path);
  await store.setStatus(row,'on_hold');
  assert.equal(fm.get(task.path).status,'on_hold'); assert.equal(fm.get(task.path).custom,'preserve');
  await assert.rejects(()=>store.setStatus(row,'done'),/更新されています/);
  assert.equal(fm.get(task.path).status,'on_hold');
  await assert.rejects(()=>store.setStatus(row,'invented'),/状態を選択/);
});
test('multiple memo writes serialize on latest content and retain template sections', async () => {
  const {store,task,bodies}=await fixture();
  await Promise.all([store.memo(task.path,'first'),store.memo(task.path,'second')]);
  const content=bodies.get(task.path)!;
  assert.ok(content.includes('first'));assert.ok(content.includes('second'));
  assert.ok(content.includes('## 派生タスク(Child Tasks)\n- child'));
  assert.ok((await store.notes(task.path)).includes('existing'));
  await assert.rejects(()=>store.memo('Daylight/Tasks/deleted.md','lost'),/見つかりません/);
});
test('deleted notes and multi-kind or malformed-tag notes are handled safely', async () => {
  const {store,files,fm,task}=await fixture();
  fm.set(task.path,{tags:['task','event'],status:'todo'});store.invalidate();assert.equal(store.items().length,1);
  fm.set(task.path,{tags:[null,42,'task'],status:'todo'});store.invalidate();assert.equal(store.items().length,2);
  const row=store.items().find((i:any)=>i.path===task.path);
  files.splice(files.indexOf(task),1);
  await assert.rejects(()=>store.setStatus(row,'done'),/見つかりません/);
});
test('a later external status is not hidden behind the saved UI state', async () => {
  const {store,task,fm}=await fixture();
  const row=store.items().find((i:any)=>i.path===task.path);
  await store.setStatus(row,'on_going');
  fm.get(task.path).status='on_hold';store.invalidate();
  assert.equal(store.items().find((i:any)=>i.path===task.path).status,'on_hold');
});
const eventInput={title:'研究ミーティング',start:'2026-11-06T09:03',end:'2026-11-06T10:17',status:'todo',projectPath:'Daylight/Projects/P.md',memo:'準備する'};
test('new events use the template, canonical project links and minute precision', async () => {
  const {store,fm,bodies}=await fixture();
  const file=await store.createEvent(eventInput);
  assert.equal(file.path,'Daylight/Events/研究ミーティング 2026-11-06.md');
  const data=fm.get(file.path);assert.equal(data.project,'[[Daylight/Projects/P]]');assert.equal(data.target_date,'2026-11-06');
  assert.equal(data.schedule_start,'2026-11-06T09:03:00');assert.equal(data.schedule_end,'2026-11-06T10:17:00');
  assert.deepEqual(Array.from(data.tags),['event']);assert.ok(bodies.get(file.path)!.includes('## URL'));assert.ok(bodies.get(file.path)!.includes('準備する'));
});
test('simultaneous same-name creates get separate files and never overwrite an existing event', async () => {
  const {store,bodies}=await fixture();
  const original=await store.createEvent({...eventInput,memo:'original'});
  const [a,b]=await Promise.all([store.createEvent({...eventInput,memo:'second'}),store.createEvent({...eventInput,memo:'third'})]);
  assert.equal(a.path,'Daylight/Events/研究ミーティング 2026-11-06 1.md');assert.equal(b.path,'Daylight/Events/研究ミーティング 2026-11-06 2.md');
  assert.ok(bodies.get(original.path)!.includes('original'));assert.ok(!bodies.get(original.path)!.includes('second'));
});
test('invalid event ranges, missing templates and unresolved projects produce no note', async () => {
  const {store,files,app}=await fixture();const count=files.length;
  await assert.rejects(()=>store.createEvent({...eventInput,end:eventInput.start}),/終了日時/);
  await assert.rejects(()=>store.createEvent({...eventInput,projectPath:'Daylight/Tasks/missing.md'}),/プロジェクト/);
  const original=app.vault.getAbstractFileByPath;
  app.vault.getAbstractFileByPath=p=>p==='Daylight/Templates/Event.md'?undefined:original(p);
  await assert.rejects(()=>store.createEvent(eventInput),/テンプレート/);
  assert.equal(files.length,count);
});
test('existing event edits update exact minute values and preserve body, unknown fields and original dates', async () => {
  const {store,fm,bodies,renames}=await fixture();
  const file=await store.createEvent(eventInput);
  await store.memo(file.path,'existing memo');
  fm.get(file.path).custom='keep';
  bodies.set(file.path,bodies.get(file.path)!.replace(/^---\n\{[^\n]*\}\n---/,`---\n${JSON.stringify(fm.get(file.path))}\n---`));
  const snapshot=await store.loadEvent(file.path);const created=fm.get(file.path)['created at'];
  assert.equal(snapshot.input.projectPath,'Daylight/Projects/P.md');assert.ok(snapshot.notes.includes('existing memo'));
  await store.updateEvent(snapshot,{...snapshot.input,start:'2026-11-06T11:07',end:'2026-11-06T12:29',status:'on_going',projectPath:'',memo:'new memo'});
  const data=fm.get(file.path);assert.equal(data.schedule_start,'2026-11-06T11:07:00');assert.equal(data.schedule_end,'2026-11-06T12:29:00');
  assert.equal(data.status,'on_going');assert.equal(data.project,null);assert.equal(data.custom,'keep');assert.equal(data['created at'],created);
  assert.ok(bodies.get(file.path)!.includes('existing memo'));assert.ok(bodies.get(file.path)!.includes('new memo'));assert.ok(bodies.get(file.path)!.includes('## URL'));assert.equal(renames.length,0);
});
test('date/title edits use FileManager rename and choose a non-colliding name', async () => {
  const {store,fm,renames,bodies}=await fixture();
  const file=await store.createEvent(eventInput);const old=file.path;
  const existing=await store.createEvent({...eventInput,title:'移動後',start:'2026-11-07T10:00',end:'2026-11-07T11:00',memo:'other note'});
  const snapshot=await store.loadEvent(old);
  await store.updateEvent(snapshot,{...snapshot.input,title:'移動後',start:'2026-11-07T09:05',end:'2026-11-07T10:09'});
  assert.equal(file.path,'Daylight/Events/移動後 2026-11-07 1.md');assert.equal(fm.get(file.path).target_date,'2026-11-07');
  assert.deepEqual(renames,[[old,file.path]]);assert.ok(bodies.get(existing.path)!.includes('other note'));
});
test('update/delete reject stale snapshots instead of losing another edit', async () => {
  const {store,fm,bodies,trashed}=await fixture();const file=await store.createEvent(eventInput);const snapshot=await store.loadEvent(file.path);
  await store.memo(file.path,'another edit');const content=bodies.get(file.path);
  await assert.rejects(()=>store.updateEvent(snapshot,{...snapshot.input,status:'done'}),/更新されています/);
  await assert.rejects(()=>store.deleteEvent(snapshot),/更新されています/);
  assert.equal(fm.get(file.path).status,'todo');assert.equal(bodies.get(file.path),content);assert.equal(trashed.size,0);
});
test('event deletion uses trash, and the full original content remains recoverable', async () => {
  const {store,files,bodies,trashed}=await fixture();const file=await store.createEvent(eventInput);const snapshot=await store.loadEvent(file.path);
  await store.deleteEvent(snapshot);
  assert.equal(files.includes(file),false);assert.equal(bodies.has(file.path),false);assert.equal(trashed.get(file.path),snapshot.content);
});
test('rename failures restore the original note instead of leaving its date/name inconsistent', async () => {
  const {store,bodies,app}=await fixture();const file=await store.createEvent(eventInput);const snapshot=await store.loadEvent(file.path);
  app.fileManager.renameFile=async()=>{throw new Error('rename failed');};
  await assert.rejects(()=>store.updateEvent(snapshot,{...snapshot.input,title:'changed',start:'2026-11-07T09:00',end:'2026-11-07T10:00'}),/rename failed/);
  assert.equal(bodies.get(file.path),snapshot.content);assert.equal(file.path,snapshot.path);
});
test('unresolved existing project links are preserved unless explicitly changed', async () => {
  const {store,app,fm}=await fixture();const file=await store.createEvent(eventInput);
  await app.fileManager.processFrontMatter(file,x=>{x.project='[[Unresolved]]';});
  const snapshot=await store.loadEvent(file.path);
  await store.updateEvent(snapshot,{...snapshot.input,status:'on_hold'});
  assert.equal(fm.get(file.path).project,'[[Unresolved]]');assert.equal(fm.get(file.path).status,'on_hold');
});
test('task sidebar updates period, due and additional typed properties while preserving child notes', async()=>{
  const {store,task,fm,bodies}=await fixture();const snapshot=await store.loadTask(task.path);
  await store.updateTask(snapshot,{schedule_start:'2026-11-06T13:07',schedule_end:'2026-11-06T14:19',due:'2026-11-08T15:23',priority:0,checked:false,labels:['a','b'],config:{nested:true}});
  const data=fm.get(task.path);assert.equal(data.schedule_start,'2026-11-06T13:07:00');assert.equal(data.due,'2026-11-08T15:23:00');
  assert.equal(data.priority,0);assert.equal(data.checked,false);assert.deepEqual(data.config,{nested:true});assert.ok(bodies.get(task.path)!.includes('## 派生タスク(Child Tasks)\n- child'));
  assert.equal(store.items().find((i:any)=>i.path===task.path).start,new Date(2026,10,6,13,7,0).getTime());
});
test('changing target date renames a task, and clearing it produces the TBD filename',async()=>{
  const {store,task,fm,renames}=await fixture();
  await store.updateTask(await store.loadTask(task.path),{target_date:'2026-11-07'});
  assert.equal(task.path,'Daylight/Tasks/Task 2026-11-07.md');assert.equal(fm.get(task.path).target_date,'2026-11-07');
  await store.updateTask(await store.loadTask(task.path),{target_date:null});
  assert.equal(task.path,'Daylight/Tasks/Task TBD.md');assert.equal(fm.get(task.path).target_date,null);assert.equal(renames.length,2);
});
test('task edits merge newer memos and unrelated status edits, but reject a changed property conflict',async()=>{
  const {store,task,fm,bodies}=await fixture();const snapshot=await store.loadTask(task.path);
  await store.memo(task.path,'new memo while editing');await store.setStatus(store.items().find((i:any)=>i.path===task.path),'on_going');
  await store.updateTask(snapshot,{due:'2026-11-07T12:00'});
  assert.equal(fm.get(task.path).status,'on_going');assert.ok(bodies.get(task.path)!.includes('new memo while editing'));
  await assert.rejects(()=>store.updateTask(snapshot,{status:'done'}),/更新されています/);
});
test('parent task links reject self/indirect cycles and wrong entity kinds',async()=>{
  const {store,task,app}=await fixture();const snapshot=await store.loadTask(task.path);
  await assert.rejects(()=>store.updateTask(snapshot,{parent_task:`[[${task.path.replace(/\.md$/,'')}]]`}),/循環/);
  const parent='Daylight/Tasks/Parent TBD.md';
  await app.vault.create(parent,`---\n${JSON.stringify({tags:['task'],status:'todo',parent_task:`[[${task.path.replace(/\.md$/,'')}]]`})}\n---\n\n## Notes\n`);store.invalidate();
  await assert.rejects(()=>store.updateTask(snapshot,{parent_task:'[[Daylight/Tasks/Parent TBD]]'}),/循環/);
  await assert.rejects(()=>store.updateTask(snapshot,{project:'[[Daylight/Tasks/Parent TBD]]'}),/プロジェクト/);
});
test('task rename failure restores previous content while preserving other properties',async()=>{
  const {store,task,bodies,app}=await fixture();const snapshot=await store.loadTask(task.path),before=bodies.get(task.path);
  app.fileManager.renameFile=async()=>{throw new Error('rename failed');};
  await assert.rejects(()=>store.updateTask(snapshot,{target_date:'2026-11-09'}),/rename failed/);
  assert.equal(bodies.get(task.path),before);
});
test('inline and sidebar task completion both record completed at, and reopening clears it',async()=>{
  const {store,task,fm}=await fixture();
  await store.setStatus(store.items().find((i:any)=>i.path===task.path),'done');
  assert.match(fm.get(task.path)['completed at'],/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  assert.ok(store.items().find((i:any)=>i.path===task.path).completedAt);
  const recorded=fm.get(task.path)['completed at'];
  await store.setStatus(store.items().find((i:any)=>i.path===task.path),'done');assert.equal(fm.get(task.path)['completed at'],recorded);
  await store.updateTask(await store.loadTask(task.path),{status:'todo'});assert.equal(fm.get(task.path)['completed at'],null);
  await store.updateTask(await store.loadTask(task.path),{status:'done'});assert.ok(fm.get(task.path)['completed at']);
});
test('existing completed tasks without a timestamp are not assigned a guessed completion date',async()=>{
  const {store,task,app,fm}=await fixture();
  await app.fileManager.processFrontMatter(task,data=>{data.status='done';});store.invalidate();
  await store.updateTask(await store.loadTask(task.path),{custom:'changed'});
  assert.equal(fm.get(task.path)['completed at'],undefined);
});


const taskInput = {title:'追加タスク',status:'todo',targetDate:'2026-11-08',start:'',end:'',due:'',projectPath:'Daylight/Projects/P.md',parentPath:'',memo:'最初のメモ'};
const projectInput = {title:'追加プロジェクト',status:'todo',parentPath:'Daylight/Projects/P.md',workingFolder:'/work/research',goal:'成果をまとめる',memo:'検討メモ'};
test('task creation expands the real template, preserves headings and uses explicit relations and dates', async () => {
  const {store,fm,bodies,task} = await fixture();
  const file = await store.createTask({...taskInput,parentPath:task.path,start:'2026-11-08T10:01',end:'2026-11-08T11:02',due:'2026-11-10T18:00'});
  assert.equal(file.path,'Daylight/Tasks/追加タスク 2026-11-08.md');
  const props = fm.get(file.path), body = bodies.get(file.path)!;
  assert.equal(props.tags.includes('task'),true); assert.equal(props.tags.includes('event'),false);
  assert.equal(props.project,'[[Daylight/Projects/P]]'); assert.equal(props.parent_task,'[[Daylight/Tasks/Task 2026-11-06]]');
  assert.equal(props.schedule_start,'2026-11-08T10:01:00'); assert.equal(props.schedule_end,'2026-11-08T11:02:00');
  assert.equal(props.due,'2026-11-10T18:00:00'); assert.equal(props.target_date,'2026-11-08');
  assert.ok(body.includes('## Notes')); assert.ok(body.includes('## 派生タスク(Child Tasks)')); assert.ok(body.includes('最初のメモ')); assert.ok(!body.includes('<%'));
});
test('unscheduled tasks use TBD, collisions never overwrite, and done tasks get a completion timestamp', async () => {
  const {store,fm,bodies} = await fixture();
  const seed = {...taskInput,targetDate:'',projectPath:'',status:'done'};
  const files = await Promise.all([store.createTask(seed),store.createTask(seed)]);
  assert.equal(files[0].path,'Daylight/Tasks/追加タスク TBD.md'); assert.equal(files[1].path,'Daylight/Tasks/追加タスク TBD 1.md');
  assert.equal(fm.get(files[0].path).target_date,null); assert.equal(fm.get(files[0].path).project,null);
  assert.ok(fm.get(files[0].path)['completed at']); assert.ok(bodies.get(files[0].path));
});
test('project creation preserves template sections, parent and goal without inventing task dates', async () => {
  const {store,fm,bodies} = await fixture();
  const file = await store.createProject(projectInput);
  assert.equal(file.path,'Daylight/Projects/追加プロジェクト.md');
  const props = fm.get(file.path), body = bodies.get(file.path)!;
  assert.equal(props.parent_project,'[[Daylight/Projects/P]]'); assert.equal(props.working_folder,'/work/research');
  assert.equal(props.status,'todo'); assert.equal(props.target_date,undefined); assert.equal(props.archived,undefined);
  for (const text of ['## ゴール','成果をまとめる','## 目標','## 完了条件','## TODO','## Event','## Achieved','検討メモ']) assert.ok(body.includes(text),text);
  const again = await store.createProject(projectInput); assert.equal(again.path,'Daylight/Projects/追加プロジェクト 1.md');
});
test('invalid task/project input and stale relation targets never create notes', async () => {
  const {store,files,app} = await fixture(); const count = files.length;
  for (const patch of [{title:'../bad'},{targetDate:'2026-02-30'},{start:'2026-11-08T10:00'}, {start:'2026-11-08T10:00',end:'2026-11-08T09:00'}, {due:'tomorrow'}, {projectPath:'Daylight/Tasks/missing.md'}, {parentPath:'Daylight/Projects/P.md'}, {status:'invalid'}]) {
    await assert.rejects(()=>store.createTask({...taskInput,...patch}));
  }
  await assert.rejects(()=>store.createProject({...projectInput,parentPath:'Daylight/Tasks/Task 2026-11-06.md'}));
  assert.equal(files.length,count);
  const get = app.vault.getAbstractFileByPath;
  app.vault.getAbstractFileByPath = (p:string) => p.startsWith('Daylight/Templates/') ? undefined : get(p);
  await assert.rejects(()=>store.createTask(taskInput),/Taskテンプレートが見つかりません/);
  await assert.rejects(()=>store.createProject(projectInput),/Projectテンプレートが見つかりません/);
  assert.equal(files.length,count);
});

test('task and project deletion uses trash and preserves related notes', async () => {
  for (const kind of ['task','project']) {
    const {store,task,project,bodies,trashed,fm}=await fixture();
    bodies.set(project.path,`---\n${JSON.stringify(fm.get(project.path))}\n---\n\n## ゴール\n内容\n`);
    const target=kind==='task'?task:project;
    const related=kind==='task'?project:task;
    const original=bodies.get(target.path), relatedBody=bodies.get(related.path);
    const item=store.items().find((i:any)=>i.path===target.path);
    const snapshot=await store.loadDeleteSnapshot(item);
    await store.deleteNote(snapshot);
    assert.equal(trashed.get(target.path),original);
    assert.equal(bodies.get(related.path),relatedBody);
    assert.ok(fm.has(related.path));
    assert.ok(!store.items().some((i:any)=>i.path===target.path));
  }
});
test('deletion rejects stale content, wrong identity, missing notes and trash failures', async () => {
  const {store,task,bodies,trashed,app}=await fixture();
  const item=store.items().find((i:any)=>i.path===task.path);
  const snapshot=await store.loadDeleteSnapshot(item);
  bodies.set(task.path,snapshot.content+'external memo');
  await assert.rejects(()=>store.deleteNote(snapshot),/更新されています/);
  assert.equal(trashed.size,0);
  bodies.set(task.path,snapshot.content);
  await assert.rejects(()=>store.loadDeleteSnapshot({...item,kind:'project'}),/種類が変わっています/);
  await assert.rejects(()=>store.deleteNote({...snapshot,kind:'project'}),/種類が変わっています/);
  await assert.rejects(()=>store.deleteNote({...snapshot,path:'daily_Daylight/Tasks/01_daily/not-a-task.md'}),/見つかりません/);
  app.fileManager.trashFile=async()=>{throw new Error('trash unavailable');};
  await assert.rejects(()=>store.deleteNote(snapshot),/trash unavailable/);
  assert.equal(bodies.get(task.path),snapshot.content); assert.equal(trashed.size,0);
});

test('play/stop atomically save actual timestamps and state, preserving schedule, links and body', async()=>{
  const {store,task,fm,bodies}=await fixture();
  const before=bodies.get(task.path)!;
  const row=()=>store.items().find((i:any)=>i.path===task.path);
  const initial=row();await store.startTask(initial);
  const started=fm.get(task.path);
  assert.equal(started.status,'on_going');assert.match(started.task_start,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);assert.equal(started.task_end,null);
  assert.equal(started.schedule_start,'2026-11-06T09:00:00');assert.equal(started.project,'[[P]]');assert.equal(started.custom,'preserve');
  assert.equal(bodies.get(task.path)!.slice(bodies.get(task.path)!.indexOf('## Notes')),before.slice(before.indexOf('## Notes')));
  await assert.rejects(()=>store.startTask(initial),/更新されています/);
  await store.finishTask(row());
  const done=fm.get(task.path);assert.equal(done.status,'done');assert.ok(done.task_end);assert.ok(done['completed at']);assert.equal(done.task_start,started.task_start);
  await assert.rejects(()=>store.finishTask(initial));
});
test('execution rejects stale time edits, wrong note kinds and future starts',async()=>{
  const {store,task,project,fm,bodies}=await fixture();
  const row=store.items().find((i:any)=>i.path===task.path);
  await assert.rejects(()=>store.startTask(store.items().find((i:any)=>i.path===project.path)));
  await store.startTask(row);const running=store.items().find((i:any)=>i.path===task.path);
  const props={...fm.get(task.path),task_start:'2099-01-01T00:00:00'};
  bodies.set(task.path,`---\n${JSON.stringify(props)}\n---\n## Notes\n`);fm.set(task.path,props);store.invalidate();
  await assert.rejects(()=>store.finishTask(running),/更新されています/);
  await assert.rejects(()=>store.finishTask(store.items().find((i:any)=>i.path===task.path)),/開始時刻より前/);
  assert.equal(fm.get(task.path).status,'on_going');
});

test('holding stops the actual block and resuming preserves its original start and schedule',async()=>{
  const {store,task,fm}=await fixture();const row=()=>store.items().find((i:any)=>i.path===task.path);
  await store.startTask(row());const original=fm.get(task.path).task_start;
  await store.setStatus(row(),'on_hold');
  assert.ok(fm.get(task.path).task_end);assert.equal(fm.get(task.path).status,'on_hold');
  await store.startTask(row());assert.equal(fm.get(task.path).task_start,original);assert.equal(fm.get(task.path).task_end,null);assert.equal(fm.get(task.path).status,'on_going');
  await store.setStatus(row(),'done');assert.ok(fm.get(task.path).task_end);assert.ok(fm.get(task.path)['completed at']);assert.equal(fm.get(task.path).schedule_start,'2026-11-06T09:00:00');
});

test('returning to ongoing clears only actual end; returning to todo resets both without changing schedule',async()=>{
  for(const target of ['todo','on_going']) {
    const {store,task,fm}=await fixture();const row=()=>store.items().find((i:any)=>i.path===task.path);
    await store.startTask(row());await store.finishTask(row());
    const completed={...fm.get(task.path)};
    await store.setStatus(row(),target);
    const result=fm.get(task.path);
    assert.equal(result.task_start,target==='todo'?null:completed.task_start);
    assert.equal(result.task_end,null);assert.equal(result['completed at'],null);
    assert.equal(result.schedule_start,completed.schedule_start);assert.equal(result.schedule_end,completed.schedule_end);
    assert.equal(result.project,completed.project);assert.equal(result.custom,'preserve');
    if(target==='todo') {
      await store.startTask(row());assert.ok(fm.get(task.path).task_start);assert.equal(fm.get(task.path).task_end,null);
    }
  }
});

test('dragging todo to ongoing and done records actual timestamps through the common status path',async()=>{
  const {store,task,fm}=await fixture();const row=()=>store.items().find((i:any)=>i.path===task.path);
  await store.setStatus(row(),'on_going');
  const first={...fm.get(task.path)};
  assert.match(first.task_start,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);assert.equal(first.task_end,null);
  await store.setStatus(row(),'done');
  const done={...fm.get(task.path)};
  assert.equal(done.task_start,first.task_start);assert.match(done.task_end,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);assert.equal(done['completed at'],done.task_end);
  await store.setStatus(row(),'todo');assert.equal(fm.get(task.path).task_start,null);assert.equal(fm.get(task.path).task_end,null);
  await store.setStatus(row(),'done');assert.equal(fm.get(task.path).task_start,null);assert.ok(fm.get(task.path).task_end);
  assert.equal(fm.get(task.path).schedule_start,'2026-11-06T09:00:00');
});

test('setting a parent preserves child state, work timestamps, schedule and body, and resolves hierarchy',async()=>{
  const {store,task,app,fm,bodies}=await fixture();
  const parent=await app.vault.create('Daylight/Tasks/Parent TBD.md',`---\n${JSON.stringify({tags:['task'],status:'on_hold'})}\n---\n\n## Notes\n`);store.invalidate();
  await store.startTask(store.items().find((i:any)=>i.path===task.path));
  const before={...fm.get(task.path)},body=bodies.get(task.path)!.split('\n---\n')[1];
  await store.setParentTask(store.items().find((i:any)=>i.path===task.path),parent.path);
  const current=fm.get(task.path);
  assert.equal(current.parent_task,'[[Daylight/Tasks/Parent TBD]]');
  for(const key of ['status','task_start','task_end','schedule_start','schedule_end','project'])assert.equal(current[key],before[key],key);
  assert.equal(bodies.get(task.path)!.split('\n---\n')[1],body);
  assert.equal(store.items().find((i:any)=>i.path===task.path).parentTaskPath,parent.path);
  await assert.rejects(()=>store.setParentTask(store.items().find((i:any)=>i.path===parent.path),task.path),/循環/);
  await store.setParentTask(store.items().find((i:any)=>i.path===task.path),'');assert.equal(fm.get(task.path).parent_task,null);
});
test('parent validation checks file content even if metadata cache has not caught up',async()=>{
  const {store,task,app,bodies}=await fixture();
  const parent=await app.vault.create('Daylight/Tasks/Parent TBD.md',`---\n${JSON.stringify({tags:['task'],status:'todo'})}\n---\n\n## Notes\n`);store.invalidate();
  bodies.set(parent.path,`---\n${JSON.stringify({tags:['task'],status:'todo',parent_task:`[[${task.path.replace(/\.md$/,'')}]]`})}\n---\n\n## Notes\n`);
  await assert.rejects(()=>store.setParentTask(store.items().find((i:any)=>i.path===task.path),parent.path),/循環/);
});

test('project changes from the card menu update only project and allow clearing it',async()=>{
  const {store,task,project,fm,bodies}=await fixture();
  const row=()=>store.items().find((i:any)=>i.path===task.path);
  await store.startTask(row());const before={...fm.get(task.path)},body=bodies.get(task.path)!.split('\n---\n')[1];
  await store.setTaskProject(row(),'');assert.equal(fm.get(task.path).project,null);
  await store.setTaskProject(row(),project.path);assert.equal(fm.get(task.path).project,'[[Daylight/Projects/P]]');
  for(const key of ['status','task_start','task_end','target_date','schedule_start','schedule_end','parent_task','custom'])assert.equal(fm.get(task.path)[key],before[key],key);
  assert.equal(bodies.get(task.path)!.split('\n---\n')[1],body);
  await assert.rejects(()=>store.setTaskProject(row(),task.path),/プロジェクト/);
  await assert.rejects(()=>store.setTaskProject(row(),'Daylight/Tasks/deleted.md'),/プロジェクト/);
  assert.equal(fm.get(task.path).project,'[[Daylight/Projects/P]]');
});

test('creating in an ongoing column initializes the same actual start as starting a task',async()=>{
  const {store,fm}=await fixture();
  const file=await store.createTask({...taskInput,status:'on_going'});
  const props=fm.get(file.path);assert.equal(props.status,'on_going');assert.ok(props.task_start);assert.equal(props.task_end,null);assert.equal(props.schedule_start,null);
  const done=await store.createTask({...taskInput,status:'done'});assert.ok(fm.get(done.path).task_end);assert.ok(fm.get(done.path)['completed at']);
});

test('play/pause/resume/finish supports multi-session and parallel running tasks', async()=>{
  const {store,task,app,fm}=await fixture();
  const second=await app.vault.create('Daylight/Tasks/Second TBD.md',`---\n${JSON.stringify({tags:['task'],status:'todo'})}\n---\n\n## Notes\n`);
  store.invalidate();
  const row=(path=task.path)=>store.items().find((i:any)=>i.path===path);
  await store.startTask(row());
  await store.startTask(row(second.path));
  assert.equal(row().status,'on_going');assert.equal(row(second.path).status,'on_going');
  await store.pauseTask(row());
  const paused=fm.get(task.path);
  assert.equal(paused.status,'on_going');assert.equal(paused.task_sessions.length,1);assert.ok(paused.task_end);assert.equal(paused['completed at'],null);
  await store.startTask(row());
  const resumed=fm.get(task.path);
  assert.equal(resumed.status,'on_going');assert.equal(resumed.task_sessions.length,2);assert.equal(resumed.task_start,paused.task_start);assert.equal(resumed.task_end,null);
  await store.pauseTask(row());
  await store.finishTask(row());
  const done=fm.get(task.path);
  assert.equal(done.status,'done');assert.equal(done.task_sessions.length,2);assert.ok(done.task_end);assert.ok(done['completed at']);
});

test('custom root routes reading, creating and date-based renaming to the configured kind folders',async()=>{
  const {store:original,files,templates,fm,bodies,app}=await fixture();
  for(const file of [...files,...templates]) {
    const old=file.path;file.path=old.replace(/^Daylight\//,'etc/Daylight/');
    if(fm.has(old)){fm.set(file.path,fm.get(old));fm.delete(old);}
    if(bodies.has(old)){bodies.set(file.path,bodies.get(old)!);bodies.delete(old);}
  }
  const store=new original.constructor(app,{registerEvent(){},register(){}},'/etc/Daylight');
  assert.equal(store.items().length,2);
  const task=await store.createTask({...taskInput,projectPath:'etc/Daylight/Projects/P.md'});
  assert.equal(task.path,'etc/Daylight/Tasks/追加タスク 2026-11-08.md');
  const snapshot=await store.loadTask(task.path);const updated=await store.updateTask(snapshot,{target_date:'2026-11-10'});
  assert.equal(updated.path,'etc/Daylight/Tasks/追加タスク 2026-11-10.md');
  const event=await store.createEvent({...eventInput,projectPath:'etc/Daylight/Projects/P.md'});
  assert.equal(event.path,'etc/Daylight/Events/研究ミーティング 2026-11-06.md');
  const project=await store.createProject({...projectInput,parentPath:''});assert.equal(project.path,'etc/Daylight/Projects/追加プロジェクト.md');
  const outsider=new File('notes/TaskOutside.md');files.push(outsider);fm.set(outsider.path,{tags:['task'],status:'todo'});store.invalidate();
  assert.ok(!store.items().some((i:any)=>i.path===outsider.path));
});
test('filtered reordering uses hidden tasks and assigns existing tasks on first use', async () => {
  const {store,task,files,fm}=await fixture();
  const hidden=new File('Daylight/Tasks/Hidden.md'), moved=new File('Daylight/Tasks/Moved.md');
  files.push(hidden,moved);fm.set(hidden.path,{tags:['task'],status:'todo',sort_order:20000});fm.set(moved.path,{tags:['task'],status:'todo',sort_order:30000});fm.get(task.path).sort_order=10000;store.invalidate();
  await store.reorderTask(store.items().find((i:any)=>i.path===moved.path),task.path,'after');
  assert.equal(fm.get(moved.path).sort_order,15000);assert.equal(fm.get(hidden.path).sort_order,20000);
});
test('status changes place tasks at the end of the destination column', async () => {
  const {store,task,files,fm}=await fixture();const other=new File('Daylight/Tasks/Doing.md');
  files.push(other);fm.set(other.path,{tags:['task'],status:'on_hold',sort_order:12345});store.sortOrderGap=1000;store.invalidate();
  await store.setStatus(store.items().find((i:any)=>i.path===task.path),'on_hold');
  assert.equal(fm.get(task.path).sort_order,13345);
});
