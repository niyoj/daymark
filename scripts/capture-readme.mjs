// Captures the real plugin with fictional data in the isolated runtime vault.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {makeDemoData} from './demo-data.mjs';
const targets = await (await fetch('http://127.0.0.1:9231/json/list')).json();
const socket = new WebSocket(targets.find(target => target.type === 'page' && target.url === 'app://obsidian.md/index.html').webSocketDebuggerUrl);
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

const {data} = makeDemoData();
let backup;const notes=[];
const settle=()=>evaluate('new Promise(r=>setTimeout(r,180))');
async function capture(name,selector){await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await settle();const params={format:'png'};if(selector)params.clip=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:Math.min(r.height,innerHeight-r.y),scale:1}})()`);const image=await send('Page.captureScreenshot',params);await fs.writeFile('docs/images/'+name+'.png',Buffer.from(image.data,'base64'));}
try{
 assert.equal(await evaluate('app.vault.adapter.basePath'),'/private/tmp/daymark-runtime-vault');
 backup=await evaluate("({data:app.plugins.plugins['niyoj-daymark'].data,enabled:app.plugins.plugins['niyoj-daymark'].exportEnabled,dark:document.body.classList.contains('theme-dark'),size:app.workspace.rightSplit.size})");
 await evaluate(`(()=>{app.setting.close();const p=app.plugins.plugins['niyoj-daymark'];p.exportEnabled=false;p.data=${JSON.stringify(data)};p.emit();app.workspace.leftSplit.collapse();for(const leaf of app.workspace.getLeavesOfType('markdown'))leaf.detach();window.__dmReadme={};})()`);
 await fs.mkdir('docs/images',{recursive:true});await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 for(const view of ['habit-board','weekday-patterns','weekly-consistency','calendar-overview']){
  const title={'habit-board':'My habit board','weekday-patterns':'My weekday patterns','weekly-consistency':'My weekly consistency','calendar-overview':'My calendar overview'}[view];
  const content='```habit-board\nview: '+view+'\n```';
  const note=await evaluate(`(async()=>{const path=${JSON.stringify(title)}+'.md';if(app.vault.getAbstractFileByPath(path))throw Error('Demo note already exists: '+path);await app.vault.create(path,${JSON.stringify(content)});const leaf=__dmReadme.leaf??=app.workspace.getLeaf(true);await leaf.setViewState({type:'markdown',state:{file:path,mode:'preview'},active:true});await app.workspace.revealLeaf(leaf);return path})()`);notes.push(note);
  await evaluate("document.body.classList.remove('theme-light');document.body.classList.add('theme-dark');app.workspace.rightSplit.collapse()");await settle();
  if(view==='habit-board'){
   await evaluate("(async()=>{await app.plugins.plugins['niyoj-daymark'].openToday();app.workspace.rightSplit.setSize(320);})()");await settle();
   await capture('overview');
   await evaluate("document.body.classList.remove('theme-dark');document.body.classList.add('theme-light')");await settle();await capture('overview-light');
   await capture('today','.dm-today');
   await evaluate("app.workspace.rightSplit.collapse()");await settle();await capture('habit-board','.markdown-preview-view .dm-block');
   // Actual editor, with the compact task list and palette of an existing routine.
   await evaluate("(async()=>{await app.plugins.plugins['niyoj-daymark'].openToday();const leaf=app.workspace.getLeavesOfType('daymark-today')[0];await leaf.loadIfDeferred?.();leaf.view.contentEl.querySelector('.dm-routine button').click()})()");await settle();await evaluate("document.querySelector('.dm-editor-task-summary').click()");await settle();await capture('routine-editor','.modal');
   await evaluate("[...document.querySelectorAll('.modal button')].find(b=>b.textContent==='Cancel').click();app.workspace.rightSplit.collapse()");
  }else{
   await evaluate("document.body.classList.remove('theme-dark');document.body.classList.add('theme-light')");await settle();await capture(view,'.markdown-preview-view .dm-block');
  }
 }
 console.log(JSON.stringify({captured:true,images:await fs.readdir('docs/images'),fictionalData:true}));
}finally{
 if(backup)await evaluate(`(async()=>{const p=app.plugins.plugins['niyoj-daymark'];p.data=${JSON.stringify(backup.data)};p.exportEnabled=${backup.enabled};p.emit();__dmReadme?.leaf?.detach();for(const path of ${JSON.stringify(notes)}){const file=app.vault.getAbstractFileByPath(path);if(file)await app.vault.delete(file)}app.workspace.rightSplit.setSize(${backup.size});document.body.classList.remove('theme-light','theme-dark');document.body.classList.add(${JSON.stringify(backup.dark?'theme-dark':'theme-light')});delete window.__dmReadme})()`).catch(console.error);
 await send('Emulation.clearDeviceMetricsOverride').catch(()=>{});socket.close();
}
