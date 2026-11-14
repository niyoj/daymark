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
import { weekdayPatterns, weeklyConsistency } from '../src/analytics.ts';
import { localDate } from '../src/domain.ts';
const fixtures=[];
const frames=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
try{
  if(await evaluate('app.vault.getName()')!=='daymark-runtime-vault')throw Error('Isolated runtime vault only');
  await evaluate('app.workspace.rightSplit.collapse();app.workspace.leftSplit.collapse()');
  const data=await evaluate("app.plugins.plugins['niyoj-daymark'].data"),results=[];
  for(const view of ['weekday-patterns','weekly-consistency']){
    const note='```habit-board\nview: '+view+'\n```';
    const fixture=await evaluate(`(async()=>{const path='Pattern style '+Date.now()+'.md';await app.vault.create(path,${JSON.stringify(note)});const leaf=app.workspace.getLeaf(true);await leaf.setViewState({type:'markdown',state:{file:path,mode:'preview'},active:true});await app.workspace.revealLeaf(leaf);window.__dmPatternCheck={leaf};return {path,id:leaf.id}})()`);fixtures.push(fixture);
    await evaluate(`(async()=>{for(let i=0;i<40;i++){const root=__dmPatternCheck.leaf.view.contentEl.querySelector('.markdown-preview-view .dm-pattern-view');if(root){__dmPatternCheck.root=root;return;}await new Promise(r=>setTimeout(r,50));}throw Error('Pattern view did not render')})()`);
    for(const width of [1200,390]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await evaluate('new Promise(r=>setTimeout(r,100))');await frames();
      await evaluate("__dmPatternCheck.root.querySelector('.dm-jump-today').click()");await frames();
      const range=await evaluate("({start:__dmPatternCheck.root.getAttribute('data-range-start'),end:__dmPatternCheck.root.getAttribute('data-range-end')})");
      const expected=view==='weekday-patterns'?weekdayPatterns(data,range.start,range.end,localDate()):weeklyConsistency(data,range.start,range.end,localDate()).rows;
      const result=await evaluate(`(async()=>{
        const assert=(v,m)=>{if(!v)throw Error(m)},root=__dmPatternCheck.root,expected=${JSON.stringify(expected)};
        assert(!root.querySelector('.dm-analytics-caption')&&!root.querySelector('.dm-analytics-detail'),'No description or bottom detail panel');
        const rows=[...root.querySelectorAll('.dm-pattern-row')].filter(row=>row.querySelector('.dm-pattern-cell'));
        assert(rows.length===expected.length,'One row per routine');
        for(const[i,row]of rows.entries())for(const[j,cell]of [...row.querySelectorAll('.dm-pattern-cell')].entries()){
          const value=expected[i].cells[j],label=cell.getAttribute('aria-label');
          assert(label.includes(value.scheduled?value.completed+' of '+value.scheduled+' completed ('+Math.round(value.rate*100)+'%)':'No scheduled occurrences'),'Exact completion count');
          assert(cell.classList.contains('is-neutral')===(value.rate===null),'Neutral opportunity');assert(cell.textContent==='','Color-only cells');
          const r=cell.getBoundingClientRect();assert(r.width===27&&r.height===27,'27px cells');
        }
        const selected=root.querySelectorAll('.dm-pattern-cell')[2];selected.click();const title=selected.title;
        [...document.querySelectorAll('.dm-cell-details button')].find(b=>b.textContent==='Done').click();
        app.plugins.plugins['niyoj-daymark'].emit();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        assert(root.querySelector('[aria-pressed=true]').title===title,'Selection retained on data refresh');
        const first=root.querySelector('.dm-pattern-cell');first.focus();
        const footer=root.querySelector('.dm-pattern-axes');assert(footer.getBoundingClientRect().top>=rows.at(-1).getBoundingClientRect().bottom,'Labels below cells');
        if(${JSON.stringify(view)}==='weekday-patterns')assert([...root.querySelectorAll('.dm-pattern-axis')].map(x=>x.textContent).join(',')==='Sun,Mon,Tue,Wed,Thu,Fri,Sat','Seven weekday labels');
        else {
          const labels=[...root.querySelectorAll('.dm-pattern-week-label')];
          for(let i=1;i<labels.length;i++)if(labels[i].dataset.month!==labels[i-1].dataset.month)assert(labels[i].textContent==='W1','Month-relative week numbers');
          assert(root.querySelectorAll('.dm-pattern-month').length>=3,'Month bands visible');
          assert(root.querySelector('.dm-pattern-grid').getBoundingClientRect().width>=root.querySelector('.dm-pattern-scroll').clientWidth-4,'Weekly range fills width');
        }
        const before=root.getAttribute('data-range-start');root.querySelector('[aria-label="Previous analytics dates"]').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        assert(root.getAttribute('data-range-start')<before,'Previous page browses history');const oldEnd=root.getAttribute('data-range-end');
        app.plugins.plugins['niyoj-daymark'].emit();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));assert(root.getAttribute('data-range-end')===oldEnd,'Historical range retained');
        root.querySelector('.dm-jump-today').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));assert(root.getAttribute('data-range-start')===before,'Jump restores range');
        root.querySelector('.dm-pattern-cell').focus();
        return {view:${JSON.stringify(view)},width:innerWidth,exactCounts:true,size:27,bottomLabels:true,historyNavigation:true};
      })()`);
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await evaluate("(()=>{const r=__dmPatternCheck.root;if(r.querySelector('.dm-pattern-cell').getAttribute('aria-pressed')!=='true')throw Error('Keyboard activation failed');[...document.querySelectorAll('.dm-cell-details button')].find(b=>b.textContent==='Done').click();r.scrollIntoView({block:'center'})})()");
      await evaluate("__dmPatternCheck.root.querySelector('.dm-jump-today').click()");await frames();
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await evaluate('new Promise(r=>setTimeout(r,160))');
      const clip=await evaluate("(()=>{const r=__dmPatternCheck.root.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()");
      const screenshot=await send('Page.captureScreenshot',{format:'png',clip});await fs.mkdir('docs/screenshots',{recursive:true});await fs.writeFile(`docs/screenshots/${view}-updated-${width}.png`,Buffer.from(screenshot.data,'base64'));results.push(result);
    }
  }
  console.log(JSON.stringify({passed:true,results},null,2));
}finally{
  await send('Emulation.clearDeviceMetricsOverride').catch(()=>{});
  for(const fixture of fixtures)await evaluate(`(async()=>{app.workspace.getLeavesOfType('markdown').find(l=>l.id===${JSON.stringify(fixture.id)})?.detach();const f=app.vault.getAbstractFileByPath(${JSON.stringify(fixture.path)});if(f)await app.vault.delete(f)})()`).catch(console.error);
  await evaluate('delete window.__dmPatternCheck').catch(()=>{});socket.close();
}
