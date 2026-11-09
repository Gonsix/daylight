import React, { useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Modal, Notice } from 'obsidian';
import { DashboardStore } from './store';
import { ProjectInput, TaskInput, projectValues, taskValues } from './create';
import { isActive, STATUS, Status } from './model';
import { submitOnCommandEnter } from './shortcuts';

export function CreateForm({ store, kind, day = '', projectPath = '', initialStatus = 'todo', close }: {
  store: DashboardStore; kind: 'task' | 'project'; day?: string; projectPath?: string; initialStatus?: Status; close: () => void;
}) {
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
    <label className="vd-form-field"><span>{label}</span><input type={type} step={type === 'datetime-local' ? 60 : undefined}
      value={String((input as unknown as Record<string,string>)[key] ?? '')} onChange={e => set(key,e.target.value)} /></label>;
  return <form className="vd-app vd-composer" onKeyDownCapture={e => submitOnCommandEnter(e,saving.current)} onSubmit={async e => {
    e.preventDefault(); if (saving.current) return;
    try { if (isTask) taskValues(task); else projectValues(project); }
    catch (e) { setError((e as Error).message); return; }
    saving.current = true; setBusy(true); setError('');
    try {
      if (isTask) await store.createTask(task); else await store.createProject(project);
      new Notice(isTask ? 'タスクを追加しました。' : 'プロジェクトを追加しました。'); close();
    } catch (e) { setError((e as Error).message); saving.current = false; setBusy(false); }
  }}>
    <fieldset disabled={busy} className="vd-event-fields">
      <label className="vd-form-field vd-title-field"><span>タイトル</span><input autoFocus required maxLength={120} value={input.title} onChange={e => set('title',e.target.value)} placeholder={isTask ? 'タスクのタイトル' : 'プロジェクト名'} /></label>
      <div className="vd-form-times">
        {isTask && field('targetDate','予定日（空欄で未定）','date')}
        <label className="vd-form-field"><span>状態</span><select value={input.status} onChange={e => set('status',e.target.value)}>
          {Object.entries(STATUS).map(([value,state]) => <option key={value} value={value}>{state.label}</option>)}
        </select></label>
      </div>
      {isTask && <>
        <div className="vd-form-times">{field('start','開始','datetime-local')}{field('end','終了','datetime-local')}</div>
        {field('due','締切','datetime-local')}
        <label className="vd-form-field"><span>プロジェクト</span><select value={task.projectPath} onChange={e => set('projectPath',e.target.value)}>
          <option value="">未設定</option>{projects.map(i => <option key={i.path} value={i.path}>{i.title}</option>)}
        </select></label>
      </>}
      <label className="vd-form-field"><span>{isTask ? '親タスク' : '親プロジェクト'}</span><select value={input.parentPath} onChange={e => set('parentPath',e.target.value)}>
        <option value="">未設定</option>{parents.map(i => <option key={i.path} value={i.path}>{i.title}</option>)}
      </select></label>
      {!isTask && <>
        {field('workingFolder','作業場所')}
        <label className="vd-form-field"><span>ゴール</span><textarea rows={3} value={project.goal} onChange={e => set('goal',e.target.value)} /></label>
      </>}
      <label className="vd-form-field"><span>メモ</span><textarea rows={3} value={input.memo} onChange={e => set('memo',e.target.value)} /></label>
      {error && <p className="vd-error" role="alert">{error}</p>}
      <div className="vd-form-actions"><button type="button" onClick={close}>キャンセル</button>
        <button className="vd-create" type="submit" aria-keyshortcuts="Meta+Enter" title="⌘ Enter" disabled={busy}>{busy ? '作成中…' : '作成'}</button>
      </div>
    </fieldset>
  </form>;
}
class CreateModal extends Modal {
  private root: Root | null = null;
  constructor(private store: DashboardStore, private kind: 'task' | 'project', private day = '', private projectPath = '', private initialStatus: Status = 'todo') { super(store.app); }
  onOpen() {
    this.setTitle(this.kind === 'task' ? 'タスクを追加' : 'プロジェクトを追加');
    this.modalEl.addClass('vd-event-modal');
    this.root = createRoot(this.contentEl);
    this.root.render(<CreateForm store={this.store} kind={this.kind} day={this.day} projectPath={this.projectPath} initialStatus={this.initialStatus} close={() => this.close()} />);
  }
  onClose() { this.root?.unmount(); this.root = null; this.contentEl.empty(); }
}
export function openTaskModal(store: DashboardStore, day: string, projectPath = '', initialStatus: Status = 'todo') { new CreateModal(store,'task',day,projectPath,initialStatus).open(); }
export function openProjectModal(store: DashboardStore) { new CreateModal(store,'project').open(); }
