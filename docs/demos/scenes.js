(async()=>{
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let cursor=document.querySelector('#demo-cursor');if(!cursor){cursor=document.createElement('div');cursor.id='demo-cursor';document.body.append(cursor);cursor.style.left='1220px';cursor.style.top='760px';}
  const move=async(el)=>{const r=el.getBoundingClientRect();cursor.style.transition='left .45s ease,top .45s ease';cursor.style.left=`${r.left+r.width/2}px`;cursor.style.top=`${r.top+Math.min(r.height/2,35)}px`;await delay(550);};
  const click=async(el)=>{if(!el)throw Error('Demo control missing');await move(el);cursor.style.background='#c1dfffaa';el.click();await delay(450);cursor.style.background='#95bfe144';};
  const named=(label)=>document.querySelector(`[aria-label="${label}"]`);
  const caption=async(title,detail='')=>{demo.caption(title,detail);await delay(1000);};
  const input=async(el,value,typing=false)=>{await move(el);el.focus();const setter=Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;
    const values=typing?Array.from({length:value.length},(_,i)=>value.slice(0,i+1)):[value];
    for(const text of values){setter.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));await delay(typing?45:180);}await delay(300);};
  const select=async(el,value)=>{await move(el);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));await delay(500);};
  const task=(title)=>[...document.querySelectorAll('.daylight-kanban-card')].find(el=>el.textContent.includes(title));
  const scene=new URLSearchParams(location.search).get('scene');
  if(scene==='events'){
    await caption('Make room for the work that matters.','Create an event directly from your daily timeline.');await delay(1200);
    await click(named('Add event'));
    await caption('Add a title and a time.','The real event form · fictional sample data');
    await input(document.querySelector('[placeholder="Event title"]'),'Design review',true);
    const dates=document.querySelectorAll('.demo-modal input[type="datetime-local"]');
    await input(dates[1],'2026-11-13T12:00');await input(dates[0],'2026-11-13T11:00');
    await select(document.querySelector('.demo-modal select'),'website.md');
    await delay(500);await click(document.querySelector('.demo-modal button[type="submit"]'));
    await caption('Your event now has a place in the day.','11:00–12:00 · Website launch');demo.focus('timeline');
    await delay(3000);demo.focus('full');await delay(1200);
  }else if(scene==='tasks'){
    await caption('From an idea to work in progress.','Add a task, then use its playback controls.');
    await click(named('Add task'));await input(document.querySelector('[placeholder="Task title"]'),'Write the launch brief',true);
    const project=[...document.querySelectorAll('.demo-modal label')].find(el=>el.textContent==='ProjectNot setWebsite launchResearch notesProduct design')?.querySelector('select')??document.querySelectorAll('.demo-modal select')[1];
    await select(project,'website.md');await click(document.querySelector('.demo-modal button[type="submit"]'));
    demo.focus('board');await caption('Press play to start.','The task moves to On going and a work session begins.');
    await click(named('Start: Write the launch brief'));await delay(1200);
    await caption('Drag a card to change its status, too.','Move Check mobile layout into On going.');
    const source=task('Check mobile layout'),target=named('On going tasks');if(!source||!target)throw Error('Drag target missing');
    await move(source);const data=new DataTransfer();source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:data}));await delay(350);
    await move(target);target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data}));await delay(350);
    target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:data}));await delay(900);
    await caption('Two tasks can run at once.','Parallel work is supported.');await delay(1200);
    await caption('25 minutes later…','Simulated demo clock · no real waiting');demo.advance(25);await delay(1200);
    await click(named('Pause work on Write the launch brief'));await caption('Pause for a break.','Session 1 is saved; the task stays On going.');await delay(1200);
    await caption('10 minutes later: resume.','Simulated break · breaks do not count as work');demo.advance(10);await click(named('Resume: Write the launch brief'));
    await caption('A second session starts.','Pause and resume as many times as you need.');await delay(1200);
    await caption('20 more minutes later…','Simulated demo clock · two sessions, 45 minutes of work');demo.advance(20);await delay(1200);
    await click(named('Finish work on Write the launch brief'));await caption('Finished — with both sessions preserved.','Done · 2 sessions · 00:45 total work');await delay(3000);demo.focus('full');await delay(1200);
  }else{
    await caption('Different projects. One busy day.','Nine tasks across Website launch, Research notes, and Product design.');await delay(1800);
    await click([...document.querySelectorAll('.daylight-project-main')].find(el=>el.textContent.includes('Website launch')));
    if(document.querySelectorAll('.daylight-kanban-card').length!==3)throw Error('Project filter failed');
    await caption('Choose a project to focus.','Only the three Website launch tasks remain.');await delay(2000);
    await click([...document.querySelectorAll('.daylight-project-main')].find(el=>el.textContent.includes('Research notes')));
    if(document.querySelectorAll('.daylight-kanban-card').length!==3)throw Error('Second project filter failed');
    await caption('Switch focus in a click.','Now showing the three Research notes tasks.');await delay(2000);
    await click([...document.querySelectorAll('.daylight-project-main')].find(el=>el.textContent.includes('Product design')));
    await caption('Keep the rest out of the way.','Product design · three tasks');await delay(2000);
    await click(document.querySelector('.daylight-filter-chip'));
    if(document.querySelectorAll('.daylight-kanban-card').length!==9)throw Error('Clearing the filter failed');
    await caption('Clear the filter to see everything again.','All nine tasks are still here.');await delay(2200);
  }
  cursor.style.opacity='0';return {scene,state:demo.state()};
})()
