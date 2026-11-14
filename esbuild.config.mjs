// Adapted from the official Obsidian sample plugin (0-BSD).
import esbuild from 'esbuild';
import { builtinModules } from 'node:module';
const prod = process.argv[2] === 'production';
const ctx = await esbuild.context({entryPoints:['src/main.ts'],bundle:true,external:['obsidian','electron',...builtinModules],format:'cjs',target:'es2021',outfile:'main.js',sourcemap:prod?false:'inline',minify:false,logLevel:'info'});
if(prod){await ctx.rebuild();await ctx.dispose();}else{await ctx.watch();}
