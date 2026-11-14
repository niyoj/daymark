// Real Obsidian editor smoke check. Requires isolated daymark-runtime-vault on CDP 9231.
// Never run this against a personal vault; the strict vault-name guard precedes all changes.
import fs from 'node:fs/promises';
const targets = await (await fetch('http://127.0.0.1:9231/json/list')).json();
const target = targets.find(target => target.type === 'page');
if (!target) throw new Error('No Obsidian page on CDP 9231');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let sequence = 0;
const pending = new Map();
socket.onmessage = event => {
  const reply = JSON.parse(event.data), request = pending.get(reply.id);
  if (request) { pending.delete(reply.id); reply.error ? request.reject(reply.error) : request.resolve(reply.result); }
};
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression) {
  return evaluate(`(async()=>{for(let i=0;i<80;i++){if(${expression})return true;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(expression)});})()`);
}
async function screenshot(name) {
  await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const result = await send('Page.captureScreenshot', { format: 'png' });
  await fs.mkdir('docs/screenshots', { recursive: true });
  await fs.writeFile(`docs/screenshots/${name}.png`, Buffer.from(result.data, 'base64'));
}
let guarded = false;
let originalData, originalSettings, originalBytes, dataPath;
const results = [];
try {
  if (await evaluate('app.vault.getName()') !== 'daymark-runtime-vault') throw new Error('Refusing mutation: use isolated daymark-runtime-vault only.');
  guarded = true;
  await evaluate("document.querySelectorAll('.dm-editor-footer .is-quiet').forEach(button=>button.click())");
  await waitFor("!document.querySelector('.dm-editor-form')");
  const initial = await evaluate(`(async()=>{
    const p=app.plugins.plugins['niyoj-daymark'];if(!p)throw Error('Daymark plugin not enabled');
    const path=app.vault.configDir+'/plugins/niyoj-daymark/data.json';
    return {data:p.data,exportEnabled:p.exportEnabled,path,bytes:await app.vault.adapter.read(path).catch(()=>null)};
  })()`);
  originalData = initial.data; originalSettings = initial.exportEnabled; originalBytes = initial.bytes; dataPath = initial.path;
  await evaluate(`(()=>{
    const check=globalThis.__daymarkEditorCheck={};
    check.assert=(ok,message)=>{if(!ok)throw Error(message)};
    check.root=()=>{const root=document.querySelector('.modal-content.dm-editor');check.assert(root,'Editor is open');return root};
    check.click=(selector)=>{const el=check.root().querySelector(selector);check.assert(el,'Missing '+selector);el.click();return el};
    check.text=(text)=>{const button=[...check.root().querySelectorAll('button')].find(button=>button.textContent===text);check.assert(button,'Missing '+text);button.click();};
    check.fill=(selector,text)=>{const input=check.root().querySelector(selector);check.assert(input,'Missing input '+selector);input.focus();input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));};
    check.footer=async()=>{
      const save=check.root().querySelector('button[type="submit"]');save.scrollIntoView({block:'center'});
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const r=save.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      check.assert(r.top>=0&&r.bottom<=innerHeight,'Save button is within viewport');
      check.assert(hit===save||save.contains(hit),'Save button is reachable');
      check.assert(getComputedStyle(check.root().querySelector('.dm-editor-footer')).position==='sticky','Footer is sticky');
      return {top:r.top,bottom:r.bottom,height:r.height};
    };
    check.cancel=()=>check.text('Cancel');
    check.edit=async(name)=>{
      const p=app.plugins.plugins['niyoj-daymark'];await p.openToday();
      const view=app.workspace.getLeavesOfType('daymark-today')[0].view;
      const card=[...view.contentEl.querySelectorAll('.dm-routine')].find(card=>card.querySelector('.dm-routine-name').textContent===name);
      check.assert(card,'Routine is visible in Today view');
      [...card.querySelectorAll('button')].find(button=>button.textContent==='Edit').click();
    };
    app.plugins.plugins['niyoj-daymark'].exportEnabled=false;
  })()`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate("app.commands.executeCommandById('niyoj-daymark:new-routine')");
  await waitFor("document.querySelector('.dm-editor-form')");
  const desktop = await evaluate(`(async()=>{
    const c=__daymarkEditorCheck;
    c.assert(c.root().querySelectorAll('.is-expanded').length===1,'New routine starts one open task');
    c.fill('.dm-editor-name input','UI check routine');c.fill('.is-expanded input','Read');
    c.click('.dm-editor-add');c.assert(document.activeElement.matches('.is-expanded input'),'Add task focuses name');
    c.fill('.is-expanded input','Stretch');
    c.assert(c.root().querySelectorAll('.is-expanded').length===1,'Only one task expanded');
    c.text('Weekdays');c.assert(document.activeElement.textContent==='Weekdays','Preset preserves focus');
    c.text('Custom days');c.assert(c.root().querySelectorAll('.dm-weekday').length===7,'Custom weekdays are visible');
    for(const day of ['Mon','Tue','Wed','Thu'])c.text(day);c.text('Fri');
    c.assert(c.root().querySelectorAll('.dm-weekday[aria-pressed="true"]').length===1,'Cannot clear final weekday');
    c.assert(c.root().querySelector('.dm-editor-error').textContent.includes('at least one'),'Minimum-day feedback');
    c.text('Every day');c.assert(c.root().querySelectorAll('.dm-weekday').length===0,'Presets hide weekday buttons');
    c.click('.dm-editor-color-toggle');const palette=c.root().querySelector('.dm-editor-palette');
    c.assert(!palette.hidden,'Palette expands');palette.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    c.assert(document.activeElement.getAttribute('aria-label')==='Blue','Palette arrow key moves focus');document.activeElement.click();
    c.assert(palette.hidden,'Choosing color closes palette');
    return {singleOpenTask:true,minimumWeekday:true,paletteKeyboard:true,save:await c.footer()};
  })()`);
  await screenshot('editor-desktop');
  await evaluate("__daymarkEditorCheck.root().querySelector('form').requestSubmit()");
  await waitFor("!document.querySelector('.dm-editor-form')");
  await evaluate(`(()=>{const p=app.plugins.plugins['niyoj-daymark'],r=p.data.routines.find(r=>r.name==='UI check routine');__daymarkEditorCheck.assert(r&&r.tasks.length===2&&r.color==='#249cff','Creation persists entered tasks/color');})()`);
  const desktopBeforeCancel = await evaluate("JSON.stringify(app.plugins.plugins['niyoj-daymark'].data)");
  await evaluate("__daymarkEditorCheck.edit('UI check routine')");
  await waitFor("document.querySelector('.dm-editor-form')");
  await evaluate("(()=>{const c=__daymarkEditorCheck;c.click('.dm-editor-task-summary');c.fill('.is-expanded input','Discard edited task');c.click('.dm-editor-add');c.fill('.is-expanded input','Discard added task');c.cancel();})()");
  if (await evaluate("JSON.stringify(app.plugins.plugins['niyoj-daymark'].data)") !== desktopBeforeCancel) throw new Error('Desktop cancel changed task records');
  results.push({desktop,desktopCancelPreservesTasks:true});
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: false });
  await evaluate("__daymarkEditorCheck.edit('UI check routine')");
  await waitFor("document.querySelector('.dm-editor-form')");
  const narrow = await evaluate(`(async()=>{
    const c=__daymarkEditorCheck;c.assert(c.root().querySelectorAll('.is-expanded').length===0,'Existing tasks initially collapsed');
    c.click('.dm-editor-task-summary');c.fill('.is-expanded input','Read ten pages');c.text('Weekdays');
    c.assert(document.activeElement.textContent==='Weekdays','Schedule focus restored');
    c.click('.dm-editor-add');c.assert(document.activeElement.matches('.is-expanded input'),'Narrow Add task focuses name');c.fill('.is-expanded input','Walk');
    const frame=c.root().closest('.modal').getBoundingClientRect();
    c.assert(frame.left>=-1&&frame.right<=innerWidth+1,'Narrow editor fits viewport');
    return {width:innerWidth,singleOpenTask:c.root().querySelectorAll('.is-expanded').length===1,save:await c.footer()};
  })()`);
  await screenshot('editor-narrow');
  await evaluate("__daymarkEditorCheck.root().querySelector('form').requestSubmit()");
  await waitFor("!document.querySelector('.dm-editor-form')");
  await evaluate(`(()=>{const r=app.plugins.plugins['niyoj-daymark'].data.routines.find(r=>r.name==='UI check routine');__daymarkEditorCheck.assert(r.tasks[0].name==='Read ten pages'&&r.tasks[0].weekdays.join(',')==='1,2,3,4,5'&&r.tasks[2].name==='Walk','Edit persists name and weekday preset');})()`);
  const beforeCancel = await evaluate("JSON.stringify(app.plugins.plugins['niyoj-daymark'].data)");
  await evaluate("__daymarkEditorCheck.edit('UI check routine')");
  await waitFor("document.querySelector('.dm-editor-form')");
  await evaluate("(()=>{const c=__daymarkEditorCheck;c.click('.dm-editor-task-summary');c.fill('.is-expanded input','Must not save');c.click('.dm-editor-add');c.fill('.is-expanded input','Never save new task');c.text('Remove task');c.cancel();})()");
  await waitFor("!document.querySelector('.dm-editor-form')");
  if (await evaluate("JSON.stringify(app.plugins.plugins['niyoj-daymark'].data)") !== beforeCancel) throw new Error('Cancel changed persisted data');
  results.push({narrow,cancelPreservesData:true});
  console.log(JSON.stringify({passed:true,results,screenshots:['docs/screenshots/editor-desktop.png','docs/screenshots/editor-narrow.png']},null,2));
} finally {
  if (guarded && await evaluate('app.vault.getName()').catch(()=>null) === 'daymark-runtime-vault') {
    await evaluate("document.querySelector('.dm-editor-footer .is-quiet')?.click()").catch(()=>{});
    if (originalData) {
      await evaluate(`(async()=>{const p=app.plugins.plugins['niyoj-daymark'];p.exportEnabled=false;await p.mutate(()=>(${JSON.stringify(originalData)}));p.exportEnabled=${JSON.stringify(originalSettings)};${originalBytes===null?`await app.vault.adapter.remove(${JSON.stringify(dataPath)}).catch(()=>{});`:`await app.vault.adapter.write(${JSON.stringify(dataPath)},${JSON.stringify(originalBytes)});`}})()`).catch(error=>console.error('Fixture restore failed:',error));
    }
    await evaluate('delete globalThis.__daymarkEditorCheck').catch(()=>{});
  }
  await send('Emulation.clearDeviceMetricsOverride').catch(()=>{});
  socket.close();
}
