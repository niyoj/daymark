import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { build } from 'esbuild';
import { addDays, createRoutine, emptyData, localDate, toggleCheckin, updateRoutine, setFreeze } from '../src/domain.ts';
import type { HabitData } from '../src/domain.ts';

const today = localDate();
const daily = [0, 1, 2, 3, 4, 5, 6];
function fixture() {
  let data = createRoutine(emptyData(), { name: 'Morning', color: '#249c03', tasks: [{ name: 'Stretch', weekdays: daily }, { name: 'Plan', weekdays: daily }] }, addDays(today, -4));
  data = createRoutine(data, { name: 'Custom', color: '#249cff', tasks: [{ name: 'Read', weekdays: [new Date(today + 'T12:00:00').getDay()] }] }, addDays(today, -4));
  data = createRoutine(data, { name: 'Rest', color: '#a64ca6', tasks: [{ name: 'Rest-day task', weekdays: [(new Date(today + 'T12:00:00').getDay() + 1) % 7] }] }, addDays(today, -4));
  data = toggleCheckin(data, data.routines[0]!.tasks[0]!.id, today);
  data = toggleCheckin(data, data.routines[1]!.tasks[0]!.id, today);
  data = setFreeze(data, data.routines[0]!.id, addDays(today, -1), true, today);
  return data;
}
const bundle = async (production: boolean) => production ? readFile(new URL('../main.js', import.meta.url), 'utf8') :
  (await build({ entryPoints: [new URL('../src/main.ts', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'browser', external: ['obsidian'] })).outputFiles[0]!.text;
async function host(production: boolean, data = fixture(), enabled = false) {
  const files = new Map<string, string>(), notices: string[] = [], writes: string[] = [];
  let timer: () => void = () => {}, clock = new Date(today + 'T12:00:00').getTime();
  const controls: { save?: () => Promise<void>; write?: () => Promise<void> } = {};
  class File { path: string; constructor(path: string) { this.path = path; } }
  const FixedDate = new Proxy(Date, {
    construct(target, args) { return Reflect.construct(target, args.length ? args : [clock]); },
    get(target, property) { return property === 'now' ? () => clock : Reflect.get(target, property); },
  });
  const write = async (path: string, content: string) => { await controls.write?.(); files.set(path, content); writes.push(content); };
  const vault = {
    adapter: { write },
    getAbstractFileByPath: (path: string) => files.has(path) ? new File(path) : null,
    create: async (path: string, content: string) => { await write(path, content); return new File(path); },
    modify: async (file: File, content: string) => { await write(file.path, content); },
    process: async (file: File, fn: (text: string) => string) => { const content = fn(files.get(file.path)!); await write(file.path, content); return content; },
  };
  const commands: any[] = [];
  class Plugin {
    app = { vault, workspace: {} };
    saved: any;
    async loadData() { return { data, exportEnabled: enabled }; }
    async saveData(value: unknown) { await controls.save?.(); this.saved = structuredClone(value); }
    registerView() {} addRibbonIcon() {} addCommand(command: unknown) { commands.push(command); }
    registerMarkdownCodeBlockProcessor() {} addSettingTab() {} registerInterval() {}
  }
  const obsidian = { Plugin, ItemView: class {}, WorkspaceLeaf: class {}, Modal: class {}, MarkdownRenderChild: class {},
    PluginSettingTab: class {}, Setting: class {}, Notice: class { constructor(message: string) { notices.push(message); } },
    normalizePath: (path: string) => path, setIcon() {}, TFile: File };
  const module = { exports: {} as any };
  vm.runInNewContext(await bundle(production), { module, require: () => obsidian, Date: FixedDate, window: { setInterval: (callback: () => void) => { timer = callback; return 1; } }, console });
  const plugin = new module.exports.default();
  await plugin.onload();
  return { plugin, files, notices, writes, controls, commands, snapshot: () => JSON.parse(files.get('habit-widget.json')!),
    advance: (days: number) => { clock += days * 86400000; timer(); } };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
for (const production of [false, true]) {
  const name = production ? 'bundle export' : 'source export';
  test(`${name}: schema, local date, scheduled tasks, completion, names and colors`, async () => {
    const h = await host(production);
    assert.equal(h.files.size, 0, 'Export is off by default');
    const routine = h.plugin.data.routines[0];
    await h.plugin.mutate((data: HabitData) => updateRoutine(data, routine.id, { name: 'Renamed morning', color: '#329999', tasks: routine.tasks.map((task: any) => ({ ...task, name: task.name + ' updated' })) }, today));
    await h.plugin.exportSnapshot();
    const snapshot = h.snapshot();
    assert.equal(snapshot.version, 1); assert.equal(snapshot.date, today);
    assert.ok(Number.isFinite(Date.parse(snapshot.updatedAt)));
    assert.equal(snapshot.completed.length, 2); assert.equal(snapshot.remaining.length, 1);
    assert.equal(snapshot.remaining[0].name, 'Plan updated');
    assert.equal(snapshot.remaining[0].routine, 'Renamed morning'); assert.equal(snapshot.remaining[0].color, '#329999');
    assert.ok(snapshot.completed.some((task: any) => task.name === 'Read'));
    assert.ok(!JSON.stringify(snapshot).includes('Rest-day task'));
    assert.equal(h.files.has('habit.json'), false, 'Keep the existing companion filename');
    assert.equal(h.plugin.data.freezes[addDays(today, -1)].length, 1, 'Export does not change freezes');
  });
  test(`${name}: manual export waits for pending persisted check-in`, async () => {
    const h = await host(production), id = h.plugin.data.routines[0].tasks[1].id;
    let release!: () => void;
    h.controls.save = () => new Promise<void>(resolve => { release = resolve; });
    const check = h.plugin.mutate((data: HabitData) => toggleCheckin(data, id, today));
    await flush();
    const exportNow = h.plugin.exportSnapshot();
    await flush(); release(); await Promise.all([check, exportNow]);
    assert.equal(h.snapshot().remaining.length, 0, 'Export must include the pending saved check-in');
    assert.equal(h.snapshot().completed.length, 3);
  });
  test(`${name}: startup refresh, auto update, disable, and local midnight`, async () => {
    const h = await host(production, fixture(), true);
    assert.equal(h.writes.length, 1, 'Enabled export is refreshed on load');
    const id = h.plugin.data.routines[0].tasks[1].id;
    await h.plugin.mutate((data: HabitData) => toggleCheckin(data, id, today));
    assert.equal(h.snapshot().remaining.length, 0);
    h.advance(1); await flush(); await flush();
    assert.equal(h.snapshot().date, addDays(today, 1));
    assert.equal(h.snapshot().completed.length, 0, 'Yesterday check-ins do not roll into today');
    h.plugin.exportEnabled = false; await h.plugin.saveSettings();
    const count = h.writes.length;
    await h.plugin.mutate((data: HabitData) => toggleCheckin(data, id, addDays(today, 1), addDays(today, 1)));
    assert.equal(h.writes.length, count);
  });
  test(`${name}: export failure retains check-in and later export recovers`, async () => {
    const h = await host(production, fixture(), true), original = h.files.get('habit-widget.json');
    const id = h.plugin.data.routines[0].tasks[1].id;
    h.controls.write = async () => { throw Error('Snapshot disk full'); };
    await h.plugin.mutate((data: HabitData) => toggleCheckin(data, id, today));
    assert.equal(h.plugin.data.checkins[today][id], true); assert.equal(h.plugin.saved.data.checkins[today][id], true);
    assert.equal(h.files.get('habit-widget.json'), original); assert.match(h.notices[0]!, /Saved your check-in; widget export failed/);
    await assert.rejects(h.plugin.exportSnapshot(), /Snapshot disk full/);
    delete h.controls.write; await h.plugin.exportSnapshot();
    assert.equal(h.snapshot().completed.length, 3);
  });
  test(`${name}: empty export is valid and repeated exports replace one file`, async () => {
    const h = await host(production, emptyData());
    await h.plugin.exportSnapshot(); await h.plugin.exportSnapshot();
    assert.equal(h.files.size, 1); assert.deepEqual(h.snapshot().remaining, []); assert.deepEqual(h.snapshot().completed, []);
  });
}
