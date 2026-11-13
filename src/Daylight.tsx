import React, { CSSProperties, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Notice } from 'obsidian';
import { DaylightStore } from './store';
import { DatePicker } from './DatePicker';
import { TimeSelection } from './TimeSelection';
import { openEditEventModal, openEventModal } from './EventModal';
import { rangeDateTimes } from './event';
import { openTaskModal, openProjectModal } from './CreateModal';
import { workDuration } from './execution';
import { openDeleteNoteModal } from './DeleteNoteModal';
import { Kanban, kanbanTasks } from './Kanban';
import { TaskProperties } from './TaskProperties';
import { submitOnCommandEnter } from './shortcuts';
import { centeredScrollTop, dayKey, dayStart, formatDuration, hasSchedule, isActive, isStatus, Item, itemSessions, moveDay, STATUS, TaskTab, timeline, timeLabel } from './model';

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    left: <path d="m14 6-6 6 6 6" />,
    right: <path d="m10 6 6 6-6 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    open: <><path d="M14 3h7v7M21 3l-9 9" /><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /></>,
    task: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="m8 12 3 3 5-6" /></>,
    event: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 10h18" /></>,
    project: <path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.task}</svg>;
}
const stateColor = (item: Item) => ({ '--daylight-state': isStatus(item.status) ? STATUS[item.status].color : '#94a3b8' } as CSSProperties);
function StatusSelect({ item, store }: { item: Item; store: DaylightStore }) {
  const [busy, setBusy] = useState(false);
  return <select className="daylight-status" style={stateColor(item)} aria-label={`${item.title}の状態`} value={item.status} disabled={busy}
    onClick={e => e.stopPropagation()} onChange={async e => {
      const next = e.target.value; setBusy(true);
      try { await store.setStatus(item, next); } catch (e) { new Notice((e as Error).message); }
      finally { setBusy(false); }
    }}>
    {!isStatus(item.status) && <option value={item.status}>{item.status || '未設定'}</option>}
    {Object.entries(STATUS).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
  </select>;
}
function Timeline({ items, day, now, store, onSelect, projectPath }: { items: Item[]; day: string; now: number; store: DaylightStore; onSelect: (path: string, event?: React.MouseEvent) => void; projectPath: string }) {
  const slots = useMemo(() => timeline(items, day, now), [items, day, now]);
  const firstHour = 0;
  const lastHour = 24;
  const start = firstHour * 60, total = (lastHour - firstHour) * 60;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroll = scroller.current;
    if (!scroll) return;
    const win = scroll.ownerDocument.defaultView!;
    let positioned = false, frame: number | null = null;
    const observer = new win.ResizeObserver(() => schedule());
    const position = () => {
      frame = null;
      const events = scroll.querySelector<HTMLElement>('.daylight-events');
      // Hearth can mount this view while hidden. Wait until it has a real viewport.
      if (positioned || !events || scroll.clientHeight === 0 || events.offsetHeight === 0) return;
      const current = Date.now(), isToday = day === dayKey(current);
      const target = isToday ? (current - dayStart(day)) / 60000 : slots.length ? slots[0].start : 9 * 60;
      const top = scroll.scrollTop + events.getBoundingClientRect().top - scroll.getBoundingClientRect().top - scroll.clientTop;
      const y = top + (target - start) * events.offsetHeight / total;
      scroll.scrollTop = isToday ? centeredScrollTop(y, scroll.clientHeight, scroll.scrollHeight)
        : Math.max(0, Math.min(scroll.scrollHeight - scroll.clientHeight, y - 50));
      positioned = true; observer.disconnect();
    };
    function schedule() { if (!positioned && frame === null) frame = win.requestAnimationFrame(position); }
    observer.observe(scroll); schedule();
    return () => { observer.disconnect(); if (frame !== null) win.cancelAnimationFrame(frame); };
  }, [day, firstHour]);
  const nowMinute = (now - dayStart(day)) / 60000;
  return <section className="daylight-panel daylight-schedule">
    <div className="daylight-section-head"><h2>タイムライン</h2><span className="daylight-count">{slots.length}</span><button className="daylight-icon-button daylight-add-event" aria-label="予定を追加" onClick={() => openEventModal(store,rangeDateTimes(day,{start:540,end:600}),projectPath)}>＋</button></div>
    <div className="daylight-timeline-scroll" ref={scroller}>
      <div className="daylight-timeline" style={{ height: total + 28 }}>
        {Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i).map(hour =>
          <div className="daylight-hour" key={hour} style={{ top: (hour - firstHour) * 60 }}><time>{String(hour).padStart(2, '0')}:00</time><span /></div>)}
        <TimeSelection key={day} day={day} scroller={scroller} onConfirm={range => openEventModal(store,range,projectPath)}>
          {slots.map((slot, idx) => <article key={`${slot.item.path}:${slot.source}:${slot.from}:${idx}`} className={`daylight-slot daylight-slot-${slot.item.kind}${slot.source === 'actual' ? ' daylight-slot-actual' : ''}${slot.running ? ' is-running' : ''}`} style={{
            ...stateColor(slot.item), top: slot.start - start, height: Math.min(total - (slot.start - start), Math.max(slot.source === 'actual' ? 2 : 26, slot.end - slot.start)),
            left: `${slot.column * 100 / slot.columns}%`, width: `calc(${100 / slot.columns}% - 5px)`,
          }} title={`${slot.item.title} · ${slot.source === 'actual' ? '実績' : '予定'} ${timeLabel(slot.from)}–${slot.running ? '実行中' : timeLabel(slot.to)}${slot.item.projectLabel ? ' · ' + slot.item.projectLabel : ''}`} onClick={e => {
            if (!(e.target as Element).closest('button,select,input,textarea')) onSelect(slot.item.path, e);
          }}>
            <button className="daylight-slot-main" onClick={e => onSelect(slot.item.path, e)}>
              <span className="daylight-slot-heading"><Icon name={slot.item.kind} size={13} /><strong>{slot.item.title}</strong></span>
              {slot.end - slot.start >= 42 && <time>{slot.source === 'actual' ? '実績 ' : ''}{timeLabel(slot.from)}–{slot.running ? '実行中' : timeLabel(slot.to)}</time>}
              {slot.end - slot.start >= 76 && slot.item.projectLabel && <span className="daylight-slot-project">{slot.item.projectLabel}</span>}
            </button>
            {slot.end - slot.start >= 104 && <StatusSelect item={slot.item} store={store} />}
          </article>)}
          {day === dayKey(now) && nowMinute >= start && nowMinute <= lastHour * 60 && <div className="daylight-now" style={{ top: nowMinute - start }}><span /></div>}
        </TimeSelection>
        {!slots.length && <span className="daylight-timeline-empty">予定なし</span>}
      </div>
    </div>
  </section>;
}

function Details({ item, store, draft, onDraft, onSaved, onClose, revision, onRetarget }: {
  item: Item; store: DaylightStore; draft: string; onDraft: (text: string) => void;
  onSaved: (text: string) => void; onClose: () => void; revision: number; onRetarget:(path:string)=>void;
}) {
  const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const memoSaving=useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [item.path]);
  useEffect(() => {
    let alive = true;
    store.notes(item.path).then(text => { if (alive) setNotes(text); }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [item.path, revision]);
  return <aside className="daylight-detail" role="dialog" aria-label={item.title}>
    <div className="daylight-detail-actions"><span>{item.kind === 'task' ? 'タスク' : item.kind === 'event' ? '予定' : 'プロジェクト'}</span>
      <button className="daylight-icon-button" aria-label="ノートを開く" onClick={() => void store.open(item.path).catch(e => new Notice(e.message))}><Icon name="open" /></button>
      <button className="daylight-icon-button" aria-label="詳細を閉じる" onClick={onClose}><Icon name="close" /></button>
    </div>
    <h2 tabIndex={-1} ref={heading}>{item.title}</h2>
    {item.kind==='task'?<TaskProperties item={item} store={store} revision={revision} onSaved={onRetarget} actions={<button type="button" className="daylight-detail-delete" onClick={() => openDeleteNoteModal(store,item,onClose)}>削除</button>}/>:<>
    <StatusSelect item={item} store={store} />
    <dl className="daylight-detail-meta">
      {item.projectLabel && <><dt>プロジェクト</dt><dd>{item.projectLabel}</dd></>}
      {item.targetDate && <><dt>予定日</dt><dd>{item.targetDate}</dd></>}
      {item.start !== null && <><dt>開始</dt><dd>{dayKey(item.start)} {timeLabel(item.start)}</dd></>}
      {item.end !== null && <><dt>終了</dt><dd>{dayKey(item.end)} {timeLabel(item.end)}</dd></>}
      {item.due !== null && <><dt>締切</dt><dd>{dayKey(item.due)} {timeLabel(item.due)}</dd></>}
    </dl>
    </>}
    {item.kind === 'task' && itemSessions(item).length > 0 && <div className="daylight-work-sessions">
      <h3>作業セッション</h3>
      <ul>{itemSessions(item).map((s, idx) => <li key={`${s.start}-${idx}`}>
        <span>{dayKey(s.start)} {timeLabel(s.start)} → {s.end != null ? `${dayKey(s.end) === dayKey(s.start) ? '' : `${dayKey(s.end)} `}${timeLabel(s.end)}` : '--:--'}</span>
        {s.end != null && s.end >= s.start && <small>{formatDuration((s.end - s.start) / 60000)}</small>}
      </li>)}</ul>
    </div>}
    {workDuration(item) && <p className="daylight-work-duration">作業時間 {workDuration(item)}</p>}
    <h3>メモ</h3>
    {notes && <div className="daylight-notes">{notes}</div>}
    <form onKeyDownCapture={e=>submitOnCommandEnter(e,memoSaving.current)} onSubmit={async e => {
      e.preventDefault(); if (memoSaving.current || !draft.trim()) return;
      const text = draft; memoSaving.current=true;setBusy(true); setError('');
      try { await store.memo(item.path, text); onSaved(text); setNotes(await store.notes(item.path)); }
      catch (e) { setError((e as Error).message); } finally { memoSaving.current=false;setBusy(false); }
    }}>
      <textarea value={draft} onChange={e => onDraft(e.target.value)} aria-label="メモを追記" placeholder="メモを追記…" rows={4} />
      {error && <p className="daylight-error" role="alert">{error}</p>}
      <div className="daylight-detail-save-actions">{item.kind === 'project' && <button type="button" className="daylight-detail-delete" disabled={busy} onClick={() => openDeleteNoteModal(store,item,onClose)}>削除</button>}<button className="daylight-save" type="submit" aria-keyshortcuts="Meta+Enter" title="⌘ Enter" disabled={busy || !draft.trim()}>{busy ? '保存中…' : '追加'}</button></div>
    </form>
  </aside>;
}

const alwaysReady = () => true;

function Loading() {
  return <div className="daylight-app daylight-is-loading" role="status" aria-live="polite" aria-busy="true">
    <div className="daylight-loading"><span className="daylight-loading-spinner" aria-hidden="true" /><span>読み込み中…</span></div>
  </div>;
}

export function Daylight({ store, initialDate = null }: { store: DaylightStore; initialDate?: string | null }) {
  const readySnapshot = store.isReady ?? alwaysReady;
  const ready = useSyncExternalStore(store.subscribe, readySnapshot, readySnapshot);
  if (!ready) return <Loading />;
  return <PreparedDashboard store={store} initialDate={initialDate} />;
}

function PreparedDashboard({ store, initialDate }: { store: DaylightStore; initialDate: string | null }) {
  const [visible, setVisible] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const win = host.current?.ownerDocument.defaultView;
    if (!win) { setVisible(true); return; }
    let second = 0;
    const first = win.requestAnimationFrame(() => {
      second = win.requestAnimationFrame(() => setVisible(true));
    });
    return () => { win.cancelAnimationFrame(first); if (second) win.cancelAnimationFrame(second); };
  }, []);
  return <div className="daylight-prepared" ref={host}>
    <div className={visible ? '' : 'daylight-pending'} aria-hidden={!visible} inert={!visible}>
      <DaylightDashboard store={store} initialDate={initialDate} />
    </div>
    {!visible && <div className="daylight-loading-overlay"><Loading /></div>}
  </div>;
}

function DaylightDashboard({ store, initialDate = null }: { store: DaylightStore; initialDate?: string | null }) {
  const revision = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const items = useMemo(() => store.items(), [store, revision]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { setNow(Date.now()); }, [revision]);
  const [chosenDay, setDay] = useState<string | null>(initialDate);
  const day = chosenDay ?? dayKey(now);
  const [tab, setTab] = useState<TaskTab>('day'); const [project, setProject] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const root = useRef<HTMLDivElement>(null), focusReturn = useRef<HTMLElement | null>(null);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(id); }, []);
  const select = (path: string, event?: React.MouseEvent) => {
    if (event && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void store.open(path, true).catch(e => new Notice(e.message)); return; }
    if (store.items().find(i => i.path === path)?.kind === 'event') { openEditEventModal(store,path); return; }
    focusReturn.current = root.current?.ownerDocument.activeElement as HTMLElement; setSelected(path);
  };
  const close = () => { setSelected(null); focusReturn.current?.focus(); };
  const scoped = useMemo(() => items.filter(i => !project || i.kind === 'project' || i.projectPath === project), [items, project]);
  const boardTasks = useMemo(() => kanbanTasks(scoped,day,tab),[scoped,day,tab]);
  const projects = items.filter(i => i.kind === 'project' && !i.archived && isActive(i));
  const currentProject = items.find(i => i.path === project);
  const selectedItem = items.find(i => i.path === selected);
  const invalid = scoped.filter(i => i.kind !== 'project' && !hasSchedule(i) && (i.targetDate === day || (i.start !== null && dayKey(i.start) === day)) && (i.kind === 'event' || i.start !== null || i.end !== null));
  return <div className={`daylight-app${selectedItem ? ' daylight-has-detail' : ''}`} ref={root} onKeyDown={e => { if (e.key === 'Escape' && selected) { e.stopPropagation(); close(); } }}>
    <header className="daylight-header">
      <div className="daylight-date-nav"><button className="daylight-icon-button" aria-label="前日" onClick={() => setDay(moveDay(day, -1))}><Icon name="left" /></button>
        <DatePicker day={day} today={dayKey(now)} items={scoped} onChange={setDay} />
        <button className="daylight-icon-button" aria-label="翌日" onClick={() => setDay(moveDay(day, 1))}><Icon name="right" /></button>
      </div>
      <div className="daylight-header-options">{project && <button className="daylight-filter-chip" onClick={() => setProject(null)}>{currentProject?.title ?? 'プロジェクト'}<Icon name="close" size={12} /></button>}
      </div>
    </header>
    <div className="daylight-layout">
      <Timeline items={scoped} day={day} now={now} store={store} onSelect={select} projectPath={project ?? ''} />
      <div className="daylight-side">
        <section className="daylight-panel daylight-tasks">
          <div className="daylight-section-head"><h2>タスク</h2><span className="daylight-count">{boardTasks.length}</span><button className="daylight-icon-button daylight-add-item" aria-label="タスクを追加" title="タスクを追加" onClick={() => openTaskModal(store,tab === 'unscheduled' ? '' : day,project ?? '')}>＋</button></div>
          <div className="daylight-tabs" role="tablist" aria-label="タスクの表示範囲">
            {([['day', '選択日'], ['ongoing', '進行中'], ['unscheduled', '予定日未定'], ['all', 'すべて']] as const).map(([id, label]) =>
              <button role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} key={id} onClick={() => setTab(id)}>{id === 'day' && day === dayKey(now) ? '今日' : label}</button>)}
          </div>
          <Kanban items={boardTasks} allItems={items} store={store} onSelect={select} onAddTask={status=>openTaskModal(store,tab === 'unscheduled' ? '' : day,project ?? '',status)} />
        </section>
        {invalid.length > 0 && <section className="daylight-panel daylight-unscheduled"><div className="daylight-section-head"><h2>日時の確認</h2><span className="daylight-count">{invalid.length}</span></div>
          {invalid.map(i => <button key={i.path} className="daylight-schedule-warning" onClick={e => select(i.path, e)}><Icon name={i.kind} /><span>{i.title}</span></button>)}</section>}
        <section className="daylight-panel daylight-projects"><div className="daylight-section-head"><h2>プロジェクト</h2><span className="daylight-count">{projects.length}</span><button className="daylight-icon-button daylight-add-item" aria-label="プロジェクトを追加" title="プロジェクトを追加" onClick={() => openProjectModal(store)}>＋</button></div>
          <div className="daylight-project-grid">{projects.map(p => {
            const count = items.filter(i => i.kind === 'task' && i.projectPath === p.path && isActive(i)).length;
            return <article className={`daylight-project${project === p.path ? ' is-selected' : ''}`} key={p.path} onClick={e => { if (!(e.target as Element).closest('button,select,input,textarea')) select(p.path, e); }}>
              <button className="daylight-project-main" aria-pressed={project === p.path} onClick={e => { if (e.metaKey || e.ctrlKey) select(p.path, e); else setProject(project === p.path ? null : p.path); }}><Icon name="project" /><strong>{p.title}</strong><span>{count}</span></button>
              <div className="daylight-project-bottom"><StatusSelect item={p} store={store} /><button className="daylight-icon-button" aria-label={`${p.title}の詳細`} onClick={e => select(p.path, e)}><Icon name="open" size={14} /></button></div>
            </article>;
          })}</div>{!projects.length && <p className="daylight-empty">プロジェクトなし</p>}
        </section>
      </div>
    </div>
    {selectedItem && <Details key={selectedItem.path} item={selectedItem} store={store} draft={drafts[selectedItem.path] ?? ''} revision={revision}
      onDraft={text => setDrafts(prev => ({ ...prev, [selectedItem.path]: text }))}
      onSaved={text => setDrafts(prev => prev[selectedItem.path] === text ? { ...prev, [selectedItem.path]: '' } : prev)} onClose={close}
      onRetarget={path=>{const previous=selectedItem.path;setSelected(path);if(path!==previous)setDrafts(prev=>{if(!Object.hasOwn(prev,previous))return prev;const next={...prev,[path]:prev[previous]};delete next[previous];return next;});}} />}
    {selected && !selectedItem && <div className="daylight-error" role="alert">ノートが見つかりません。<button onClick={close}>閉じる</button></div>}
  </div>;
}
