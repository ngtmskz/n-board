# Changelog

All notable changes to N-Board are recorded here. Versions follow [Semantic Versioning](https://semver.org/).

- **Major** — changes you need to act on when updating (renamed settings, data that must be migrated, etc.)
- **Minor** — new features that work without any changes on your side
- **Patch** — bug fixes and small wording or layout fixes

## [Unreleased]

### Fixed

- CSV export now also prefixes `'` to text that starts with `-` (except plain numbers and a lone `-`), so spreadsheet apps such as Excel don't evaluate it as a formula. Bullet-style notes like `- idea` were shown as `#NAME?` in Excel before

## [1.0.0] - 2026-11-09

The first public release.

### Added

- Sticky notes in 7 colors, sections, plain text, and images (paste, drag and drop, or pick a file)
- Arrows that connect notes, text, images and sections, with optional labels and two-way arrows
- Realtime collaboration with a list of who's on the board
- Animated stamps based on Noto Emoji, plus a stamp with your profile photo
- A shared timer with a 3-second countdown, confetti and sound, and 4 looping background music tracks
- Comments on sticky notes
- Export to CSV, PNG and a single HTML file
- Copy and paste between boards
- Sharing with everyone in your organization who has the link, or only with invited people
- Sign-in limited to Google accounts in allowed domains, enforced by Firestore and Storage security rules
- English and Japanese UI
- Settings in `.env` for the app name, taglines, feedback contact and the "Powered by N-Board" line

[1.0.0]: https://github.com/ngtmskz/n-board/releases/tag/v1.0.0
