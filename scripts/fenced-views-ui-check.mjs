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
const fence=view=>'```habit-board\n'+(view?'view: '+view+'\n':'')+'```';
const fixtures=[];
const frames=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
async function openNote(content,blocks){
  const file=await evaluate(`(async()=>{const path='Fenced views '+Date.now()+'.md';await app.vault.create(path,${JSON.stringify(content)});const leaf=app.workspace.getLeaf(true);await leaf.setViewState({type:'markdown',state:{file:path,mode:'preview'},active:true});await app.workspace.revealLeaf(leaf);window.__dmFenceCheck={leaf,path};return {path,id:leaf.id}})()`);
  fixtures.push(file);
  await evaluate(`(async()=>{for(let i=0;i<30;i++){const root=__dmFenceCheck.leaf.view.contentEl.querySelector('.markdown-preview-view');if(root?.querySelectorAll('.dm-block').length>=${blocks}){__dmFenceCheck.root=root;return;}if(root)root.scrollTop=i%2?0:root.scrollHeight;await new Promise(r=>setTimeout(r,200));}throw Error('Blocks did not render')})()`);
  await frames();
}
try{
  if(await evaluate('app.vault.getName()')!=='daymark-runtime-vault')throw Error('Use isolated runtime vault only.');
  await evaluate('app.workspace.rightSplit.collapse();app.workspace.leftSplit.collapse()');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false});
  await openNote(['# My own heading','Personal text before the block.',fence('invalid-view'),fence(),'## My weekly heading',fence('weekly-consistency'),'Text after all views.'].join('\n\n'),3);
  const independent=await evaluate(`(async()=>{
    const assert=(v,m)=>{if(!v)throw Error(m)},root=__dmFenceCheck.root;
    const a=root.querySelector('[data-daymark-view="weekday-patterns"]'),b=root.querySelector('[data-daymark-view="weekly-consistency"]');
    assert(a&&b,'Empty block renders weekday and explicit option renders weekly');
    assert(!root.querySelector('.dm-analytics-tabs'),'No view-switch navigation');
    assert(!app.workspace.getLeavesOfType('daymark-analytics').length&&!app.commands.commands['niyoj-daymark:open-analytics'],'Standalone Analytics is absent');
    const source=await app.vault.read(app.vault.getAbstractFileByPath(__dmFenceCheck.path));assert(source.includes('Personal text before the block.')&&source.includes('Text after all views.'),'Author text preserved');
    const dismiss=()=>[...document.querySelectorAll('.dm-cell-details button')].find(b=>b.textContent==='Done').click();
    a.querySelectorAll('.dm-analytics-cell')[2].click();dismiss();b.querySelectorAll('.dm-analytics-cell')[3].click();dismiss();
    const textA=a.querySelector('[aria-pressed=true]').title,textB=b.querySelector('[aria-pressed=true]').title;
    a.querySelector('.dm-analytics-scroll').scrollLeft=40;b.querySelector('.dm-analytics-scroll').scrollLeft=90;const scrollA=a.querySelector('.dm-analytics-scroll').scrollLeft;
    app.plugins.plugins['niyoj-daymark'].emit();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    assert(a.querySelector('[aria-pressed=true]').title===textA&&b.querySelector('[aria-pressed=true]').title===textB,'Independent selections survive refresh');
    assert(a.querySelector('.dm-analytics-scroll').scrollLeft===scrollA&&b.querySelector('.dm-analytics-scroll').scrollLeft===90,'Independent scroll survives refresh');
    assert(a.querySelectorAll('[aria-pressed=true]').length===1&&b.querySelectorAll('[aria-pressed=true]').length===1,'One selected cell per block');
    assert([...b.querySelectorAll('.dm-analytics-cell')].every(x=>!x.textContent),'Weekly cells have no numbers');
    const msg=root.querySelector('[role=alert]').textContent;for(const v of ['weekday-patterns','weekly-consistency','calendar-overview','habit-board'])assert(msg.includes(v),'Available view message');
    return {emptyBlock:'weekday-patterns',independentSelections:true,independentScroll:true,invalidViewMessage:true,noStandalonePage:true};
  })()`);
  await openNote(fence('calendar-overview'),1);
  await evaluate(`(()=>{const root=__dmFenceCheck.root,c=root.querySelector('.dm-analytics-cell.is-frozen');if(!c)throw Error('Missing calendar freeze');c.click();if(!c.title.includes('freeze'))throw Error('Missing calendar freeze tooltip');if(root.querySelector('.dm-analytics-detail'))throw Error('Calendar must not show bottom task viewer');[...document.querySelectorAll('.dm-cell-details button')].find(b=>b.textContent==='Done').click()})()`);
  await send('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
  await openNote('# My habit history\n\n'+fence('habit-board'),1);
  const widths=[];
  for(const width of [1200,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await frames();
    widths.push(await evaluate(`(async()=>{
      const assert=(v,m)=>{if(!v)throw Error(m)},board=__dmFenceCheck.root.querySelector('[data-daymark-view="habit-board"]');
      board.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const visible=()=>{const s=board.querySelector('.dm-board-scroll'),c=s.querySelector('.dm-cell.is-today');assert(c,'Today exists');const r=c.getBoundingClientRect(),v=s.getBoundingClientRect(),l=s.querySelector('.dm-column-headings .dm-board-label').getBoundingClientRect();assert(r.right<=v.right&&r.left>=l.right,'Full today column visible');};
      visible();board.querySelector('[aria-label="Previous dates"]').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      assert(!board.querySelector('.dm-date-label.is-today'),'Historical range displayed');board.querySelector('.dm-jump-today').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));visible();
      return {width:innerWidth,initialTodayVisible:true,jumpToToday:true};
    })()`));
  }
  console.log(JSON.stringify({...independent,calendarFreeze:true,widths},null,2));
}finally{
  await send('Emulation.clearDeviceMetricsOverride').catch(()=>{});
  for(const fixture of fixtures)await evaluate(`(async()=>{app.workspace.getLeavesOfType('markdown').find(l=>l.id===${JSON.stringify(fixture.id)})?.detach();const f=app.vault.getAbstractFileByPath(${JSON.stringify(fixture.path)});if(f)await app.vault.delete(f);})()`).catch(console.error);
  await evaluate('delete window.__dmFenceCheck').catch(()=>{});socket.close();
}
