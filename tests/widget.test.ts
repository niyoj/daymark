import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { addDays, localDate } from '../src/domain.ts';

const source = await readFile(new URL('../companion/Scriptable.js', import.meta.url), 'utf8');

async function render(snapshot: unknown, exists = true) {
  const labels: string[] = [];
  let installed = false;
  class Widget {
    setPadding() {}
    addText(text: string) { labels.push(text); return {}; }
    addSpacer() {}
  }
  class Color { static dynamic(a: unknown) { return a; } constructor(_value: string) {} }
  const manager = {
    bookmarkExists: () => true,
    bookmarkedPath: () => '/bookmarked/habit-widget.json',
    fileExists: () => exists,
    downloadFileFromiCloud: async () => {},
    readString: () => JSON.stringify(snapshot),
  };
  await vm.runInNewContext(`(async () => { ${source}\n })()`, {
    args: {}, config: { widgetFamily: 'medium', runsInWidget: true },
    FileManager: { iCloud: () => manager }, ListWidget: Widget, Color,
    Font: { systemFont: () => {}, semiboldSystemFont: () => {} },
    Script: { setWidget: () => { installed = true; }, complete: () => {} },
    console: { warn: () => {} },
  });
  assert.equal(installed, true);
  return labels.join('\n');
}

test('widget renders current snapshot counts and remaining tasks', async () => {
  const result = await render({ date: localDate(), updatedAt: new Date().toISOString(),
    remaining: [{ name: 'Read' }], completed: [{ name: 'Stretch' }],
  });
  assert.match(result, /1 remaining/);
  assert.match(result, /○ Read/);
  assert.match(result, /1 completed/);
  assert.doesNotMatch(result, /Snapshot may be stale/);
});

test('widget labels yesterday and never presents old counts as current', async () => {
  const yesterday = addDays(localDate(), -1);
  const result = await render({ date: yesterday, updatedAt: new Date().toISOString(), remaining: [], completed: [] });
  assert.match(result, new RegExp(yesterday));
  assert.match(result, /Open Obsidian to refresh/);
  assert.match(result, /Earlier snapshot/);
  assert.doesNotMatch(result, /Everything scheduled is done/);
});

test('widget flags old exports and recovers from missing or malformed snapshots', async () => {
  const result = await render({ date: localDate(), updatedAt: new Date(Date.now() - 3 * 3600000).toISOString(), remaining: [], completed: [] });
  assert.match(result, /Snapshot may be stale/);
  assert.match(await render({}, false), /Connect your habits/);
  assert.match(await render({ date: localDate() }), /Connect your habits/);
});
