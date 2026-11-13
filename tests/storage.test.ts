import * as i18n from '../src/i18n';
i18n.setLanguage('ja');
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
class TFile {constructor(public path:string,public content=''){} }
class TFolder {constructor(public path:string){} }
const compiled=build({entryPoints:[path.resolve('src/storage.ts'),path.resolve('src/store.ts')],outdir:'unused',bundle:true,write:false,format:'cjs',platform:'node',loader:{'.md':'text'},external:['./i18n','obsidian']});
async function fixture(){
  const files=new Map<string,TFile|TFolder>(),renames:string[][]=[];
  const app={metadataCache:{on:()=>({})},vault:{on:()=>({}),getAbstractFileByPath:(p:string)=>files.get(p),createFolder:async(p:string)=>{if(files.has(p))throw new Error('exists');const f=new TFolder(p);files.set(p,f);return f;},create:async(p:string,c:string)=>{if(files.has(p))throw new Error('exists');const f=new TFile(p,c);files.set(p,f);return f;}},fileManager:{renameFile:async(f:TFolder,next:string)=>{if(files.has(next))throw new Error('exists');const old=f.path;renames.push([old,next]);for(const [key,value]of [...files])if(key===old||key.startsWith(old+'/')){files.delete(key);value.path=next+key.slice(old.length);files.set(value.path,value);}}}};
  const require=createRequire(path.join(process.cwd(),'package.json'));
  const modules=(await compiled).outputFiles.map(output=>{const module={exports:{} as any};vm.runInNewContext(output.text,{module,exports:module.exports,require:(id:string)=>id==='./i18n'?i18n:id==='obsidian'?{TFile,TFolder}:require(id),console,Intl,Date});return module.exports;});
  return {files,renames,app,storage:new modules[0].DaylightStorage(app),Storage:modules[0].DaylightStorage,Store:modules[1].DaylightStore,normalize:modules[0].storageRoot};
}
test('first install creates all folders and complete bundled templates without overwriting edits',async()=>{
  const {storage,files}=await fixture();await storage.ensure();
  for(const folder of ['Daylight','Daylight/Tasks','Daylight/Events','Daylight/Projects','Daylight/Templates'])assert.ok(files.get(folder)instanceof TFolder);
  for(const name of ['Task','Event','Project'])assert.ok(files.get(`Daylight/Templates/${name}.md`)instanceof TFile);
  assert.ok((files.get('Daylight/Templates/Task.md')as TFile).content.includes('task_start:'));
  assert.ok((files.get('Daylight/Templates/Project.md')as TFile).content.includes('## ゴール'));
  const template=files.get('Daylight/Templates/Task.md')as TFile;template.content='custom template';await storage.ensure();assert.equal(template.content,'custom template');
});
test('installation is idempotent under concurrent creation and rejects file-folder collisions',async()=>{
  const {storage,files,app,Storage}=await fixture();await Promise.all([storage.ensure(),storage.ensure()]);assert.equal(files.size,8);
  files.set('Other',new TFile('Other'));await assert.rejects(()=>new Storage(app,'Other').ensure(),/同名/);
});
test('root input is vault relative, supports nested paths and rejects unsafe paths',async()=>{
  const {normalize}=await fixture();assert.equal(normalize('/etc/Daylight/'),'etc/Daylight');
  for(const path of ['', '/', '../Daylight','.obsidian/Daylight','Daylight/../Tasks','C:/Daylight'])assert.throws(()=>normalize(path));
});
test('moving the root uses FileManager once, preserves customized files, and never merges into an existing target',async()=>{
  const {storage,files,renames}=await fixture();await storage.ensure();const template=files.get('Daylight/Templates/Task.md')as TFile;template.content='custom';
  await storage.moveRoot('/etc/Daylight');assert.equal(storage.root,'etc/Daylight');assert.equal(renames.length,1);assert.equal((files.get('etc/Daylight/Templates/Task.md')as TFile).content,'custom');assert.ok(!files.has('Daylight'));
  await assert.rejects(()=>storage.moveRoot('etc/Daylight/Nested'),/中へ/);
  await assert.rejects(()=>storage.moveRoot('etc'),/同名/);assert.equal(storage.root,'etc/Daylight');
});
test('root migration rolls back file location if saving configuration fails',async()=>{
  const {app,files,Store}=await fixture();const store=new Store(app,{registerEvent(){},register(){}});await store.storage.ensure();
  await assert.rejects(()=>store.relocateRoot('etc/Daylight',async()=>{throw new Error('save failed');}),/save failed/);
  assert.equal(store.storage.root,'Daylight');assert.ok(files.has('Daylight/Templates/Task.md'));assert.ok(!files.has('etc/Daylight'));
});
