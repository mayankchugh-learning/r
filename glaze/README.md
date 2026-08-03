# Glaze Store Catalog

An organized, auto-maintained index of every public app in the [Glaze Store](https://www.glaze.app/store).

**1,578** apps · **7** categories · **1,165** publishers · **27,842** installs · **2.67 GB** total, median **83 KB**

## Browse

| View | |
| --- | --- |
| [By installs](./ranked/README.md) | every app ranked by install count |
| [By size](./sizes/README.md) | every app ranked by download size |
| [By category](./categories/README.md) | 7 categories → curated topics → auto-discovered groups (✦), nested as deep as the data supports |
| [By publisher](./publishers/README.md) | 1,165 publishers, sortable by installs or app count |
| [Alphabetical](./alphabetical/a.md) | every app, A–Z |
| [Recent](./recent.md) | newest releases and updates |
| [Changelog](./CHANGELOG.md) | apps added, removed, and updated per sync |

## By section

| Section | Categories | Apps | Installs |
| --- | --- | --- | --- |
| Work & Productivity | Productivity | 507 | 6,251 |
| Development | Developer Tools | 313 | 7,675 |
| System & Utilities | Utilities | 390 | 6,169 |
| Creative & Media | Design, Media | 228 | 6,527 |
| Life & Play | Lifestyle, Games & Fun | 140 | 1,220 |

## Most installed

| # | App | Installs | Category | Publisher |
| --- | --- | --- | --- | --- |
| 1 | [World Cup 2026](https://www.glaze.app/app/PtePF9) | 1,468 | Media | Thomas Paul Mann |
| 2 | [AI Skills Browser](https://www.glaze.app/app/ai-skills-browser-vMg0FR) | 860 | Developer Tools | alexi.build |
| 3 | [Claude Usage](https://www.glaze.app/app/claude-usage-2iVSvr) | 853 | Developer Tools | Boufford |
| 4 | [ray.fm](https://www.glaze.app/app/Af8oi9) | 844 | Media | Samuel Kraft |
| 5 | [Mac Setup](https://www.glaze.app/app/ZtKVr6) | 712 | Developer Tools | Nichlas Wærnes Andersen |
| 6 | [Highlight](https://www.glaze.app/app/highlight-puwjxR) | 623 | Developer Tools | Thomas Paul Mann |
| 7 | [Dynamic Wallpaper](https://www.glaze.app/app/xJvbba) | 491 | Utilities | Jordan Amblin |
| 8 | [Defaults](https://www.glaze.app/app/defaults-G62ohp) | 447 | Utilities | Thomas Paul Mann |
| 9 | [Peel](https://www.glaze.app/app/esimhU) | 417 | Utilities | Thomas Paul Mann |
| 10 | [Radical](https://www.glaze.app/app/radical-s4LsSN) | 415 | Productivity | Maya Avendaño |

## How this stays up to date

A scheduled job runs `node scripts/glaze-catalog/sync.mjs --push`. Glaze's backend requires an API key, so the store's own public search endpoint is queried per category — one request each, no credentials — and the union is the whole store. Every run diffs against [`data/apps.json`](./data/apps.json); the JSON always tracks current install counts, while these pages are regenerated when an app is added, removed or updated, when the top 50 install ranking moves, or once a day regardless.

Topics below each category are not a fixed list: curated keyword rules (`scripts/glaze-catalog/taxonomy.mjs`) provide the first split, then frequent-term mining promotes emergent topics out of "General" (marked ✦) and keeps splitting any group that still yields at least two coherent subgroups of 4+ apps.
