import { App, TFile, TFolder } from 'obsidian';
import { Kind } from './model';
import taskTemplate from '../templates/Task.md';
import eventTemplate from '../templates/Event.md';
import projectTemplate from '../templates/Project.md';

export const DEFAULT_ROOT = 'Daylight';
const FOLDERS: Record<Kind,string> = { task:'Tasks', event:'Events', project:'Projects' };
const TEMPLATES = { Task:taskTemplate, Event:eventTemplate, Project:projectTemplate };
export function storageRoot(value: string): string {
  const path=value.trim().replace(/\\/g,'/').replace(/\/+/g,'/').replace(/^\/|\/$/g,'');
  if (!path || /[:*?"<>|\x00-\x1f]/.test(path) || path.split('/').some(p=>p.startsWith('.') || !p)) throw new Error('Vault内のフォルダを指定してください（例: Daylight / etc/Daylight）。');
  return path;
}
export async function ensureFolder(app: App, path: string): Promise<void> {
  let current='';
  for (const part of path.split('/')) {
    current=current ? `${current}/${part}` : part;
    const file=app.vault.getAbstractFileByPath(current);
    if(file) {if(!(file instanceof TFolder))throw new Error(`${current} に同名のファイルがあります。`);continue;}
    try {await app.vault.createFolder(current);}
    catch(error) {if(!(app.vault.getAbstractFileByPath(current) instanceof TFolder))throw error;}
  }
}
export class DaylightStorage {
  root: string;
  constructor(public app: App, root=DEFAULT_ROOT) {this.root=storageRoot(root);}
  folder(kind: Kind) {return `${this.root}/${FOLDERS[kind]}`;}
  template(kind: Kind) {return `${this.root}/Templates/${kind === 'task' ? 'Task' : kind === 'event' ? 'Event' : 'Project'}.md`;}
  kind(path: string): Kind | null {return (Object.keys(FOLDERS) as Kind[]).find(kind=>path.startsWith(this.folder(kind)+'/')) ?? null;}
  async ensure() {
    for(const path of [this.root,...Object.values(FOLDERS).map(f=>`${this.root}/${f}`),`${this.root}/Templates`])await ensureFolder(this.app,path);
    for(const [name,content] of Object.entries(TEMPLATES)) {
      const path=`${this.root}/Templates/${name}.md`,file=this.app.vault.getAbstractFileByPath(path);
      if(file) {if(!(file instanceof TFile))throw new Error(`${path} に同名のフォルダがあります。`);continue;}
      try {await this.app.vault.create(path,content);}
      catch(error) {if(!(this.app.vault.getAbstractFileByPath(path) instanceof TFile))throw error;}
    }
  }
  async moveRoot(value: string) {
    const next=storageRoot(value);
    if(next===this.root)return;
    if(next.startsWith(this.root+'/'))throw new Error('現在のDaylightフォルダの中へは移動できません。');
    if(this.app.vault.getAbstractFileByPath(next))throw new Error('移動先に同名のファイルまたはフォルダがあります。別の場所を指定してください。');
    const folder=this.app.vault.getAbstractFileByPath(this.root);
    if(!(folder instanceof TFolder))throw new Error('現在のDaylightフォルダが見つかりません。');
    const parent=next.split('/').slice(0,-1).join('/');if(parent)await ensureFolder(this.app,parent);
    await this.app.fileManager.renameFile(folder,next);
    this.root=next;
  }
}
