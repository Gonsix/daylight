import React, { useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Modal, Notice } from 'obsidian';
import { DashboardStore, DeleteSnapshot } from './store';
import { Item } from './model';

export function DeleteNoteForm({ store, item, snapshot, close, onDeleted }: {
  store: DashboardStore; item: Item; snapshot: DeleteSnapshot; close: () => void; onDeleted: () => void;
}) {
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const saving = useRef(false);
  return <div className="vd-app vd-composer">
    <p>「{item.title}」のノートをゴミ箱に移します。</p>
    {item.kind === 'project' && <p className="vd-delete-hint">所属するタスクや予定は削除しません。</p>}
    {error && <p className="vd-error" role="alert">{error}</p>}
    <div className="vd-form-actions">
      <button type="button" disabled={busy} onClick={close}>キャンセル</button>
      <button type="button" className="vd-delete" disabled={busy} onClick={async () => {
        if (saving.current) return;
        saving.current=true;setBusy(true);setError('');
        try { await store.deleteNote(snapshot); new Notice('ノートをゴミ箱に移しました。'); close(); onDeleted(); }
        catch (e) { setError((e as Error).message); saving.current=false;setBusy(false); }
      }}>{busy ? '削除中…' : '削除する'}</button>
    </div>
  </div>;
}
class DeleteNoteModal extends Modal {
  private root: Root | null = null;
  constructor(private store: DashboardStore, private item: Item, private onDeleted: () => void) { super(store.app); }
  async onOpen() {
    this.setTitle(this.item.kind === 'task' ? 'タスクを削除' : 'プロジェクトを削除');
    this.modalEl.addClass('vd-event-modal'); this.root=createRoot(this.contentEl);
    this.root.render(<p className="vd-event-loading">読み込み中…</p>);
    try {
      const snapshot=await this.store.loadDeleteSnapshot(this.item);
      this.root?.render(<DeleteNoteForm store={this.store} item={this.item} snapshot={snapshot} close={() => this.close()} onDeleted={this.onDeleted} />);
    } catch (e) {
      this.root?.render(<div className="vd-app vd-composer"><p className="vd-error" role="alert">{(e as Error).message}</p><button onClick={() => this.close()}>閉じる</button></div>);
    }
  }
  onClose() { this.root?.unmount(); this.root=null; this.contentEl.empty(); }
}
export function openDeleteNoteModal(store: DashboardStore, item: Item, onDeleted: () => void) { new DeleteNoteModal(store,item,onDeleted).open(); }
