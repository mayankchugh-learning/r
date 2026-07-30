# Glaze Store Catalog

An organized, auto-maintained index of every public app in the [Glaze Store](https://www.glaze.app/store).

**69** apps · **6** categories · **58** publishers · **10,033** installs

## Browse

| View | |
| --- | --- |
| [By installs](./ranked.md) | every app ranked by install count |
| [By category](#categories) | the store's own categories, install-sorted |
| [By publisher](./publishers.md) | every publisher, ranked by total installs |
| [Recent](./recent.md) | newest releases and updates |
| [Changelog](./CHANGELOG.md) | apps added, removed, and updated per sync |

## Categories

| Category | Apps | Installs |
| --- | --- | --- |
| [Utilities](./categories/utilities.md) | 22 | 2,517 |
| [Developer Tools](./categories/developer-tools.md) | 17 | 4,484 |
| [Productivity](./categories/productivity.md) | 16 | 1,409 |
| [Media](./categories/media.md) | 8 | 1,122 |
| [Design](./categories/design.md) | 5 | 500 |
| [Lifestyle](./categories/lifestyle.md) | 1 | 1 |

## Most installed

| # | App | Installs | Category | Publisher |
| --- | --- | --- | --- | --- |
| 1 | [Claude Usage](https://www.glaze.app/app/claude-usage-2iVSvr) | 838 | Developer Tools | Boufford |
| 2 | [AI Skills Browser](https://www.glaze.app/app/ai-skills-browser-vMg0FR) | 834 | Developer Tools | alexi.build |
| 3 | [Mac Setup](https://www.glaze.app/app/mac-setup-ZtKVr6) | 701 | Developer Tools | Nichlas Wærnes Andersen |
| 4 | [Highlight](https://www.glaze.app/app/highlight-puwjxR) | 603 | Developer Tools | Thomas Paul Mann |
| 5 | [Defaults](https://www.glaze.app/app/defaults-G62ohp) | 400 | Utilities | Thomas Paul Mann |
| 6 | [CS Glaze Synth](https://www.glaze.app/app/9TGenH) | 397 | Media | Combustion Studio |
| 7 | [SubsTrack](https://www.glaze.app/app/substrack-Sxg9zV) | 397 | Productivity | Khalid Hasan Zibon |
| 8 | [Peel](https://www.glaze.app/app/peel-esimhU) | 394 | Utilities | Thomas Paul Mann |
| 9 | [Icon Keeper](https://www.glaze.app/app/icon-keeper-x9TGum) | 335 | Utilities | Yann-Edern Gillet |
| 10 | [Hotkey Explorer](https://www.glaze.app/app/hotkey-explorer-Lu5b3W) | 317 | Developer Tools | Alex Antonov |

## How this stays up to date

A scheduled job runs `node scripts/glaze-catalog/sync.mjs --push`. Glaze's backend requires an API key, so the store page's server-rendered payload is parsed instead — one request, no credentials. Every run diffs against [`data/apps.json`](./data/apps.json); the JSON always tracks current install counts, while these pages are regenerated when an app is added, removed or updated, when the top 25 install ranking moves, or once a day regardless. Runs that find nothing meaningful make no commit.
