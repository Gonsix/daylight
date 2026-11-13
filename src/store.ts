import { t } from './i18n';
import { App, Plugin, TAbstractFile, TFile, TFolder, parseYaml, stringifyYaml } from 'obsidian';
import { DaylightStorage } from './storage';
import { orderedTasks, orderBetween } from './order';
import { EventInput, EventSnapshot, KEEP_PROJECT, eventDocument, renderEvent, updateEventDocument, validateEvent } from './event';
import { appendMemo, dateTime, dateValue, dayKey, isStatus, Item, itemSessions, Kind, notesText, parseWorkSessions, timeLabel, titleFor, WorkSession } from './model';
import { mergeTaskProperties, PropertyChanges, TaskSnapshot, taskDocument } from './task';
import { isFrontmatterRunning, isTaskRunning, pauseWork, recordWorkStatus } from './execution';
import { TaskInput, ProjectInput, taskValues, projectValues, renderCreatedNote } from './create';
import { DEFAULT_LANGUAGE, Language } from './i18n';

export interface DeleteSnapshot { path: string; kind: 'task' | 'project'; content: string }

export class DaylightStore {
  readonly storage: DaylightStorage;
  private storageChanging = false;
  private listeners = new Set<() => void>();
  private revision = 0;
  private pending = new Map<string, Promise<unknown>>();
  private overrides = new Map<string, { status: string; previous: string }>();
  private cache: Item[] | null = null;
  private itemCache = new Map<string, Item | null>();
  private orderOverrides = new Map<string, { value: number; previous: unknown }>();
  private workOverrides = new Map<string, { sessions: WorkSession[]; taskStart: number | null; taskEnd: number | null; valueKey: string; previousKey: string }>();
  private ready = false;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  sortOrderGap = 10000;
  language: Language = DEFAULT_LANGUAGE;
  constructor(public app: App, plugin: Plugin, root = 'Daylight') {
    this.storage = new DaylightStorage(app,root);
    const notify = () => {
      if (this.notifyTimer !== null) { clearTimeout(this.notifyTimer); this.notifyTimer = null; }
      this.revision++;
      for (const fn of this.listeners) fn();
    };
    const update = (path?: string) => {
      if (path) this.itemCache.delete(path); else this.itemCache.clear();
      this.cache = null;
      notify();
    };
    const schedule = () => {
      this.cache = null;
      if (!this.ready || this.notifyTimer !== null) return;
      if (typeof setTimeout !== 'function') { notify(); return; }
      this.notifyTimer = setTimeout(notify, 16);
    };
    const relevant = (path: string) => this.storage.kind(path) !== null;
    const onFileChange = (file: TAbstractFile, oldPath?: string) => {
      if (file instanceof TFolder) {
        const affects = (path: string) => path === this.storage.root || this.storage.root.startsWith(path + '/') || relevant(path + '/');
        if (!affects(file.path) && !(oldPath && affects(oldPath))) return;
        this.itemCache.clear(); schedule(); return;
      }
      if (!(file instanceof TFile)) return;
      if (!relevant(file.path) && !(oldPath && relevant(oldPath))) return;
      this.itemCache.delete(file.path);
      if (oldPath) this.itemCache.delete(oldPath);
      schedule();
    };
    // Link resolution may change when another file is renamed or created.
    // Rebuild only entries whose resolved target has actually changed.
    const onResolved = () => {
      let changed = false;
      for (const [path, item] of this.itemCache) {
        if (!item) continue;
        const file = app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) continue;
        const fm = app.metadataCache.getFileCache(file)?.frontmatter;
        const resolve = (value: unknown) => {
          const link = typeof value === 'string' ? value.match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/) : null;
          return link ? app.metadataCache.getFirstLinkpathDest(link[1], path)?.path ?? null : null;
        };
        if (resolve(fm?.project) !== item.projectPath || resolve(fm?.parent_task) !== (item.parentTaskPath ?? null)) {
          this.itemCache.delete(path); changed = true;
        }
      }
      if (changed) schedule();
    };
    plugin.registerEvent(app.metadataCache.on('changed', file => onFileChange(file)));
    plugin.registerEvent(app.metadataCache.on('resolved', onResolved));
    plugin.registerEvent(app.vault.on('create', file => onFileChange(file)));
    plugin.registerEvent(app.vault.on('delete', file => onFileChange(file)));
    plugin.registerEvent(app.vault.on('rename', (file, oldPath) => onFileChange(file, oldPath)));
    plugin.registerEvent(app.vault.on('modify', file => onFileChange(file)));
    plugin.register(() => {
      if (this.notifyTimer !== null) { clearTimeout(this.notifyTimer); this.notifyTimer = null; }
      this.listeners.clear();
    });
    this.invalidate = update;
  }
  invalidate: (path?: string) => void;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.revision;
  isReady = () => this.ready;
  async prepareStartup(): Promise<void> {
    const files = this.storage.markdownFiles();
    if (files.every(file => this.app.metadataCache.getFileCache(file) != null)) return;
    // Some files may never have a cache (for example, an empty note), so do not
    // leave the dashboard blocked indefinitely if no further event arrives.
    await new Promise<void>(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.app.metadataCache.offref(event);
        resolve();
      };
      const event = this.app.metadataCache.on('resolved', finish);
      const timer = setTimeout(finish, 3000);
    });
  }
  markReady() {
    if (this.ready) return;
    this.ready = true;
    this.invalidate();
  }
  items(): Item[] {
    if (this.cache) return this.cache;
    this.cache = this.storage.markdownFiles().flatMap(file => {
      if (this.itemCache.has(file.path)) {
        const item = this.itemCache.get(file.path);
        return item ? [item] : [];
      }
      const parsed = this.parseItem(file);
      this.itemCache.set(file.path, parsed);
      return parsed ? [parsed] : [];
    });
    return this.cache;
  }
  private parseItem(file: TFile): Item | null {
      const cached = this.app.metadataCache.getFileCache(file), fm = cached?.frontmatter;
      if (!fm) return null;
      const tags: string[] = Array.isArray(fm.tags) ? fm.tags : typeof fm.tags === 'string' ? fm.tags.split(/[,\s]+/) : [];
      const allTags = [...tags, ...(cached.tags?.map(t => t.tag) ?? [])].filter(t => typeof t === 'string').map(t => t.replace(/^#/, ''));
      const kinds = (['task', 'event', 'project'] as Kind[]).filter(k => allTags.includes(k));
      if (kinds.length !== 1) return null;
      const kind = kinds[0];
      if(this.storage.kind(file.path)!==kind)return null;
      const raw = typeof fm.status === 'string' ? fm.status.trim() : '';
      const override = this.overrides.get(file.path);
      // Hold the result only while metadata still contains our previous value.
      // A later external edit must never be masked by a permanent UI override.
      if (override && (raw === override.status || raw !== override.previous)) this.overrides.delete(file.path);
      const orderOverride = this.orderOverrides.get(file.path);
      if (orderOverride && (fm.sort_order === orderOverride.value || fm.sort_order !== orderOverride.previous)) this.orderOverrides.delete(file.path);
      const sortOrder = this.orderOverrides.get(file.path)?.value ?? (Number.isSafeInteger(fm.sort_order) ? fm.sort_order : null);
      const project = typeof fm.project === 'string' ? fm.project : '';
      const target = project.match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/);
      const linked = target ? this.app.metadataCache.getFirstLinkpathDest(target[1], file.path) : null;
      const parent = typeof fm.parent_task === 'string' ? fm.parent_task : '';
      const parentLink = parent.match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/);
      const parentFile = parentLink ? this.app.metadataCache.getFirstLinkpathDest(parentLink[1],file.path) : null;
      return { path: file.path, title: titleFor(file.basename, kind), kind,
        status: this.overrides.get(file.path)?.status ?? raw, sortOrder, targetDate: dateValue(fm.target_date),
        start: dateTime(fm.schedule_start), end: dateTime(fm.schedule_end), due: dateTime(fm.due),
        projectPath: linked?.path ?? null,
        projectLabel: target?.[2] || linked?.basename || target?.[1] || project,
        parentTaskPath: parentFile?.path ?? null, parentTaskLabel: parentLink?.[2] || (parentFile ? titleFor(parentFile.basename,'task') : parentLink?.[1]) || parent,
        archived: fm.archived === true,
        ...(() => {
          const sessions = parseWorkSessions(fm.task_sessions, fm.task_start, fm.task_end);
          const taskStart = dateTime(fm.task_start) ?? sessions[0]?.start ?? null;
          const taskEnd = dateTime(fm.task_end) ?? (sessions.length ? sessions[sessions.length - 1].end : null);
          const rawKey = this.workKey(sessions, taskStart, taskEnd);
          const workOverride = this.workOverrides.get(file.path);
          if (workOverride && (rawKey === workOverride.valueKey || rawKey !== workOverride.previousKey)) this.workOverrides.delete(file.path);
          const active = this.workOverrides.get(file.path);
          return {
            completedAt: dateTime(fm['completed at']),
            taskStart: active ? active.taskStart : taskStart,
            taskEnd: active ? active.taskEnd : taskEnd,
            taskSessions: active ? active.sessions : sessions,
          };
        })(),
      };
  }
  private file(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== 'md' || this.storage.kind(path) === null) throw new Error(t("ノートが見つかりません。"));
    return file;
  }
  private async queue(path: string, work: () => Promise<void>) {
    if(this.storageChanging)throw new Error(t("Daylightフォルダを移動中です。完了後にもう一度お試しください。"));
    const previous = this.pending.get(path) ?? Promise.resolve();
    const task = previous.catch(() => {}).then(work);
    this.pending.set(path, task);
    try { await task; } finally { if (this.pending.get(path) === task) this.pending.delete(path); }
  }
  async relocateRoot(next: string, save: () => Promise<void>) {
    if(this.storageChanging)throw new Error(t("Daylightフォルダを移動中です。"));
    this.storageChanging=true;
    const previous=this.storage.root;
    try {
      await Promise.allSettled([...this.pending.values()]);
      await this.storage.moveRoot(next);
      try {await save();}
      catch(error) {
        try {await this.storage.moveRoot(previous);}
        catch {throw new Error(t("設定を保存できず、フォルダは {0} に移動済みです。配置場所を確認してください。", this.storage.root));}
        throw error;
      }
    } finally {this.storageChanging=false;this.invalidate();}
  }
  private async initializeOrder(status: string) {
    const rows = orderedTasks(this.items().filter(i => i.kind === 'task' && i.status === status));
    let last = rows.reduce((max, i) => i.sortOrder != null ? Math.max(max, i.sortOrder) : max, 0);
    for (const item of rows.filter(i => i.sortOrder == null)) {
      const value = orderBetween(last, null, this.sortOrderGap);
      await this.app.fileManager.processFrontMatter(this.file(item.path), fm => {
        if (String(fm.status ?? '').trim() !== status || (fm.sort_order != null && fm.sort_order !== '')) throw new Error(t("タスクが更新されています。もう一度お試しください。"));
        const previous = fm.sort_order; fm.sort_order = value;
        this.orderOverrides.set(item.path, {value, previous});
      });
      last = value; this.invalidate(item.path);
    }
  }
  private async appendOrder(status: string, exclude = ''): Promise<number> {
    await this.initializeOrder(status);
    const rows = orderedTasks(this.items().filter(i => i.kind === 'task' && i.status === status && i.path !== exclude));
    return orderBetween(rows.at(-1)?.sortOrder ?? null, null, this.sortOrderGap);
  }
  async reorderTask(item: Item, anchorPath: string, side: 'before' | 'after') {
    await this.queue('__event_mutations__', async () => {
      await this.initializeOrder(item.status);
      const rows = orderedTasks(this.items().filter(i => i.kind === 'task' && i.status === item.status && i.path !== item.path));
      const index = rows.findIndex(i => i.path === anchorPath);
      if (index < 0) throw new Error(t("移動先のタスクが更新されています。もう一度お試しください。"));
      const position = index + (side === 'after' ? 1 : 0);
      const value = orderBetween(rows[position-1]?.sortOrder ?? null, rows[position]?.sortOrder ?? null, this.sortOrderGap);
      const current = this.items().find(i => i.path === item.path);
      if (!current || current.status !== item.status) throw new Error(t("タスクの状態が更新されています。"));
      await this.app.fileManager.processFrontMatter(this.file(item.path), fm => {
        if (String(fm.status ?? '').trim() !== item.status || fm.sort_order !== current.sortOrder) throw new Error(t("タスクが更新されています。もう一度お試しください。"));
        const previous = fm.sort_order; fm.sort_order = value; this.orderOverrides.set(item.path,{value,previous});
      });
      this.invalidate(item.path);
    });
  }
  private workKey(sessions: WorkSession[], taskStart: number | null, taskEnd: number | null): string {
    return `${taskStart ?? ''}|${taskEnd ?? ''}|${sessions.map(s => `${s.start}..${s.end ?? ''}`).join(',')}`;
  }
  private captureWorkOverride(path: string, previousKey: string, fm: Record<string, unknown>) {
    const sessions = parseWorkSessions(fm.task_sessions, fm.task_start, fm.task_end);
    const taskStart = dateTime(fm.task_start) ?? sessions[0]?.start ?? null;
    const taskEnd = dateTime(fm.task_end) ?? (sessions.length ? sessions[sessions.length - 1].end : null);
    const valueKey = this.workKey(sessions, taskStart, taskEnd);
    if (valueKey !== previousKey) this.workOverrides.set(path, { sessions, taskStart, taskEnd, valueKey, previousKey });
  }
  async setStatus(item: Item, status: string) {
    if (!isStatus(status)) throw new Error(t("状態を選択してください。"));
    await this.queue('__event_mutations__', () => this.queue(item.path, async () => {
      const order = item.kind === 'task' && item.status !== status ? await this.appendOrder(status, item.path) : null;
      const previousKey = this.workKey(itemSessions(item), item.taskStart ?? null, item.taskEnd ?? null);
      let updatedWork: Record<string, unknown> | null = null;
      await this.app.fileManager.processFrontMatter(this.file(item.path), fm => {
        if (String(fm.status ?? '').trim() !== item.status) throw new Error(t("状態が更新されています。再度選択してください。"));
        const previous=fm.status;
        fm.status = status;
        if (order !== null) { this.orderOverrides.set(item.path,{value:order,previous:fm.sort_order}); fm.sort_order=order; }
        if (item.kind === 'task') { recordWorkStatus(fm, previous); updatedWork = { ...fm }; }
      });
      if (updatedWork) this.captureWorkOverride(item.path, previousKey, updatedWork);
      this.overrides.set(item.path, { status, previous: item.status }); this.invalidate(item.path);
    }));
  }
  async startTask(item: Item) {
    if (item.kind !== 'task' || item.status === 'done' || item.status === 'cancelled') throw new Error(t("開始できるタスクを選び直してください。"));
    if (isTaskRunning(item)) throw new Error(t("すでに開始しています。"));
    await this.queue('__event_mutations__', () => this.queue(item.path, async () => {
      const order = item.status !== 'on_going' ? await this.appendOrder('on_going',item.path) : null;
      const file=this.file(item.path);
      const expectedSessions = itemSessions(item);
      const previousKey = this.workKey(expectedSessions, item.taskStart ?? null, item.taskEnd ?? null);
      let updatedWork: Record<string, unknown> | null = null;
      await this.app.vault.process(file, content => {
        const yaml={parse:parseYaml,stringify:stringifyYaml};
        const {fm,body,newline}=taskDocument(content,yaml);
        const currentSessions = parseWorkSessions(fm.task_sessions, fm.task_start, fm.task_end);
        if (fm.status !== item.status || this.workKey(currentSessions, dateTime(fm.task_start), dateTime(fm.task_end)) !== previousKey) throw new Error(t("タスクが更新されています。開き直してください。"));
        if (fm.status === 'on_going' && isFrontmatterRunning(fm)) throw new Error(t("すでに開始しています。"));
        const now=Date.now();
        const previous=fm.status;
        fm.status='on_going';if(order !== null){this.orderOverrides.set(item.path,{value:order,previous:fm.sort_order});fm.sort_order=order;}recordWorkStatus(fm,previous,now);fm['completed at']=null;
        updatedWork = { ...fm };
        return `---${newline}${stringifyYaml(fm).trimEnd().replace(/\r?\n/g,newline)}${newline}---${newline}${body}`;
      });
      if (updatedWork) this.captureWorkOverride(item.path, previousKey, updatedWork);
      this.overrides.set(item.path,{status:'on_going',previous:item.status});this.invalidate(item.path);
    }));
  }
  async pauseTask(item: Item) {
    if (item.kind !== 'task' || !isTaskRunning(item)) throw new Error(t("実行中のタスクを選び直してください。"));
    await this.queue('__event_mutations__', () => this.queue(item.path, async () => {
      const previousKey = this.workKey(itemSessions(item), item.taskStart ?? null, item.taskEnd ?? null);
      let updatedWork: Record<string, unknown> | null = null;
      await this.app.vault.process(this.file(item.path), content => {
        const {fm,body,newline}=taskDocument(content,{parse:parseYaml,stringify:stringifyYaml});
        const currentSessions = parseWorkSessions(fm.task_sessions, fm.task_start, fm.task_end);
        if (fm.status !== 'on_going' || !isFrontmatterRunning(fm) || this.workKey(currentSessions, dateTime(fm.task_start), dateTime(fm.task_end)) !== previousKey) throw new Error(t("タスクが更新されています。開き直してください。"));
        pauseWork(fm, Date.now());
        updatedWork = { ...fm };
        return `---${newline}${stringifyYaml(fm).trimEnd().replace(/\r?\n/g,newline)}${newline}---${newline}${body}`;
      });
      if (updatedWork) this.captureWorkOverride(item.path, previousKey, updatedWork);
      this.invalidate(item.path);
    }));
  }
  async finishTask(item: Item) {
    if (item.kind !== 'task' || item.status !== 'on_going') throw new Error(t("実行中のタスクを選び直してください。"));
    await this.queue('__event_mutations__', () => this.queue(item.path, async () => {
      const order = await this.appendOrder('done',item.path);
      const previousKey = this.workKey(itemSessions(item), item.taskStart ?? null, item.taskEnd ?? null);
      let updatedWork: Record<string, unknown> | null = null;
      await this.app.vault.process(this.file(item.path), content => {
        const {fm,body,newline}=taskDocument(content,{parse:parseYaml,stringify:stringifyYaml});
        const currentSessions = parseWorkSessions(fm.task_sessions, fm.task_start, fm.task_end);
        if (fm.status !== 'on_going' || this.workKey(currentSessions, dateTime(fm.task_start), dateTime(fm.task_end)) !== previousKey) throw new Error(t("タスクが更新されています。開き直してください。"));
        fm.status='done';this.orderOverrides.set(item.path,{value:order,previous:fm.sort_order});fm.sort_order=order;recordWorkStatus(fm,'on_going');
        updatedWork = { ...fm };
        return `---${newline}${stringifyYaml(fm).trimEnd().replace(/\r?\n/g,newline)}${newline}---${newline}${body}`;
      });
      if (updatedWork) this.captureWorkOverride(item.path, previousKey, updatedWork);
      this.overrides.set(item.path,{status:'done',previous:item.status});this.invalidate(item.path);
    }));
  }
  async memo(path: string, text: string) {
    const stamp = `${dayKey()} ${timeLabel(Date.now())}`;
    await this.queue(path, async () => {
      await this.app.vault.process(this.file(path), content => appendMemo(content, text, stamp));
      this.invalidate(path);
    });
  }
  async notes(path: string) { return notesText(await this.app.vault.read(this.file(path))); }
  private deletionKind(content: string): 'task' | 'project' {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    const fm = match ? parseYaml(match[1]) : null;
    const tags = (Array.isArray(fm?.tags) ? fm.tags : typeof fm?.tags === 'string' ? fm.tags.split(/[,\s]+/) : [])
      .filter((t: unknown): t is string => typeof t === 'string').map((t: string) => t.replace(/^#/, ''));
    const kinds = (['task', 'project', 'event'] as const).filter(k => tags.includes(k));
    if (kinds.length !== 1 || kinds[0] === 'event') throw new Error(t("タスクまたはプロジェクトのノートを選び直してください。"));
    return kinds[0];
  }
  async loadDeleteSnapshot(item: Item): Promise<DeleteSnapshot> {
    const content = await this.app.vault.read(this.file(item.path));
    const kind = this.deletionKind(content);
    if (kind !== item.kind) throw new Error(t("ノートの種類が変わっています。詳細を開き直してください。"));
    return { path: item.path, kind, content };
  }
  async deleteNote(snapshot: DeleteSnapshot) {
    await this.queue('__event_mutations__', () => this.queue(snapshot.path, async () => {
      const file = this.file(snapshot.path), content = await this.app.vault.read(file);
      if (content !== snapshot.content) throw new Error(t("ノートが更新されています。削除画面を開き直してください。"));
      if (this.deletionKind(content) !== snapshot.kind) throw new Error(t("ノートの種類が変わっています。"));
      await this.app.fileManager.trashFile(file);
      this.overrides.delete(snapshot.path); this.invalidate();
    }));
  }
  async open(path: string, background = false) { await this.app.workspace.getLeaf('tab').openFile(this.file(path), background ? { active: false } : undefined); }
  private projectLink(path: string): string {
    if (!path) return '';
    const project = this.items().find(i => i.kind === 'project' && i.path === path);
    if (!project) throw new Error(t("プロジェクトを選び直してください。"));
    return `[[${this.file(project.path).path.replace(/\.md$/, '')}]]`;
  }
  private uniqueEventPath(stem: string, kind: Kind, currentPath = ''): string {
    for (let suffix = 0; suffix < 10000; suffix++) {
      const candidate = `${this.storage.folder(kind)}/${stem}${suffix ? ` ${suffix}` : ''}.md`;
      if (candidate === currentPath || !this.app.vault.getAbstractFileByPath(candidate)) return candidate;
    }
    throw new Error(t("重複しないノート名を確保できませんでした。"));
  }
  async loadTask(path:string):Promise<TaskSnapshot> {
    const file=this.file(path),{fm}=taskDocument(await this.app.vault.read(file),{parse:parseYaml,stringify:stringifyYaml});
    let types:Record<string,string>={};
    try { types=JSON.parse(await this.app.vault.adapter.read('.obsidian/types.json')).types??{}; } catch { /* Unknown types remain editable as text/YAML. */ }
    return {path,properties:fm,types};
  }
  private taskReference(value:unknown,kind:'project'|'task',source:string):string|null {
    if(value===null||value==='')return null;
    if(typeof value!=='string')throw new Error(t("リンク先を選択してください。"));
    const match=value.match(/^\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]$/);
    const target=match?this.app.metadataCache.getFirstLinkpathDest(match[1],source):null;
    if(!target||!this.items().some(i=>i.path===target.path&&i.kind===kind))throw new Error(kind==='project'?t("プロジェクトを選び直してください。"):t("親タスクを選び直してください。"));
    if(kind==='task') {
      const seen=new Set([source]);let parent:TFile|null=target;
      while(parent) {
        if(seen.has(parent.path))throw new Error(t("親タスクの関係が循環しています。"));
        seen.add(parent.path);
        const raw:unknown=this.app.metadataCache.getFileCache(parent)?.frontmatter?.parent_task;
        const link:RegExpMatchArray|null=typeof raw==='string'?raw.match(/^\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]$/):null;
        parent=link?this.app.metadataCache.getFirstLinkpathDest(link[1],parent.path):null;
      }
    }
    return `[[${this.file(target.path).path.replace(/\.md$/,'')}]]`;
  }
  private async validateParentChain(parentLink: unknown, source: string) {
    const seen=new Set([source]);
    let raw=typeof parentLink === 'string' ? parentLink : '';
    let context=source;
    while (raw) {
      const match=raw.match(/^\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]$/);
      const file=match ? this.app.metadataCache.getFirstLinkpathDest(match[1],context) : null;
      if (!file) throw new Error(t("親タスクのリンク先を確認してください。"));
      if (seen.has(file.path)) throw new Error(t("親タスクの関係が循環しています。"));
      seen.add(file.path);
      const {fm}=taskDocument(await this.app.vault.read(this.file(file.path)),{parse:parseYaml,stringify:stringifyYaml});
      raw=typeof fm.parent_task === 'string' ? fm.parent_task : '';context=file.path;
    }
  }
  async setTaskProject(item: Item, projectPath: string) {
    if (item.kind !== 'task') throw new Error(t("タスクを選択してください。"));
    const snapshot = await this.loadTask(item.path);
    await this.updateTask(snapshot, { project: projectPath ? `[[${projectPath.replace(/\.md$/, '')}]]` : null });
  }
  async setParentTask(item: Item, parentPath: string) {
    if (item.kind !== 'task') throw new Error(t("タスクを選択してください。"));
    const snapshot=await this.loadTask(item.path);
    await this.updateTask(snapshot,{parent_task:parentPath ? `[[${parentPath.replace(/\.md$/,'')}]]` : null});
  }
  async updateTask(snapshot:TaskSnapshot,changes:PropertyChanges):Promise<TFile> {
    let result:TFile|undefined;
    await this.queue('__event_mutations__',()=>this.queue(snapshot.path,async()=>{
      const file=this.file(snapshot.path),yaml={parse:parseYaml,stringify:stringifyYaml};
      const patch={...changes};
      if (typeof patch.status === 'string' && patch.status !== snapshot.properties.status) patch.sort_order = await this.appendOrder(patch.status,snapshot.path);
      const equal=(a:unknown,b:unknown)=>stringifyYaml({value:a})===stringifyYaml({value:b});
      for(const [key,kind] of [['project','project'],['parent_task','task']] as const) {
        if(Object.hasOwn(patch,key)&&!equal(patch[key],snapshot.properties[key]))patch[key]=this.taskReference(patch[key],kind,snapshot.path);
      }
      if (Object.hasOwn(patch,'parent_task') && !equal(patch.parent_task,snapshot.properties.parent_task)) await this.validateParentChain(patch.parent_task,snapshot.path);
      const before=await this.app.vault.read(file),preview=mergeTaskProperties(before,snapshot,patch,yaml);
      const rename=preview.changed.includes('target_date')&&dateValue(preview.properties.target_date)!==dateValue(taskDocument(before,yaml).fm.target_date);
      const destination=rename?this.uniqueEventPath(`${titleFor(file.basename,'task')} ${dateValue(preview.properties.target_date)||'TBD'}`,'task',file.path):file.path;
      let previous='',updated='';
      await this.app.vault.process(file,latest=>{
        previous=latest;updated=mergeTaskProperties(latest,snapshot,patch,yaml).content;return updated;
      });
      try { if(destination!==file.path)await this.app.fileManager.renameFile(file,destination); }
      catch(error) {
        if(file.path===snapshot.path) {
          try { await this.app.vault.process(file,latest=>{if(latest!==updated)throw new Error(t("別の編集があります。"));return previous;}); }
          catch {this.invalidate();throw new Error(t("内容の一部は保存済みです。ノートを開き直して確認してください。"));}
        } else {this.invalidate();throw new Error(t("名前変更後の処理を完了できませんでした。ノートを開き直してください。"));}
        this.invalidate();throw error;
      }
      this.overrides.delete(snapshot.path);this.workOverrides.delete(snapshot.path);this.invalidate();result=file;
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
      if (await this.app.vault.read(file) !== snapshot.content) throw new Error(t("ノートが更新されています。予定を開き直してください。"));
      const { fm } = eventDocument(snapshot.content, { parse: parseYaml, stringify: stringifyYaml });
      const project = input.projectPath === KEEP_PROJECT ? fm.project : this.projectLink(input.projectPath) || null;
      const updated = updateEventDocument(snapshot.content, input, project, { parse: parseYaml, stringify: stringifyYaml }, `${dayKey()} ${timeLabel(Date.now())}`);
      const rename = checked.title !== snapshot.input.title || checked.start.slice(0,10) !== dateValue(fm.target_date);
      const destination = rename ? this.uniqueEventPath(`${checked.title} ${checked.start.slice(0,10)}`, 'event', file.path) : file.path;
      await this.app.vault.process(file, latest => {
        if (latest !== snapshot.content) throw new Error(t("ノートが更新されています。予定を開き直してください。"));
        return updated;
      });
      try {
        if (destination !== file.path) await this.app.fileManager.renameFile(file, destination);
      } catch (error) {
        // Restore only our own write. Never discard a later edit from another view.
        if (file.path === snapshot.path) {
          try {
            await this.app.vault.process(file, latest => {
              if (latest !== updated) throw new Error(t("別の編集があるため復元できません。"));
              return snapshot.content;
            });
          } catch { this.invalidate(); throw new Error(t("内容の一部は保存済みです。ノートを開き直して確認してください。")); }
        } else { this.invalidate(); throw new Error(t("名前変更後の処理を完了できませんでした。ノートを開き直して確認してください。")); }
        this.invalidate(); throw error;
      }
      this.overrides.delete(snapshot.path); this.invalidate(); result = file;
    }));
    return result!;
  }
  async deleteEvent(snapshot: EventSnapshot) {
    await this.queue('__event_mutations__', () => this.queue(snapshot.path, async () => {
      const file = this.file(snapshot.path), content = await this.app.vault.read(file);
      if (content !== snapshot.content) throw new Error(t("ノートが更新されています。予定を開き直してください。"));
      eventDocument(content, { parse: parseYaml, stringify: stringifyYaml });
      await this.app.fileManager.trashFile(file);
      this.overrides.delete(snapshot.path); this.invalidate();
    }));
  }
  private async createNote(kind: 'task' | 'project', stem: string, properties: () => Record<string, unknown>, memo: string, goal = ''): Promise<TFile> {
    let result: TFile | undefined;
    await this.queue('__event_mutations__', async () => {
      const name = kind === 'task' ? 'Task' : 'Project';
      const template = this.app.vault.getAbstractFileByPath(this.storage.template(kind));
      if (!(template instanceof TFile)) throw new Error(t("{0}テンプレートが見つかりません。", name));
      const values = properties();
      if (kind === 'task' && typeof values.status === 'string') values.sort_order = await this.appendOrder(values.status);
      const content = renderCreatedNote(await this.app.vault.read(template), kind, values, memo, dayKey(), { parse: parseYaml, stringify: stringifyYaml }, goal);
      for (let suffix = 0; suffix < 10000; suffix++) {
        const path = `${this.storage.folder(kind)}/${stem}${suffix ? ` ${suffix}` : ''}.md`;
        if (this.app.vault.getAbstractFileByPath(path)) continue;
        try { result = await this.app.vault.create(path, content); break; }
        catch (error) { if (!this.app.vault.getAbstractFileByPath(path)) throw error; }
      }
      if (!result) throw new Error(t("重複しないノート名を確保できませんでした。"));
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
      const template = this.app.vault.getAbstractFileByPath(this.storage.template('event'));
      if (!(template instanceof TFile)) throw new Error(t("Eventテンプレートが見つかりません。"));
      const projectLink = this.projectLink(input.projectPath);
      const content = renderEvent(await this.app.vault.read(template), input, projectLink, dayKey(), { parse: parseYaml, stringify: stringifyYaml });
      const stem = `${checked.title} ${checked.start.slice(0, 10)}`;
      for (let suffix = 0; suffix < 10000; suffix++) {
        const path = `${this.storage.folder('event')}/${stem}${suffix ? ` ${suffix}` : ''}.md`;
        if (this.app.vault.getAbstractFileByPath(path)) continue;
        try { result = await this.app.vault.create(path, content); break; }
        catch (error) {
          // A simultaneous external create can take the same name. Never overwrite it.
          if (!this.app.vault.getAbstractFileByPath(path)) throw error;
        }
      }
      if (!result) throw new Error(t("重複しないノート名を確保できませんでした。"));
      this.invalidate();
    });
    return result!;
  }
}
