// Live regression: history edits must retain the date range AND horizontal position.
import { createRoutine, emptyData, addDays, localDate } from '../src/domain.ts';
const fixture = createRoutine(emptyData(), { name: 'History fixture', color: '#249c03', tasks: [{ name: 'Read', weekdays: [0,1,2,3,4,5,6] }] }, addDays(localDate(), -100));
const targets=await(await fetch('http://127.0.0.1:9231/json/list')).json();
const socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let id=0;const pending=new Map();socket.onmessage=e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result);}};
function send(method,params={}){const n=++id;return new Promise((resolve,reject)=>{pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;}
let original;
try{
  if(await evaluate('app.vault.getName()')!=='daymark-runtime-vault')throw Error('Use isolated runtime vault only.');
  original=await evaluate("(async()=>{const p=app.plugins.plugins['niyoj-daymark'];const path=app.vault.configDir+'/plugins/niyoj-daymark/data.json';return {data:p.data,exportEnabled:p.exportEnabled,path,bytes:await app.vault.adapter.read(path)}})()");
  await evaluate(`(async()=>{const p=app.plugins.plugins['niyoj-daymark'];p.exportEnabled=false;p.data=${JSON.stringify(fixture)};p.emit();const path='Board layout fixture.md';if(!app.vault.getAbstractFileByPath(path))await app.vault.create(path,String.fromCharCode(96).repeat(3)+'habit-board'+String.fromCharCode(10)+'view: habit-board'+String.fromCharCode(10)+String.fromCharCode(96).repeat(3));const leaf=app.workspace.getLeavesOfType('markdown')[0]??app.workspace.getLeaf(true);await leaf.setViewState({type:'markdown',state:{file:'Board layout fixture.md',mode:'preview'},active:true});app.workspace.rightSplit.collapse();app.workspace.leftSplit.collapse();await new Promise(r=>setTimeout(r,100));})()`);
  const result=await evaluate(`(async()=>{
    const assert=(v,m)=>{if(!v)throw Error(m)};
    const frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const root=document.querySelector('.markdown-preview-view .dm-root');
    root.querySelector('.dm-jump-today').click();await frames();
    const initialLast=[...root.querySelectorAll('.dm-date-label')].at(-1).getAttribute('data-date');
    const crossing=[...root.querySelectorAll('.dm-month-span')].map(e=>e.getAttribute('data-month'));
    assert(crossing.length>=2,'Current range should cross a month boundary');
    const initialFirst=root.querySelector('.dm-date-label').getAttribute('data-date');
    root.querySelector('[aria-label="Previous dates"]').click();await frames();
    const viewport=root.querySelector('.dm-board-scroll');
    const first=root.querySelector('.dm-date-label').getAttribute('data-date');
    const before=root.querySelector('.dm-board-range').textContent;
    [...root.querySelectorAll('.dm-cell')].at(-3).click();
    const task=document.querySelector('.modal-content .dm-task');assert(task,'Older date has an editable scheduled task');task.click();
    for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,25));if(Object.keys(app.plugins.plugins['niyoj-daymark'].data.checkins).length)break;}
    await frames();
    assert(root.querySelector('.dm-board-range').textContent===before,'Edit must retain the historical range');
    assert(root.querySelector('.dm-date-label').getAttribute('data-date')===first,'Historical date columns must not reset');
    assert(root.querySelector('.dm-board-scroll').scrollLeft===0,'Board stays non-scrollable');
    [...document.querySelectorAll('.modal-content button')].find(b=>b.textContent==='Done').click();
    root.querySelector('.dm-jump-today').click();await frames();
    assert(root.querySelector('.dm-date-label').getAttribute('data-date')===initialFirst,'Jump restores current range');
    const last=[...root.querySelectorAll('.dm-date-label')].at(-1);assert(last.getAttribute('data-date')===initialLast&&last.classList.contains('is-today'),'Jump restores today header');
    const s=root.querySelector('.dm-board-scroll'),r=s.querySelector('.dm-cell.is-today').getBoundingClientRect(),v=s.getBoundingClientRect();
    assert(r.right<=v.right&&r.left>v.left+112,'Jump shows full today column');
    assert(root.querySelector('.dm-visible-month').textContent.length>0,'Month stays visible at partial month start');
    return {monthBoundary:crossing,olderDateEditPreservesRange:true,innerScroll:false,jumpToToday:true};
  })()`);
  console.log(JSON.stringify(result,null,2));
}finally{
  if(original)await evaluate(`(async()=>{const p=app.plugins.plugins['niyoj-daymark'];p.data=${JSON.stringify(original.data)};p.exportEnabled=${JSON.stringify(original.exportEnabled)};p.emit();await app.vault.adapter.write(${JSON.stringify(original.path)},${JSON.stringify(original.bytes)});})()`);
  socket.close();
}
