import React from 'react';
import {createRoot} from 'react-dom/client';
import {Daylight} from '../../src/Daylight';
import {setLanguage} from '../../src/i18n';
import {dayKey,dateTime,itemSessions,Item} from '../../src/model';
import {recordWorkStatus,pauseWork} from '../../src/execution';
import {taskValues} from '../../src/create';
import {validateEvent} from '../../src/event';

// All data is fictional and held in memory. The product's components and work
// transition helpers are used without writing to an Obsidian vault.
setLanguage('en');
const NativeDate=Date;let clock=new NativeDate('2026-11-13T10:30:00').getTime();
(window as any).Date=class extends NativeDate {
  constructor(...args:any[]){super(0);this.setTime(Reflect.construct(NativeDate,args.length?args:[clock]).getTime());}
  static now(){return clock;}
};
(HTMLElement.prototype as any).addClass=function(...names:string[]){this.classList.add(...names);};
(HTMLElement.prototype as any).empty=function(){this.replaceChildren();};
const scene=new URLSearchParams(location.search).get('scene')??'events';
const at=(time:string)=>dateTime('2026-11-13T'+time+':00')!;
const base={kind:'task',status:'todo',targetDate:'2026-11-13',start:null,end:null,due:null,projectPath:'website.md',projectLabel:'Website launch',archived:false} as Item;
const projects=[['website','Website launch'],['research','Research notes'],['product','Product design']];
let rows:Item[]=projects.map(([id,title])=>({...base,path:id+'.md',title,kind:'project',projectPath:null,status:'on_going'}));
const titles=['Check mobile layout','Review references','Sketch the new dashboard','Polish the landing page','Outline the research brief','Prepare usability tests','Update the screenshots','Summarize reading notes','Review navigation labels'];
for(let index=0;index<(scene==='projects'?9:3);index++){
 const [project,title]=projects[index%3];rows.push({...base,path:'task-'+index+'.md',title:titles[index],projectPath:project+'.md',projectLabel:title,status:scene==='projects'?['todo','on_going','done'][Math.floor(index/3)]: 'todo',completedAt:scene==='projects'&&index>=6?clock:null,sortOrder:(index+1)*10000});
}
rows.push({...base,path:'standup.md',title:'Morning check-in',kind:'event',start:at('09:30'),end:at('10:00')});
const listeners=new Set<()=>void>();let revision=0,id=20;
const emit=()=>{rows=[...rows];revision++;listeners.forEach(fn=>fn());};
const item=(path:string)=>{const result=rows.find(row=>row.path===path);if(!result)throw Error('Demo item not found');return result;};
const work=(target:Item,status?:string,pause=false)=>{
 const fm:any={status:status??target.status,task_start:target.taskStart?new NativeDate(target.taskStart).toISOString():null,task_end:target.taskEnd?new NativeDate(target.taskEnd).toISOString():null,task_sessions:itemSessions(target).map(s=>`${local(s.start)}..${s.end===null?'':local(s.end)}`)};
 if(pause)pauseWork(fm,clock);else recordWorkStatus(fm,target.status,clock);
 target.status=fm.status;target.taskStart=dateTime(fm.task_start);target.taskEnd=dateTime(fm.task_end);
 target.taskSessions=(fm.task_sessions??[]).map((s:string)=>{const [start,end]=s.split('..');return {start:dateTime(start)!,end:end?dateTime(end):null};});
 target.completedAt=dateTime(fm['completed at']);emit();
};
const local=(time:number)=>{const d=new NativeDate(time),pad=(v:number)=>String(v).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;};
const store:any={language:'en',app:{},isReady:()=>true,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn);},snapshot:()=>revision,items:()=>rows,
 createEvent:async(input:any)=>{const valid=validateEvent(input);const project=rows.find(p=>p.path===input.projectPath);const event={...base,path:'event-'+id+++'.md',title:valid.title,kind:'event',status:valid.status,start:dateTime(valid.start),end:dateTime(valid.end),projectPath:project?.path??null,projectLabel:project?.title??''};rows.push(event as Item);emit();return event;},
 createTask:async(input:any)=>{const valid=taskValues(input);const project=rows.find(p=>p.path===input.projectPath);const task={...base,path:'new-task-'+id+++'.md',title:valid.title,status:valid.status,targetDate:input.targetDate,start:dateTime(valid.schedule_start),end:dateTime(valid.schedule_end),projectPath:project?.path??null,projectLabel:project?.title??'',sortOrder:200000};rows.push(task);emit();return task;},
 startTask:async(target:Item)=>work(item(target.path),'on_going'),pauseTask:async(target:Item)=>work(item(target.path),undefined,true),finishTask:async(target:Item)=>work(item(target.path),'done'),setStatus:async(target:Item,status:string)=>work(item(target.path),status),
 notes:async()=>'',loadTask:async(path:string)=>{const target=item(path);return {path,types:{},properties:{tags:['task'],status:target.status,target_date:target.targetDate,task_sessions:itemSessions(target).map(s=>`${local(s.start)}..${s.end===null?'':local(s.end)}`)}};},
};
(window as any).demo={
 caption:(title:string,detail='')=>{document.querySelector('#caption-title')!.textContent=title;document.querySelector('#caption-detail')!.textContent=detail;},
 focus:(region:string)=>{const view=document.querySelector('#camera') as HTMLElement;view.dataset.focus=region;},
 advance:(minutes:number)=>{clock+=minutes*60000;emit();document.querySelector('#demo-clock')!.textContent=`DEMO CLOCK · ${new NativeDate(clock).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})} · SIMULATED`;},
 state:()=>rows.map(({path,title,status,taskSessions,projectPath})=>({path,title,status,taskSessions,projectPath})),
};
createRoot(document.querySelector('#app')!).render(<Daylight store={store} initialDate={dayKey(clock)}/>);
