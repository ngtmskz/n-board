// vite.config.ts の define でビルド時に埋め込む値
declare const __APP_VERSION__: string;
/** ビルドした日（YYYY-MM-DD）。開発サーバーでは null。 */
declare const __BUILD_DATE__: string | null;
declare const __APP_DEPENDENCIES__: { name: string; version: string; license: string }[];
