import React, { useEffect, useRef, useState } from 'react';
import { adjustRange, RangeAction, rangeDateTimes, selectRange, TIME_STEP, TimeRange } from './event';
import { dayStart, timeLabel } from './model';
import { confirmRangeOnEnter } from './shortcuts';

interface Drag { id: number; action: RangeAction; anchor: number; original: TimeRange; clientY: number; }
export function TimeSelection({ day, scroller, onConfirm, children }: {
  day: string; scroller: React.RefObject<HTMLDivElement | null>;
  onConfirm: (range: { start: string; end: string }) => void; children: React.ReactNode;
}) {
  const layer = useRef<HTMLDivElement>(null), active = useRef<Drag | null>(null);
  const tap = useRef<{ id: number; x: number; y: number } | null>(null);
  const [range, setRange] = useState<TimeRange | null>(null), [dragging, setDragging] = useState(false);
  const current = useRef<TimeRange | null>(null), frame = useRef<number | null>(null);
  const minute = (clientY: number) => {
    const rect = layer.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1440, (clientY - rect.top) * 1440 / rect.height));
  };
  const update = (next: TimeRange) => {
    current.current = next;
    setRange(prev => prev?.start === next.start && prev.end === next.end ? prev : next);
  };
  const stop = () => {
    const drag = active.current; active.current = null; tap.current = null; setDragging(false);
    const win = layer.current?.ownerDocument.defaultView;
    if (frame.current !== null) { win?.cancelAnimationFrame(frame.current); frame.current = null; }
    if (drag && layer.current?.hasPointerCapture(drag.id)) layer.current.releasePointerCapture(drag.id);
  };
  const clear = () => { stop(); current.current = null; setRange(null); };
  const confirm=()=>{
    if(!current.current||active.current)return;
    const times=rangeDateTimes(day,current.current);clear();onConfirm(times);
  };
  const applyPointer = (clientY: number) => {
    const drag = active.current;
    if (drag) update(adjustRange(drag.original, drag.action, drag.anchor, minute(clientY)));
  };
  const autoScroll = () => {
    const drag = active.current, scroll = scroller.current;
    if (!drag || !scroll || !layer.current) { frame.current = null; return; }
    const rect = scroll.getBoundingClientRect(), edge = 36;
    const delta = drag.clientY < rect.top + edge ? -Math.min(12, (rect.top + edge - drag.clientY) / 3)
      : drag.clientY > rect.bottom - edge ? Math.min(12, (drag.clientY - rect.bottom + edge) / 3) : 0;
    if (delta) { scroll.scrollTop += delta; applyPointer(drag.clientY); }
    frame.current = layer.current.ownerDocument.defaultView!.requestAnimationFrame(autoScroll);
  };
  const begin = (e: React.PointerEvent, action: RangeAction) => {
    if (e.button !== 0 || !e.isPrimary || !layer.current) return;
    e.preventDefault(); e.stopPropagation();
    const anchor = minute(e.clientY), original = current.current ?? selectRange(anchor, anchor);
    active.current = { id: e.pointerId, action, anchor, original, clientY: e.clientY };
    if (action === 'create') update(selectRange(anchor, anchor));
    layer.current.setPointerCapture(e.pointerId); setDragging(true);
    if (frame.current === null) frame.current = layer.current.ownerDocument.defaultView!.requestAnimationFrame(autoScroll);
  };
  useEffect(() => {
    if (!range) return;
    const doc = layer.current!.ownerDocument;
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape'&&(active.current||layer.current?.contains(e.target as Node))) { e.preventDefault(); e.stopPropagation(); clear(); } };
    doc.addEventListener('keydown', escape, true);
    return () => doc.removeEventListener('keydown', escape, true);
  }, [range !== null]);
  useEffect(() => () => {
    active.current = null;
    if (frame.current !== null) layer.current?.ownerDocument.defaultView?.cancelAnimationFrame(frame.current);
  }, []);
  const label = range ? `${timeLabel(dayStart(day) + range.start * 60000)}–${range.end === 1440 ? '24:00' : timeLabel(dayStart(day) + range.end * 60000)}` : '';
  return <div className={`vd-events${dragging ? ' is-selecting' : ''}`} ref={layer} style={{ height: 1440 }} tabIndex={-1}
    onKeyDownCapture={e=>confirmRangeOnEnter(e,confirm,!current.current||!!active.current)}
    onPointerDown={e => {
      if ((e.target as Element).closest('.vd-slot, .vd-selection, .vd-selection-tools, button, select')) return;
      if (e.pointerType === 'touch') { tap.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; return; }
      begin(e, 'create');
    }}
    onPointerMove={e => {
      if (tap.current && Math.hypot(e.clientX - tap.current.x, e.clientY - tap.current.y) > 6) tap.current = null;
      if (active.current?.id === e.pointerId) { active.current.clientY = e.clientY; applyPointer(e.clientY); }
    }}
    onPointerUp={e => {
      if (active.current?.id === e.pointerId) { applyPointer(e.clientY); stop(); layer.current?.focus({preventScroll:true}); }
      else if (tap.current?.id === e.pointerId) { const at = minute(e.clientY); update(selectRange(at,at)); tap.current = null; layer.current?.focus({preventScroll:true}); }
    }}
    onPointerCancel={() => { if (active.current) clear(); else tap.current = null; }}
    onLostPointerCapture={e => { if (e.target === e.currentTarget && active.current) clear(); }}>
    {children}
    {range && <>
      <div className="vd-selection" style={{ top: range.start, height: range.end - range.start }} onPointerDown={e => begin(e, 'move')}>
        <button className="vd-range-handle vd-range-start" aria-label="開始時刻を調整" onPointerDown={e => begin(e, 'start')} onKeyDown={e => {
          if (['ArrowUp','ArrowDown'].includes(e.key)) { e.preventDefault(); update(adjustRange(range,'start',0,range.start+(e.key==='ArrowUp'?-TIME_STEP:TIME_STEP))); }
        }} />
        <button className="vd-range-handle vd-range-end" aria-label="終了時刻を調整" onPointerDown={e => begin(e, 'end')} onKeyDown={e => {
          if (['ArrowUp','ArrowDown'].includes(e.key)) { e.preventDefault(); update(adjustRange(range,'end',0,range.end+(e.key==='ArrowUp'?-TIME_STEP:TIME_STEP))); }
        }} />
      </div>
      {!dragging && <div className="vd-selection-tools" style={{ top: range.start >= 42 ? range.start - 38 : range.end + 8 }}>
        <span>{label}</span><button onClick={confirm} aria-keyshortcuts="Enter" title="Enterで予定を追加">予定を追加</button>
        <button className="vd-range-cancel" aria-label="範囲選択をキャンセル" onClick={clear}>×</button>
      </div>}
      {dragging && <span className="vd-selection-time" style={{ top: range.start + 4 }}>{label}</span>}
      <span className="vd-sr-only" role="status" aria-live="polite">{label}</span>
    </>}
  </div>;
}
