# Glaze Store Catalog

An organized, auto-maintained index of every public app in the [Glaze Store](https://www.glaze.app/store).

**1553** apps · **7** categories · **1152** publishers · **25,969** installs

## Browse

| View | |
| --- | --- |
| [By installs](./ranked/README.md) | every app ranked by install count |
| [By category](#categories) | the store's own categories, install-sorted |
| [By publisher](./publishers.md) | every publisher, ranked by total installs |
| [Recent](./recent.md) | newest releases and updates |
| [Changelog](./CHANGELOG.md) | apps added, removed, and updated per sync |

## Categories

| Category | Apps | Installs |
| --- | --- | --- |
| [Productivity](./categories/productivity.md) | 499 | 5,445 |
| [Utilities](./categories/utilities.md) | 383 | 5,819 |
| [Developer Tools](./categories/developer-tools.md) | 311 | 7,490 |
| [Media](./categories/media.md) | 130 | 4,564 |
| [Design](./categories/design.md) | 93 | 1,493 |
| [Games & Fun](./categories/games-fun.md) | 85 | 771 |
| [Lifestyle](./categories/lifestyle.md) | 52 | 387 |

## Most installed

| # | App | Installs | Category | Publisher |
| --- | --- | --- | --- | --- |
| 1 | [World Cup 2026](https://www.glaze.app/app/PtePF9) | 1,468 | Media | Thomas Paul Mann |
| 2 | [Claude Usage](https://www.glaze.app/app/claude-usage-2iVSvr) | 839 | Developer Tools | Boufford |
| 3 | [AI Skills Browser](https://www.glaze.app/app/ai-skills-browser-vMg0FR) | 838 | Developer Tools | alexi.build |
| 4 | [ray.fm](https://www.glaze.app/app/Af8oi9) | 837 | Media | Samuel Kraft |
| 5 | [Mac Setup](https://www.glaze.app/app/mac-setup-ZtKVr6) | 703 | Developer Tools | Nichlas Wærnes Andersen |
| 6 | [Highlight](https://www.glaze.app/app/highlight-puwjxR) | 606 | Developer Tools | Thomas Paul Mann |
| 7 | [Dynamic Wallpaper](https://www.glaze.app/app/xJvbba) | 487 | Utilities | Jordan Amblin |
| 8 | [Defaults](https://www.glaze.app/app/defaults-G62ohp) | 410 | Utilities | Thomas Paul Mann |
| 9 | [Peel](https://www.glaze.app/app/peel-esimhU) | 401 | Utilities | Thomas Paul Mann |
| 10 | [SubsTrack](https://www.glaze.app/app/substrack-Sxg9zV) | 399 | Productivity | Khalid Hasan Zibon |

## How this stays up to date

A scheduled job runs `node scripts/glaze-catalog/sync.mjs --push`. Glaze's backend requires an API key, so the store page's server-rendered payload is parsed instead — one request, no credentials. Every run diffs against [`data/apps.json`](./data/apps.json); the JSON always tracks current install counts, while these pages are regenerated when an app is added, removed or updated, when the top 50 install ranking moves, or once a day regardless. Runs that find nothing meaningful make no commit.
