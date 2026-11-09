// firestore.rules.template と storage.rules.template に許可ドメインを埋め込んで、
// firestore.rules と storage.rules を生成する。
// セキュリティルールは環境変数を読めないため、デプロイ前・エミュレーター起動前に生成する。
//   node scripts/build-rules.mjs --mode development   (.env.development を使う)
//   node scripts/build-rules.mjs --mode production    (.env.production を使う)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function parseDomains(value) {
  const domains = String(value ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  for (const d of domains) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw new Error(`不正なドメイン: ${d}`);
  }
  if (domains.length === 0) throw new Error('VITE_ALLOWED_DOMAINS が設定されていません');
  return domains;
}

export function buildRules(domains, templateName = 'firestore.rules.template') {
  // ルールの正規表現はRE2。"." は [.] にしてバックスラッシュのエスケープを避ける。
  const pattern = `[^@]+@(${domains.map((d) => d.replaceAll('.', '[.]')).join('|')})`;
  const template = readFileSync(join(root, templateName), 'utf8');
  const placeholder = '__ALLOWED_EMAIL_PATTERN__';
  if (template.split(placeholder).length !== 2) {
    throw new Error(`テンプレート中の ${placeholder} はちょうど1か所である必要があります`);
  }
  return template.replace(placeholder, pattern);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const modeIndex = process.argv.indexOf('--mode');
  const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : 'development';
  const env = loadEnv(mode, root, 'VITE_');
  const domains = parseDomains(env.VITE_ALLOWED_DOMAINS);
  writeFileSync(join(root, 'firestore.rules'), buildRules(domains));
  writeFileSync(join(root, 'storage.rules'), buildRules(domains, 'storage.rules.template'));
  console.log(`firestore.rules と storage.rules を生成しました（mode=${mode}, domains=${domains.join(', ')}）`);
}
