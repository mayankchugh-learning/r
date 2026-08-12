# Raycast Extensions Catalog

An organized, auto-maintained index of every extension in [raycast/extensions](https://github.com/raycast/extensions).

**3165** extensions · **17** categories · **2109** publishers

## Browse

| View | |
| --- | --- |
| [By downloads](./ranked/README.md) | every extension ranked by installs |
| [By category](./categories/README.md) | 17 categories → curated subcategories → auto-discovered topic groups (✦), nested as deep as the data supports |
| [By platform](./platforms/README.md) | macOS (3133) · Windows (840) · cross-platform (808), each by category |
| [By publisher](./publishers/README.md) | 2109 publishers, sortable by downloads or extension count; big publishers get their own page |
| [Alphabetical](./alphabetical/0-9.md) | every extension, A–Z |
| [Changelog](./CHANGELOG.md) | upstream additions, updates, removals per sync |

## By section

17 categories in 7 sections — full per-category breakdown in [categories/](./categories/README.md).

| Section | Categories | Extensions |
| --- | --- | --- |
| Work & Productivity | Productivity, Applications, Communication | 1,673 |
| Development | Developer Tools, AI, Documentation, Data, Security | 1,399 |
| Creative & Media | Design Tools, Media | 419 |
| Web, Finance & News | Web, Finance, News | 659 |
| System & Utilities | System, Other | 433 |
| Fun & Entertainment | Fun | 276 |
| Uncategorized | Uncategorized | 114 |

## How this stays up to date

A scheduled job runs `node scripts/extension-catalog/sync.mjs --push`, which fetches the latest upstream tree, diffs every extension's tree SHA against [`data/extensions.json`](./data/extensions.json), downloads only the changed manifests, regenerates these pages, and records additions/updates/removals in [CHANGELOG.md](./CHANGELOG.md). Runs that find no extension changes make no commit.

Subcategories are not a fixed list: curated keyword rules (`scripts/extension-catalog/taxonomy.mjs`) provide the first split, then frequent-term mining promotes emergent topics out of "General" (marked ✦) and recursively splits every group for as long as it still yields at least two coherent subgroups of 4+ extensions — depth is bounded only by the data, so new tools trending upstream get their own group automatically on a future sync.
