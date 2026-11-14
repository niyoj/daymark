import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import { localDate, toggleCheckin, addDays, createRoutine, updateRoutine, setFreeze } from '../src/domain.ts';

// Runs the real plugin entry in a small host adapter, without launching Obsidian.
// This validates registration, forms, persistence, sidebar and board subscriptions.
class Element {
  tagName: string; children: Element[] = []; className = ''; textContent = ''; value = '';
  type = ''; title = ''; disabled = false; parent?: Element;
  attributes: Record<string,string> = {}; handlers: Record<string,Function[]> = {};
  style: Record<string,unknown> = { setProperty() {} };
  ownerDocument = { createElement: (tag: string) => new Element(tag) };
  classList = {
    add: (...names: string[]) => { this.className += ' ' + names.join(' '); },
    toggle: (name: string, on: boolean) => { this.className = this.className.split(' ').filter(n => n !== name).join(' ') + (on ? ' '+name : ''); },
  };
  constructor(tag: string) { this.tagName = tag; }
  append(child: Element) { child.parent = this; this.children.push(child); }
  replaceChildren() { this.children = []; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(name: string,value: string) { this.attributes[name] = value; }
  getAttribute(name: string) { return this.attributes[name]; }
  addEventListener(name: string, fn: Function) { (this.handlers[name] ??= []).push(fn); }
  querySelector(selector: string) { return find(this,e=>selector.startsWith('.') && e.className.split(' ').includes(selector.slice(1)))[0]; }
  focus() {}
  fire(name: string) { for (const fn of this.handlers[name] ?? []) fn({ preventDefault() {} }); }
}
const find = (root: Element, predicate: (e: Element) => boolean): Element[] => [root,...root.children.flatMap(child=>find(child,predicate))].filter(predicate);
const byClass = (root: Element, name: string) => find(root,e=>e.className.split(' ').includes(name));
const flush = () => new Promise<void>(resolve=>setTimeout(resolve,0));

async function smoke(production: boolean) {
  let lastModal: any;
  const writes: Record<string,string> = {};
  let saved: any;
  const commands: any[] = [];
  const views = new Map<string,Function>();
  let processor: Function;
  const leaf: any = { view: undefined, setViewState: async ({type}:any) => {
    leaf.view = views.get(type)!(leaf); await leaf.view.onOpen();
  }};
  class TFile { path: string; constructor(path: string) { this.path = path; } }
  const app = { workspace: {
    getLeavesOfType: () => leaf.view ? [leaf] : [], getRightLeaf: () => leaf,
    getLeaf: () => leaf, revealLeaf: async () => {},
  }, vault: {
    getAbstractFileByPath: (path: string) => writes[path] === undefined ? null : new TFile(path),
    create: async (path: string, value: string) => { writes[path] = value; return new TFile(path); },
    process: async (file: TFile, change: (value: string) => string) => { writes[file.path] = change(writes[file.path]!); return writes[file.path]; },
    adapter: { write: async (path: string, value: string) => { writes[path] = value; } },
  } };
  const notices: string[] = [];
  class Plugin {
    app = app;
    loadData = async () => undefined;
    saveData = async (value: unknown) => { saved = structuredClone(value); };
    registerView = (key: string, factory: Function) => views.set(key,factory);
    addRibbonIcon() {}
    addCommand(command: unknown) { commands.push(command); }
    registerMarkdownCodeBlockProcessor(name: string, fn: Function) { if(name==='habit-board') processor = fn; }
    addSettingTab() {}
    registerInterval() {}
  }
  class Modal {
    contentEl = new Element('div');
    title = '';
    constructor(_app: unknown) {}
    setTitle(title: string) { this.title = title; }
    // Obsidian owns `selection` for the document selection it captures when opening.
    open() { (this as any).selection = {}; lastModal = this; (this as any).onOpen(); }
    close() { (this as any).onClose(); }
  }
  class ItemView { contentEl = new Element('div'); constructor(_leaf: unknown) {} }
  class MarkdownRenderChild { containerEl: Element; constructor(container: Element) { this.containerEl = container; } }
  (globalThis as any).__daymarkMock = { Plugin, Modal, ItemView, MarkdownRenderChild,
    WorkspaceLeaf: class {}, TFile, Platform: { isMobile: false }, Notice: class { constructor(value:string) { notices.push(value); } },
    PluginSettingTab: class {}, Setting: class {}, normalizePath: (v:string)=>v,
    setIcon: (element: Element, name: string) => element.setAttribute('data-icon', name),
  };
  const originalWindow = (globalThis as any).window;
  (globalThis as any).window = { setInterval: () => 1 };
  try {
    const source = production ? await readFile(new URL('../main.js',import.meta.url),'utf8') :
      (await build({entryPoints:[new URL('../src/main.ts',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'browser',external:['obsidian']})).outputFiles[0]!.text;
    const module = { exports: {} as any };
    vm.runInNewContext(source, { module, require: (name:string) => { assert.equal(name,'obsidian'); return (globalThis as any).__daymarkMock; }, window:(globalThis as any).window, console });
    const Daymark = module.exports.default;
    const plugin = new Daymark();
    await plugin.onload();
    assert.equal(views.has('daymark-today'), true);
    assert.equal(views.has('daymark-analytics'),false);
    assert.equal(commands.some(c=>['open-analytics','weekday-patterns','weekly-consistency','calendar-overview'].includes(c.id)),false);
    let inserted=''; commands.find(c=>c.id==='insert-board').editorCallback({replaceSelection:(value:string)=>{inserted=value;}});
    assert.match(inserted,/view: habit-board/);
    commands.find(command=>command.id==='new-routine').callback();
    const inputs = find(lastModal.contentEl,e=>e.tagName==='input');
    inputs[0]!.value = 'Morning'; inputs[1]!.value = 'Read'; inputs[1]!.fire('input');
    find(lastModal.contentEl,e=>e.tagName==='form')[0]!.fire('submit');
    await flush();
    assert.equal(plugin.data.routines.length,1);
    assert.equal(saved.data.routines[0].tasks[0].name,'Read');
    await plugin.openToday();
    assert.equal(byClass(leaf.view.contentEl,'dm-task').length,1);
    const board = new Element('div');
    let boardChild: any;
    processor!('view: habit-board',board,{ addChild: (child:any)=>{ boardChild=child;child.onload(); } });
    assert.equal(byClass(board,'dm-cell').length,28);
    const blocks: any[]=[];
    const renderBlock=(source:string)=>{const root=new Element('div');processor!(source,root,{addChild:(child:any)=>{blocks.push(child);child.onload();}});return root;};
    const defaultBoard=renderBlock('');
    assert.equal(defaultBoard.getAttribute('data-daymark-view'),'habit-board');
    assert.equal(byClass(defaultBoard,'dm-cell').length,28);
    assert.equal(byClass(defaultBoard,'dm-routine-stats-detail')[0]!.hidden,true);
    byClass(defaultBoard,'dm-board-routine-button')[0]!.fire('click');
    assert.equal(byClass(defaultBoard,'dm-routine-stats-detail')[0]!.hidden,false);
    assert.equal(byClass(defaultBoard,'dm-board-routine-button')[0]!.getAttribute('aria-expanded'),'true');
    assert.equal(byClass(defaultBoard,'dm-routine-stat-value')[3]!.textContent,'—');
    assert.equal(byClass(leaf.view.contentEl,'dm-board-stat').length,0,'Sidebar mini-board is unchanged');
    const weekday=renderBlock('view: weekday-patterns');
    assert.equal(weekday.getAttribute('data-daymark-view'),'weekday-patterns');
    assert.equal(byClass(weekday,'dm-analytics-cell').length,7);
    assert.equal(byClass(weekday,'dm-analytics-detail').length,0);
    assert.equal(byClass(weekday,'dm-analytics-caption').length,0);
    assert.equal(byClass(weekday,'dm-pattern-axis')[0]!.textContent,'Sun');
    assert.equal(byClass(weekday,'dm-analytics-tabs').length,0);
    const weekly=renderBlock('view: weekly-consistency');
    assert.ok(byClass(weekly,'dm-analytics-cell').length>=12);
    assert.equal(byClass(weekly,'dm-analytics-detail').length,0);
    assert.equal(byClass(weekly,'dm-analytics-caption').length,0);
    assert.ok(byClass(weekly,'dm-pattern-week-label').some(x=>x.textContent==='W1'));
    const start=weekly.getAttribute('data-range-start');
    find(weekly,e=>e.getAttribute('aria-label')==='Previous analytics dates')[0]!.fire('click');
    assert.notEqual(weekly.getAttribute('data-range-start'),start);
    find(weekly,e=>e.getAttribute('aria-label')==='Jump to today')[0]!.fire('click');
    assert.equal(weekly.getAttribute('data-range-start'),start);
    const calendar=renderBlock('view: calendar-overview');
    assert.equal(byClass(calendar,'dm-analytics-cell').length,77+new Date().getDay()+1);
    assert.equal(byClass(calendar,'dm-analytics-detail').length,0);
    assert.equal(byClass(calendar,'dm-analytics-caption').length,0);
    assert.ok(byClass(calendar,'dm-calendar-week-label').some(label=>label.textContent==='W1'));
    assert.ok(byClass(calendar,'dm-calendar-week-label').every(label=>/^W[1-6]$/.test(label.textContent)));
    const initialCalendarDate=byClass(calendar,'dm-calendar-cell')[0]!.getAttribute('data-date');
    find(calendar,e=>e.getAttribute('aria-label')==='Previous calendar dates')[0]!.fire('click');
    assert.notEqual(byClass(calendar,'dm-calendar-cell')[0]!.getAttribute('data-date'),initialCalendarDate);
    find(calendar,e=>e.getAttribute('aria-label')==='Jump to today')[0]!.fire('click');
    assert.equal(byClass(calendar,'dm-calendar-cell')[0]!.getAttribute('data-date'),initialCalendarDate);

    const invalid=renderBlock('view: unknown');
    assert.match(byClass(invalid,'dm-notice')[0]!.textContent,/weekday-patterns, weekly-consistency, calendar-overview, habit-board/);
    byClass(weekday,'dm-analytics-cell')[2]!.fire('click');
    assert.equal(lastModal.title,'Morning');
    assert.match(byClass(lastModal.contentEl,'dm-detail-period')[0]!.textContent,/Tuesday/);
    assert.equal(byClass(lastModal.contentEl,'dm-detail-count')[0]!.textContent,'No scheduled occurrences');
    lastModal.close();
    byClass(weekly,'dm-analytics-cell')[0]!.fire('click');
    assert.equal(lastModal.title,'Morning');
    assert.equal(byClass(lastModal.contentEl,'dm-detail-count')[0]!.textContent,'No scheduled occurrences');
    lastModal.close();
    byClass(calendar,'dm-calendar-cell').at(-1)!.fire('click');
    assert.equal(byClass(lastModal.contentEl,'dm-detail-count')[0]!.textContent,'0 of 1 routines completed');
    assert.match(byClass(lastModal.contentEl,'dm-detail-routine-text')[0]!.children[0]!.textContent,/Morning/);
    find(lastModal.contentEl,e=>e.getAttribute('aria-label')==='Edit check-ins for Morning')[0]!.fire('click');
    assert.equal(lastModal.title,'Morning');
    assert.equal(byClass(lastModal.contentEl,'dm-task-name')[0]!.textContent,'Read');
    lastModal.close();
    plugin.emit();
    assert.equal(byClass(weekday,'dm-analytics-cell')[2]!.getAttribute('aria-pressed'),'true');
    assert.equal(byClass(weekly,'dm-analytics-cell')[0]!.getAttribute('aria-pressed'),'true');
    assert.equal(byClass(calendar,'dm-analytics-cell').at(-1)!.getAttribute('aria-pressed'),'true');
    for(const block of blocks)if(block.containerEl!==defaultBoard)block.onunload();

    byClass(leaf.view.contentEl,'dm-task')[0]!.fire('click');
    await flush();
    assert.equal(byClass(leaf.view.contentEl,'dm-task')[0]!.getAttribute('aria-pressed'),'true');
    assert.equal(byClass(leaf.view.contentEl,'dm-check')[0]!.getAttribute('data-icon'),'check');
    assert.equal(byClass(leaf.view.contentEl,'dm-task-state')[0]!.textContent,'Done');
    assert.equal(byClass(defaultBoard,'dm-routine-stat-value')[3]!.textContent,'100%');
    assert.equal(byClass(defaultBoard,'dm-routine-stats-detail')[0]!.hidden,false,'Selected stats survive check-in refresh');
    blocks.find(block=>block.containerEl===defaultBoard).onunload();
    assert.equal(byClass(board,'is-complete').length,1);
    await plugin.exportSnapshot();
    const snapshot = JSON.parse(writes['habit-widget.json']!);
    assert.equal(snapshot.completed.length,1);
    assert.equal(snapshot.remaining.length,0);
    // The same action undoes completion and rerenders both subscribers.
    byClass(leaf.view.contentEl,'dm-task')[0]!.fire('click');
    await flush();
    assert.equal(byClass(board,'is-complete').length,0);
    assert.equal(byClass(leaf.view.contentEl,'dm-task')[0]!.getAttribute('aria-pressed'),'false');
    // Failed disk writes leave memory unchanged; the queue accepts later actions.
    const workingSave = plugin.saveData;
    const previousData = plugin.data;
    const taskId = plugin.data.routines[0].tasks[0].id;
    plugin.saveData = async () => { throw new Error('Disk full'); };
    await assert.rejects(plugin.mutate((data:any)=>toggleCheckin(data,taskId,localDate())), /Disk full/);
    assert.equal(plugin.data,previousData);
    plugin.saveData = workingSave;
    await Promise.all([
      plugin.mutate((data:any)=>toggleCheckin(data,taskId,localDate())),
      plugin.mutate((data:any)=>toggleCheckin(data,taskId,localDate())),
    ]);
    assert.equal(byClass(leaf.view.contentEl,'dm-task')[0]!.getAttribute('aria-pressed'),'false');
    // History pagination reaches older dates and returns without moving into future dates.
    const firstDateLabel = byClass(board,'dm-cell')[0]!.getAttribute('aria-label');
    const nav = (name:string) => find(board,e=>e.getAttribute('aria-label')===name)[0]!;
    assert.equal(nav('Next dates').disabled,true);
    nav('Previous dates').fire('click');
    assert.notEqual(byClass(board,'dm-cell')[0]!.getAttribute('aria-label'),firstDateLabel);
    assert.equal(nav('Next dates').disabled,false);
    const oldRange = byClass(board,'dm-cell')[0]!.getAttribute('aria-label');
    plugin.emit();
    assert.equal(byClass(board,'dm-cell')[0]!.getAttribute('aria-label'),oldRange);
    nav('Jump to today').fire('click');
    assert.equal(byClass(board,'dm-cell')[0]!.getAttribute('aria-label'),firstDateLabel);
    nav('Previous dates').fire('click');
    nav('Next dates').fire('click');
    assert.equal(byClass(board,'dm-cell')[0]!.getAttribute('aria-label'),firstDateLabel);
    assert.equal(nav('Next dates').disabled,true);
    // A routine renamed today retains its previous name and task in yesterday's detail.
    let history = createRoutine(plugin.data,{name:'Old ritual',color:'#123456',tasks:[
      {name:'Old task',weekdays:[0,1,2,3,4,5,6]},
    ]},addDays(localDate(),-35));
    const oldRoutine = history.routines.at(-1)!;
    history = updateRoutine(history,oldRoutine.id,{name:'New ritual',color:'#123456',tasks:[
      {id:oldRoutine.tasks[0]!.id,name:'New task',weekdays:[0,1,2,3,4,5,6]},
    ]},localDate());
    await plugin.mutate(()=>history);
    const historyRow = byClass(board,'dm-board-row').find(row=>byClass(row,'dm-board-label')[0]?.textContent==='New ritual')!;
    byClass(historyRow,'dm-cell').at(-2)!.fire('click');
    assert.equal(lastModal.title,'Old ritual');
    assert.match(byClass(lastModal.contentEl,'dm-detail-period')[0]!.textContent,/\d{4}/);
    assert.equal(byClass(lastModal.contentEl,'dm-task-name')[0]!.textContent,'Old task');
    lastModal.close();
    // Exhausted monthly allowance is explained; an existing freeze can still be removed.
    const yesterday = addDays(localDate(),-1);
    const anchor = Number(yesterday.slice(-2)) <= 2 ? addDays(localDate().slice(0,7)+'-01',-1) : yesterday;
    await plugin.mutate((data:any)=>setFreeze(setFreeze(data,oldRoutine.id,anchor,true),oldRoutine.id,addDays(anchor,-1),true));
    const currentRow = () => byClass(board,'dm-board-row').find(row=>byClass(row,'dm-board-label')[0]?.textContent==='New ritual')!;
    find(currentRow(),cell=>cell.getAttribute('data-date')===addDays(anchor,-2))[0]!.fire('click');
    const freezeAction = () => find(lastModal.contentEl,e=>e.getAttribute('data-focus-key')==='freeze')[0]!;
    assert.equal(freezeAction().textContent,'Use a freeze');
    assert.equal(freezeAction().disabled,true);
    assert.ok(byClass(lastModal.contentEl,'dm-detail-note').some(e=>e.textContent.includes('Monthly allowance used')));
    lastModal.close();
    find(currentRow(),cell=>cell.getAttribute('data-date')===anchor)[0]!.fire('click');
    assert.equal(freezeAction().textContent,'Remove freeze');
    assert.equal(freezeAction().disabled,false);
    freezeAction().fire('click');await flush();
    assert.equal(freezeAction().textContent,'Use a freeze');
    assert.equal(freezeAction().disabled,false);
    lastModal.close();
    const initialListeners = plugin.listeners.size;
    boardChild.onunload(); await leaf.view.onClose();
    assert.equal(plugin.listeners.size,initialListeners-2);
    assert.deepEqual(notices,[]);
  } finally {
    (globalThis as any).window = originalWindow;
    delete (globalThis as any).__daymarkMock;
  }
}
test('plugin source entry: create, check/undo, persistence, board, widget, recovery', () => smoke(false));
test('production bundle entry: create, check/undo, persistence, board, widget, recovery', () => smoke(true));
