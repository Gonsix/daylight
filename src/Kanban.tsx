import React, { CSSProperties, useRef, useState } from 'react';
import { Notice } from 'obsidian';
import { DashboardStore } from './store';
import { carryovers, completedTasks, dayKey, filterTasks, isStatus, Item, STATUS, Status, TaskTab, timeLabel } from './model';

export function kanbanTasks(items: Item[], day: string, tab: TaskTab): Item[] {
  const rows = filterTasks(items,day,tab);
  if (tab === 'day') rows.push(...carryovers(items,day).filter(i => i.kind === 'task'),...completedTasks(items,day));
  return [...new Map(rows.map(i => [i.path,i])).values()];
}
export function Kanban({ items, store, onSelect }: { items: Item[]; store: DashboardStore; onSelect: (path: string) => void }) {
  const [showOther,setShowOther] = useState(false), [over,setOver] = useState(''), [busy,setBusy] = useState<string | null>(null);
  const [menu,setMenu] = useState<string | null>(null), [query,setQuery] = useState('');
  const dragged = useRef<Item | null>(null), saving = useRef(false);
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
  return <div className="vd-kanban-wrap">
    <div className="vd-kanban-tools"><label className="vd-kanban-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input type="search" aria-label="カンバン内のタスクを検索" placeholder="タスク名・プロジェクトで検索" value={query} onChange={e => setQuery(e.target.value)} /></label><button type="button" aria-expanded={showOther} onClick={() => setShowOther(v => !v)}>{showOther ? '保留・中止を隠す' : '保留・中止を表示'}{otherCount > 0 ? ` (${otherCount})` : ''}</button></div>
    <div className="vd-kanban" aria-label="タスクのカンバン" tabIndex={0}>
      {columns.map(status => {
        const rows = visibleItems.filter(i => status === 'unknown' ? !isStatus(i.status) : i.status === status);
        const label = isStatus(status) ? STATUS[status].label : '状態未設定';
        const color = status === 'todo' ? '#3fb950' : status === 'on_going' ? '#d29922' : status === 'done' ? '#a371f7' : isStatus(status) ? STATUS[status].color : '#94a3b8';
        return <section key={status} className={`vd-kanban-column${over === status ? ' is-over' : ''}`} aria-label={`${label}のタスク`}
          style={{'--vd-state':color} as CSSProperties}
          onDragOver={e => { if (dragged.current && isStatus(status) && !saving.current) { e.preventDefault(); e.dataTransfer.dropEffect='move'; setOver(status); } }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(''); }}
          onDrop={e => { e.preventDefault(); const item=dragged.current; dragged.current=null; setOver(''); if (item && isStatus(status)) void move(item,status); }}>
          <h3>{label}<span>{rows.length}</span></h3>
          {rows.map(item => <article key={item.path} className="vd-kanban-card" draggable={!busy} aria-busy={busy === item.path}
            onDragStart={e => { if ((e.target as Element).closest('select')) {e.preventDefault();return;} dragged.current=item; e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('application/x-vault-dashboard-task',item.path); }}
            onDragEnd={() => { dragged.current=null;setOver(''); }}>
            <div className="vd-kanban-card-head"><span className={`vd-kanban-card-state${item.status === 'done' ? ' is-done' : ''}`} aria-hidden="true">{item.status === 'done' ? '✓' : ''}</span><span className="vd-kanban-project">{item.projectLabel || 'タスク'}</span><button className="vd-kanban-menu-button" type="button" aria-label={`${item.title}の操作`} aria-expanded={menu === item.path} onClick={() => setMenu(menu === item.path ? null : item.path)}>⋯</button></div>
            <button className="vd-kanban-title" onClick={() => onSelect(item.path)}>{item.title}</button>
            {item.targetDate && <span className="vd-kanban-meta">予定 {item.targetDate}</span>}
            {item.due !== null && <span className="vd-kanban-meta">締切 {dayKey(item.due)} {timeLabel(item.due)}</span>}
            {menu === item.path && <select autoFocus aria-label={`${item.title}の状態`} value={item.status} disabled={!!busy} onChange={e => { const next=e.target.value; if(isStatus(next)) void move(item,next); }}>
              {!isStatus(item.status) && <option value={item.status}>{item.status || '未設定'}</option>}
              {Object.entries(STATUS).map(([value,state]) => <option key={value} value={value}>{state.label}</option>)}
            </select>}
          </article>)}
          {!rows.length && <p className="vd-kanban-empty">タスクなし</p>}
        </section>;
      })}
    </div>
  </div>;
}
