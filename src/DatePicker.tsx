import React, { useEffect, useMemo, useRef, useState } from 'react';
import { dayKey, dayStart, hasSchedule, Item, monthDays, moveDay, moveMonth } from './model';

const weekdays = ['月', '火', '水', '木', '金', '土', '日'];
function Chevron({ right = false }: { right?: boolean }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={right ? 'm10 6 6 6-6 6' : 'm14 6-6 6 6 6'} /></svg>;
}

export function DatePicker({ day, today, items, onChange }: { day: string; today: string; items: Item[]; onChange: (date: string | null) => void }) {
  const [open, setOpen] = useState(false), [month, setMonth] = useState(day), [focused, setFocused] = useState(day);
  const host = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const cells = useMemo(() => monthDays(month), [month]);
  const counts = useMemo(() => new Map(cells.map(date => {
    const start = dayStart(date), end = dayStart(moveDay(date, 1));
    return [date, items.filter(i => i.kind !== 'project' && (i.targetDate === date || (hasSchedule(i) && i.start! < end && i.end! > start))).length];
  })), [cells, items]);
  const choose = (date: string | null) => { onChange(date); setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const doc = host.current!.ownerDocument;
    const outside = (e: PointerEvent) => { if (!e.composedPath().includes(host.current!)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    const blur = (e: FocusEvent) => { if (e.target instanceof doc.defaultView!.Node && !host.current?.contains(e.target)) setOpen(false); };
    doc.addEventListener('pointerdown', outside, true); doc.addEventListener('keydown', escape, true); doc.addEventListener('focusin', blur);
    return () => { doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('keydown', escape, true); doc.removeEventListener('focusin', blur); };
  }, [open]);
  useEffect(() => {
    if (open) popup.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus();
  }, [open, focused]);
  const year = Number(month.slice(0, 4)), monthIndex = Number(month.slice(5, 7));
  const thisYear = Number(today.slice(0,4));
  const years = Array.from(new Set([...Array.from({ length: 101 }, (_, i) => thisYear - 50 + i), year])).sort((a,b) => a-b);
  const changeMonth = (value: string) => { setMonth(value); setFocused(value.slice(0,7) + '-01'); };
  return <div className="daylight-datepicker" ref={host}>
    <button className="daylight-date" ref={trigger} aria-label="日付を選択" aria-haspopup="dialog" aria-expanded={open} onClick={() => {
      if (!open) { setMonth(day); setFocused(day); } setOpen(!open);
    }}>
      <span>{new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' }).format(dayStart(day))}</span>
      <span className="daylight-weekday">{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(dayStart(day))}</span>
    </button>
    {open && <div className="daylight-calendar-popover" ref={popup} role="dialog" aria-label="日付を選択" aria-modal="false">
      <div className="daylight-calendar-head">
        <button className="daylight-icon-button" aria-label="前の月" onClick={() => changeMonth(moveMonth(month.slice(0,7) + '-01', -1))}><Chevron /></button>
        <div className="daylight-calendar-month">
          <select aria-label="年" value={year} onChange={e => changeMonth(`${e.target.value}-${String(monthIndex).padStart(2,'0')}-01`)}>{years.map(y => <option key={y} value={y}>{y}年</option>)}</select>
          <select aria-label="月" value={monthIndex} onChange={e => changeMonth(`${year}-${e.target.value.padStart(2,'0')}-01`)}>{Array.from({length:12},(_,i) => <option key={i} value={i+1}>{i+1}月</option>)}</select>
        </div>
        <button className="daylight-icon-button" aria-label="次の月" onClick={() => changeMonth(moveMonth(month.slice(0,7) + '-01', 1))}><Chevron right /></button>
      </div>
      <div className="daylight-calendar-grid" role="grid" aria-label={`${year}年${monthIndex}月`}>
        <div role="row" className="daylight-calendar-weekdays">{weekdays.map(w => <span role="columnheader" key={w}>{w}</span>)}</div>
        {Array.from({length:6},(_,week) => <div className="daylight-calendar-week" role="row" key={week}>
          {cells.slice(week*7,week*7+7).map(date => {
            const count = counts.get(date) ?? 0;
            return <button key={date} type="button" role="gridcell" data-day={date} aria-selected={date===day} aria-current={date===today ? 'date' : undefined}
              aria-label={`${Number(date.slice(0,4))}年${Number(date.slice(5,7))}月${Number(date.slice(8))}日${count ? `・${count}件` : ''}`}
              tabIndex={date===focused ? 0 : -1}
              className={`daylight-calendar-day${date.slice(0,7)!==month.slice(0,7) ? ' is-outside' : ''}${date===today ? ' is-today' : ''}${date===day ? ' is-selected' : ''}`}
              onClick={() => choose(date)} onFocus={() => setFocused(date)}
              onKeyDown={e => {
                let next: string | null = null;
                if (e.key==='ArrowLeft') next=moveDay(date,-1);
                if (e.key==='ArrowRight') next=moveDay(date,1);
                if (e.key==='ArrowUp') next=moveDay(date,-7);
                if (e.key==='ArrowDown') next=moveDay(date,7);
                if (e.key==='Home') next=cells[week*7];
                if (e.key==='End') next=cells[week*7+6];
                if (e.key==='PageUp') next=moveMonth(date,-1);
                if (e.key==='PageDown') next=moveMonth(date,1);
                if (next) { e.preventDefault(); setMonth(next); setFocused(next); }
              }}>
              <span>{Number(date.slice(8))}</span><span className="daylight-calendar-dots" aria-hidden="true">{Array.from({length:Math.min(3,count)},(_,i)=><i key={i} />)}</span>
            </button>;
          })}
        </div>)}
      </div>
      <div className="daylight-calendar-shortcuts"><button onClick={() => choose(moveDay(today,-1))}>昨日</button><button onClick={() => choose(null)}>今日</button><button onClick={() => choose(moveDay(today,1))}>明日</button></div>
    </div>}
  </div>;
}
