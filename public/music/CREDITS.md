# BGM の出典

このフォルダの BGM は OtoLogic のフリー素材を、ループ再生用に編集したものです。
CC BY 4.0 で提供されており、クレジット（「OtoLogic」の表記）を表示することを条件に使用しています。
編集（曲の一部を切り出し、つなぎ目を短く重ねてループにしたもの）は、ライセンスで認められている改変にあたる。

- 提供元：OtoLogic（https://otologic.jp/）
- ライセンス：CC BY 4.0（https://creativecommons.org/licenses/by/4.0/deed.ja）
- 利用規約：https://otologic.jp/free/license.html
- 編集：曲の一部を切り出して、つなぎ目なくループするようにした（ループ用に編集）

| ファイル | 画面の曲名 | 元の曲（OtoLogic） | 掲載ページ | 切り出した部分 | ループの長さ |
|---|---|---|---|---|---|
| relax.mp3 | リラックス | ほっこりティータイム（hokkori tea time） | ボサノバ（https://otologic.jp/free/bgm/bossanova01.html） | 26.54〜89.84 秒 | 63.30 秒 |
| focus.mp3 | フォーカス | Specification | エレクトロニカ（https://otologic.jp/free/bgm/electronica01.html） | 60.67〜127.45 秒 | 66.78 秒 |
| happy.mp3 | ハッピー | Special To Me | ジャズ（https://otologic.jp/free/bgm/jazz01.html） | 29.61〜102.77 秒 | 73.17 秒 |
| groove.mp3 | ノリノリ | 夜の雑踏（yoru no zattou） | ジャズ（https://otologic.jp/free/bgm/jazz01.html） | 29.09〜83.41 秒 | 54.31 秒 |

アプリ内では、履歴画面のアカウントのメニューから開く「このサービスについて」にクレジットを表示している。

## 曲を差し替える・増やすとき

- 30〜90 秒くらいの、最後と最初がつながるループにする（頭と最後に無音を入れない）
- `src/constants.ts` の `BGM_TRACKS` に曲名とファイル名を書く
- 曲の ID を増やす・変える場合は、セキュリティルール（firestore.rules.template の validBgm）も直す
- 出典をこのファイルに書く
