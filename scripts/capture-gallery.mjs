// Captures real Daymark UI; the phone-sized panes are desktop-emulated previews.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {makeDemoData} from './demo-data.mjs';
const targets=await(await fetch('http://127.0.0.1:9231/json/list')).json();
const target=targets.find(t=>t.type==='page'&&t.url==='app://obsidian.md/index.html');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let sequence=0;const pending=new Map();
socket.onmessage=e=>{const response=JSON.parse(e.data),request=pending.get(response.id);if(request){pending.delete(response.id);response.error?request.reject(response.error):request.resolve(response.result);}};
function send(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const reply=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(reply.exceptionDetails)throw Error(reply.exceptionDetails.exception?.description??reply.exceptionDetails.text);return reply.result.value;}
const settle=()=>evaluate('new Promise(r=>setTimeout(r,240))');
const {data,freezeDate}=makeDemoData();
const fence=view=>'```habit-board\nview: '+view+'\n```';
let backup;const notes=[];const folder='Daymark gallery';
async function theme(dark){await evaluate(`document.body.classList.remove('theme-dark','theme-light');document.body.classList.add('${dark?'theme-dark':'theme-light'}')`);await settle();}
async function dataset(value){await evaluate(`(()=>{const p=app.plugins.plugins['niyoj-daymark'];p.data=${JSON.stringify(value)};p.emit();})()`);await settle();}
async function closeDialog(){await evaluate("(()=>{const modal=document.querySelector('.dm-editor,.dm-cell-details');if(modal)[...modal.querySelectorAll('button')].find(b=>b.textContent==='Cancel'||b.textContent==='Done')?.click()})()");await settle();}
async function note(title,content){
  const path=await evaluate(`(async()=>{await __dmGallery.leaf.setViewState({type:'empty'});const path=${JSON.stringify(folder)}+'/'+${JSON.stringify(title)}+'.md';if(app.vault.getAbstractFileByPath(path))throw Error('Gallery note already exists: '+path);await app.vault.create(path,${JSON.stringify(content)});await __dmGallery.leaf.setViewState({type:'markdown',state:{file:path,mode:'preview'},active:true});await app.workspace.revealLeaf(__dmGallery.leaf);return path;})()`);
  notes.push(path);await settle();
}
async function phonePane(startAtBlock=false){
  await evaluate('app.workspace.rightSplit.collapse();app.workspace.leftSplit.collapse()');
  await send('Emulation.setDeviceMetricsOverride',{width:420,height:780,deviceScaleFactor:2.5,mobile:false});await settle();
  const r=await evaluate('(()=>{const r=__dmGallery.leaf.view.contentEl.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width}})()');
  await send('Emulation.setDeviceMetricsOverride',{width:Math.round(420+360-r.width),height:Math.ceil(r.y+720),deviceScaleFactor:2.5,mobile:false});await settle();
  const clip=await evaluate('(()=>{const r=__dmGallery.leaf.view.contentEl.getBoundingClientRect();if(Math.abs(r.width-360)>1)throw Error("Expected 360 CSS-pixel content pane");return{x:r.x,y:r.y,width:360,height:640,scale:1}})()');
  if(startAtBlock){
    const y=await evaluate("__dmGallery.leaf.view.contentEl.querySelector('.markdown-preview-view .dm-block').getBoundingClientRect().y-12");
    await send('Emulation.setDeviceMetricsOverride',{width:Math.round(420+360-r.width),height:Math.ceil(y+720),deviceScaleFactor:2.5,mobile:false});await settle();
    clip.y=y;
  }
  return clip;
}
async function capture(device,name,clip){
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await settle();
  const result=await send('Page.captureScreenshot',{format:'png',fromSurface:true,...(clip?{clip}:{})});
  const png=Buffer.from(result.data,'base64'),[width,height]=device==='desktop'?[1200,800]:[900,1600];
  assert.equal(png.readUInt32BE(16),width,`Capture width: ${name}`);assert.equal(png.readUInt32BE(20),height,`Capture height: ${name}`);assert.ok(png.length<5_000_000);
  const path=`docs/images/gallery/${device}/${name}.png`;await fs.mkdir(`docs/images/gallery/${device}`,{recursive:true});await fs.writeFile(path,png);console.log(JSON.stringify({path,width,height,bytes:png.length}));
}
async function newRoutine(custom=true){
  await evaluate("app.commands.executeCommandById('niyoj-daymark:new-routine')");await settle();
  await evaluate(`(()=>{const root=document.querySelector('.dm-editor'),name=root.querySelector('.dm-editor-name input'),task=root.querySelector('.dm-editor-task-detail input');name.value='Reading time';name.dispatchEvent(new Event('input',{bubbles:true}));task.value='Read ten pages';task.dispatchEvent(new Event('input',{bubbles:true}));if(${custom}){[...root.querySelectorAll('.dm-editor-mode')].find(b=>b.textContent==='Custom days').click();for(const day of ['Sun','Tue','Thu','Sat'])root.querySelector('.dm-weekday[aria-label='+day+']').click();}root.querySelector('.dm-editor-task-detail input').focus()})()`);await settle();
}
try{
  assert.equal(await evaluate('app.vault.adapter.basePath'),'/private/tmp/daymark-runtime-vault');
  backup=await evaluate("(async()=>{const p=app.plugins.plugins['niyoj-daymark'];return{data:p.data,enabled:p.exportEnabled,bytes:await app.vault.adapter.read('.obsidian/plugins/niyoj-daymark/data.json'),dark:document.body.classList.contains('theme-dark'),size:app.workspace.rightSplit.size}})()");
  await evaluate("(()=>{app.setting.close();const p=app.plugins.plugins['niyoj-daymark'];p.exportEnabled=false;app.workspace.rightSplit.collapse();app.workspace.leftSplit.collapse();for(const leaf of app.workspace.getLeavesOfType('daymark-today'))leaf.detach();window.__dmGallery={leaf:app.workspace.getLeaf(true)};})()");
  await evaluate(`(async()=>{const existing=app.vault.getAbstractFileByPath(${JSON.stringify(folder)});if(existing){if(!Array.isArray(existing.children)||existing.children.length)throw Error('Gallery folder is not empty')}else await app.vault.createFolder(${JSON.stringify(folder)});})()`);
  await dataset(data);
  await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});await theme(true);
  await note('Habits, in my notes',fence('habit-board'));
  await evaluate("(async()=>{const right=app.workspace.getRightLeaf(false);if(!right)throw Error('Right sidebar unavailable');__dmGallery.right=right;await right.setViewState({type:'daymark-today',active:true});await app.workspace.revealLeaf(right);app.workspace.rightSplit.expand();app.workspace.rightSplit.setSize(320)})()");await settle();
  await evaluate("(()=>{const r=__dmGallery.right.view.contentEl.getBoundingClientRect();if(!r.width||r.height<innerHeight*.75||r.x<=__dmGallery.leaf.view.contentEl.getBoundingClientRect().x)throw Error('Today must be visible beside the Habit Board')})()");
  await capture('desktop','01-habit-board-and-today');
  await evaluate('app.workspace.rightSplit.collapse()');await theme(false);
  const analyticsDemo={...data,routines:data.routines.slice(0,2)};await dataset(analyticsDemo);
  await note('Weekly review','**By weekday**\n\n'+fence('weekday-patterns')+'\n\n**By week**\n\n'+fence('weekly-consistency'));
  await capture('desktop','02-weekday-and-weekly-patterns');
  await dataset(data);await note('A calendar of progress',fence('calendar-overview')+'\n\nSelect a date to see the routines behind it.');
  await capture('desktop','03-calendar-overview');
  await newRoutine();await capture('desktop','04-create-a-routine');await closeDialog();
  await theme(true);await note('Review and correct a day',fence('habit-board'));await settle();
  await evaluate(`(async()=>{const root=__dmGallery.leaf.view.contentEl.querySelector('.markdown-preview-view .dm-block');for(let i=0;i<12;i++){const cell=root.querySelector('[data-routine-id="${data.routines[0].id}"] [data-date="${freezeDate}"]');if(cell){cell.click();return;}root.querySelector('[aria-label="Previous dates"]').click();await new Promise(r=>setTimeout(r,100));}throw Error('Frozen date not in history');})()`);await settle();
  await capture('desktop','05-check-ins-and-freezes');await closeDialog();
  await theme(false);await dataset(data);
  await evaluate("(async()=>{await __dmGallery.leaf.setViewState({type:'daymark-today',active:true});await app.workspace.revealLeaf(__dmGallery.leaf)})()");await settle();
  await capture('mobile','01-today',await phonePane());
  const two={...data,routines:data.routines.slice(0,2)};await dataset(two);await note('Habit Board',fence('habit-board'));const boardClip=await phonePane(true);
  await evaluate("(()=>{const root=__dmGallery.leaf.view.contentEl.querySelector('.markdown-preview-view .dm-block');root.querySelector('.dm-board-routine-button').click();__dmGallery.leaf.view.contentEl.querySelector('.markdown-preview-view').scrollTop=0})()");await settle();
  await capture('mobile','02-habit-board-and-stats',boardClip);
  await dataset(data);await note('Weekday patterns',fence('weekday-patterns'));await capture('mobile','03-weekday-patterns',await phonePane());
  await theme(true);await note('Calendar overview',fence('calendar-overview')+'\n\nTap a date to inspect its routines and any freeze.');await capture('mobile','04-calendar-overview',await phonePane());
  await theme(false);await send('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:2.5,mobile:false});await settle();await newRoutine(false);
  await evaluate("(()=>{__dmGallery.chrome=[...document.querySelectorAll('.workspace,.status-bar,.titlebar')].map(e=>({element:e,visibility:e.style.visibility}));for(const item of __dmGallery.chrome)item.element.style.visibility='hidden';document.querySelector('.modal-container').style.visibility='visible'})()");
  await capture('mobile','05-create-a-routine');
  await evaluate("for(const item of __dmGallery.chrome)item.element.style.visibility=item.visibility");await closeDialog();
}finally{
  await closeDialog().catch(()=>{});
  if(backup)await evaluate(`(async()=>{const p=app.plugins.plugins['niyoj-daymark'];p.data=${JSON.stringify(backup.data)};p.exportEnabled=${backup.enabled};p.emit();await app.vault.adapter.write('.obsidian/plugins/niyoj-daymark/data.json',${JSON.stringify(backup.bytes)});for(const item of __dmGallery?.chrome??[])item.element.style.visibility=item.visibility;__dmGallery?.leaf?.detach();__dmGallery?.right?.detach();for(const path of ${JSON.stringify(notes)}){const f=app.vault.getAbstractFileByPath(path);if(f)await app.vault.delete(f)}app.workspace.rightSplit.setSize(${backup.size});document.body.classList.remove('theme-dark','theme-light');document.body.classList.add(${JSON.stringify(backup.dark?'theme-dark':'theme-light')});delete window.__dmGallery;})()`).catch(console.error);
  await send('Emulation.clearDeviceMetricsOverride').catch(()=>{});socket.close();
}
