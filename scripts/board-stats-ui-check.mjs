// Real-Obsidian regression: lifetime stats, responsive grid, and corrected history.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {emptyData,createRoutine,localDate,addDays,dateRange,dueTasks,toggleCheckin,setFreeze} from '../src/domain.ts';
import {lifetimeRoutineStats,routineStatValues,ROUTINE_STAT_LABELS} from '../src/routine-stats.ts';
const targets = await (await fetch('http://127.0.0.1:9231/json/list')).json();
const socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let sequence = 0;
const pending = new Map();
socket.onmessage = event => {
  const response = JSON.parse(event.data), request = pending.get(response.id);
  if (request) { pending.delete(response.id); response.error ? request.reject(response.error) : request.resolve(response.result); }
};
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result.value;
}

const today=localDate(),daily=[0,1,2,3,4,5,6];
let fixture=createRoutine(emptyData(),{name:'Daily practice',color:'#249c03',tasks:[{name:'Read a chapter',weekdays:daily}]},addDays(today,-50));
fixture=createRoutine(fixture,{name:'Selected weekdays',color:'#249cff',tasks:[{name:'Review notes',weekdays:[1,3,5]}]},addDays(today,-20));
fixture=createRoutine(fixture,{name:'Protected streak',color:'#329999',tasks:[{name:'Take a walk',weekdays:daily}]},addDays(today,-4));
fixture=createRoutine(fixture,{name:'A new routine with no history',color:'#a64ca6',tasks:[{name:'Start small',weekdays:daily}]},today);
for(const date of dateRange(addDays(today,-50),addDays(today,-9)))fixture=toggleCheckin(fixture,fixture.routines[0].tasks[0].id,date,today);
let occurrences=0;for(const date of dateRange(addDays(today,-20),addDays(today,-1))){const tasks=dueTasks(fixture,fixture.routines[1].id,date);if(tasks.length&&occurrences++%2===0)fixture=toggleCheckin(fixture,tasks[0].id,date,today);}
for(const offset of [-4,-2,-1])fixture=toggleCheckin(fixture,fixture.routines[2].tasks[0].id,addDays(today,offset),today);
fixture=setFreeze(fixture,fixture.routines[2].id,addDays(today,-3),true,today);
let backup,note;const results=[];
const settle=()=>evaluate('new Promise(r=>setTimeout(r,150))');
async function key(key,code,windowsVirtualKeyCode){for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode});await settle();}
async function verifyStats(){
 const data=await evaluate("app.plugins.plugins['niyoj-daymark'].data");
 const expected=data.routines.map(r=>{const stats=lifetimeRoutineStats(data,r.id,today);return{id:r.id,values:routineStatValues(stats)}});
 await evaluate(`(()=>{const root=__dmBoardStats.root,expected=${JSON.stringify(expected)};for(const r of expected){const row=[...root.querySelectorAll('.dm-board-row[data-routine-id]')].find(e=>e.dataset.routineId===r.id);const values=[...row.querySelectorAll('.dm-board-stat .dm-routine-stat-value')].map(e=>e.textContent);if(JSON.stringify(values)!==JSON.stringify(r.values))throw Error('Incorrect lifetime row '+r.id);if(row.querySelector('.dm-routine-stat-count'))throw Error('Rate counts should not be visible');}const selected=root.querySelector('.dm-board-routine-button[aria-expanded=true]');if(selected){const row=selected.closest('[data-routine-id]'),r=expected.find(r=>r.id===row.dataset.routineId),detail=root.querySelector('.dm-routine-stats-detail');if(detail.hidden)throw Error('Selected stats hidden');if(JSON.stringify([...detail.querySelectorAll('dt')].map(e=>e.textContent))!==JSON.stringify(${JSON.stringify(ROUTINE_STAT_LABELS.map(l=>l[0]))}))throw Error('Exact labels');if(JSON.stringify([...detail.querySelectorAll('.dm-routine-stat-value')].map(e=>e.textContent))!==JSON.stringify(r.values))throw Error('Compact stats differ');if(detail.querySelector('.dm-routine-stat-count'))throw Error('Compact rate must be percentage-only');}})()`);
}
async function capture(name){await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await settle();const clip=await evaluate("(()=>{const r=__dmBoardStats.root.getBoundingClientRect();return{x:r.x,y:Math.max(0,r.y),width:r.width,height:Math.min(r.height,innerHeight-Math.max(0,r.y)),scale:1}})()");const shot=await send('Page.captureScreenshot',{format:'png',clip});await fs.mkdir('docs/images',{recursive:true});await fs.writeFile('docs/images/'+name+'.png',Buffer.from(shot.data,'base64'));}
try{
 assert.equal(await evaluate('app.vault.adapter.basePath'),'/private/tmp/daymark-runtime-vault');
 backup=await evaluate("(async()=>{const p=app.plugins.plugins['niyoj-daymark'];return{data:p.data,enabled:p.exportEnabled,bytes:await app.vault.adapter.read('.obsidian/plugins/niyoj-daymark/data.json'),dark:document.body.classList.contains('theme-dark')}})()");
 await evaluate(`(()=>{const p=app.plugins.plugins['niyoj-daymark'];p.exportEnabled=false;p.data=${JSON.stringify(fixture)};p.emit();app.workspace.rightSplit.collapse();app.workspace.leftSplit.collapse();window.__dmBoardStats={};})()`);
 note=await evaluate(`(async()=>{const path='Routine stats verification '+Date.now()+'.md';await app.vault.create(path,${JSON.stringify('```habit-board\n```')});const leaf=app.workspace.getLeaf(true);await leaf.setViewState({type:'markdown',state:{file:path,mode:'preview'},active:true});await app.workspace.revealLeaf(leaf);__dmBoardStats.leaf=leaf;return path})()`);await settle();
 await evaluate("__dmBoardStats.root=__dmBoardStats.leaf.view.contentEl.querySelector('.markdown-preview-view .dm-block')");
 for(const theme of ['light','dark'])for(const width of [1200,390,320]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await evaluate(`document.body.classList.remove('theme-light','theme-dark');document.body.classList.add('theme-${theme}')`);await settle();
  await evaluate("__dmBoardStats.root.querySelector('.dm-jump-today').click();__dmBoardStats.root.scrollIntoView({block:'start'})");await settle();
  const geometry=await evaluate(`(()=>{const root=__dmBoardStats.root,assert=(v,m)=>{if(!v)throw Error(m)},host=root.querySelector('.dm-board-host'),scroll=root.querySelector('.dm-board-scroll'),r=scroll.getBoundingClientRect(),today=scroll.querySelector('.dm-cell.is-today').getBoundingClientRect();assert(root.dataset.daymarkView==='habit-board','Empty block default');assert(root.querySelectorAll('.dm-date-label').length>=7,'At least seven dates visible');assert(!root.querySelector('select'),'No Rate period selector');assert(scroll.scrollWidth<=scroll.clientWidth+1&&scroll.scrollHeight<=scroll.clientHeight+1,'No internal board scrolling');assert(today.right<=r.right+1&&today.left>=scroll.querySelector('.dm-column-headings .dm-board-label').getBoundingClientRect().right,'Full today column on first layout');const inline=host.classList.contains('has-inline-stats');assert(inline===${width===1200},'Responsive inline mode');if(inline){assert(getComputedStyle(root.querySelector('.dm-routine-stats-heading')).textAlign==='center','Centered Routine stats title');assert(JSON.stringify([...root.querySelectorAll('.dm-board-stat-heading')].map(e=>e.textContent))===JSON.stringify(${JSON.stringify(ROUTINE_STAT_LABELS.map(l=>l[0]))}),'Four labeled columns');for(const row of root.querySelectorAll('.dm-board-row[data-routine-id]')){const box=row.getBoundingClientRect(),date=row.querySelector('.dm-cell').getBoundingClientRect();assert(box.height<=32,'Compact routine rows');for(const cell of row.querySelectorAll('.dm-board-stat')){const s=cell.getBoundingClientRect();assert(s.width<=64,'Compact stats columns');assert(Math.abs(s.y+s.height/2-(date.y+date.height/2))<1,'Stats and dates align by routine');assert(s.right<=r.right+1,'Stats fit pane');}}}else{for(const b of root.querySelectorAll('.dm-board-routine-button'))assert(b.getBoundingClientRect().height>=44,'44px routine targets');assert(root.querySelector('.dm-routine-stats-detail').hidden,'Stats wait for routine selection');}return{inline,columns:root.querySelectorAll('.dm-date-label').length,pane:scroll.clientWidth};})()`);
  await verifyStats();
  if(width===390){
   await evaluate("__dmBoardStats.root.querySelector('.dm-board-routine-button').focus()");await key('Enter','Enter',13);await verifyStats();
   assert.equal(await evaluate("document.activeElement.classList.contains('dm-board-routine-button')"),true);
   await key(' ','Space',32);assert.equal(await evaluate("__dmBoardStats.root.querySelector('.dm-routine-stats-detail').hidden"),true);await key(' ','Space',32);await verifyStats();
   const point=await evaluate("(()=>{const b=__dmBoardStats.root.querySelectorAll('.dm-board-routine-button')[2];b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
   await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();
   assert.equal(await evaluate("__dmBoardStats.root.querySelectorAll('.dm-board-routine-button')[2].getAttribute('aria-expanded')"),'true');await verifyStats();
   await send('Emulation.setTouchEmulationEnabled',{enabled:false});
   await evaluate("__dmBoardStats.root.querySelector('.dm-board-routine-button').click();__dmBoardStats.root.scrollIntoView({block:'start'})");await settle();
  }
  await capture('routine-stats-'+theme+'-'+width);
  // Browsing month boundaries must not change any lifetime values.
  for(let n=0;n<10;n++){await evaluate(`__dmBoardStats.root.querySelector('[aria-label="Previous dates"]').click()`);await settle();await verifyStats();if(await evaluate("__dmBoardStats.root.querySelectorAll('.dm-month-span').length>1"))break;if(n===9)throw Error('Month boundary not reached');}
  await evaluate("__dmBoardStats.root.querySelector('.dm-jump-today').click()");await settle();await verifyStats();
  // Correct an older check-in in a preceding page, then undo it in the same dialog.
  await evaluate(`__dmBoardStats.root.querySelector('[aria-label="Previous dates"]').click()`);await settle();
  const range=await evaluate("__dmBoardStats.root.querySelector('.dm-board-range').textContent");
  await evaluate("(()=>{const cells=__dmBoardStats.root.querySelector('[data-routine-id]').querySelectorAll('.dm-cell'),cell=cells[cells.length-1];__dmBoardStats.date=cell.dataset.date;cell.focus();cell.click()})()");await settle();
  await evaluate("document.querySelector('.dm-cell-details .dm-task').click()");await settle();await verifyStats();
  assert.equal(await evaluate("__dmBoardStats.root.querySelector('.dm-board-range').textContent"),range);
  await evaluate("document.querySelector('.dm-cell-details .dm-task').click()");await settle();await verifyStats();
  await key('Escape','Escape',27);assert.equal(await evaluate("document.activeElement.dataset.date===__dmBoardStats.date"),true);
  await evaluate("__dmBoardStats.root.querySelector('.dm-jump-today').click()");await settle();
  if(width===390){
   await evaluate("__dmBoardStats.root.querySelectorAll('.dm-board-routine-button')[3].click()");await verifyStats();assert.equal(await evaluate("[...__dmBoardStats.root.querySelectorAll('.dm-routine-stats-detail .dm-routine-stat-value')].at(-1).textContent"),'—');
   await evaluate("(()=>{const row=__dmBoardStats.root.querySelectorAll('[data-routine-id]')[3];row.querySelector('.dm-cell.is-today').click()})()");await settle();await evaluate("document.querySelector('.dm-cell-details .dm-task').click()");await settle();await verifyStats();
   assert.equal(await evaluate("[...__dmBoardStats.root.querySelectorAll('.dm-routine-stats-detail .dm-routine-stat-value')].at(-1).textContent"),'100%');
   await evaluate("document.querySelector('.dm-cell-details .dm-task').click()");await settle();await key('Escape','Escape',27);
   await evaluate("__dmBoardStats.root.querySelector('.dm-board-routine-button[aria-expanded=true]').click()");
  }
  results.push({theme,width,...geometry,counts:true,historyIndependent:true,correctionUpdates:true,todayVisible:true,jump:true,keyboardAndTap:width===390});
 }
 console.log(JSON.stringify({passed:true,results,physicalIPhone:false},null,2));
}finally{
 if(backup)await evaluate(`(async()=>{[...document.querySelectorAll('.dm-cell-details button')].find(b=>b.textContent==='Done')?.click();const p=app.plugins.plugins['niyoj-daymark'];p.data=${JSON.stringify(backup.data)};p.exportEnabled=${backup.enabled};p.emit();await app.vault.adapter.write('.obsidian/plugins/niyoj-daymark/data.json',${JSON.stringify(backup.bytes)});__dmBoardStats.leaf?.detach();const f=app.vault.getAbstractFileByPath(${JSON.stringify(note)});if(f)await app.vault.delete(f);document.body.classList.remove('theme-light','theme-dark');document.body.classList.add(${JSON.stringify(backup.dark?'theme-dark':'theme-light')});delete window.__dmBoardStats})()`).catch(console.error);
 await send('Emulation.setTouchEmulationEnabled',{enabled:false}).catch(()=>{});await send('Emulation.clearDeviceMetricsOverride').catch(()=>{});socket.close();
}
