import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'www');
const files = ['index.html', 'app.js', 'geometry3d.js', 'geokernel.js', 'grader.js', 'latex.js', 'mobile-bridge.js'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) await cp(resolve(root, file), resolve(output, file));
await mkdir(resolve(output, 'vendor'), { recursive: true });
await cp(resolve(root, 'node_modules/@capacitor/core/dist/index.js'), resolve(output, 'vendor/capacitor-core.js'));
await cp(resolve(root, 'node_modules/three/build'), resolve(output, 'vendor/three/build'), { recursive: true });
await cp(resolve(root, 'node_modules/three/examples/jsm'), resolve(output, 'vendor/three/addons'), { recursive: true });
await cp(resolve(root, 'node_modules/katex/dist/katex.min.css'), resolve(output, 'vendor/katex.min.css'));
await cp(resolve(root, 'node_modules/katex/dist/katex.min.js'), resolve(output, 'vendor/katex.min.js'));
await cp(resolve(root, 'node_modules/katex/dist/fonts'), resolve(output, 'vendor/fonts'), { recursive: true });
await cp(resolve(root, 'node_modules/mathjax/es5'), resolve(output, 'vendor/mathjax'), { recursive: true });
console.log(`Copied ${files.length} app files into www/`);
