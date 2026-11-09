/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** 「このサービスについて」に出す、アプリが直接使っているパッケージとライセンス */
const dependencies = Object.keys(pkg.dependencies).map((name) => {
  const dep = JSON.parse(readFileSync(new URL(`./node_modules/${name}/package.json`, import.meta.url), 'utf8'));
  return { name, version: dep.version, license: dep.license };
});

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: { port: 5173 },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // 開発サーバーでは日付の代わりに「開発版」と出す
    __BUILD_DATE__: JSON.stringify(command === 'build' ? new Date().toISOString().slice(0, 10) : null),
    __APP_DEPENDENCIES__: JSON.stringify(dependencies),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
    fileParallelism: false,
  },
}));
