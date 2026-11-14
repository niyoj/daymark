import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { addDays, createRoutine, emptyData, localDate, toggleCheckin, widgetSnapshot } from '../src/domain.ts';

const source = await readFile(new URL('../companion/Daymark-Today.js', import.meta.url), 'utf8');
function fixture() {
  let data = createRoutine(emptyData(), {
    name: 'Morning', color: '#249c03',
    tasks: ['Stretch', 'Read', 'Plan', 'Walk', 'Write', 'Review'].map(name => ({ name, weekdays: [0,1,2,3,4,5,6] })),
  });
  data = toggleCheckin(data, data.routines[0]!.tasks[0]!.id, localDate());
  return widgetSnapshot(data);
}
interface Options {
  folder?: boolean; bookmark?: boolean; exists?: boolean; cloud?: boolean;
  downloadFails?: boolean; unreadable?: boolean; raw?: string;
  family?: string; ipad?: boolean; inWidget?: boolean; smallPreview?: boolean;
}
async function render(snapshot: unknown, options: Options = {}) {
  const labels: string[] = [], paths: string[] = [], rings: string[] = [], downloads: string[] = [];
  let installed = false, preview = '', refresh: Date | undefined;
  class Container {
    refreshAfterDate?: Date;
    addText(text: string) { labels.push(text); return {}; }
    addStack() { return new Container(); }
    addImage() { return {}; }
    addSpacer() {} setPadding() {} layoutHorizontally() {} layoutVertically() {} centerAlignContent() {}
    async presentLarge() { preview = 'large'; } async presentSmall() { preview = 'small'; }
  }
  class Color { constructor(_hex: string) {} }
  class Size { constructor(_width: number, _height: number) {} }
  class Point { x: number; y: number; constructor(x: number, y: number) { this.x = x; this.y = y; } }
  class Rect { constructor(_x: number, _y: number, _width: number, _height: number) {} }
  class Path { addLines() {} }
  class DrawContext {
    setLineWidth() {} setStrokeColor() {} strokeEllipse() {} addPath() {} strokePath() {}
    setFillColor() {} fillEllipse() {} setFont() {} setTextColor() {} setTextAlignedCenter() {}
    drawTextInRect(text: string) { rings.push(text); } getImage() { return {}; }
  }
  const target = options.folder ? '/vault' : '/vault/habit-widget.json';
  const manager = {
    bookmarkExists: (name: string) => { assert.equal(name, 'Daymark Widget'); return options.bookmark !== false; },
    bookmarkedPath: (name: string) => { assert.equal(name, 'Daymark Widget'); return target; },
    isDirectory: () => options.folder === true,
    joinPath: (directory: string, file: string) => `${directory}/${file}`,
    fileExists: (path: string) => { paths.push(path); return options.exists !== false; },
    isFileStoredIniCloud: () => options.cloud === true,
    isFileDownloaded: () => false,
    downloadFileFromiCloud: async (path: string) => { downloads.push(path); if (options.downloadFails) throw Error('Cloud unavailable'); },
    readString: () => { if (options.unreadable) throw Error('Access denied'); return options.raw ?? JSON.stringify(snapshot); },
  };
  const code = options.smallPreview ? source.replace('const previewSize = "large";', 'const previewSize = "small";') : source;
  await vm.runInNewContext(`(async () => { ${code}\n })()`, {
    config: { widgetFamily: options.inWidget === false ? undefined : options.family ?? 'large', runsInWidget: options.inWidget !== false },
    FileManager: { local: () => manager }, ListWidget: Container,
    Color, Size, Point, Rect, Path, DrawContext,
    DateFormatter: class { string(date: Date) { return date.toDateString(); } },
    Device: { isPad: () => options.ipad === true },
    Font: { systemFont() {}, semiboldSystemFont() {}, boldSystemFont() {} },
    Script: { setWidget: (widget: Container) => { installed = true; refresh = widget.refreshAfterDate; }, complete() {} },
    console: { log() {} },
  });
  assert.equal(installed, options.inWidget !== false);
  return { text: labels.join('\n'), paths, rings, downloads, preview, refresh };
}

test('Daymark Today reads the real exported schema through file and folder bookmarks', async () => {
  for (const folder of [false, true]) {
    const result = await render(fixture(), { folder });
    assert.deepEqual(result.paths, ['/vault/habit-widget.json']);
    assert.match(result.text, /1 \/ 6 done/); assert.match(result.text, /5 left today/);
    assert.match(result.text, /Read/); assert.match(result.text, /Morning/);
    assert.match(result.text, /If done/); assert.match(result.text, /—/);
    assert.doesNotMatch(result.text, /Stretch/);
    assert.deepEqual(result.rings, ['17%']);
  }
});

test('Daymark Today limits rows for iPhone, iPad, and compact widgets', async () => {
  const snapshot = fixture();
  assert.match((await render(snapshot)).text, /\+1 more/);
  assert.doesNotMatch((await render(snapshot, { ipad: true })).text, /\+\d more/);
  for (const family of ['small', 'medium']) {
    const result = await render(snapshot, { family });
    assert.match(result.text, /Read\nPlan/); assert.match(result.text, /\+3 more/);
    assert.doesNotMatch(result.text, /Walk|If done|—/);
  }
});

test('Daymark Today refuses to present previous-day progress as current', async () => {
  const snapshot = fixture(); snapshot.date = addDays(localDate(), -1);
  const result = await render(snapshot);
  assert.match(result.text, /Out of date/); assert.match(result.text, /Open Daymark/);
  assert.doesNotMatch(result.text, /1 \/ 6 done|Read/); assert.deepEqual(result.rings, []);
});

test('Daymark Today handles missing bookmarks, absent exports, and malformed content', async () => {
  assert.match((await render(fixture(), { bookmark: false })).text, /Connect Daymark/);
  assert.match((await render(fixture(), { exists: false })).text, /Export missing/);
  for (const snapshot of [{}, { ...fixture(), version: 2 }, { ...fixture(), remaining: [{ name: '' }] }]) {
    assert.match((await render(snapshot)).text, /Export unavailable/);
  }
  assert.match((await render(null, { raw: '{broken' })).text, /Can’t read export/);
  assert.match((await render(null, { unreadable: true })).text, /Can’t read export/);
});

test('Daymark Today downloads an iCloud placeholder before reading and recovers from download failure', async () => {
  const result = await render(fixture(), { cloud: true });
  assert.deepEqual(result.downloads, ['/vault/habit-widget.json']); assert.match(result.text, /1 \/ 6 done/);
  assert.deepEqual((await render(fixture())).downloads, []);
  assert.match((await render(fixture(), { cloud: true, downloadFails: true })).text, /Can’t read export/);
});

test('Daymark Today distinguishes empty and completed days', async () => {
  const snapshot = fixture(); snapshot.completed.push(...snapshot.remaining); snapshot.remaining = [];
  const complete = await render(snapshot);
  assert.match(complete.text, /6 \/ 6 done/); assert.match(complete.text, /All done today/);
  assert.deepEqual(complete.rings, ['100%']);
  const empty = await render(widgetSnapshot(emptyData()));
  assert.match(empty.text, /No tasks due/); assert.deepEqual(empty.rings, []);
});

test('Daymark Today previews in-app and bounds its refresh request by midnight', async () => {
  assert.equal((await render(fixture(), { inWidget: false })).preview, 'large');
  assert.equal((await render(fixture(), { inWidget: false, smallPreview: true })).preview, 'small');
  const before = Date.now(), midnight = new Date(); midnight.setHours(24,0,0,0);
  const result = await render(fixture()), refresh = result.refresh!.getTime();
  assert.ok(refresh >= before && refresh <= Date.now() + 15 * 60 * 1000);
  assert.ok(refresh <= midnight.getTime());
});
