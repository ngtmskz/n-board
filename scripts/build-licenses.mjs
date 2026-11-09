// アプリが使っているオープンソースのライセンスの全文を集めて public/licenses.txt に書き出す。
// 「このサービスについて」の画面からリンクする。開発サーバーの起動前とビルド前に実行する。
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** ライセンス文のファイルがないパッケージに示す、標準の全文の場所 */
const SPDX_URLS = {
  'Apache-2.0': 'https://www.apache.org/licenses/LICENSE-2.0',
  MIT: 'https://opensource.org/license/mit',
  ISC: 'https://opensource.org/license/isc-license-txt',
  'BSD-3-Clause': 'https://opensource.org/license/bsd-3-clause',
  '0BSD': 'https://opensource.org/license/0bsd',
};

// 本番で使うパッケージ（devDependencies を除く）の場所を、依存の依存まで含めて一覧にする
const listing = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const dirs = [...new Set(listing.split('\n').map((l) => l.trim()).filter((l) => l && l !== root))];

const seen = new Set();
const sections = [];
for (const dir of dirs) {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const id = `${pkg.name}@${pkg.version}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const licenseFile = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  const license = typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? '不明');
  const text = licenseFile
    ? readFileSync(join(dir, licenseFile), 'utf8').trim()
    : `（パッケージにライセンス文のファイルが含まれていないため、標準の全文へのリンクを示す）\n${SPDX_URLS[license] ?? `https://spdx.org/licenses/${license}.html`}`;
  sections.push({ id, text: `${id}\nライセンス：${license}\n\n${text}` });
}
sections.sort((a, b) => a.id.localeCompare(b.id));

const header = `N-Board が使っているオープンソースソフトウェアのライセンス
（このファイルはビルド時に自動で作られる。${sections.length} 件）

効果音・BGM の出典は「このサービスについて」の画面と、public/sounds/CREDITS.md・public/music/CREDITS.md を参照。
`;
const out = [header, ...sections.map((s) => s.text)].join(`\n\n${'='.repeat(72)}\n\n`) + '\n';
writeFileSync(join(root, 'public', 'licenses.txt'), out);
console.log(`public/licenses.txt を作成しました（${sections.length} 件）`);
