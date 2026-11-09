# スタンプの絵の出典

スタンプの絵は Google の Noto Emoji を使っています。

| 種類 | ファイル | 提供元 | ライセンス |
|---|---|---|---|
| 止まった絵 | `*.svg` | Noto Emoji（https://github.com/googlefonts/noto-emoji の `2D/svg`） | Apache License 2.0（全文は `LICENSE-noto-emoji.txt`） |
| 貼ったときの動き | `anim/*.json`（Lottie） | Noto Emoji Animation（https://googlefonts.github.io/noto-emoji-animation/） | CC BY 4.0（https://creativecommons.org/licenses/by/4.0/deed.ja） |

- ファイルは改変せずにそのまま置いています。
- `question`（❓）の動きは、最後まで再生すると消えてしまうため、アプリ側で途中（描き終わったところ）で止めています（`src/constants.ts` の `STAMP_ANIMATION_OVERRIDES`）。

| ファイル名 | 絵文字 | 止まった絵の元ファイル |
|---|---|---|
| like | 👍 | emoji_u1f44d.svg |
| heart | ❤️ | emoji_u2764.svg |
| star | ⭐ | emoji_u2b50.svg |
| hundred | 💯 | emoji_u1f4af.svg |
| fire | 🔥 | emoji_u1f525.svg |
| idea | 💡 | emoji_u1f4a1.svg |
| rofl | 🤣 | emoji_u1f923.svg |
| eyes | 👀 | emoji_u1f440.svg |
| question | ❓ | emoji_u2753.svg |

アプリ内では、履歴画面のアカウントのメニューから開く「このサービスについて」にクレジットを表示している。
