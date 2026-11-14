// Run only against an isolated Obsidian vault on port 9231. Never edits a user's vault.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRoutine, emptyData, localDate, addDays, dateRange, dueTasks, toggleCheckin, setFreeze } from '../src/domain.ts';
import { weekdayPatterns, weeklyConsistency, calendarProgress } from '../src/analytics.ts';
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
const settle = () => evaluate('new Promise(r=>setTimeout(r,100))');
async function key(key, code, windowsVirtualKeyCode, modifiers = 0) {
  for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers });
  await settle();
}
async function shot(name, selector) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 }); await settle();
  const clip = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.max(0,r.x),y:Math.max(0,r.y),width:Math.min(r.width,innerWidth-r.x),height:Math.min(r.height,innerHeight-r.y),scale:1}})()`);
  const capture = await send('Page.captureScreenshot', { format: 'png', clip });
  await fs.mkdir('docs/screenshots', { recursive: true });
  await fs.writeFile('docs/screenshots/' + name + '.png', Buffer.from(capture.data, 'base64'));
}
const today = localDate(), yesterday = addDays(today, -1), start = addDays(today, -100), days = [0,1,2,3,4,5,6];
let fixture = createRoutine(emptyData(), { name: 'Morning ritual', color: '#249c03', tasks: [{ name: 'Stretch for five minutes', weekdays: days }, { name: 'Plan the day', weekdays: days }] }, start);
fixture = createRoutine(fixture, { name: 'Review notes', color: '#249cff', tasks: [{ name: 'Review the notes from this week', weekdays: [1,3,5] }] }, start);
fixture = createRoutine(fixture, { name: 'Make time for a longer creative practice', color: '#a64ca6', tasks: [{ name: 'Write a little, even when the first sentence takes a while', weekdays: days }] }, start);
for (const [i,date] of dateRange(start, today).entries()) for (const [j,routine] of fixture.routines.entries()) {
  for (const [k,task] of dueTasks(fixture,routine.id,date).entries()) if (i % (j + 2) === 0 && (date !== yesterday || k === 0)) fixture = toggleCheckin(fixture, task.id, date, today);
}
// Ensure a partial frozen date and a partial today, independent of the run's weekday.
fixture.checkins[yesterday] = { [fixture.routines[0].tasks[0].id]: true };
fixture.checkins[today] = { [fixture.routines[0].tasks[0].id]: true };
fixture = setFreeze(fixture, fixture.routines[0].id, yesterday, true, today);
const notes = [], results = [];
let backup;
try {
  const vault = await evaluate('app.vault.adapter.basePath');
  assert.equal(vault, '/private/tmp/daymark-runtime-vault');
  backup = await evaluate(`(async()=>({data:app.plugins.plugins['niyoj-daymark'].data,exportEnabled:app.plugins.plugins['niyoj-daymark'].exportEnabled,file:await app.vault.adapter.read('.obsidian/plugins/niyoj-daymark/data.json'),dark:document.body.classList.contains('theme-dark'),size:app.workspace.rightSplit.size}))()`);
  await evaluate(`(()=>{const p=app.plugins.plugins['niyoj-daymark'];p.exportEnabled=false;p.data=${JSON.stringify(fixture)};p.emit();app.workspace.leftSplit.collapse();})()`);
  await evaluate(`(async()=>{const p=app.plugins.plugins['niyoj-daymark'];await p.openToday();const leaf=app.workspace.getLeavesOfType('daymark-today')[0];await leaf.loadIfDeferred?.();window.__dmPolish={today:leaf.view};})()`);
  await evaluate(`__dmPolish.contrast=root=>{
    const color=value=>{if(value.startsWith('color(srgb')){const p=value.slice(11).match(/[\\d.]+/g).map(Number);return [p[0]*255,p[1]*255,p[2]*255,p[3]??1]};const p=value.match(/[\\d.]+/g)?.map(Number);return p?[p[0],p[1],p[2],p[3]??1]:[0,0,0,0]};
    const blend=(a,b)=>a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3]));
    const lum=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
    let min=Infinity;
    for(const e of root.querySelectorAll('.dm-detail-note,.dm-detail-period,.dm-task-name,.dm-routine-meta,.dm-detail-count,.dm-button.is-primary')){
      if(!e.textContent||getComputedStyle(e.closest('button')??e).opacity!=='1')continue;
      let ancestors=[],p=e;while(p){ancestors.push(p);p=p.parentElement};let bg=[255,255,255];for(const a of ancestors.reverse())bg=blend(color(getComputedStyle(a).backgroundColor),bg);
      const fg=blend(color(getComputedStyle(e).color),bg),a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);min=Math.min(min,ratio);
      if(ratio<4.5)throw Error('Text contrast '+ratio.toFixed(2)+' for '+e.className);
    }return Number(min.toFixed(2));
  }`);
  for (const view of ['habit-board','weekday-patterns','weekly-consistency','calendar-overview']) {
    const content = '```habit-board\nview: ' + view + '\n```';
    notes.push(await evaluate(`(async()=>{const path='Polish fixture '+${JSON.stringify(view)}+' '+Date.now()+'.md';await app.vault.create(path,${JSON.stringify(content)});return {view:${JSON.stringify(view)},path}})()`));
  }
  for (const theme of ['light','dark']) for (const [width,height] of [[1200,900],[390,844],[844,390]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.body.classList.remove('theme-light','theme-dark');document.body.classList.add('theme-${theme}');app.workspace.rightSplit.setSize(${width === 1200 ? 320 : 350});app.workspace.rightSplit.expand();`); await settle();
    const sidebar = await evaluate(`(()=>{const root=__dmPolish.today.contentEl,assert=(v,m)=>{if(!v)throw Error(m)};root.scrollTop=0;
      const rect=root.getBoundingClientRect();assert(rect.width>=280,'Sidebar width');
      const group=root.querySelector('.dm-routine'),rows=[...group.querySelectorAll('.dm-task')];
      assert(rows[0].getAttribute('aria-pressed')==='false'&&rows[1].getAttribute('aria-pressed')==='true','Remaining tasks first');
      assert(rows[1].querySelector('.dm-task-state').textContent==='Done','Completed label');
      assert(getComputedStyle(rows[1].querySelector('.dm-task-name')).textDecorationLine.includes('line-through'),'Completed strike');
      assert(root.querySelector('.dm-header').innerText.includes('New routine'),'Create accessible');
      for(const b of root.querySelectorAll('.dm-header button,.dm-routine-header button,.dm-task')){const r=b.getBoundingClientRect();assert(r.height>=44,'44px checklist actions');assert(r.right<=rect.right+1&&r.left>=rect.left-1,'Controls within pane');}
      for(const name of root.querySelectorAll('.dm-task-name'))assert(name.scrollWidth<=name.clientWidth+1,'Task name wraps within pane');
      __dmPolish.contrast(root);const task=rows[0];task.focus();__dmPolish.taskKey=task.getAttribute('data-focus-key');return {width:rect.width,remainingFirst:true,completedNonColor:true,targets44:true};})()`);
    await key(' ', 'Space', 32);
    assert.equal(await evaluate(`(()=>{const root=__dmPolish.today.contentEl,b=[...root.querySelectorAll('.dm-task')].find(b=>b.getAttribute('data-focus-key')===__dmPolish.taskKey);return b.getAttribute('aria-pressed')==='true'&&document.activeElement===b;})()`), true, 'Check and retained keyboard focus');
    await key(' ', 'Space', 32);
    assert.equal(await evaluate(`document.activeElement.getAttribute('aria-pressed')`), 'false', 'Undo retains focus');
    await key('Tab', 'Tab', 9);
    assert.equal(await evaluate(`__dmPolish.today.contentEl.contains(document.activeElement)`), true, 'Tab proceeds within checklist');
    await shot(`polish-today-${theme}-${width}`, '.dm-today');
    await evaluate('app.workspace.rightSplit.collapse()'); await settle();
    for (const note of notes) {
      await evaluate(`(async()=>{const leaf=__dmPolish.leaf??=app.workspace.getLeaf(true);await leaf.setViewState({type:'markdown',state:{file:${JSON.stringify(note.path)},mode:'preview'},active:true});await app.workspace.revealLeaf(leaf);})()`);
      await settle();
      await evaluate(`(()=>{const root=__dmPolish.leaf.view.contentEl.querySelector('.markdown-preview-view .dm-block');if(!root)throw Error('Missing rendered block');__dmPolish.root=root;root.scrollIntoView({block:'start'});})()`); await settle();
      const range = await evaluate(`({start:__dmPolish.root.getAttribute('data-range-start'),end:__dmPolish.root.getAttribute('data-range-end')})`);
      const view = note.view;
      let expected, selected;
      if (view === 'weekday-patterns') {
        const rows = weekdayPatterns(fixture,range.start,range.end,today), weekday = new Date(yesterday+'T12:00:00').getDay();
        expected = rows[0].cells[weekday]; selected = weekday;
      } else if (view === 'weekly-consistency') {
        const rows = weeklyConsistency(fixture,range.start,range.end,today).rows;
        selected = rows[0].cells.findIndex(c=>c.weekStart<=yesterday&&c.weekEnd>=yesterday);expected = rows[0].cells[selected];
      } else if (view === 'calendar-overview') expected = calendarProgress(fixture,yesterday,yesterday,today)[0];
      await evaluate(`(()=>{const root=__dmPolish.root;let cell;
        if(${JSON.stringify(view)}==='habit-board')cell=[...root.querySelectorAll('.dm-board-row')].find(r=>r.querySelector('.dm-board-label')?.textContent==='Morning ritual').querySelector('[data-date="${yesterday}"]');
        else if(${JSON.stringify(view)}==='calendar-overview')cell=root.querySelector('[data-date="${yesterday}"]');
        else cell=root.querySelectorAll('.dm-pattern-row:has(.dm-pattern-cell)')[0].querySelectorAll('.dm-pattern-cell')[${selected??0}];
        if(!cell)throw Error('Missing cell');cell.focus();__dmPolish.cellKey=cell.getAttribute('data-detail-key');})()`);
      await key('Enter','Enter',13);
      const detail = await evaluate(`(()=>{const root=document.querySelector('.modal-content.dm-cell-details');if(!root)throw Error('Details did not open');
        const assert=(v,m)=>{if(!v)throw Error(m)},modal=root.closest('.modal'),r=modal.getBoundingClientRect(),body=root.getBoundingClientRect();
        assert(root.scrollWidth<=root.clientWidth+2,'No horizontal detail overflow');assert(r.left>=-1&&r.right<=innerWidth+1,'Modal fits width');
        assert(modal.contains(document.activeElement),'Focus enters detail');
        const focused=document.activeElement;if(focused.classList.contains('dm-task')){const f=focused.getBoundingClientRect(),hit=document.elementFromPoint(f.x+f.width/2,f.y+f.height/2);assert(focused.contains(hit),'Focused task is not obscured');}
        __dmPolish.contrast(root);
        const done=[...root.querySelectorAll('button')].find(b=>b.textContent==='Done'),d=done.getBoundingClientRect();assert(d.height>=44,'44px detail action');assert(d.bottom<=innerHeight+1&&d.top>=0,'Done reachable');
        const hit=document.elementFromPoint(d.x+d.width/2,d.y+d.height/2);assert(done.contains(hit),'Done is not obscured');
        return {contrast:__dmPolish.contrast(root),title:modal.querySelector('.modal-title').textContent,count:root.querySelector('.dm-detail-count').textContent,period:root.querySelector('.dm-detail-period')?.textContent,text:root.innerText,modalWidth:r.width,modalHeight:r.height};})()`);
      if (view === 'habit-board') { assert.equal(detail.title,'Morning ritual');assert.equal(detail.count,'1 of 2 tasks complete');assert.match(detail.text,/Remove freeze/); }
      else if (view === 'calendar-overview') { assert.equal(detail.count,`${expected.completed} of ${expected.scheduled} routines completed`);assert.match(detail.text,/Freeze used/); }
      else { assert.equal(detail.title,'Morning ritual');assert.equal(detail.count,`${expected.completed} of ${expected.scheduled} scheduled days completed`);assert.match(detail.text,/1 freeze used/); }
      await shot(`polish-${view}-${theme}-${width}`, '.modal');
      if(view==='habit-board'){
        await evaluate(`(()=>{const b=document.querySelector('.dm-cell-details [data-focus-key=freeze]');b.focus();const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(!b.contains(hit))throw Error('Freeze action obscured');})()`);
        await evaluate(`document.querySelector('.dm-cell-details .dm-task').focus()`);
      }
      // Native Tab / Shift+Tab stay inside Obsidian's dialog focus scope.
      await key('Tab','Tab',9); assert.equal(await evaluate(`document.querySelector('.modal')?.contains(document.activeElement)`),true);
      await key('Tab','Tab',9,8); assert.equal(await evaluate(`document.querySelector('.modal')?.contains(document.activeElement)`),true);
      await key('Escape','Escape',27);
      assert.equal(await evaluate(`!document.querySelector('.modal-content.dm-cell-details')&&document.activeElement?.getAttribute('data-detail-key')===__dmPolish.cellKey`),true,'Escape returns to originating cell');
      // Space opens the same details; Done also returns focus.
      await key(' ','Space',32);
      await evaluate(`(()=>{const r=document.querySelector('.modal-content.dm-cell-details');if(!r)throw Error('Space did not open details');[...r.querySelectorAll('button')].find(b=>b.textContent==='Done').click()})()`); await settle();
      assert.equal(await evaluate(`document.activeElement?.getAttribute('data-detail-key')===__dmPolish.cellKey`),true,'Done returns cell focus');
      if(view==='calendar-overview'){
        await key('Enter','Enter',13);
        await evaluate(`document.querySelector('.dm-cell-details .dm-detail-routine button').focus()`);
        await key('Enter','Enter',13);
        assert.equal(await evaluate(`document.querySelector('.modal-title').textContent`),'Morning ritual');
        assert.equal(await evaluate(`document.querySelectorAll('.dm-cell-details .dm-task').length`),2);
        await key('Escape','Escape',27);
        assert.equal(await evaluate(`document.activeElement?.getAttribute('data-detail-key')===__dmPolish.cellKey`),true);
      }
      if (view === 'weekday-patterns') {
        // Custom-weekday routine: exact denominator and a genuinely unscheduled cell.
        const cells = weekdayPatterns(fixture,range.start,range.end,today)[1].cells;
        for (const weekday of [1,0]) {
          await evaluate(`__dmPolish.root.querySelectorAll('.dm-pattern-row:has(.dm-pattern-cell)')[1].querySelectorAll('.dm-pattern-cell')[${weekday}].click()`);
          const count=await evaluate(`document.querySelector('.dm-cell-details .dm-detail-count').textContent`);
          assert.equal(count,cells[weekday].scheduled?`${cells[weekday].completed} of ${cells[weekday].scheduled} scheduled days completed`:'No scheduled occurrences');
          await key('Escape','Escape',27);
        }
      }
      results.push({theme,width,height,view,keyboard:true,exactCounts:true,detailFits:true,minimumTextContrast:detail.contrast,...(view==='habit-board'?{sidebar}:{} )});
    }
  }
  // Correction, freeze removal/reapply, loading, and save failure recovery in the real host.
  const board=notes.find(n=>n.view==='habit-board');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await evaluate(`(async()=>{await __dmPolish.leaf.setViewState({type:'markdown',state:{file:${JSON.stringify(board.path)},mode:'preview'},active:true});await app.workspace.revealLeaf(__dmPolish.leaf);})()`);await settle();
  await evaluate(`(()=>{__dmPolish.root=__dmPolish.leaf.view.contentEl.querySelector('.markdown-preview-view .dm-block');const row=[...__dmPolish.root.querySelectorAll('.dm-board-row')].find(r=>r.querySelector('.dm-board-label')?.textContent==='Morning ritual');row.querySelector('[data-date="${yesterday}"]').click();})()`);await settle();
  await evaluate(`document.querySelector('.dm-cell-details .dm-task[aria-pressed=false]').click()`);await settle();
  assert.equal(await evaluate(`document.querySelector('.dm-cell-details .dm-detail-count').textContent`),'2 of 2 tasks complete');
  assert.equal(await evaluate(`app.plugins.plugins['niyoj-daymark'].data.freezes['${yesterday}'].length`),1,'Correction retains recorded freeze');
  await evaluate(`document.querySelector('.dm-cell-details .dm-task').click()`);await settle();
  await evaluate(`document.querySelector('.dm-cell-details [data-focus-key=freeze]').focus()`);await key('Enter','Enter',13);
  assert.equal(await evaluate(`document.querySelector('.dm-cell-details [data-focus-key=freeze]').textContent`),'Use a freeze');
  assert.equal(await evaluate(`document.activeElement.getAttribute('data-focus-key')`),'freeze');
  await key('Enter','Enter',13);
  assert.equal(await evaluate(`document.querySelector('.dm-cell-details [data-focus-key=freeze]').textContent`),'Remove freeze');
  // A delayed save has a busy/disabled row. Failure keeps the old data and re-enables it.
  await evaluate(`(()=>{const p=app.plugins.plugins['niyoj-daymark'];__dmPolish.save=p.saveData;__dmPolish.before=JSON.stringify(p.data);p.saveData=()=>new Promise((resolve,reject)=>{__dmPolish.reject=reject});document.querySelector('.dm-cell-details .dm-task').click()})()`);await settle();
  assert.equal(await evaluate(`(()=>{const b=document.querySelector('.dm-cell-details .dm-task');return b.disabled&&b.getAttribute('aria-busy')==='true'})()`),true);
  await evaluate(`__dmPolish.reject(new Error('Polish test: simulated disk full'));app.plugins.plugins['niyoj-daymark'].saveData=__dmPolish.save;`);await settle();
  assert.equal(await evaluate(`JSON.stringify(app.plugins.plugins['niyoj-daymark'].data)===__dmPolish.before&&!document.querySelector('.dm-cell-details .dm-task').disabled`),true);
  await key('Escape','Escape',27);
  // Empty and all-complete Today states without changing stored records.
  await evaluate(`(()=>{const p=app.plugins.plugins['niyoj-daymark'];p.data={version:1,routines:[],checkins:{},freezes:{}};p.emit()})()`);
  assert.match(await evaluate(`__dmPolish.today.contentEl.innerText`),/No tasks due today/);
  const allDone=structuredClone(fixture);for(const routine of allDone.routines)for(const task of dueTasks(allDone,routine.id,today))allDone.checkins[today][task.id]=true;
  await evaluate(`(()=>{const p=app.plugins.plugins['niyoj-daymark'];p.data=${JSON.stringify(allDone)};p.emit()})()`);
  assert.match(await evaluate(`__dmPolish.today.contentEl.innerText`),/All tasks complete/);
  console.log(JSON.stringify({passed:true,results,correctionAndFreeze:true,loadingAndFailureRecovery:true,emptyAndCompleteStates:true,physicalIPhone:false},null,2));
} finally {
  if(backup) {
    await evaluate(`(()=>{document.querySelectorAll('.modal-content.dm-cell-details').forEach(r=>[...r.querySelectorAll('button')].find(b=>b.textContent==='Done')?.click());const p=app.plugins.plugins['niyoj-daymark'];if(__dmPolish?.save)p.saveData=__dmPolish.save;p.data=${JSON.stringify(backup.data)};p.exportEnabled=${backup.exportEnabled};p.emit();app.workspace.rightSplit.setSize(${backup.size});document.body.classList.remove('theme-light','theme-dark');document.body.classList.add(${JSON.stringify(backup.dark?'theme-dark':'theme-light')});})()`).catch(console.error);
    await evaluate(`app.vault.adapter.write('.obsidian/plugins/niyoj-daymark/data.json',${JSON.stringify(backup.file)})`).catch(console.error);
    for(const note of notes)await evaluate(`(async()=>{if(__dmPolish?.leaf?.view?.file?.path===${JSON.stringify(note.path)})__dmPolish.leaf.detach();const f=app.vault.getAbstractFileByPath(${JSON.stringify(note.path)});if(f)await app.vault.delete(f)})()`).catch(console.error);
  }
  await send('Emulation.clearDeviceMetricsOverride').catch(()=>{});
  await evaluate('delete window.__dmPolish').catch(()=>{});socket.close();
}
