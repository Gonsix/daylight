import { subscribeLanguage, t, useLanguage } from './i18n';
import React, { useRef, useState } from 'preact/compat';
import { createRoot } from 'preact/compat/client';
type Root = ReturnType<typeof createRoot>;
import { Modal, Notice } from 'obsidian';
import { DaylightStore, DeleteSnapshot } from './store';
import { Item } from './model';

export function DeleteNoteForm({ store, item, snapshot, close, onDeleted }: {
  store: DaylightStore; item: Item; snapshot: DeleteSnapshot; close: () => void; onDeleted: () => void;
}) {
  useLanguage();
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const saving = useRef(false);
  return <div className="daylight-app daylight-composer">
    <p>{t("「{0}」のノートをゴミ箱に移します。", item.title)}</p>
    {item.kind === 'project' && <p className="daylight-delete-hint">{t("所属するタスクや予定は削除しません。")}</p>}
    {error && <p className="daylight-error" role="alert">{error}</p>}
    <div className="daylight-form-actions">
      <button type="button" disabled={busy} onClick={close}>{t("キャンセル")}</button>
      <button type="button" className="daylight-delete" disabled={busy} onClick={() => { void (async () => {
        if (saving.current) return;
        saving.current=true;setBusy(true);setError('');
        try { await store.deleteNote(snapshot); new Notice(t("ノートをゴミ箱に移しました。")); close(); onDeleted(); }
        catch (e) { setError((e as Error).message); saving.current=false;setBusy(false); }
      })(); }}>{busy ? t("削除中…") : t("削除する")}</button>
    </div>
  </div>;
}
class DeleteNoteModal extends Modal {
  private root: Root | null = null;
  private stopLanguage: (() => void) | null = null;
  constructor(private store: DaylightStore, private item: Item, private onDeleted: () => void) { super(store.app); }
  async onOpen() {
    this.setTitle(this.item.kind === 'task' ? t("タスクを削除") : t("プロジェクトを削除"));
    this.stopLanguage = subscribeLanguage(() => { this.setTitle(this.item.kind === 'task' ? t("タスクを削除") : t("プロジェクトを削除")); });
    this.modalEl.addClass('daylight-event-modal'); this.root=createRoot(this.contentEl);
    this.root.render(<p className="daylight-event-loading">{t("読み込み中…")}</p>);
    try {
      const snapshot=await this.store.loadDeleteSnapshot(this.item);
      this.root?.render(<DeleteNoteForm store={this.store} item={this.item} snapshot={snapshot} close={() => this.close()} onDeleted={this.onDeleted} />);
    } catch (e) {
      this.root?.render(<div className="daylight-app daylight-composer"><p className="daylight-error" role="alert">{(e as Error).message}</p><button onClick={() => this.close()}>{t("閉じる")}</button></div>);
    }
  }
  onClose() { this.stopLanguage?.(); this.stopLanguage = null; this.root?.unmount(); this.root=null; this.contentEl.empty(); }
}
export function openDeleteNoteModal(store: DaylightStore, item: Item, onDeleted: () => void) { new DeleteNoteModal(store,item,onDeleted).open(); }
