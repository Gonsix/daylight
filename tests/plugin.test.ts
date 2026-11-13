import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

async function loadPlugin(saved: any = null, existing: any[] = [], storageError?: Error) {
  const result=await build({loader:{'.md':'text'},entryPoints:[path.resolve('src/main.tsx')],bundle:true,write:false,format:'cjs',platform:'node',external:['obsidian','react','react/*','react-dom/*']});
  const registrations:any={notices:[],errors:[]};
  let layoutReady=false;
  class Plugin {
    app:any; registerEvent() {} register(callback:any) { registrations.cleanup = callback; }
    async loadData() { return saved; }
    async saveData(data:any) { registrations.saved = { ...data }; }
    addSettingTab(tab:any) { registrations.settingsTab = tab; }
    registerView(type:string,factory:any){registrations.view={type,factory};}
    addRibbonIcon(_icon:string,_label:string,callback:any){registrations.ribbon=callback;}
    addCommand(command:any){registrations.command=command;}
    registerMarkdownCodeBlockProcessor(type:string,callback:any){registrations.markdown={type,callback};(registrations.markdowns??={})[type]=callback;}
  }
  class TFile { extension='md'; constructor(public path:string){}}
  class TFolder { children:any[]=[]; constructor(public path:string){}}
  registrations.TFile = TFile;
  const storageFiles=new Map<string,any>();
  class MarkdownRenderChild { constructor(public containerEl:any){} }
  const require=createRequire(path.join(process.cwd(),'package.json'));const module={exports:{} as any};
  vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,console:{...console,error:(...args:any[])=>registrations.errors.push(args)},Intl,Date,setTimeout,clearTimeout,
    require:(id:string)=>id==='obsidian'?{TFile,TFolder,addIcon:()=>{},Plugin,PluginSettingTab:class { containerEl:any; constructor(..._args:any[]){} },Setting:class{},Notice:class {constructor(message:string){registrations.notices.push(message);}},Modal:class{},ItemView:class{},MarkdownRenderChild,parseYaml:(text:string)=>({date:text.split(':').slice(1).join(':').trim().replaceAll('"','')})}:require(id)});
  const plugin=new module.exports.default();
  plugin.app={metadataCache:{on:()=>({})},vault:{on:()=>({}),getMarkdownFiles:()=>[],getAbstractFileByPath:(path:string)=>storageFiles.get(path),createFolder:async(path:string)=>{if(!layoutReady)throw new Error('Vault not ready');if(storageError)throw storageError;storageFiles.set(path,new TFolder(path));},create:async(path:string)=>{const file=new TFile(path);storageFiles.set(path,file);return file;}},workspace:{onLayoutReady:(callback:any)=>{registrations.ready=()=>{layoutReady=true;return callback();};},getLeavesOfType:()=>existing,getLeaf:()=>({setViewState:async(state:any)=>{registrations.opened=state;}}),revealLeaf:async(leaf:any)=>{registrations.revealed=leaf;}}};
  await plugin.onload();
  return { plugin, registrations, storageFiles };
}

test('plugin loads and registers independent view, command and date-aware Markdown embeds', async () => {
  const { registrations } = await loadPlugin();
  assert.equal(registrations.view.type,'daylight');assert.equal(registrations.markdown.type,'daylight');
  assert.equal(registrations.view.factory({}).getDisplayText(),'Daylight');
  assert.equal(registrations.command.id,'open-daylight');
  assert.equal(registrations.command.name,'Daylightを開く');
  assert.equal(typeof registrations.markdowns['vault-dashboard'],'function');
  registrations.command.callback();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(registrations.opened.type,'daylight');
  let child:any;let error='';
  const el={createEl:(_tag:string,props:any)=>{error=props.text;}};
  const ctx={sourcePath:'daily_notes/01_daily/2026-11-06.md',addChild:(value:any)=>{child=value;}};
  registrations.markdown.callback('',el,ctx);assert.equal(child.date,'2026-11-06');
  registrations.markdown.callback('date: today',el,ctx);assert.equal(child.date,null);
  registrations.markdown.callback('date: "2026-11-07"',el,ctx);assert.equal(child.date,'2026-11-07');
  registrations.markdown.callback('date: "2026-02-30"',el,ctx);assert.ok(error.includes('YYYY-MM-DD'));
});


test('startup waits for layout readiness and reuses the restored dashboard tab', async () => {
  const existing = {};
  const { registrations } = await loadPlugin({ openOnStartup: true }, [existing]);
  assert.equal(registrations.revealed, undefined);
  await registrations.ready();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(registrations.revealed, existing);
  assert.equal(registrations.opened, undefined);
});

test('startup opens a dedicated tab when enabled and none was restored', async () => {
  const { registrations } = await loadPlugin({ openOnStartup: true });
  await registrations.ready();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(registrations.opened.type, 'daylight');
  assert.equal(registrations.opened.active, true);
});

test('startup stays off by default, for disabled or invalid settings, and after unload', async () => {
  for (const saved of [null, { openOnStartup: false }, { openOnStartup: 'true' }]) {
    const { registrations } = await loadPlugin(saved);
    await registrations.ready();
    assert.equal(registrations.opened, undefined);
  }
  const { registrations } = await loadPlugin({ openOnStartup: true });
  registrations.cleanup();
  await registrations.ready();
  assert.equal(registrations.opened, undefined);
});

test('startup preference is persisted', async () => {
  const { plugin, registrations } = await loadPlugin();
  assert.ok(registrations.settingsTab);
  plugin.settings.openOnStartup = true;
  await plugin.saveSettings();
  assert.equal(registrations.saved.openOnStartup, true);
});

test('obsolete kanban preference is discarded while startup and storage settings are preserved',async()=>{
  for(const enableKanban of [true,false,'true']) {
    const {plugin,registrations}=await loadPlugin({enableKanban,openOnStartup:true,rootFolder:'etc/Daylight'});
    assert.equal(Object.hasOwn(plugin.settings,'enableKanban'),false);
    assert.equal(Object.hasOwn(plugin.store,'kanbanEnabled'),false);
    assert.equal(Object.hasOwn(registrations.saved,'enableKanban'),false);
    assert.equal(plugin.settings.openOnStartup,true);assert.equal(plugin.settings.rootFolder,'etc/Daylight');
  }
});

test('saved root configuration is normalized and initialized on installation',async()=>{
  const {plugin,storageFiles,registrations}=await loadPlugin({rootFolder:'/etc/Daylight/'});
  assert.equal(storageFiles.size,0);
  await registrations.ready();
  assert.equal(plugin.settings.rootFolder,'etc/Daylight');assert.equal(plugin.store.storage.root,'etc/Daylight');
  for(const name of ['Tasks','Events','Projects','Templates'])assert.ok(storageFiles.has(`etc/Daylight/${name}`));
  for(const name of ['Task','Event','Project'])assert.ok(storageFiles.has(`etc/Daylight/Templates/${name}.md`));
  assert.equal(storageFiles.has('Daylight'),false);
  await plugin.saveSettings();assert.equal(registrations.saved.rootFolder,'etc/Daylight');
});


test('storage failure after layout does not prevent plugin registration or startup display',async()=>{
  const {registrations}=await loadPlugin({openOnStartup:true},[],new Error('Storage unavailable'));
  assert.equal(registrations.view.type,'daylight');
  await registrations.ready();
  assert.equal(registrations.opened.type,'daylight');
  assert.equal(registrations.errors.length,1);
  assert.ok(registrations.notices.some((message:string)=>message.includes('フォルダ')));
});

test('unloading before layout skips storage initialization',async()=>{
  const {registrations,storageFiles}=await loadPlugin();
  registrations.cleanup();
  await registrations.ready();
  assert.equal(storageFiles.size,0);
});

test('store stays in loading state until layout and storage initialization finish', async () => {
  const { plugin, registrations } = await loadPlugin();
  assert.equal(plugin.store.isReady(), false);
  await registrations.ready();
  assert.equal(plugin.store.isReady(), true);

  const failing = await loadPlugin({ openOnStartup: true }, [], new Error('Storage unavailable'));
  assert.equal(failing.plugin.store.isReady(), false);
  await failing.registrations.ready();
  assert.equal(failing.plugin.store.isReady(), true);
});

test('startup waits for unresolved dashboard metadata before marking the store ready', async () => {
  const { plugin, registrations } = await loadPlugin();
  let resolved: (() => void) | undefined;
  let removed = false;
  // Storage folders are created during layout initialization.
  const originalLookup = plugin.app.vault.getAbstractFileByPath;
  plugin.app.vault.getAbstractFileByPath = (path: string) => {
    const result = originalLookup(path);
    if (path === 'Daylight/Tasks' && result) result.children = [new registrations.TFile('Daylight/Tasks/example.md')];
    return result;
  };
  plugin.app.metadataCache.getFileCache = () => null;
  plugin.app.metadataCache.on = (name: string, callback: () => void) => {
    assert.equal(name, 'resolved'); resolved = callback; return {};
  };
  plugin.app.metadataCache.offref = () => { removed = true; };
  const startup = registrations.ready();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(plugin.store.isReady(), false);
  assert.ok(resolved);
  resolved();
  await startup;
  assert.equal(plugin.store.isReady(), true);
  assert.equal(removed, true);
});
