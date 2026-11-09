// エミュレーターと Vite の開発サーバーを同時に起動する。
import { spawn } from 'node:child_process';

const children = [
  spawn('npm', ['run', 'emulators'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev:web'], { stdio: 'inherit' }),
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGINT');
  setTimeout(() => process.exit(code), 3000).unref();
}
for (const child of children) child.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
