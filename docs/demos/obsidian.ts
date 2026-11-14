// Browser-only stand-ins for Obsidian chrome. No vault or network access.
export const Platform = {isPhone:false};
export const parseYaml = JSON.parse;
export const stringifyYaml = JSON.stringify;
export class Notice {
  constructor(message:string) {
    const toast=document.createElement('div');toast.className='demo-toast';toast.textContent=message;
    document.body.append(toast);setTimeout(()=>toast.remove(),2200);
  }
}
export class Modal {
  modalEl:HTMLElement;contentEl:HTMLElement;private overlay:HTMLElement;private heading:HTMLElement;
  constructor(_app:unknown) {
    this.overlay=document.createElement('div');this.overlay.className='demo-backdrop';
    this.modalEl=document.createElement('section');this.modalEl.className='demo-modal';this.modalEl.setAttribute('role','dialog');
    this.heading=document.createElement('h2');this.contentEl=document.createElement('div');
    this.modalEl.append(this.heading,this.contentEl);this.overlay.append(this.modalEl);
  }
  setTitle(value:string){this.heading.textContent=value;this.modalEl.setAttribute('aria-label',value);}
  open(){document.body.append(this.overlay);(this as any).onOpen?.();}
  close(){(this as any).onClose?.();this.overlay.remove();}
}
