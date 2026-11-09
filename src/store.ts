import { App, Plugin, TFile, parseYaml, stringifyYaml } from 'obsidian';
import { EventInput, EventSnapshot, KEEP_PROJECT, eventDocument, renderEvent, updateEventDocument, validateEvent } from './event';
import { appendMemo, dateTime, dateValue, dayKey, isStatus, Item, Kind, notesText, localTimestamp, timeLabel, titleFor } from './model';
import { mergeTaskProperties, PropertyChanges, TaskSnapshot, taskDocument } from './task';
import { recordWorkStatus } from './execution';
import { TaskInput, ProjectInput, taskValues, projectValues, renderCreatedNote } from './create';

export interface DeleteSnapshot { path: string; kind: 'task' | 'project'; content: string }

export class DashboardStore {
  kanbanEnabled = false;
  private listeners = new Set<() => void>();
  private revision = 0;
  private pending = new Map<string, Promise<unknown>>();
  private overrides = new Map<string, { status: string; previous: string }>();
  private cache: Item[] | null = null;
  constructor(public app: App, plugin: Plugin) {
    const update = () => { this.cache = null; this.revision++; for (const fn of this.listeners) fn(); };
    plugin.registerEvent(app.metadataCache.on('changed', update));
    plugin.registerEvent(app.metadataCache.on('resolved', update));
    plugin.registerEvent(app.vault.on('create', update));
    plugin.registerEvent(app.vault.on('delete', update));
    plugin.registerEvent(app.vault.on('rename', update));
    plugin.registerEvent(app.vault.on('modify', update));
    plugin.register(() => this.listeners.clear());
    this.invalidate = update;
  }
  invalidate: () => void;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.revision;
  items(): Item[] {
    if (this.cache) return this.cache;
    this.cache = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith('notes/')).flatMap(file => {
      const cached = this.app.metadataCache.getFileCache(file), fm = cached?.frontmatter;
      if (!fm) return [];
      const tags: string[] = Array.isArray(fm.tags) ? fm.tags : typeof fm.tags === 'string' ? fm.tags.split(/[,\s]+/) : [];
      const allTags = [...tags, ...(cached.tags?.map(t => t.tag) ?? [])].filter(t => typeof t === 'string').map(t => t.replace(/^#/, ''));
      const kinds = (['task', 'event', 'project'] as Kind[]).filter(k => allTags.includes(k));
      if (kinds.length !== 1) return [];
      const kind = kinds[0];
      const raw = typeof fm.status === 'string' ? fm.status.trim() : '';
      const override = this.overrides.get(file.path);
      // Hold the result only while metadata still contains our previous value.
      // A later external edit must never be masked by a permanent UI override.
      if (override && (raw === override.status || raw !== override.previous)) this.overrides.delete(file.path);
      const project = typeof fm.project === 'string' ? fm.project : '';
      const target = project.match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/);
      const linked = target ? this.app.metadataCache.getFirstLinkpathDest(target[1], file.path) : null;
      return [{ path: file.path, title: titleFor(file.basename, kind), kind,
        status: this.overrides.get(file.path)?.status ?? raw, targetDate: dateValue(fm.target_date),
        start: dateTime(fm.schedule_start), end: dateTime(fm.schedule_end), due: dateTime(fm.due),
        projectPath: linked?.path ?? null,
        projectLabel: target?.[2] || linked?.basename || target?.[1] || project,
        archived: fm.archived === true,
        completedAt:dateTime(fm['completed at']), taskStart:dateTime(fm.task_start), taskEnd:dateTime(fm.task_end),
      }];
    });
    return this.cache;
  }
  private file(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== 'md' || !path.startsWith('notes/')) throw new Error('ノートが見つかりません。');
    return file;
  }
  private async queue(path: string, work: () => Promise<void>) {
    const previous = this.pending.get(path) ?? Promise.resolve();
    const task = previous.catch(() => {}).then(work);
    this.pending.set(path, task);
    try { await task; } finally { if (this.pending.get(path) === task) this.pending.delete(path); }
  }
  async setStatus(item: Item, status: string) {
    if (!isStatus(status)) throw new Error('状態を選択してください。');
    await this.queue(item.path, async () => {
      await this.app.fileManager.processFrontMatter(this.file(item.path), fm => {
        if (String(fm.status ?? '').trim() !== item.status) throw new Error('状態が更新されています。再度選択してください。');
        const previous=fm.status;
        fm.status = status;
        if(item.kind==='task')recordWorkStatus(fm,previous);
      });
      this.overrides.set(item.path, { status, previous: item.status }); this.invalidate();
    });
  }
  async startTask(item: Item) {
    if (item.kind !== 'task' || item.status === 'done' || item.status === 'cancelled') throw new Error('開始できるタスクを選び直してください。');
    await this.queue(item.path, async () => {
      const file=this.file(item.path);
      await this.app.vault.process(file, content => {
        const yaml={parse:parseYaml,stringify:stringifyYaml};
        const {fm,body,newline}=taskDocument(content,yaml);
        if (fm.status !== item.status || dateTime(fm.task_start) !== (item.taskStart ?? null) || dateTime(fm.task_end) !== (item.taskEnd ?? null)) throw new Error('タスクが更新されています。開き直してください。');
        if (fm.status === 'on_going' && dateTime(fm.task_start) !== null && !fm.task_end) throw new Error('すでに開始しています。');
        const now=Date.now();
        // A task uses one start/end pair. Resuming retains its original start.
        if (dateTime(fm.task_start) === null) fm.task_start=localTimestamp(now);
        if (dateTime(fm.task_start)! > now) throw new Error('作業開始が現在より後になっています。');
        fm.task_end=null;fm.status='on_going';fm['completed at']=null;
        return `---${newline}${stringifyYaml(fm).trimEnd().replace(/\r?\n/g,newline)}${newline}---${newline}${body}`;
      });
      this.invalidate();
    });
  }
  async finishTask(item: Item) {
    if (item.kind !== 'task' || item.status !== 'on_going' || item.taskStart == null || item.taskEnd != null) throw new Error('実行中のタスクを選び直してください。');
    await this.queue(item.path, async () => {
      await this.app.vault.process(this.file(item.path), content => {
        const {fm,body,newline}=taskDocument(content,{parse:parseYaml,stringify:stringifyYaml});
        if (fm.status !== 'on_going' || dateTime(fm.task_start) !== item.taskStart || dateTime(fm.task_end) !== null) throw new Error('タスクが更新されています。開き直してください。');
        fm.status='done';recordWorkStatus(fm,'on_going');
        return `---${newline}${stringifyYaml(fm).trimEnd().replace(/\r?\n/g,newline)}${newline}---${newline}${body}`;
      });
      this.invalidate();
    });
  }
  async memo(path: string, text: string) {
    const stamp = `${dayKey()} ${timeLabel(Date.now())}`;
    await this.queue(path, async () => {
      await this.app.vault.process(this.file(path), content => appendMemo(content, text, stamp));
      this.invalidate();
    });
  }
  async notes(path: string) { return notesText(await this.app.vault.read(this.file(path))); }
  private deletionKind(content: string): 'task' | 'project' {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    const fm = match ? parseYaml(match[1]) : null;
    const tags = (Array.isArray(fm?.tags) ? fm.tags : typeof fm?.tags === 'string' ? fm.tags.split(/[,\s]+/) : [])
      .filter((t: unknown): t is string => typeof t === 'string').map((t: string) => t.replace(/^#/, ''));
    const kinds = (['task', 'project', 'event'] as const).filter(k => tags.includes(k));
    if (kinds.length !== 1 || kinds[0] === 'event') throw new Error('タスクまたはプロジェクトのノートを選び直してください。');
    return kinds[0];
  }
  async loadDeleteSnapshot(item: Item): Promise<DeleteSnapshot> {
    const content = await this.app.vault.read(this.file(item.path));
    const kind = this.deletionKind(content);
    if (kind !== item.kind) throw new Error('ノートの種類が変わっています。詳細を開き直してください。');
    return { path: item.path, kind, content };
  }
  async deleteNote(snapshot: DeleteSnapshot) {
    await this.queue('__event_mutations__', () => this.queue(snapshot.path, async () => {
      const file = this.file(snapshot.path), content = await this.app.vault.read(file);
      if (content !== snapshot.content) throw new Error('ノートが更新されています。削除画面を開き直してください。');
      if (this.deletionKind(content) !== snapshot.kind) throw new Error('ノートの種類が変わっています。');
      await this.app.fileManager.trashFile(file);
      this.overrides.delete(snapshot.path); this.invalidate();
    }));
  }
  async open(path: string) { await this.app.workspace.getLeaf('tab').openFile(this.file(path)); }
  private projectLink(path: string): string {
    if (!path) return '';
    const project = this.items().find(i => i.kind === 'project' && i.path === path);
    if (!project) throw new Error('プロジェクトを選び直してください。');
    return `[[${this.file(project.path).path.replace(/\.md$/, '')}]]`;
  }
  private uniqueEventPath(stem: string, currentPath = ''): string {
    for (let suffix = 0; suffix < 10000; suffix++) {
      const candidate = `notes/${stem}${suffix ? ` ${suffix}` : ''}.md`;
      if (candidate === currentPath || !this.app.vault.getAbstractFileByPath(candidate)) return candidate;
    }
    throw new Error('重複しないノート名を確保できませんでした。');
  }
  async loadTask(path:string):Promise<TaskSnapshot> {
    const file=this.file(path),{fm}=taskDocument(await this.app.vault.read(file),{parse:parseYaml,stringify:stringifyYaml});
    let types:Record<string,string>={};
    try { types=JSON.parse(await this.app.vault.adapter.read('.obsidian/types.json')).types??{}; } catch { /* Unknown types remain editable as text/YAML. */ }
    return {path,properties:fm,types};
  }
  private taskReference(value:unknown,kind:'project'|'task',source:string):string|null {
    if(value===null||value==='')return null;
    if(typeof value!=='string')throw new Error('リンク先を選択してください。');
    const match=value.match(/^\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]$/);
    const target=match?this.app.metadataCache.getFirstLinkpathDest(match[1],source):null;
    if(!target||!this.items().some(i=>i.path===target.path&&i.kind===kind))throw new Error(kind==='project'?'プロジェクトを選び直してください。':'親タスクを選び直してください。');
    if(kind==='task') {
      const seen=new Set([source]);let parent:TFile|null=target;
      while(parent) {
        if(seen.has(parent.path))throw new Error('親タスクの関係が循環しています。');
        seen.add(parent.path);
        const raw:unknown=this.app.metadataCache.getFileCache(parent)?.frontmatter?.parent_task;
        const link:RegExpMatchArray|null=typeof raw==='string'?raw.match(/^\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]$/):null;
        parent=link?this.app.metadataCache.getFirstLinkpathDest(link[1],parent.path):null;
      }
    }
    return `[[${this.file(target.path).path.replace(/\.md$/,'')}]]`;
  }
  async updateTask(snapshot:TaskSnapshot,changes:PropertyChanges):Promise<TFile> {
    let result:TFile|undefined;
    await this.queue('__event_mutations__',()=>this.queue(snapshot.path,async()=>{
      const file=this.file(snapshot.path),yaml={parse:parseYaml,stringify:stringifyYaml};
      const patch={...changes};
      const equal=(a:unknown,b:unknown)=>stringifyYaml({value:a})===stringifyYaml({value:b});
      for(const [key,kind] of [['project','project'],['parent_task','task']] as const) {
        if(Object.hasOwn(patch,key)&&!equal(patch[key],snapshot.properties[key]))patch[key]=this.taskReference(patch[key],kind,snapshot.path);
      }
      const before=await this.app.vault.read(file),preview=mergeTaskProperties(before,snapshot,patch,yaml);
      const rename=preview.changed.includes('target_date')&&dateValue(preview.properties.target_date)!==dateValue(taskDocument(before,yaml).fm.target_date);
      const destination=rename?this.uniqueEventPath(`${titleFor(file.basename,'task')} ${dateValue(preview.properties.target_date)||'TBD'}`,file.path):file.path;
      let previous='',updated='';
      await this.app.vault.process(file,latest=>{
        previous=latest;updated=mergeTaskProperties(latest,snapshot,patch,yaml).content;return updated;
      });
      try { if(destination!==file.path)await this.app.fileManager.renameFile(file,destination); }
      catch(error) {
        if(file.path===snapshot.path) {
          try { await this.app.vault.process(file,latest=>{if(latest!==updated)throw new Error('別の編集があります。');return previous;}); }
          catch {this.invalidate();throw new Error('内容の一部は保存済みです。ノートを開き直して確認してください。');}
        } else {this.invalidate();throw new Error('名前変更後の処理を完了できませんでした。ノートを開き直してください。');}
        this.invalidate();throw error;
      }
      this.overrides.delete(snapshot.path);this.invalidate();result=file;
    }));
    return result!;
  }
  async loadEvent(path: string): Promise<EventSnapshot> {
    const file = this.file(path), content = await this.app.vault.read(file);
    const { fm } = eventDocument(content, { parse: parseYaml, stringify: stringifyYaml });
    const rawProject = typeof fm.project === 'string' ? fm.project : fm.project ? String(fm.project) : '';
    const link = rawProject.match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/);
    const resolved = link ? this.app.metadataCache.getFirstLinkpathDest(link[1], path) : null;
    const linkedProject = resolved && this.items().some(i => i.kind === 'project' && i.path === resolved.path) ? resolved : null;
    const format = (value: unknown) => {
      const time = dateTime(value);
      if (time === null) return '';
      const seconds = Math.floor((time % 60000) / 1000);
      return `${dayKey(time)}T${timeLabel(time)}${seconds ? ':' + String(seconds).padStart(2,'0') : ''}`;
    };
    return { path, content, notes: notesText(content), projectLabel: link?.[2] || resolved?.basename || rawProject,
      input: { title: titleFor(file.basename,'event'), start: format(fm.schedule_start), end: format(fm.schedule_end),
        status: typeof fm.status === 'string' ? fm.status : '',
        projectPath: linkedProject?.path || (rawProject ? KEEP_PROJECT : ''), memo: '' } };
  }
  async updateEvent(snapshot: EventSnapshot, input: EventInput): Promise<TFile> {
    const checked = validateEvent(input);
    let result: TFile | undefined;
    await this.queue('__event_mutations__', () => this.queue(snapshot.path, async () => {
      const file = this.file(snapshot.path);
      if (await this.app.vault.read(file) !== snapshot.content) throw new Error('ノートが更新されています。予定を開き直してください。');
      const { fm } = eventDocument(snapshot.content, { parse: parseYaml, stringify: stringifyYaml });
      const project = input.projectPath === KEEP_PROJECT ? fm.project : this.projectLink(input.projectPath) || null;
      const updated = updateEventDocument(snapshot.content, input, project, { parse: parseYaml, stringify: stringifyYaml }, `${dayKey()} ${timeLabel(Date.now())}`);
      const rename = checked.title !== snapshot.input.title || checked.start.slice(0,10) !== dateValue(fm.target_date);
      const destination = rename ? this.uniqueEventPath(`${checked.title} ${checked.start.slice(0,10)}`, file.path) : file.path;
      await this.app.vault.process(file, latest => {
        if (latest !== snapshot.content) throw new Error('ノートが更新されています。予定を開き直してください。');
        return updated;
      });
      try {
        if (destination !== file.path) await this.app.fileManager.renameFile(file, destination);
      } catch (error) {
        // Restore only our own write. Never discard a later edit from another view.
        if (file.path === snapshot.path) {
          try {
            await this.app.vault.process(file, latest => {
              if (latest !== updated) throw new Error('別の編集があるため復元できません。');
              return snapshot.content;
            });
          } catch { this.invalidate(); throw new Error('内容の一部は保存済みです。ノートを開き直して確認してください。'); }
        } else { this.invalidate(); throw new Error('名前変更後の処理を完了できませんでした。ノートを開き直して確認してください。'); }
        this.invalidate(); throw error;
      }
      this.overrides.delete(snapshot.path); this.invalidate(); result = file;
    }));
    return result!;
  }
  async deleteEvent(snapshot: EventSnapshot) {
    await this.queue('__event_mutations__', () => this.queue(snapshot.path, async () => {
      const file = this.file(snapshot.path), content = await this.app.vault.read(file);
      if (content !== snapshot.content) throw new Error('ノートが更新されています。予定を開き直してください。');
      eventDocument(content, { parse: parseYaml, stringify: stringifyYaml });
      await this.app.fileManager.trashFile(file);
      this.overrides.delete(snapshot.path); this.invalidate();
    }));
  }
  private async createNote(kind: 'task' | 'project', stem: string, properties: () => Record<string, unknown>, memo: string, goal = ''): Promise<TFile> {
    let result: TFile | undefined;
    await this.queue('__event_mutations__', async () => {
      const name = kind === 'task' ? 'Task' : 'Project';
      const template = this.app.vault.getAbstractFileByPath(`etc/Templates/${name}.md`);
      if (!(template instanceof TFile)) throw new Error(`${name}テンプレートが見つかりません。`);
      const content = renderCreatedNote(await this.app.vault.read(template), kind, properties(), memo, dayKey(), { parse: parseYaml, stringify: stringifyYaml }, goal);
      for (let suffix = 0; suffix < 10000; suffix++) {
        const path = `notes/${stem}${suffix ? ` ${suffix}` : ''}.md`;
        if (this.app.vault.getAbstractFileByPath(path)) continue;
        try { result = await this.app.vault.create(path, content); break; }
        catch (error) { if (!this.app.vault.getAbstractFileByPath(path)) throw error; }
      }
      if (!result) throw new Error('重複しないノート名を確保できませんでした。');
      this.invalidate();
    });
    return result!;
  }
  async createTask(input: TaskInput): Promise<TFile> {
    const { title, ...values } = taskValues(input);
    return this.createNote('task', `${title} ${input.targetDate || 'TBD'}`, () => ({ ...values,
      project: this.projectLink(input.projectPath) || null,
      parent_task: input.parentPath ? this.taskReference(`[[${input.parentPath.replace(/\.md$/, '')}]]`, 'task', '') : null,
    }), input.memo);
  }
  async createProject(input: ProjectInput): Promise<TFile> {
    const { title, status } = projectValues(input);
    return this.createNote('project', title, () => ({ status,
      parent_project: this.projectLink(input.parentPath) || null,
      working_folder: input.workingFolder.trim() || null,
    }), input.memo, input.goal);
  }
  async createEvent(input: EventInput): Promise<TFile> {
    const checked = validateEvent(input);
    let result: TFile | undefined;
    await this.queue('__event_mutations__', async () => {
      const template = this.app.vault.getAbstractFileByPath('etc/Templates/Event.md');
      if (!(template instanceof TFile)) throw new Error('Eventテンプレートが見つかりません。');
      const projectLink = this.projectLink(input.projectPath);
      const content = renderEvent(await this.app.vault.read(template), input, projectLink, dayKey(), { parse: parseYaml, stringify: stringifyYaml });
      const stem = `${checked.title} ${checked.start.slice(0, 10)}`;
      for (let suffix = 0; suffix < 10000; suffix++) {
        const path = `notes/${stem}${suffix ? ` ${suffix}` : ''}.md`;
        if (this.app.vault.getAbstractFileByPath(path)) continue;
        try { result = await this.app.vault.create(path, content); break; }
        catch (error) {
          // A simultaneous external create can take the same name. Never overwrite it.
          if (!this.app.vault.getAbstractFileByPath(path)) throw error;
        }
      }
      if (!result) throw new Error('重複しないノート名を確保できませんでした。');
      this.invalidate();
    });
    return result!;
  }
}
