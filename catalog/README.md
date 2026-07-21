# Raycast Extensions Catalog

An organized, auto-maintained index of every extension in [raycast/extensions](https://github.com/raycast/extensions).

**3080** extensions · **16** categories · **2038** publishers

## Browse

| View | |
| --- | --- |
| [By category](./categories/README.md) | 16 categories → curated subcategories → auto-discovered topic groups (✦), nested as deep as the data supports |
| [By platform](./platforms/README.md) | macOS (3052) · Windows (795) · cross-platform (767), each by category |
| [By publisher](./publishers/README.md) | 2038 publishers with all their extensions |
| [Alphabetical](./alphabetical/0-9.md) | every extension, A–Z |
| [Changelog](./CHANGELOG.md) | upstream additions, updates, removals per sync |

## Categories at a glance

| Category | Extensions |
| --- | --- |
| [Applications](./categories/applications/README.md) | 359 |
| [Communication](./categories/communication/README.md) | 137 |
| [Data](./categories/data/README.md) | 235 |
| [Design Tools](./categories/design-tools/README.md) | 133 |
| [Developer Tools](./categories/developer-tools/README.md) | 952 |
| [Documentation](./categories/documentation/README.md) | 178 |
| [Finance](./categories/finance/README.md) | 132 |
| [Fun](./categories/fun/README.md) | 253 |
| [Media](./categories/media/README.md) | 251 |
| [News](./categories/news/README.md) | 81 |
| [Other](./categories/other/README.md) | 183 |
| [Productivity](./categories/productivity/README.md) | 1279 |
| [Security](./categories/security/README.md) | 74 |
| [System](./categories/system/README.md) | 215 |
| [Uncategorized](./categories/uncategorized/README.md) | 330 |
| [Web](./categories/web/README.md) | 423 |

## How this stays up to date

A scheduled job runs `node scripts/extension-catalog/sync.mjs --push`, which fetches the latest upstream tree, diffs every extension's tree SHA against [`data/extensions.json`](./data/extensions.json), downloads only the changed manifests, regenerates these pages, and records additions/updates/removals in [CHANGELOG.md](./CHANGELOG.md). Runs that find no extension changes make no commit.

Subcategories are not a fixed list: curated keyword rules (`scripts/extension-catalog/taxonomy.mjs`) provide the first split, then frequent-term mining promotes emergent topics out of "General" (marked ✦) and recursively splits every group for as long as it still yields at least two coherent subgroups of 4+ extensions — depth is bounded only by the data, so new tools trending upstream get their own group automatically on a future sync.
