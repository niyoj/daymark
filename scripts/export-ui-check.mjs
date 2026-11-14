// Verifies JSON export against the real Vault API in an isolated Obsidian instance.
import assert from 'node:assert/strict';
import { widgetSnapshot, localDate } from '../src/domain.ts';
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

let backup;
const exportedPath='habit-widget.json';
const settle=()=>evaluate('new Promise(r=>setTimeout(r,150))');
async function readSnapshot(){return evaluate("(async()=>{const f=app.vault.getFileByPath('habit-widget.json');if(!f)throw Error('Export missing from the Vault cache');return JSON.parse(await app.vault.read(f))})()");}
async function expectSnapshot(){const data=await evaluate("app.plugins.plugins['niyoj-daymark'].data");const actual=await readSnapshot();assert.ok(Number.isFinite(Date.parse(actual.updatedAt)));const expected=widgetSnapshot(data,localDate(),actual.updatedAt);assert.deepEqual(actual,expected);return actual;}
try{
  assert.equal(await evaluate('app.vault.adapter.basePath'),'/private/tmp/daymark-runtime-vault');
  backup=await evaluate("(async()=>{const p=app.plugins.plugins['niyoj-daymark'];return{data:p.data,enabled:p.exportEnabled,bytes:await app.vault.adapter.read('.obsidian/plugins/niyoj-daymark/data.json'),snapshot:await app.vault.adapter.exists('habit-widget.json')?await app.vault.adapter.read('habit-widget.json'):null}})()");
  await evaluate("(async()=>{const p=app.plugins.plugins['niyoj-daymark'];p.exportEnabled=false;await p.saveSettings();app.setting.open();app.setting.openTabById('niyoj-daymark');})()");await settle();
  await evaluate("(()=>{const rows=[...app.setting.activeTab.containerEl.querySelectorAll('.setting-item')].filter(r=>r.querySelector('.setting-item-name')?.textContent==='Export widget snapshot after changes');if(rows.length!==1)throw Error('Export setting must render once');const toggle=rows[0].querySelector('.checkbox-container');if(!toggle)throw Error('Export toggle missing');toggle.click()})()");await settle();
  assert.equal(await evaluate("app.plugins.plugins['niyoj-daymark'].exportEnabled"),true);
  const initial=await expectSnapshot();
  await evaluate("app.setting.close()");
  // Queue the manual export immediately after a check-in, with no waiting between them.
  await evaluate("(async()=>{const p=app.plugins.plugins['niyoj-daymark'];await p.openToday();const leaf=app.workspace.getLeavesOfType('daymark-today')[0];await leaf.loadIfDeferred?.();leaf.view.contentEl.querySelector('.dm-task').click();await p.exportSnapshot()})()");
  const updated=await expectSnapshot();assert.notEqual(updated.completed.length,initial.completed.length);
  // Automatic export failure must not roll back the successfully saved habit record.
  await evaluate("(async()=>{const p=app.plugins.plugins['niyoj-daymark'];window.__dmExport={process:app.vault.process};app.vault.process=async function(file,fn){if(file.path==='habit-widget.json')throw Error('Export test: simulated write failure');return __dmExport.process.call(this,file,fn)};const d=p.data,id=d.routines[0].tasks[0].id,date=new Date().toLocaleDateString('en-CA');await p.mutate(data=>({...data,checkins:{...data.checkins,[date]:{...data.checkins[date],[id]:!data.checkins[date]?.[id]}}}));})()");
  const afterFailed=await readSnapshot();assert.deepEqual(afterFailed,updated);
  const saved=await evaluate("(async()=>{const p=app.plugins.plugins['niyoj-daymark'];const disk=JSON.parse(await app.vault.adapter.read('.obsidian/plugins/niyoj-daymark/data.json'));return JSON.stringify(disk.data)===JSON.stringify(p.data)})()");assert.equal(saved,true);
  await evaluate("(async()=>{app.vault.process=__dmExport.process;const p=app.plugins.plugins['niyoj-daymark'];await p.exportSnapshot()})()");await expectSnapshot();
  // Manual command creates an export even when automatic export is disabled.
  await evaluate("(async()=>{const p=app.plugins.plugins['niyoj-daymark'];p.exportEnabled=false;await p.saveSettings();const f=app.vault.getFileByPath('habit-widget.json');if(f)await app.vault.delete(f);app.commands.executeCommandById('niyoj-daymark:export-widget');await p.exportSnapshot()})()");await expectSnapshot();
  console.log(JSON.stringify({passed:true,file:exportedPath,realVaultCreateAndProcess:true,settingsToggle:true,manualAndAuto:true,pendingCheckinIncluded:true,saveSurvivesExportFailure:true,recovery:true},null,2));
}finally{
  if(backup)await evaluate(`(async()=>{app.setting.close();if(window.__dmExport?.process)app.vault.process=__dmExport.process;const p=app.plugins.plugins['niyoj-daymark'];p.exportEnabled=false;await p.mutate(()=>(${JSON.stringify(backup.data)}));p.exportEnabled=${JSON.stringify(backup.enabled)};await app.vault.adapter.write('.obsidian/plugins/niyoj-daymark/data.json',${JSON.stringify(backup.bytes)});const f=app.vault.getFileByPath('habit-widget.json');if(${JSON.stringify(backup.snapshot)}===null){if(f)await app.vault.delete(f)}else if(f)await app.vault.process(f,()=>${JSON.stringify(backup.snapshot)});else await app.vault.create('habit-widget.json',${JSON.stringify(backup.snapshot)});delete window.__dmExport;})()`).catch(console.error);
  socket.close();
}
