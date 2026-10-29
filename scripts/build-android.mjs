import { copyFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const androidDir = resolve(root, 'android');
const wrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const build = spawnSync(wrapper, ['assembleDebug'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const apk = resolve(androidDir, 'app/build/outputs/apk/debug/app-debug.apk');
const outputDir = resolve(root, 'dist');
await mkdir(outputDir, { recursive: true });
await copyFile(apk, resolve(outputDir, 'MathVision.apk'));
console.log(`APK ready: ${resolve(outputDir, 'MathVision.apk')}`);
