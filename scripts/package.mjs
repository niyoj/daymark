import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const {id,version}=JSON.parse(await readFile('manifest.json','utf8'));
await mkdir(`dist/${id}`,{recursive:true});
for(const name of ['main.js','manifest.json','styles.css'])await copyFile(name,`dist/${id}/${name}`);
execFileSync('zip',['-q','-r',`${id}-${version}.zip`,id],{cwd:'dist'});
console.log(`Ready: dist/${id}-${version}.zip (extract into your vault's .obsidian/plugins/)`);
