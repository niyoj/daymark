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
const settle = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const selector = '.markdown-preview-view .dm-root';
async function capture(name) {
  await evaluate(`document.querySelector('${selector}').scrollIntoView({block:'center'})`);
  await settle();
  const clip = await evaluate(`(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`);
  const result = await send('Page.captureScreenshot', { format: 'png', clip });
  await fs.mkdir('docs/screenshots', { recursive: true });
  await fs.writeFile(`docs/screenshots/${name}.png`, Buffer.from(result.data, 'base64'));
}
let originalTheme;
try {
  if (await evaluate('app.vault.getName()') !== 'daymark-runtime-vault') throw new Error('Use the isolated runtime vault for this check.');
  await evaluate("(async()=>{const path='Board layout fixture.md';if(!app.vault.getAbstractFileByPath(path))await app.vault.create(path,String.fromCharCode(96).repeat(3)+'habit-board'+String.fromCharCode(10)+'view: habit-board'+String.fromCharCode(10)+String.fromCharCode(96).repeat(3));const leaf=app.workspace.getLeavesOfType('markdown')[0]??app.workspace.getLeaf(true);await leaf.setViewState({type:'markdown',state:{file:'Board layout fixture.md',mode:'preview'},active:true});app.workspace.rightSplit.collapse();app.workspace.leftSplit.collapse();await new Promise(r=>setTimeout(r,150));})()");
  originalTheme = await evaluate("document.body.classList.contains('theme-dark')?'theme-dark':'theme-light'");
  await settle();
  const result = await evaluate(`(async()=>{
    const assert=(ok,message)=>{if(!ok)throw Error(message)},root=document.querySelector('${selector}');
    await new Promise(r=>setTimeout(r,100));
    const check=()=>{
      const viewport=root.querySelector('.dm-board-scroll'),grid=root.querySelector('.dm-board');
      assert(getComputedStyle(viewport).overflowX==='clip'&&getComputedStyle(viewport).overflowY==='clip','Board has no inner scrolling');
      assert(viewport.scrollWidth<=viewport.clientWidth+1,'All date columns fit');
      assert(viewport.scrollHeight<=viewport.clientHeight+1,'All routine rows fit naturally');
      const last=root.querySelector('.dm-cell.is-today').getBoundingClientRect(),v=viewport.getBoundingClientRect();
      assert(last.right<=v.right&&last.left>=root.querySelector('.dm-column-headings .dm-board-label').getBoundingClientRect().right,'Full today column visible');
      viewport.scrollLeft=80;viewport.scrollTop=80;assert(viewport.scrollLeft===0&&viewport.scrollTop===0,'Programmatic inner scroll is disabled');
      return root.querySelectorAll('.dm-date-label').length;
    };
    const columns=check(),initial=root.querySelector('.dm-board-range').textContent;
    root.querySelector('[aria-label="Previous dates"]').click();
    const historical=root.querySelector('.dm-board-range').textContent;assert(historical!==initial,'Arrows change date page');
    app.plugins.plugins['niyoj-daymark'].emit();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    assert(root.querySelector('.dm-board-range').textContent===historical,'Refresh retains historical page');
    root.querySelector('.dm-jump-today').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));check();
    return {columns,innerScroll:false,todayVisible:true,arrowPaging:true,pagePreserved:true};
  })()`);
  await capture('board-after-dark');
  await evaluate("document.body.classList.remove('theme-dark');document.body.classList.add('theme-light')");
  await settle();
  await capture('board-after-light');
  await evaluate("document.body.classList.remove('theme-light');document.body.classList.add('theme-dark')");
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: false });
  await evaluate(`document.querySelector('${selector}').replaceChildren();app.plugins.plugins['niyoj-daymark'].emit()`);
  await settle();
  await evaluate('new Promise(r=>setTimeout(r,100))');
  const narrow = await evaluate(`(()=>{const root=document.querySelector('${selector}'),s=root.querySelector('.dm-board-scroll'),last=s.querySelector('.is-today.dm-cell').getBoundingClientRect(),labels=root.querySelectorAll('.dm-date-label');if(s.scrollWidth>s.clientWidth+1||s.scrollHeight>s.clientHeight+1||last.right>s.getBoundingClientRect().right)throw Error('Narrow board must fit without scrolling');return {columns:labels.length,innerScroll:false};})()`);
  await capture('board-after-narrow');
  console.log(JSON.stringify({ ...result, narrowViewport: narrow, screenshots: 'docs/screenshots/board-after-*.png' }, null, 2));
} finally {
  await send('Emulation.clearDeviceMetricsOverride').catch(() => {});
  if (originalTheme) await evaluate(`document.body.classList.remove('theme-dark','theme-light');document.body.classList.add('${originalTheme}')`).catch(() => {});
  socket.close();
}
