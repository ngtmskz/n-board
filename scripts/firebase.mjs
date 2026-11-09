// firebase-tools をプロジェクト内のものを使って起動する。
// Homebrew の openjdk@21 は keg-only でPATHに入らないため、ここでだけPATHに足す。
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

export function javaEnv(env = process.env) {
  const candidates = [
    env.JAVA_HOME,
    '/opt/homebrew/opt/openjdk@21',
    '/usr/local/opt/openjdk@21',
  ].filter(Boolean);
  const home = candidates.find((dir) => existsSync(join(dir, 'bin', 'java')));
  if (!home) return env;
  return { ...env, JAVA_HOME: home, PATH: `${join(home, 'bin')}${delimiter}${env.PATH}` };
}

export function runFirebase(args, options = {}) {
  return spawn(process.execPath, ['node_modules/firebase-tools/lib/bin/firebase.js', ...args], {
    stdio: 'inherit',
    env: javaEnv(),
    ...options,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const child = runFirebase(process.argv.slice(2));
  child.on('exit', (code) => process.exit(code ?? 1));
}
