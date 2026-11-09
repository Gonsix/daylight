import React, { CSSProperties, useMemo, useRef, useState } from 'react';
import { Notice, Platform } from 'obsidian';
import { childTasks, canParent } from './hierarchy';
import { isTaskRunning, workDuration } from './execution';
import { DashboardStore } from './store';
import { carryovers, completedTasks, dayKey, filterTasks, isStatus, Item, localTimestamp, STATUS, Status, TaskTab, timeLabel } from './model';

const kanbanColor = (status:string) => status === 'todo' ? '#3fb950' : status === 'on_going' ? '#d29922' : status === 'done' ? '#a371f7' : isStatus(status) ? STATUS[status].color : '#94a3b8';

function CompletedIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" strokeWidth="2" /><path d="m8 12 3 3 6-6" strokeWidth="2.8" /></svg>;
}

export function kanbanTasks(items: Item[], day: string, tab: TaskTab): Item[] {
  const rows = filterTasks(items,day,tab);
  if (tab === 'day') rows.push(...carryovers(items,day).filter(i => i.kind === 'task'),...completedTasks(items,day));
  return [...new Map(rows.map(i => [i.path,i])).values()];
}
export function Kanban({ items, allItems = items, store, onSelect }: { items: Item[]; allItems?: Item[]; store: DashboardStore; onSelect: (path: string) => void }) {
  const [showOther,setShowOther] = useState(false), [over,setOver] = useState(''), [busy,setBusy] = useState<string | null>(null);
  const [menu,setMenu] = useState<string | null>(null), [query,setQuery] = useState('');
  const dragged = useRef<Item | null>(null), saving = useRef(false);
  const [parentOver,setParentOver] = useState('');
  const [collapsed,setCollapsed] = useState<Set<string>>(() => new Set());
  const children=useMemo(()=>childTasks(allItems),[allItems]);
  const visibleItems = items.filter(i => `${i.title} ${i.projectLabel}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const otherCount = items.filter(i => ['on_hold','cancelled'].includes(i.status)).length;
  const columns: string[] = ['todo','on_going','done',...(showOther ? ['on_hold','cancelled'] : []),...(items.some(i => !isStatus(i.status)) ? ['unknown'] : [])];
  const move = async (item: Item, status: Status) => {
    if (saving.current || item.status === status) return;
    saving.current = true; setBusy(item.path);
    try { await store.setStatus(item,status); setMenu(null); }
    catch (e) { new Notice((e as Error).message); }
    finally { saving.current = false; setBusy(null); }
  };
  const execute = async (item: Item) => {
    if (saving.current) return;
    saving.current=true;setBusy(item.path);
    try { if (isTaskRunning(item)) await store.finishTask(item); else await store.startTask(item);setMenu(null); }
    catch(e) { new Notice((e as Error).message); }
    finally { saving.current=false;setBusy(null); }
  };
  const assignProject = async (item: Item, projectPath: string) => {
    if (saving.current) return;
    saving.current=true;setBusy(item.path);
    try { await store.setTaskProject(item,projectPath);setMenu(null); }
    catch(e) { new Notice((e as Error).message); }
    finally { saving.current=false;setBusy(null); }
  };
  const assignParent = async (item: Item, parentPath: string) => {
    if (saving.current) return;
    saving.current=true;setBusy(item.path);
    try { await store.setParentTask(item,parentPath);setMenu(null); }
    catch(e) { new Notice((e as Error).message); }
    finally {saving.current=false;setBusy(null);}
  };
  const parentDragOver = (e: React.DragEvent, target: Item) => {
    if (!dragged.current) return;
    e.stopPropagation();setOver('');
    if (!saving.current && canParent(allItems,dragged.current.path,target.path)) {
      e.preventDefault();e.dataTransfer.dropEffect='link';setParentOver(target.path);
    } else { e.dataTransfer.dropEffect='none';setParentOver(''); }
  };
  const parentDrop = (e: React.DragEvent, target: Item) => {
    e.preventDefault();e.stopPropagation();
    const child=dragged.current;dragged.current=null;setParentOver('');setOver('');
    if(child && canParent(allItems,child.path,target.path)) void assignParent(child,target.path);
  };
  return <div className="vd-kanban-wrap">
    <div className="vd-kanban-tools"><label className="vd-kanban-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input type="search" aria-label="カンバン内のタスクを検索" placeholder="タスク名・プロジェクトで検索" value={query} onChange={e => setQuery(e.target.value)} /></label><button type="button" aria-expanded={showOther} onClick={() => setShowOther(v => !v)}>{showOther ? '保留・中止を隠す' : '保留・中止を表示'}{otherCount > 0 ? ` (${otherCount})` : ''}</button></div>
    <div className={`vd-kanban${Platform?.isPhone ? ' vd-kanban-phone' : ''}`} aria-label="タスクのカンバン" tabIndex={0}>
      {columns.map(status => {
        const rows = visibleItems.filter(i => status === 'unknown' ? !isStatus(i.status) : i.status === status);
        const label = isStatus(status) ? STATUS[status].label : '状態未設定';
        const color = kanbanColor(status);
        return <section key={status} className={`vd-kanban-column${over === status ? ' is-over' : ''}`} aria-label={`${label}のタスク`}
          style={{'--vd-state':color} as CSSProperties}
          onDragOver={e => { if (dragged.current && isStatus(status) && !saving.current) { e.preventDefault(); e.dataTransfer.dropEffect='move'; setOver(status); } }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(''); }}
          onDrop={e => { e.preventDefault(); const item=dragged.current; dragged.current=null; setOver(''); if (item && isStatus(status)) void move(item,status); }}>
          <h3>{label}<span>{rows.length}</span></h3>
          {rows.map(item => <article key={item.path} className={`vd-kanban-card${parentOver === item.path ? ' is-parent-target' : ''}`} onDragOver={e=>parentDragOver(e,item)} onDrop={e=>parentDrop(e,item)} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setParentOver('');}} draggable={!busy} aria-busy={busy === item.path}
            onDragStart={e => { if ((e.target as Element).closest('button,select')) {e.preventDefault();return;} dragged.current=item; e.stopPropagation(); e.dataTransfer.effectAllowed='all'; e.dataTransfer.setData('application/x-vault-dashboard-task',item.path); }}
            onDragEnd={() => { dragged.current=null;setOver('');setParentOver(''); }}>
            {parentOver === item.path && <span className="vd-parent-drop-hint">このタスクの子にする</span>}
            <div className="vd-kanban-card-head"><span className={`vd-kanban-card-state${item.status === 'done' ? ' is-done' : ''}`} aria-hidden="true">{item.status === 'done' && <CompletedIcon />}</span><span className="vd-kanban-project">{item.projectLabel || 'タスク'}</span>{!['done','cancelled'].includes(item.status) && <button className={`vd-kanban-run-button${isTaskRunning(item) ? ' is-running' : ''}`} type="button" disabled={!!busy} aria-label={`${item.title}の作業を${isTaskRunning(item) ? '終了' : '開始'}`} title={isTaskRunning(item) ? '作業を終了して完了' : '作業を開始'} onClick={() => void execute(item)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{isTaskRunning(item) ? <rect x="6" y="6" width="12" height="12" rx="2"/> : <path d="M7 4.8a1 1 0 0 1 1.5-.86l12 7.2a1 1 0 0 1 0 1.72l-12 7.2A1 1 0 0 1 7 19.2Z"/>}</svg>
            </button>}<button className="vd-kanban-menu-button" type="button" aria-label={`${item.title}の操作`} aria-expanded={menu === item.path} onClick={() => setMenu(menu === item.path ? null : item.path)}>⋯</button></div>
            <button className="vd-kanban-title" onClick={() => onSelect(item.path)}>{item.title}</button>
            {['on_going','done'].includes(item.status) && <span className="vd-kanban-work-times" title={`作業開始 ${item.taskStart != null ? `${dayKey(item.taskStart)} ${timeLabel(item.taskStart)}` : '未設定'} ／ 作業終了 ${item.taskEnd != null ? `${dayKey(item.taskEnd)} ${timeLabel(item.taskEnd)}` : '未設定'}`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg>
              {item.taskStart != null ? <time dateTime={localTimestamp(item.taskStart)} aria-label="作業開始">{timeLabel(item.taskStart)}</time> : <span aria-label="作業開始未設定">--:--</span>}
              <span className="vd-work-arrow" aria-hidden="true">→</span>
              {item.taskEnd != null ? <time dateTime={localTimestamp(item.taskEnd)} aria-label="作業終了">{timeLabel(item.taskEnd)}</time> : <span aria-label="作業終了未設定">--:--</span>}
            </span>}
            {item.due !== null && <span className="vd-kanban-meta">締切 {dayKey(item.due)} {timeLabel(item.due)}</span>}
            {workDuration(item) && <span className="vd-kanban-meta vd-work-duration">作業時間 {workDuration(item)}</span>}
            {!!children.get(item.path)?.length && <div className="vd-child-tasks">
              <button type="button" className="vd-child-toggle" aria-expanded={!collapsed.has(item.path)} onClick={()=>setCollapsed(prev=>{const next=new Set(prev);if(next.has(item.path))next.delete(item.path);else next.add(item.path);return next;})}>サブタスク {children.get(item.path)!.filter(child=>child.status==='done').length}/{children.get(item.path)!.length}<span aria-hidden="true">{collapsed.has(item.path) ? '›' : '⌄'}</span></button>
              {!collapsed.has(item.path) && children.get(item.path)!.map(child=><button key={child.path} type="button" className={`vd-child-row${parentOver === child.path ? ' is-parent-target' : ''}`} title={`${child.title} · ${isStatus(child.status) ? STATUS[child.status].label : child.status || '未設定'}`} onClick={()=>onSelect(child.path)} onDragOver={e=>parentDragOver(e,child)} onDrop={e=>parentDrop(e,child)}>
                <span className={`vd-child-status${child.status === 'done' ? ' is-done' : ''}`} style={{'--vd-child-state':kanbanColor(child.status)} as CSSProperties} aria-label={isStatus(child.status) ? STATUS[child.status].label : '状態未設定'}>{child.status === 'done' && <CompletedIcon />}</span><span className="vd-child-title">{child.title}</span>
              </button>)}
            </div>}
            {menu === item.path && <div className="vd-kanban-status-menu" role="group" aria-label={`${item.title}の操作`}>
              <label className="vd-parent-picker"><span>プロジェクト</span><select aria-label={`${item.title}のプロジェクト`} value={item.projectPath || ''} disabled={!!busy} onChange={e=>void assignProject(item,e.target.value)}>
                <option value="">未設定</option>
                {item.projectPath && !allItems.some(p=>p.kind==='project' && p.path===item.projectPath) && <option value={item.projectPath}>{item.projectLabel || item.projectPath}</option>}
                {allItems.filter(p=>p.kind==='project' && (!p.archived || p.path===item.projectPath)).map(p=><option key={p.path} value={p.path}>{p.title}</option>)}
              </select></label>
              <label className="vd-parent-picker"><span>親タスク</span><select aria-label={`${item.title}の親タスク`} value={item.parentTaskPath || ''} disabled={!!busy} onChange={e=>void assignParent(item,e.target.value)}>
                <option value="">親なし</option>
                {item.parentTaskPath && !allItems.some(p=>p.path===item.parentTaskPath) && <option value={item.parentTaskPath}>{item.parentTaskLabel || item.parentTaskPath}</option>}
                {allItems.filter(p=>p.kind==='task' && canParent(allItems,item.path,p.path)).map(p=><option key={p.path} value={p.path}>{p.title} · {p.targetDate || '予定日未定'}</option>)}
              </select></label>
              <button type="button" disabled={!!busy || item.status === 'on_hold'} onClick={() => void move(item,'on_hold')}>保留にする</button>
              <button type="button" disabled={!!busy || item.status === 'cancelled'} onClick={() => void move(item,'cancelled')}>中止にする</button>
            </div>}

          </article>)}
          {!rows.length && <p className="vd-kanban-empty">タスクなし</p>}
        </section>;
      })}
    </div>
  </div>;
}
