import { subscribeLanguage, t, useLanguage } from './i18n';
import React, { useRef, useState } from 'preact/compat';
import { createRoot } from 'preact/compat/client';
type Root = ReturnType<typeof createRoot>;
import { Modal, Notice } from 'obsidian';
import { DaylightStore } from './store';
import { ProjectInput, TaskInput, projectValues, taskValues } from './create';
import { isActive, STATUS, Status } from './model';
import { submitOnCommandEnter } from './shortcuts';

export function CreateForm({ store, kind, day = '', projectPath = '', initialStatus = 'todo', close }: {
  store: DaylightStore; kind: 'task' | 'project'; day?: string; projectPath?: string; initialStatus?: Status; close: () => void;
}) {
  useLanguage();
  const [task, setTask] = useState<TaskInput>({ title: '', status: initialStatus, targetDate: day, start: '', end: '', due: '', projectPath, parentPath: '', memo: '' });
  const [project, setProject] = useState<ProjectInput>({ title: '', status: 'todo', parentPath: '', workingFolder: '', goal: '', memo: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const saving = useRef(false);
  const isTask = kind === 'task', input = isTask ? task : project;
  const set = (key: keyof TaskInput | keyof ProjectInput, value: string) => {
    if (isTask) setTask(prev => ({ ...prev, [key]: value }));
    else setProject(prev => ({ ...prev, [key]: value }));
    setError('');
  };
  const items = store.items();
  const projects = items.filter(i => i.kind === 'project' && ((!i.archived && isActive(i)) || i.path === projectPath));
  const parents = isTask ? items.filter(i => i.kind === 'task' && isActive(i)) : projects;
  const field = (key: keyof TaskInput | keyof ProjectInput, label: string, type = 'text') =>
    <label className="daylight-form-field"><span>{label}</span><input type={type} step={type === 'datetime-local' ? 60 : undefined}
      value={String((input as unknown as Record<string,string>)[key] ?? '')} onChange={e => set(key,e.currentTarget.value)} /></label>;
  return <form className="daylight-app daylight-composer" onKeyDownCapture={e => submitOnCommandEnter(e,saving.current)} onSubmit={e => { void (async () => {
    e.preventDefault(); if (saving.current) return;
    try { if (isTask) taskValues(task); else projectValues(project); }
    catch (e) { setError((e as Error).message); return; }
    saving.current = true; setBusy(true); setError('');
    try {
      if (isTask) await store.createTask(task); else await store.createProject(project);
      new Notice(isTask ? t("タスクを追加しました。") : t("プロジェクトを追加しました。")); close();
    } catch (e) { setError((e as Error).message); saving.current = false; setBusy(false); }
  })(); }}>
    <fieldset disabled={busy} className="daylight-event-fields">
      <label className="daylight-form-field daylight-title-field"><span>{t("タイトル")}</span><input autoFocus required maxLength={120} value={input.title} onChange={e => set('title',e.currentTarget.value)} placeholder={isTask ? t("タスクのタイトル") : t("プロジェクト名")} /></label>
      <div className="daylight-form-times">
        {isTask && field('targetDate',t("予定日（空欄で未定）"),'date')}
        <label className="daylight-form-field"><span>{t("状態")}</span><select value={input.status} onChange={e => set('status',e.currentTarget.value)}>
          {Object.entries(STATUS).map(([value,state]) => <option key={value} value={value}>{state.label}</option>)}
        </select></label>
      </div>
      {isTask && <>
        <div className="daylight-form-times">{field('start',t("開始"),'datetime-local')}{field('end',t("終了"),'datetime-local')}</div>
        {field('due',t("締切"),'datetime-local')}
        <label className="daylight-form-field"><span>{t("プロジェクト")}</span><select value={task.projectPath} onChange={e => set('projectPath',e.currentTarget.value)}>
          <option value="">{t("未設定")}</option>{projects.map(i => <option key={i.path} value={i.path}>{i.title}</option>)}
        </select></label>
      </>}
      <label className="daylight-form-field"><span>{isTask ? t("親タスク") : t("親プロジェクト")}</span><select value={input.parentPath} onChange={e => set('parentPath',e.currentTarget.value)}>
        <option value="">{t("未設定")}</option>{parents.map(i => <option key={i.path} value={i.path}>{i.title}</option>)}
      </select></label>
      {!isTask && <>
        {field('workingFolder',t("作業場所"))}
        <label className="daylight-form-field"><span>{t("ゴール")}</span><textarea rows={3} value={project.goal} onChange={e => set('goal',e.currentTarget.value)} /></label>
      </>}
      <label className="daylight-form-field"><span>{t("メモ")}</span><textarea rows={3} value={input.memo} onChange={e => set('memo',e.currentTarget.value)} /></label>
      {error && <p className="daylight-error" role="alert">{error}</p>}
      <div className="daylight-form-actions"><button type="button" onClick={close}>{t("キャンセル")}</button>
        <button className="daylight-create" type="submit" aria-keyshortcuts="Meta+Enter" title="⌘ Enter" disabled={busy}>{busy ? t("作成中…") : t("作成")}</button>
      </div>
    </fieldset>
  </form>;
}
class CreateModal extends Modal {
  private root: Root | null = null;
  private stopLanguage: (() => void) | null = null;
  constructor(private store: DaylightStore, private kind: 'task' | 'project', private day = '', private projectPath = '', private initialStatus: Status = 'todo') { super(store.app); }
  onOpen() {
    this.setTitle(this.kind === 'task' ? t("タスクを追加") : t("プロジェクトを追加"));
    this.stopLanguage = subscribeLanguage(() => { this.setTitle(this.kind === 'task' ? t("タスクを追加") : t("プロジェクトを追加")); });
    this.modalEl.addClass('daylight-event-modal');
    this.root = createRoot(this.contentEl);
    this.root.render(<CreateForm store={this.store} kind={this.kind} day={this.day} projectPath={this.projectPath} initialStatus={this.initialStatus} close={() => this.close()} />);
  }
  onClose() { this.stopLanguage?.(); this.stopLanguage = null; this.root?.unmount(); this.root = null; this.contentEl.empty(); }
}
export function openTaskModal(store: DaylightStore, day: string, projectPath = '', initialStatus: Status = 'todo') { new CreateModal(store,'task',day,projectPath,initialStatus).open(); }
export function openProjectModal(store: DaylightStore) { new CreateModal(store,'project').open(); }
