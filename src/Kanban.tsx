import type { TargetedMouseEvent, TargetedDragEvent } from 'preact';
import { t, useLanguage } from './i18n';
import React, { useMemo, useRef, useState } from 'preact/compat';
import { Notice, Platform } from 'obsidian';
import { childTasks, canParent } from './hierarchy';
import { isTaskRunning, workDuration } from './execution';
import { DaylightStore } from './store';
import { orderedTasks } from './order';
import { carryovers, completedTasks, dayKey, filterTasks, isStatus, Item, itemSessions, localTimestamp, STATUS, Status, TaskTab, timeLabel } from './model';

const kanbanColor = (status:string) => status === 'todo' ? '#3fb950' : status === 'on_going' ? '#d29922' : status === 'done' ? '#a371f7' : isStatus(status) ? STATUS[status].color : '#94a3b8';

function CompletedIcon() {
  useLanguage();
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" strokeWidth="2" /><path d="m8 12 3 3 6-6" strokeWidth="2.8" /></svg>;
}

export function kanbanTasks(items: Item[], day: string, tab: TaskTab): Item[] {
  const rows = filterTasks(items,day,tab);
  if (tab === 'day') rows.push(...carryovers(items,day).filter(i => i.kind === 'task'),...completedTasks(items,day));
  return [...new Map(rows.map(i => [i.path,i])).values()];
}
export function Kanban({ items, allItems = items, store, onSelect, onAddTask }: { items: Item[]; allItems?: Item[]; store: DaylightStore; onSelect: (path: string, event?: TargetedMouseEvent<HTMLElement>) => void; onAddTask?: (status: Status) => void }) {
  useLanguage();
  const [showOther,setShowOther] = useState(false), [over,setOver] = useState(''), [busy,setBusy] = useState<string | null>(null);
  const [menu,setMenu] = useState<string | null>(null), [query,setQuery] = useState('');
  const dragged = useRef<Item | null>(null), saving = useRef(false);
  const [parentOver,setParentOver] = useState('');
  const [orderOver,setOrderOver] = useState<{path:string;side:'before'|'after'} | null>(null);
  const [draggedCard,setDraggedCard] = useState<{path:string;height:number} | null>(null);
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
  const execute = async (item: Item, action: 'start' | 'pause' | 'finish') => {
    if (saving.current) return;
    saving.current = true; setBusy(item.path);
    try {
      if (action === 'pause') await store.pauseTask(item);
      else if (action === 'finish') await store.finishTask(item);
      else await store.startTask(item);
      setMenu(null);
    }
    catch (e) { new Notice((e as Error).message); }
    finally { saving.current = false; setBusy(null); }
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
  const parentDragOver = (e: TargetedDragEvent<HTMLElement>, target: Item) => {
    if (!dragged.current || !e.dataTransfer) return;
    const rect=e.currentTarget.getBoundingClientRect(), fraction=(e.clientY-rect.top)/rect.height;
    if (dragged.current.status !== target.status && (fraction < 0.25 || fraction > 0.75)) { setParentOver(''); setOrderOver(null); return; }
    if (target.path !== dragged.current.path && (fraction < 0.25 || fraction > 0.75)) {
      e.preventDefault();e.stopPropagation();if (e.dataTransfer) e.dataTransfer.dropEffect='move';setParentOver('');setOver('');
      setOrderOver({path:target.path,side:fraction < 0.25 ? 'before' : 'after'});return;
    }
    setOrderOver(null);
    e.stopPropagation();setOver('');
    if (!saving.current && canParent(allItems,dragged.current.path,target.path)) {
      e.preventDefault();e.dataTransfer.dropEffect='link';setParentOver(target.path);
    } else { e.dataTransfer.dropEffect='none';setParentOver(''); }
  };
  const parentDrop = (e: TargetedDragEvent<HTMLElement>, target: Item) => {
    e.preventDefault();e.stopPropagation();
    const child=dragged.current;dragged.current=null;setDraggedCard(null);setParentOver('');setOver('');
    const placement=orderOver;setOrderOver(null);
    if (child && placement?.path === target.path && child.status === target.status) {
      if (saving.current) return;
      saving.current=true;setBusy(child.path);
      const shown=orderedTasks(visibleItems.filter(i=>i.status===target.status && i.path!==child.path));
      const next=placement.side === 'after' ? shown[shown.findIndex(i=>i.path===target.path)+1] : undefined;
      void store.reorderTask(child,next?.path ?? target.path,next ? 'before' : placement.side).catch(e=>new Notice((e as Error).message)).finally(()=>{saving.current=false;setBusy(null);});
    } else if(child && canParent(allItems,child.path,target.path)) void assignParent(child,target.path);
  };
  return <div className="daylight-kanban-wrap">
    <div className="daylight-kanban-tools"><label className="daylight-kanban-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input type="search" aria-label={t("カンバン内のタスクを検索")} placeholder={t("タスク名・プロジェクトで検索")} value={query} onChange={e => setQuery(e.currentTarget.value)} /></label><button type="button" aria-expanded={showOther} onClick={() => setShowOther(v => !v)}>{showOther ? t("保留・中止を隠す") : t("保留・中止を表示")}{otherCount > 0 ? ` (${otherCount})` : ''}</button></div>
    <div className={`daylight-kanban${Platform?.isPhone ? ' daylight-kanban-phone' : ''}`} aria-label={t("タスクのカンバン")} tabIndex={0}>
      {columns.map(status => {
        const rows = orderedTasks(visibleItems.filter(i => status === 'unknown' ? !isStatus(i.status) : i.status === status));
        const label = isStatus(status) ? STATUS[status].label : t("状態未設定");
        const color = kanbanColor(status);
        return <section key={status} className={`daylight-kanban-column${over === status ? ' is-over' : ''}`} aria-label={t("{0}のタスク", label)}
          style={{'--daylight-state':color}}
          onDragOver={e => { if (dragged.current && isStatus(status) && !saving.current) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect='move'; setOrderOver(null);setParentOver('');setOver(status); } }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { setOver('');setOrderOver(null);setParentOver(''); } }}
          onDrop={e => { e.preventDefault(); const item=dragged.current; dragged.current=null; setDraggedCard(null);setOrderOver(null);setParentOver('');setOver(''); if (item && isStatus(status)) void move(item,status); }}>
          <h3>{label}<span>{rows.length}</span></h3>
          {rows.map(item => {
            const sessions = itemSessions(item), running = isTaskRunning(item), first = sessions[0], latest = sessions[sessions.length - 1];
            const displayStart = first?.start ?? item.taskStart ?? null, displayEnd = latest ? latest.end : (item.taskEnd ?? null);
            const showWorkTimes = ['on_going', 'done'].includes(item.status) || (item.status === 'on_hold' && sessions.length > 0);
            const workTitle = sessions.length > 1
              ? sessions.map((s, idx) => `${idx + 1}. ${dayKey(s.start)} ${timeLabel(s.start)} → ${s.end != null ? `${dayKey(s.end)} ${timeLabel(s.end)}` : t("実行中")}`).join('\n')
              : t("作業開始 {0} ／ 作業終了 {1}", displayStart != null ? `${dayKey(displayStart)} ${timeLabel(displayStart)}` : '未設定', displayEnd != null ? `${dayKey(displayEnd)} ${timeLabel(displayEnd)}` : '未設定');
            return <React.Fragment key={item.path}>
            <div className={`daylight-kanban-insertion${orderOver?.path === item.path && orderOver.side === 'before' ? ' is-active' : ''}`} style={{'--daylight-insertion-height': `${draggedCard?.height ?? 0}px`}} aria-hidden="true" onDragOver={e=>{if(orderOver?.path === item.path && orderOver.side==='before'){e.preventDefault();e.stopPropagation();if (e.dataTransfer) e.dataTransfer.dropEffect='move';}}} onDrop={e=>parentDrop(e,item)}><span>{t("ここに移動")}</span></div>
            <article className={`daylight-kanban-card${parentOver === item.path ? ' is-parent-target' : ''}${draggedCard?.path === item.path ? ' is-dragging' : ''}`} onDragOver={e=>parentDragOver(e,item)} onDrop={e=>{if(dragged.current?.status !== item.status && parentOver !== item.path){setParentOver('');setOrderOver(null);return;} parentDrop(e,item);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setParentOver('');}} draggable={!busy} aria-busy={busy === item.path}
            onClick={e => { if (!(e.target as Element).closest('button,select,input,textarea,label')) onSelect(item.path,e); }}
            onDragStart={e => { if (!e.dataTransfer) return; if ((e.target as Element).closest('button,select')) {e.preventDefault();return;} dragged.current=item; setDraggedCard({path:item.path,height:e.currentTarget.getBoundingClientRect().height}); e.stopPropagation(); e.dataTransfer.effectAllowed='all'; e.dataTransfer.setData('application/x-daylight-task',item.path); }}
            onDragEnd={() => { dragged.current=null;setDraggedCard(null);setOver('');setParentOver('');setOrderOver(null); }}>
            {parentOver === item.path && <span className="daylight-parent-drop-hint">{t("このタスクの子にする")}</span>}
            <div className="daylight-kanban-card-head"><span className={`daylight-kanban-card-state${item.status === 'done' ? ' is-done' : ''}`} aria-hidden="true">{item.status === 'done' && <CompletedIcon />}</span><span className="daylight-kanban-project">{item.projectLabel || t("タスク")}</span>
              {!['done','cancelled'].includes(item.status) && (running ? <>
                <button className="daylight-kanban-action daylight-kanban-pause-button" type="button" disabled={!!busy} aria-label={t("{0}の作業を一時停止", item.title)} title={t("作業を一時停止")} onClick={() => void execute(item, 'pause')}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                </button>
                <button className="daylight-kanban-action daylight-kanban-run-button is-running" type="button" disabled={!!busy} aria-label={t("{0}の作業を終了", item.title)} title={t("作業を終了して完了")} onClick={() => void execute(item, 'finish')}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                </button>
              </> : <>
                <button className="daylight-kanban-action daylight-kanban-run-button" type="button" disabled={!!busy} aria-label={t("{0}の作業を{1}", item.title, sessions.length ? t("再開") : t("開始"))} title={sessions.length ? t("作業を再開") : t("作業を開始")} onClick={() => void execute(item, 'start')}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.8a1 1 0 0 1 1.5-.86l12 7.2a1 1 0 0 1 0 1.72l-12 7.2A1 1 0 0 1 7 19.2Z"/></svg>
                </button>
                {item.status === 'on_going' && <button className="daylight-kanban-action daylight-kanban-run-button is-running" type="button" disabled={!!busy} aria-label={t("{0}の作業を終了", item.title)} title={t("作業を終了して完了")} onClick={() => void execute(item, 'finish')}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                </button>}
              </>)}
              <button className="daylight-kanban-menu-button" type="button" aria-label={t("{0}の操作", item.title)} aria-expanded={menu === item.path} onClick={() => setMenu(menu === item.path ? null : item.path)}>⋯</button>
            </div>
            <button className="daylight-kanban-title" onClick={e => onSelect(item.path,e)}>{item.title}</button>
            {showWorkTimes && <span className="daylight-kanban-work-times" title={workTitle}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg>
              {displayStart != null ? <time dateTime={localTimestamp(displayStart)} aria-label={t("作業開始")}>{timeLabel(displayStart)}</time> : <span aria-label={t("作業開始未設定")}>--:--</span>}
              <span className="daylight-work-arrow" aria-hidden="true">→</span>
              {displayEnd != null ? <time dateTime={localTimestamp(displayEnd)} aria-label={t("作業終了")}>{timeLabel(displayEnd)}</time> : <span aria-label={t("作業終了未設定")}>--:--</span>}
              {sessions.length > 1 && <span className="daylight-work-sessions-count">{t("/ 計")}{sessions.length}{t("回")}</span>}
            </span>}
            {item.due !== null && <span className="daylight-kanban-meta">{t("締切")}{' '}{dayKey(item.due)} {timeLabel(item.due)}</span>}
            {workDuration(item) && <span className="daylight-kanban-meta daylight-work-duration">{t("作業時間")}{' '}{workDuration(item)}</span>}
            {!!children.get(item.path)?.length && <div className="daylight-child-tasks">
              <button type="button" className="daylight-child-toggle" aria-expanded={!collapsed.has(item.path)} onClick={()=>setCollapsed(prev=>{const next=new Set(prev);if(next.has(item.path))next.delete(item.path);else next.add(item.path);return next;})}>{t("サブタスク")}{' '}{children.get(item.path)!.filter(child=>child.status==='done').length}/{children.get(item.path)!.length}<span aria-hidden="true">{collapsed.has(item.path) ? '›' : '⌄'}</span></button>
              {!collapsed.has(item.path) && children.get(item.path)!.map(child=><button key={child.path} type="button" className={`daylight-child-row${parentOver === child.path ? ' is-parent-target' : ''}`} title={`${child.title} · ${isStatus(child.status) ? STATUS[child.status].label : child.status || t("未設定")}`} onClick={e=>onSelect(child.path,e)} onDragOver={e=>parentDragOver(e,child)} onDrop={e=>parentDrop(e,child)}>
                <span className={`daylight-child-status${child.status === 'done' ? ' is-done' : ''}`} style={{'--daylight-child-state':kanbanColor(child.status)}} aria-label={isStatus(child.status) ? STATUS[child.status].label : t("状態未設定")}>{child.status === 'done' && <CompletedIcon />}</span><span className="daylight-child-title">{child.title}</span>
              </button>)}
            </div>}
            {menu === item.path && <div className="daylight-kanban-status-menu" role="group" aria-label={t("{0}の操作", item.title)}>
              <label className="daylight-parent-picker"><span>{t("ステータス")}</span><select aria-label={t("{0}のステータス", item.title)} value={item.status} disabled={!!busy} onChange={e=>{const status=e.currentTarget.value;if(isStatus(status))void move(item,status);}}>
                {!isStatus(item.status) && <option value={item.status}>{item.status || t("未設定")}</option>}
                {Object.entries(STATUS).map(([value,state])=><option key={value} value={value}>{state.label}</option>)}
              </select></label>
              <label className="daylight-parent-picker"><span>{t("プロジェクト")}</span><select aria-label={t("{0}のプロジェクト", item.title)} value={item.projectPath || ''} disabled={!!busy} onChange={e=>void assignProject(item,e.currentTarget.value)}>
                <option value="">{t("未設定")}</option>
                {item.projectPath && !allItems.some(p=>p.kind==='project' && p.path===item.projectPath) && <option value={item.projectPath}>{item.projectLabel || item.projectPath}</option>}
                {allItems.filter(p=>p.kind==='project' && (!p.archived || p.path===item.projectPath)).map(p=><option key={p.path} value={p.path}>{p.title}</option>)}
              </select></label>
              <label className="daylight-parent-picker"><span>{t("親タスク")}</span><select aria-label={t("{0}の親タスク", item.title)} value={item.parentTaskPath || ''} disabled={!!busy} onChange={e=>void assignParent(item,e.currentTarget.value)}>
                <option value="">{t("親なし")}</option>
                {item.parentTaskPath && !allItems.some(p=>p.path===item.parentTaskPath) && <option value={item.parentTaskPath}>{item.parentTaskLabel || item.parentTaskPath}</option>}
                {allItems.filter(p=>p.kind==='task' && canParent(allItems,item.path,p.path)).map(p=><option key={p.path} value={p.path}>{p.title} · {p.targetDate || t("予定日未定")}</option>)}
              </select></label>
            </div>}

          </article>
          <div className={`daylight-kanban-insertion${orderOver?.path === item.path && orderOver.side === 'after' ? ' is-active' : ''}`} style={{'--daylight-insertion-height': `${draggedCard?.height ?? 0}px`}} aria-hidden="true" onDragOver={e=>{if(orderOver?.path === item.path && orderOver.side==='after'){e.preventDefault();e.stopPropagation();if (e.dataTransfer) e.dataTransfer.dropEffect='move';}}} onDrop={e=>parentDrop(e,item)}><span>{t("ここに移動")}</span></div>
          </React.Fragment>;})}
          {!rows.length && <p className="daylight-kanban-empty">{t("タスクなし")}</p>}
          {onAddTask && isStatus(status) && <div className="daylight-kanban-add-zone"><button type="button" className="daylight-kanban-add" aria-label={t("{0}にタスクを追加", label)} onClick={()=>onAddTask(status)}>{t("＋ 追加")}</button></div>}
        </section>;
      })}
    </div>
  </div>;
}
