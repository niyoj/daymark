import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { emptyData, createRoutine, localDate, addDays, dueTasks, routineAt } from '../src/domain.ts';

class Element {
  tagName: string; children: Element[] = []; className = ''; textContent = ''; value = ''; hidden = false; disabled = false;
  attributes: Record<string,string> = {}; handlers: Record<string,Function[]> = {};
  style = { setProperty() {}, backgroundColor: '' }; parent?: Element;
  ownerDocument = document;
  classList = { add: (...names: string[]) => { this.className += ' '+names.join(' '); } };
  constructor(tag:string) { this.tagName=tag; }
  append(child:Element) { this.children.push(child); child.parent=this; }
  replaceChildren() { this.children=[]; }
  setAttribute(key:string,value:string) { this.attributes[key]=value; }
  getAttribute(key:string) { return this.attributes[key]; }
  addEventListener(name:string,handler:Function) { (this.handlers[name]??=[]).push(handler); }
  fire(name:string,extra:object={}) { for (const handler of this.handlers[name]??[]) handler({preventDefault(){},stopPropagation(){},...extra}); }
  focus() { document.activeElement=this; }
  querySelector(selector:string) { return descendants(this).find(child=>selector.startsWith('.')?child.className.split(' ').includes(selector.slice(1)):child.getAttribute('aria-pressed')==='true'); }
}
const document = {activeElement: undefined as Element|undefined,createElement:(tag:string)=>new Element(tag)};
const descendants = (root:Element):Element[] => root.children.flatMap(child=>[child,...descendants(child)]);
const all = (root:Element,cls:string) => descendants(root).filter(child=>child.className.split(' ').includes(cls));
const clickText = (root:Element,text:string) => { const button=descendants(root).find(child=>child.tagName==='button'&&child.textContent===text); assert.ok(button,`Missing button ${text}`); button.fire('click'); };
const flush = () => new Promise<void>(resolve=>setTimeout(resolve,0));
async function setup(routine?:any,data=emptyData()) {
  let closed=false;
  class Modal { contentEl=new Element('div'); constructor(_app:unknown) {} setTitle() {} close(){closed=true;} }
  (globalThis as any).__editorModal=Modal;
  let source=await readFile(new URL('../src/routine-modal.ts',import.meta.url),'utf8');
  source=source.replace("import { Modal } from 'obsidian';",'const Modal = globalThis.__editorModal;');
  source=source.replace("from './domain'",`from '${new URL('../src/domain.ts',import.meta.url).href}'`);
  const code=stripTypeScriptTypes(source,{mode:'transform'});
  // Unique URL binds each host class to this test's closed state.
  const {RoutineModal}=await import('data:text/javascript;base64,'+Buffer.from(code+`\n// ${Math.random()}`).toString('base64'));
  const plugin={app:{},data,mutate:async(change:Function)=>{plugin.data=change(plugin.data);}};
  const modal=new RoutineModal(plugin,routine);modal.onOpen();
  return {modal,plugin,isClosed:()=>closed};
}

test('editor adds and focuses one expanded task, with compact collapsed summaries',async()=>{
  const {modal}=await setup(); const root=modal.contentEl as Element;
  assert.equal(all(root,'is-expanded').length,1);
  const firstInput=all(root,'dm-editor-task-detail')[0]!.children[0]!.children[0]!;
  firstInput.value='Read'; firstInput.fire('input');
  clickText(root,'+ Add task');
  assert.equal(all(root,'dm-editor-task').length,2);
  assert.equal(all(root,'is-expanded').length,1);
  assert.equal(document.activeElement?.tagName,'input');
  assert.equal(all(root,'dm-editor-task-title')[0]!.textContent,'Read');
  assert.equal(all(root,'dm-weekday').length,0);
  all(root,'dm-editor-task-summary')[0]!.fire('click');
  assert.equal(all(root,'is-expanded').length,1);
  assert.equal(all(root,'dm-editor-task-detail')[0]!.hidden,false);
  assert.equal(all(root,'dm-editor-task-detail')[1]!.hidden,true);
  assert.equal(document.activeElement,all(root,'dm-editor-task-summary')[0]);
  clickText(root,'Remove task');
  assert.equal(all(root,'dm-editor-task').length,1);
  assert.equal(document.activeElement,all(root,'dm-editor-task-summary')[0]);
  all(root,'dm-editor-task-summary')[0]!.fire('click');
  clickText(root,'Remove task');
  assert.equal(document.activeElement,all(root,'dm-editor-add')[0]);
});

test('editor schedule presets and custom days require at least one day; palette closes with keyboard',async()=>{
  const {modal}=await setup();const root=modal.contentEl as Element;
  clickText(root,'Weekdays');assert.equal(all(root,'dm-editor-task-schedule')[0]!.textContent,'Weekdays');
  assert.equal(document.activeElement?.textContent,'Weekdays');
  clickText(root,'Custom days');assert.equal(all(root,'dm-weekday').length,7);
  assert.equal(document.activeElement?.textContent,'Custom days');
  for(const day of ['Mon','Tue','Wed','Thu'])clickText(root,day);
  clickText(root,'Fri');
  assert.equal(all(root,'dm-weekday').filter(day=>day.getAttribute('aria-pressed')==='true').length,1);
  assert.match(all(root,'dm-editor-error')[0]!.textContent,/at least one/);
  const paletteToggle=all(root,'dm-editor-color-toggle')[0]!;paletteToggle.fire('click');
  assert.equal(paletteToggle.getAttribute('aria-expanded'),'true');
  const palette=all(root,'dm-editor-palette')[0]!;
  palette.fire('keydown',{key:'ArrowRight'});assert.equal(document.activeElement?.getAttribute('aria-label'),'Blue');
  palette.fire('keydown',{key:'End'});assert.equal(document.activeElement?.getAttribute('aria-label'),'Teal');
  palette.fire('keydown',{key:'Home'});assert.equal(document.activeElement?.getAttribute('aria-label'),'Green');
  palette.fire('keydown',{key:'Escape'});
  assert.equal(palette.hidden,true);assert.equal(document.activeElement,paletteToggle);
});

test('editing starts collapsed and saves changed names without rewriting yesterday',async()=>{
  const yesterday=addDays(localDate(),-1);
  const data=createRoutine(emptyData(),{name:'Morning',color:'#249c03',tasks:[{name:'Read',weekdays:[0,1,2,3,4,5,6]}]},yesterday);
  const routine=data.routines[0]!;const {modal,plugin,isClosed}=await setup(routine,data);const root=modal.contentEl as Element;
  assert.equal(all(root,'is-expanded').length,0);
  const name=all(root,'dm-editor-name')[0]!.children[0]!;name.value='Evening';
  all(root,'dm-editor-task-summary')[0]!.fire('click');
  const task=all(root,'dm-editor-task-detail')[0]!.children[0]!.children[0]!;task.value='Write';task.fire('input');
  descendants(root).find(element=>element.tagName==='form')!.fire('submit');await flush();
  assert.equal(isClosed(),true);assert.equal(plugin.data.routines[0]!.name,'Evening');
  assert.equal(routineAt(plugin.data.routines[0]!,yesterday)?.name,'Morning');
  assert.equal(dueTasks(plugin.data,routine.id,yesterday)[0]!.name,'Read');
  assert.equal(dueTasks(plugin.data,routine.id,localDate())[0]!.name,'Write');
});
