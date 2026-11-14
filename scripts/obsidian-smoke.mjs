/** Prepare an isolated demo vault and optionally launch Obsidian.
 * Run: node --experimental-strip-types scripts/obsidian-smoke.mjs [--launch]
 * This never reads or modifies the user's normal Obsidian profile or vault.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { emptyData, createRoutine, localDate, addDays, dueTasks, toggleCheckin, setFreeze } from '../src/domain.ts';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vault = path.join(project, 'test-vault');
const manifest = JSON.parse(await fs.readFile(path.join(project, 'manifest.json'), 'utf8'));
const plugin = path.join(vault, '.obsidian/plugins', manifest.id);
const profile = '/private/tmp/daymark-obsidian-profile';
await fs.mkdir(plugin, { recursive: true });
await fs.mkdir(profile, { recursive: true });
for (const filename of ['main.js', 'manifest.json', 'styles.css']) await fs.copyFile(path.join(project, filename), path.join(plugin, filename));

const today = localDate();
let data = emptyData();
for (const [name, color, names] of [
  ['Morning ritual', '#249c03', ['Stretch for 5 minutes', 'Read 10 pages', 'Plan the day']],
  ['Move your body', '#329999', ['Take a mindful walk']],
  ['Make something', '#249cff', ['Write a little every day']],
  ['Evening reset', '#a64ca6', ['Review notes', 'Put the phone away']],
]) {
  data = createRoutine(data, { name, color, tasks: names.map(name => ({ name, weekdays: [0, 1, 2, 3, 4, 5, 6] })) }, addDays(today, -27));
}
for (let n = 27; n >= 0; n--) {
  const date = addDays(today, -n);
  for (const [i, routine] of data.routines.entries()) {
    for (const [j, task] of dueTasks(data, routine.id, date).entries()) {
      if (n === 0 ? i === 0 && j < 2 : (n + i) % 9 !== 0 && (n + i + j) % 13 !== 0) {
        data = toggleCheckin(data, task.id, date, today);
      }
    }
  }
}
data = setFreeze(data, data.routines[0].id, addDays(today, -9), true, today);
await fs.writeFile(path.join(plugin, 'data.json'), JSON.stringify({ data, exportEnabled: false }, null, 2));
await fs.writeFile(path.join(vault, '.obsidian/community-plugins.json'), JSON.stringify([manifest.id]));
await fs.writeFile(path.join(vault, '.obsidian/app.json'), '{}');
await fs.writeFile(path.join(vault, 'Welcome.md'), '# Your everyday, a little brighter\n\nOpen **Daymark: Open Today** from the command palette.\n\n```habit-board\n```\n');
await fs.writeFile(path.join(profile, 'obsidian.json'), JSON.stringify({ vaults: { daymarkprototype: { path: vault, ts: Date.now(), open: true } } }));
console.log(`Prepared isolated demo vault: ${vault}`);
if (process.argv.includes('--launch')) {
  const child = spawn('/Applications/Obsidian.app/Contents/MacOS/Obsidian', [`--user-data-dir=${profile}`, '--remote-debugging-port=9231'], { stdio: 'inherit' });
  child.on('error', error => { console.error(`Obsidian launch failed: ${error.message}`); process.exitCode = 1; });
  child.on('exit', (code, signal) => { if (code || signal) { console.error(`Obsidian exited: ${signal ?? code}`); process.exitCode = 1; } });
}
