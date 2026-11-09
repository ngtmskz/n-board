// セキュリティルールのテストを実行する。
// エミュレーターが起動中（npm run dev 中など）ならそれを使い、なければ一時的に起動する。
// テストは別のプロジェクトIDを使うので、開発中のデータには影響しない。
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { runFirebase } from './firebase.mjs';

const HOST = '127.0.0.1';
const PORT = 8080;

function isListening() {
  return new Promise((resolve) => {
    const socket = connect(PORT, HOST);
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
  });
}

const child = (await isListening())
  ? spawn('npx', ['vitest', 'run'], {
      stdio: 'inherit',
      env: { ...process.env, FIRESTORE_EMULATOR_HOST: `${HOST}:${PORT}` },
    })
  : runFirebase(['emulators:exec', '--only', 'firestore', 'npx vitest run']);
child.on('exit', (code) => process.exit(code ?? 1));
