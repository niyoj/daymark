// Verify real Obsidian layout through a dedicated, isolated debug instance.
// Requires /private/tmp/daymark-runtime-vault running with --remote-debugging-port=9231.
import fs from 'node:fs/promises';
const targets = await (await fetch('http://127.0.0.1:9231/json/list')).json();
const socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let sequence = 0;
const pending = new Map();
socket.onmessage = event => {
  const result = JSON.parse(event.data), request = pending.get(result.id);
  if (request) { pending.delete(result.id); result.error ? request.reject(result.error) : request.resolve(result.result); }
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
// Presentation checks are confined to the isolated Obsidian runtime vault.
const frames=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const note = '```habit-board\nview: calendar-overview\n```';
let fixture;
try{
  if(await evaluate('app.vault.getName()')!=='daymark-runtime-vault')throw Error('Isolated runtime vault only');
  fixture=await evaluate(`(async()=>{const path='Calendar style '+Date.now()+'.md';await app.vault.create(path,${JSON.stringify(note)});const leaf=app.workspace.getLeaf(true);await leaf.setViewState({type:'markdown',state:{file:path,mode:'preview'},active:true});await app.workspace.revealLeaf(leaf);app.workspace.rightSplit.collapse();app.workspace.leftSplit.collapse();window.__dmCalendarCheck={leaf};return {path,id:leaf.id}})()`);
  await evaluate(`(async()=>{for(let i=0;i<40;i++){const root=__dmCalendarCheck.leaf.view.contentEl.querySelector('.markdown-preview-view .dm-calendar-view');if(root){__dmCalendarCheck.root=root;return;}await new Promise(r=>setTimeout(r,50));}throw Error('Calendar did not render')})()`);
  const results=[];
  for(const width of [1200,768,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await evaluate('new Promise(r=>setTimeout(r,100))');await frames();
    results.push(await evaluate(`(async()=>{
      const assert=(v,m)=>{if(!v)throw Error(m)},root=__dmCalendarCheck.root;
      root.scrollIntoView({block:'center'});root.querySelector('.dm-jump-today').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      assert(!root.querySelector('.dm-analytics-caption')&&!root.querySelector('.dm-analytics-detail'),'Description and bottom task panel removed');
      const cells=[...root.querySelectorAll('.dm-calendar-cell')];assert(cells.length>=78,'Show at least twelve week columns');
      const first=cells[0].getBoundingClientRect();assert(first.width===27&&first.height===27,'Match Habit Board cell size');
      const full=cells.find(c=>c.getAttribute('aria-label').includes('(100%)'));assert(full&&getComputedStyle(full).backgroundColor==='color(srgb 0.141176 0.611765 0.0117647)','Use Habit Board green at full completion');
      const labels=[...root.querySelectorAll('.dm-calendar-week-label')];assert(labels.every(x=>/^W[1-6]$/.test(x.textContent)),'Week labels are month-relative');
      for(let i=1;i<labels.length;i++){const prev=labels[i-1].parentElement.dataset.month,month=labels[i].parentElement.dataset.month;if(month!==prev)assert(labels[i].textContent==='W1','New month restarts at W1');}
      const grid=root.querySelector('.dm-calendar-grid'),pane=root.querySelector('.dm-calendar-scroll');assert(grid.getBoundingClientRect().width>=pane.clientWidth-4,'Calendar fills available width');
      const column=labels[0].parentElement;assert(labels[0].getBoundingClientRect().top>=column.children[6].getBoundingClientRect().bottom,'Week labels below dates');
      assert(root.querySelectorAll('.dm-calendar-month').length>=3&&root.querySelector('.dm-calendar-week.is-month-start'),'Month separators');
      const freeze=root.querySelector('.dm-calendar-cell.is-frozen');assert(freeze&&freeze.title.includes('freeze'),'Freeze and date/count tooltip retained');freeze.click();
      const selected=freeze.getAttribute('data-date');app.plugins.plugins['niyoj-daymark'].emit();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      assert(root.querySelector('[data-date="'+selected+'"]').getAttribute('aria-pressed')==='true','Per-block selection survives refresh');
      [...document.querySelectorAll('.dm-cell-details button')].find(b=>b.textContent==='Done').click();
      root.querySelector('[aria-label="Previous calendar dates"]').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      assert(!root.querySelector('.dm-calendar-cell.is-today'),'Previous date range shown');assert(!root.querySelector('[aria-label="Next calendar dates"]').disabled,'Can navigate forward');
      root.querySelector('.dm-jump-today').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const scroll=root.querySelector('.dm-calendar-scroll'),today=scroll.querySelector('.dm-calendar-cell.is-today'),r=today.getBoundingClientRect(),v=scroll.getBoundingClientRect();
      assert(r.right<=v.right&&r.left>=scroll.querySelector('.dm-calendar-day-labels').getBoundingClientRect().right,'Jump reveals full today cell');
      return {width:innerWidth,cells:cells.length,size:first.width,green:true,bottomWeekLabels:true,navigation:true,widthFilled:true,monthlyWeekReset:true};
    })()`));
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});
    await evaluate('new Promise(r=>setTimeout(r,180))');
    const rootBounds=await evaluate(`(()=>{const r=__dmCalendarCheck.root.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`);
    const screenshot=await send('Page.captureScreenshot',{format:'png',clip:rootBounds});await fs.mkdir('docs/screenshots',{recursive:true});await fs.writeFile(`docs/screenshots/calendar-updated-${width}.png`,Buffer.from(screenshot.data,'base64'));
  }
  console.log(JSON.stringify({passed:true,results},null,2));
}finally{
  await send('Emulation.clearDeviceMetricsOverride').catch(()=>{});
  if(fixture)await evaluate(`(async()=>{__dmCalendarCheck.leaf.detach();const f=app.vault.getAbstractFileByPath(${JSON.stringify(fixture.path)});if(f)await app.vault.delete(f);delete window.__dmCalendarCheck})()`).catch(console.error);
  socket.close();
}
