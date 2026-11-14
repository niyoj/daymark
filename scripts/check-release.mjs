import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const manifest = JSON.parse(await fs.readFile('manifest.json', 'utf8'));
const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const versions = JSON.parse(await fs.readFile('versions.json', 'utf8'));
const semver = /^\d+\.\d+\.\d+$/;
assert.match(manifest.version, semver);
assert.match(manifest.minAppVersion, semver);
assert.equal(manifest.version, pkg.version, 'Package and manifest versions differ');
assert.equal(versions[manifest.version], manifest.minAppVersion, 'versions.json does not match the manifest');
assert.equal(manifest.id, 'niyoj-daymark', 'Keep the installed data identity stable');
assert.equal(manifest.author, 'niyoj');
assert.equal(manifest.name, 'Daymark Habits');
assert.ok(manifest.description.length <= 250 && manifest.description.endsWith('.'));
assert.equal(manifest.isDesktopOnly, false);
assert.equal(pkg.license, '0BSD');
if (process.argv[2]) assert.equal(process.argv[2], manifest.version, 'Release tag must match manifest.version, without a v prefix');
for (const file of ['README.md', 'LICENSE', 'main.js', 'styles.css']) assert.ok((await fs.stat(file)).size > 0, `Missing release file: ${file}`);
const bundle = await fs.readFile('main.js', 'utf8');
for (const call of bundle.matchAll(/require\(["']([^"']+)["']\)/g)) assert.equal(call[1], 'obsidian', `Mobile-incompatible runtime dependency: ${call[1]}`);
const readme = await fs.readFile('README.md', 'utf8');
for (const match of readme.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
  const link = match[1].split('#')[0];
  if (!link || /^[a-z]+:/i.test(link)) continue;
  assert.ok(!path.isAbsolute(link), `Use portable links in the README: ${link}`);
  await fs.access(link);
}
console.log(`Release checks passed: ${manifest.name} ${manifest.version}; required assets, portable links, and mobile bundle imports.`);
