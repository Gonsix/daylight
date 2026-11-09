import React, { useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Modal, Notice } from 'obsidian';
import { DaylightStore } from './store';
import { EventInput, EventSnapshot, KEEP_PROJECT, validateEvent } from './event';
import { dateTime, isActive, isStatus, STATUS } from './model';
import { submitOnCommandEnter } from './shortcuts';

export function EventForm({ store, seed, close, snapshot }: { store: DaylightStore; seed: EventInput; close: () => void; snapshot?: EventSnapshot }) {
  const [input, setInput] = useState(seed), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saving = useRef(false);
  const projects = store.items().filter(i => i.kind === 'project' && ((!i.archived && isActive(i)) || i.path === seed.projectPath));
  const set = (key: keyof EventInput, value: string) => { setInput(prev => ({ ...prev, [key]: value })); setError(''); };
  const start = dateTime(input.start), end = dateTime(input.end);
  const rangeError = start !== null && end !== null && end <= start ? '終了日時は開始日時より後にしてください。' : '';
  return <form className="daylight-app daylight-composer" onKeyDownCapture={e=>submitOnCommandEnter(e,saving.current||confirmDelete)} onSubmit={async e => {
    e.preventDefault(); if (saving.current||confirmDelete) return;
    try { validateEvent(input); } catch (e) { setError((e as Error).message); return; }
    saving.current = true; setBusy(true); setError('');
    try {
      if (snapshot) await store.updateEvent(snapshot,input); else await store.createEvent(input);
      new Notice(snapshot ? '予定を更新しました。' : '予定を追加しました。'); close();
    }
    catch (e) { setError((e as Error).message); saving.current = false; setBusy(false); }
  }}>
    <fieldset disabled={busy} className="daylight-event-fields">
    <label className="daylight-form-field daylight-title-field"><span>タイトル</span><input autoFocus required maxLength={120} value={input.title} onChange={e => set('title',e.target.value)} placeholder="予定のタイトル" /></label>
    <div className="daylight-form-times">
      <label className="daylight-form-field"><span>開始</span><input type="datetime-local" required step={60} value={input.start} onChange={e => set('start',e.target.value)} /></label>
      <label className="daylight-form-field"><span>終了</span><input type="datetime-local" required step={60} value={input.end} onChange={e => set('end',e.target.value)} /></label>
    </div>
    {rangeError && <p className="daylight-error" role="alert">{rangeError}</p>}
    <div className="daylight-form-times">
      <label className="daylight-form-field"><span>プロジェクト</span><select value={input.projectPath} onChange={e => set('projectPath',e.target.value)}><option value="">未設定</option>
        {seed.projectPath === KEEP_PROJECT && <option value={KEEP_PROJECT}>{snapshot?.projectLabel || '現在の設定'}</option>}
        {seed.projectPath && seed.projectPath !== KEEP_PROJECT && !projects.some(p => p.path === seed.projectPath) && <option value={seed.projectPath}>{snapshot?.projectLabel || seed.projectPath}</option>}
        {projects.map(p => <option key={p.path} value={p.path}>{p.title}</option>)}</select></label>
      <label className="daylight-form-field"><span>状態</span><select value={input.status} onChange={e => set('status',e.target.value)}>
        {!isStatus(input.status) && <option value={input.status}>{input.status || '未設定'}</option>}
        {Object.entries(STATUS).map(([value,state]) => <option key={value} value={value}>{state.label}</option>)}</select></label>
    </div>
    {snapshot?.notes && <div className="daylight-existing-notes">{snapshot.notes}</div>}
    <label className="daylight-form-field"><span>{snapshot ? 'メモを追記' : 'メモ'}</span><textarea rows={3} value={input.memo} onChange={e => set('memo',e.target.value)} /></label>
    {error && <p className="daylight-error" role="alert">{error}</p>}
    {confirmDelete && <div className="daylight-delete-confirm" role="alert"><p>予定ノートをゴミ箱に移します。</p><button type="button" onClick={() => setConfirmDelete(false)}>戻る</button><button type="button" className="daylight-delete" onClick={async () => {
      if (!snapshot || saving.current) return;
      saving.current=true;setBusy(true);setError('');
      try { await store.deleteEvent(snapshot);new Notice('予定をゴミ箱に移しました。');close(); }
      catch (e) { setError((e as Error).message);saving.current=false;setBusy(false); }
    }}>削除する</button></div>}
    <div className="daylight-form-actions">
      {snapshot && !confirmDelete && <button className="daylight-delete daylight-delete-start" type="button" onClick={() => setConfirmDelete(true)}>削除</button>}
      <button type="button" disabled={busy} onClick={close}>キャンセル</button><button className="daylight-create" type="submit" aria-keyshortcuts="Meta+Enter" title="⌘ Enter" disabled={busy || !!rangeError || confirmDelete}>{busy ? '処理中…' : snapshot ? '保存' : '作成'}</button>
    </div>
    </fieldset>
  </form>;
}

class EventModal extends Modal {
  private root: Root | null = null;
  constructor(private store: DaylightStore, private seed?: EventInput, private path?: string) { super(store.app); }
  async onOpen() {
    this.setTitle(this.path ? '予定を編集' : '予定を追加'); this.modalEl.addClass('daylight-event-modal');
    this.root = createRoot(this.contentEl);
    if (this.path) {
      this.root.render(<p className="daylight-event-loading">読み込み中…</p>);
      try {
        const snapshot = await this.store.loadEvent(this.path);
        this.root?.render(<EventForm store={this.store} seed={snapshot.input} snapshot={snapshot} close={() => this.close()} />);
      } catch (e) { this.root?.render(<div className="daylight-app daylight-composer"><p className="daylight-error" role="alert">{(e as Error).message}</p><button onClick={() => this.close()}>閉じる</button></div>); }
    } else if (this.seed) this.root.render(<EventForm store={this.store} seed={this.seed} close={() => this.close()} />);
  }
  onClose() { this.root?.unmount(); this.root = null; this.contentEl.empty(); }
}
export function openEventModal(store: DaylightStore, range: { start: string; end: string }, projectPath = '') {
  new EventModal(store, { ...range, projectPath, title: '', status: 'todo', memo: '' }).open();
}
export function openEditEventModal(store: DaylightStore, path: string) { new EventModal(store, undefined, path).open(); }
