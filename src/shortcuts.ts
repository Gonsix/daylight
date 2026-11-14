import type { KeyboardEvent } from 'react';

// Keep the legacy WebKit composition fallback behind a narrow compatibility contract.
function isImeComposition(event: { nativeEvent: { isComposing: boolean }; keyCode?: number }): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

/** Submit through the normal form path so validation and save guards still apply. */
export function submitOnCommandEnter(event:KeyboardEvent<HTMLFormElement>,blocked=false):void {
  if(!event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!['Enter','Return'].includes(event.key)
    ||isImeComposition(event)||event.repeat||event.defaultPrevented)return;
  event.preventDefault();event.stopPropagation();
  if(blocked)return;
  const submit=event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]');
  if(!submit||submit.disabled||submit.matches(':disabled'))return;
  event.currentTarget.requestSubmit(submit);
}

export function confirmRangeOnEnter(event:KeyboardEvent<HTMLDivElement>,confirm:()=>void,blocked=false):void {
  if(blocked||!['Enter','Return'].includes(event.key)||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey
    ||isImeComposition(event)||event.repeat||event.defaultPrevented)return;
  const target=event.target as Element;
  if(target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .daylight-range-cancel, .daylight-slot'))return;
  event.preventDefault();event.stopPropagation();confirm();
}
