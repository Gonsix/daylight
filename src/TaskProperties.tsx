import { errorMessage, valueText } from './value';
import { t, useLanguage } from './i18n';
import React, { useEffect, useRef, useState } from 'preact/compat';
import { parseYaml, stringifyYaml } from 'obsidian';
import { DaylightStore } from './store';
import { dateValue, isStatus, Item, STATUS } from './model';
import { localDateTime, PROPERTY_LABELS, PropertyChanges, propertyType, TASK_FIELDS, TaskSnapshot } from './task';
import { submitOnCommandEnter } from './shortcuts';

export function TaskProperties({ item, store, revision, onSaved, actions }: { item:Item; store:DaylightStore; revision:number; onSaved:(path:string)=>void; actions?:React.ReactNode }) {
  useLanguage();
  const [snapshot,setSnapshot]=useState<TaskSnapshot|null>(null),[changes,setChanges]=useState<PropertyChanges>({});
  const [types,setTypes]=useState<Record<string,string>>({}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [adding,setAdding]=useState(false),[name,setName]=useState(''),[newType,setNewType]=useState('text');
  const dirty=useRef(false),saving=useRef(false),mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false;},[]);
  const install=(data:TaskSnapshot)=>{setSnapshot(data);setChanges({});setTypes({});dirty.current=false;setError('');};
  useEffect(()=>{
    if(dirty.current||saving.current)return;
    let cancelled=false;
    store.loadTask(item.path).then(data=>{if(!cancelled&&!dirty.current)install(data);}).catch(e=>{if(!cancelled)setError(errorMessage(e));});
    return ()=>{cancelled=true;};
  },[item.path,revision]);
  const change=(key:string,value:unknown)=>{dirty.current=true;setChanges(prev=>({...prev,[key]:value}));setError('');};
  if(!snapshot)return <div className="daylight-task-properties"><p className={error?'daylight-error':'daylight-property-loading'}>{error||t("読み込み中…")}</p></div>;
  const keys=Array.from(new Set([...TASK_FIELDS,...Object.keys(snapshot.properties),...Object.keys(changes)]));
  const value=(key:string)=>Object.hasOwn(changes,key)?changes[key]:snapshot.properties[key]??null;
  const type=(key:string)=>propertyType(key,snapshot.properties[key],types[key]||snapshot.types[key]);
  const links=store.items();
  const field=(key:string)=>{
    const current=value(key),kind=type(key),label=PROPERTY_LABELS[key]||key;
    const text=valueText(current);
    let control:React.ReactNode;
    if(kind==='status')control=<select value={text} aria-label={label} onChange={e=>change(key,e.currentTarget.value)}>
      {!isStatus(text)&&<option value={text}>{text||t("未設定")}</option>}{Object.entries(STATUS).map(([id,s])=><option key={id} value={id}>{s.label}</option>)}</select>;
    else if(kind==='project'||kind==='parent_task') {
      const candidates=links.filter(i=>i.kind===(kind==='project'?'project':'task')&&i.path!==item.path);
      const options=candidates.map(i=>({value:`[[${i.path.replace(/\.md$/,'')}]]`,label:i.title+(kind==='parent_task'?` · ${i.targetDate||t("予定日未定")}`:'')}));
      const originalLabel=kind==='project'&&item.projectLabel?item.projectLabel:text.replace(/^\[\[|\]\]$/g,'');
      control=<select value={text} aria-label={label} onChange={e=>change(key,e.currentTarget.value||null)}><option value="">{t("未設定")}</option>
        {text&&!options.some(o=>o.value===text)&&<option value={text}>{originalLabel||t("現在の設定")}</option>}
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>;
    } else if(kind==='boolean')control=<select value={valueText(current)} aria-label={label} onChange={e=>change(key,e.currentTarget.value===''?null:e.currentTarget.value==='true')}><option value="">{t("未設定")}</option><option value="true">{t("はい")}</option><option value="false">{t("いいえ")}</option></select>;
    else if(kind==='list')control=<textarea rows={2} aria-label={label} placeholder={t("1行に1項目")} value={typeof current==='string'?current:Array.isArray(current)?current.join('\n'):''} onChange={e=>change(key,e.currentTarget.value)} />;
    else if(kind==='yaml')control=<textarea className="daylight-property-yaml" rows={4} aria-label={label} value={typeof current==='string'?current:stringifyYaml(current??{}).trimEnd()} onChange={e=>change(key,e.currentTarget.value)} />;
    else if(kind==='datetime') {
      const local=localDateTime(current);
      control=<input type="datetime-local" step={local.length>16?1:60} aria-label={label} value={local} onChange={e=>change(key,e.currentTarget.value||null)} />;
    } else if(kind==='date')control=<input type="date" aria-label={label} value={dateValue(current)} onChange={e=>change(key,e.currentTarget.value||null)} />;
    else if(kind==='number')control=<input type="number" step="any" aria-label={label} value={text} onChange={e=>change(key,e.currentTarget.value)} />;
    else control=<input type="text" aria-label={label} value={text} onChange={e=>change(key,e.currentTarget.value)} />;
    return <label className="daylight-form-field daylight-property-field" key={key}><span>{label}{kind==='yaml'&&<small>YAML</small>}</span>{control}</label>;
  };
  return <form className="daylight-task-properties" onKeyDownCapture={e=>submitOnCommandEnter(e,saving.current)} onSubmit={e=>{ void (async () => {
    e.preventDefault();if(saving.current)return;
    const patch:PropertyChanges={...changes};
    try {
      for(const key of Object.keys(patch)) {
        const kind=type(key),raw=patch[key];
        if(kind==='number'&&typeof raw==='string') {if(raw.trim()==='')patch[key]=null;else {const n=Number(raw);if(!Number.isFinite(n))throw new Error(t("{0}は数値を入力してください。", PROPERTY_LABELS[key]||key));patch[key]=n;}}
        if(kind==='list'&&typeof raw==='string')patch[key]=raw.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
        if(kind==='yaml'&&typeof raw==='string')patch[key]=parseYaml(raw)??null;
      }
    } catch(e){setError((e as Error).message);return;}
    saving.current=true;setBusy(true);setError('');let saved=false;
    try {
      const file=await store.updateTask(snapshot,patch);saved=true;
      const refreshed=await store.loadTask(file.path);
      if(mounted.current)install(refreshed);onSaved(file.path);
    } catch(e){if(mounted.current)setError(saved?t("保存済みです。詳細を開き直してください。"):(e as Error).message.replaceAll(t("再読み込みしてください。"),t("詳細を開き直してください。")));}
    finally {saving.current=false;if(mounted.current)setBusy(false);}
  })(); }}>
    <div className="daylight-property-header"><h3>{t("プロパティ")}</h3></div>
    <fieldset disabled={busy} className="daylight-event-fields">
      {TASK_FIELDS.map(field)}
      <div className="daylight-extra-properties">{keys.filter(k=>!TASK_FIELDS.includes(k)).map(field)}</div>
      {adding?<div className="daylight-new-property">
        <input autoFocus aria-label={t("新しいプロパティ名")} placeholder={t("プロパティ名")} value={name} onChange={e=>setName(e.currentTarget.value)} />
        <select aria-label={t("新しいプロパティの種類")} value={newType} onChange={e=>setNewType(e.currentTarget.value)}>{[['text',t("テキスト")],['number',t("数値")],['boolean',t("チェック")],['date',t("日付")],['datetime',t("日時")],['list',t("リスト")],['yaml',t("構造化データ")]].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
        <button type="button" onClick={()=>{const key=name.trim();if(!key||keys.includes(key)||/[\r\n\0]/.test(key)){setError(t("重複しないプロパティ名を入力してください。"));return;}setTypes(prev=>({...prev,[key]:newType==='boolean'?'checkbox':newType}));change(key,newType==='yaml'?{}:newType==='list'?[]:null);setAdding(false);setName('');}}>{t("追加")}</button>
        <button type="button" onClick={()=>setAdding(false)}>×</button>
      </div>:<button type="button" className="daylight-add-property" onClick={()=>setAdding(true)}>{t("＋ プロパティ")}</button>}
      {error&&<p className="daylight-error" role="alert">{error}</p>}
      <div className="daylight-detail-save-actions">{actions}<button type="submit" className="daylight-save" aria-keyshortcuts="Meta+Enter" title="⌘ Enter" disabled={busy||!Object.keys(changes).length}>{busy?t("保存中…"):t("保存")}</button></div>
    </fieldset>
  </form>;
}
