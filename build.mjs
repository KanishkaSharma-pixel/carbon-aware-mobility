import {build} from 'esbuild';import fs from 'node:fs';
fs.mkdirSync('dist',{recursive:true});await build({entryPoints:['src/main.tsx'],bundle:true,outdir:'dist',format:'esm',minify:true,sourcemap:true,loader:{'.tsx':'tsx','.ts':'ts','.png':'dataurl'}});fs.copyFileSync('index.html','dist/index.html');fs.cpSync('public','dist',{recursive:true});
await build({entryPoints:['src/engine.ts'],bundle:true,outfile:'tests/engine.bundle.mjs',platform:'node',format:'esm'});
