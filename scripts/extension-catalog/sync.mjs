#!/usr/bin/env node
/**
 * Raycast extensions catalog generator & upstream sync.
 *
 * Diffs the extension list of this repo against upstream
 * (https://github.com/raycast/extensions) using tree SHAs only — no full
 * checkout of the multi-gigabyte repository is required. Designed to run in a
 * blob-filtered (partial) clone: only the package.json manifests that actually
 * changed are downloaded on demand.
 *
 * Outputs (all under catalog/):
 *   data/extensions.json      machine-readable state, used for diffing runs
 *   README.md                 stats + master index
 *   categories/<slug>/        one section per category; large categories are
 *                             split into per-letter subpages
 *   platforms/<platform>/     macOS / Windows / cross-platform, broken down
 *                             by category
 *   publishers/<letter>.md    every publisher with their extensions
 *   alphabetical/<letter>.md  flat A–Z listings
 *   CHANGELOG.md              added/updated/removed log, newest first
 *
 * Usage: node scripts/extension-catalog/sync.mjs [--force] [--commit] [--push]
 *   --force   regenerate even if upstream shows no extension changes
 *   --commit  git-commit catalog changes (no-op when nothing changed)
 *   --push    git-push the current branch (implies --commit), retries on
 *             network failure with exponential backoff
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CATALOG_DIR = path.join(ROOT, "catalog");
const STATE_FILE = path.join(CATALOG_DIR, "data", "extensions.json");
const CHANGELOG_FILE = path.join(CATALOG_DIR, "CHANGELOG.md");
const UPSTREAM_URL = "https://github.com/raycast/extensions";
const SOURCE_BASE = "https://github.com/raycast/extensions/tree/main/extensions";
const STORE_BASE = "https://www.raycast.com";

// Category sections larger than this get split into per-letter subpages.
const SPLIT_THRESHOLD = 200;

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const PUSH = args.has("--push");
const COMMIT = args.has("--commit") || PUSH;

function git(gitArgs, opts = {}) {
  return execFileSync("git", gitArgs, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    timeout: 600_000,
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

function tryGit(gitArgs, opts = {}) {
  try {
    return git(gitArgs, opts);
  } catch {
    return null;
  }
}

// --- 1. Make sure the upstream remote exists and fetch the freshest ref -----

function ensureUpstreamAndFetch() {
  const remotes = git(["remote"]).split("\n").filter(Boolean);
  if (!remotes.includes("upstream")) {
    git(["remote", "add", "upstream", UPSTREAM_URL]);
  }
  // Let missing blobs be fetched on demand from either remote.
  git(["config", "remote.upstream.promisor", "true"]);
  git(["config", "remote.upstream.partialclonefilter", "blob:none"]);

  if (tryGit(["fetch", "--depth=1", "--filter=blob:none", "upstream", "main"]) !== null) {
    return "upstream/main";
  }
  console.warn("warn: could not fetch upstream, falling back to origin/main");
  if (tryGit(["fetch", "--depth=1", "--filter=blob:none", "origin", "main"]) !== null) {
    return "origin/main";
  }
  if (tryGit(["rev-parse", "--verify", "origin/main"]) !== null) {
    console.warn("warn: fetch failed entirely, using previously fetched origin/main");
    return "origin/main";
  }
  throw new Error("no reachable source for the extensions tree");
}

// --- 2. List extension directories with their tree SHAs --------------------

function listExtensionTrees(ref) {
  const out = git(["ls-tree", ref, "extensions/"]);
  const map = new Map();
  for (const line of out.split("\n")) {
    if (!line) continue;
    const m = line.match(/^040000 tree ([0-9a-f]{40})\textensions\/(.+)$/);
    if (m) map.set(m[2], m[1]);
  }
  return map;
}

// --- 3. Manifest loading ----------------------------------------------------

function loadManifest(ref, dir) {
  const lsOut = tryGit(["ls-tree", ref, `extensions/${dir}/`]);
  if (!lsOut) return null;
  const m = lsOut.match(/^100\d{3} blob ([0-9a-f]{40})\textensions\/.+\/package\.json$/m);
  if (!m) return null;
  const raw = tryGit(["cat-file", "-p", m[1]]);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(`warn: invalid JSON in extensions/${dir}/package.json`);
    return null;
  }
}

function toEntry(dir, treeSha, pkg) {
  const categories = Array.isArray(pkg.categories) && pkg.categories.length
    ? pkg.categories.map(String)
    : ["Uncategorized"];
  const platforms = Array.isArray(pkg.platforms) && pkg.platforms.length
    ? pkg.platforms.map(String)
    : ["macOS"]; // manifests without a platforms field are macOS-only
  const handle = pkg.owner || pkg.author || "";
  return {
    dir,
    name: String(pkg.name || dir),
    title: String(pkg.title || pkg.name || dir),
    description: String(pkg.description || ""),
    author: String(pkg.author || ""),
    owner: pkg.owner ? String(pkg.owner) : null,
    contributors: Array.isArray(pkg.contributors) ? pkg.contributors.length : 0,
    categories,
    platforms,
    store: handle ? `${STORE_BASE}/${handle}/${pkg.name || dir}` : null,
    source: `${SOURCE_BASE}/${encodeURIComponent(dir)}`,
    treeSha,
  };
}

// --- 4. Markdown rendering --------------------------------------------------

function mdEscape(text, max = 160) {
  let s = String(text).replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
  if (s.length > max) s = `${s.slice(0, max - 1).trimEnd()}…`;
  return s;
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function extRow(e) {
  const title = `[${mdEscape(e.title, 60)}](${e.source})`;
  const store = e.store ? `[store](${e.store})` : "—";
  const by = e.owner ? `${e.owner} (org)` : e.author || "—";
  const platforms = e.platforms.join(", ");
  return `| ${title} | ${mdEscape(e.description)} | ${mdEscape(by, 40)} | ${platforms} | ${store} |`;
}

const TABLE_HEADER = [
  "| Extension | Description | Author | Platforms | Store |",
  "| --- | --- | --- | --- | --- |",
];

function renderTable(entries) {
  return [...TABLE_HEADER, ...entries.map(extRow)].join("\n");
}

function letterOf(s) {
  const c = String(s).trim().charAt(0).toUpperCase();
  return c >= "A" && c <= "Z" ? c : "0-9";
}

function byTitle(a, b) {
  return a.title.localeCompare(b.title, "en") || a.dir.localeCompare(b.dir, "en");
}

function groupBy(items, keysOf) {
  const groups = new Map();
  for (const item of items) {
    for (const key of keysOf(item)) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
  }
  return groups;
}

function letterNav(letters, current, prefix = "./") {
  return letters
    .map((l) =>
      l === current ? `**${l}**` : `[${l}](${prefix}${l.toLowerCase()}.md)`,
    )
    .join(" · ");
}

function writePage(relPath, lines) {
  const file = path.join(CATALOG_DIR, relPath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${lines.join("\n")}\n`);
}

/**
 * Writes one section (e.g. a category, or a platform×category slice) either as
 * a single page with the full table, or — above SPLIT_THRESHOLD — as an index
 * page plus per-letter subpages. Returns the link target for the section.
 */
function writeSection({ dirRel, title, entries, backLink, intro = [] }) {
  const sorted = [...entries].sort(byTitle);
  const count = `${sorted.length} extension${sorted.length === 1 ? "" : "s"}`;

  if (sorted.length <= SPLIT_THRESHOLD) {
    writePage(`${dirRel}/README.md`, [
      `# ${title}`,
      "",
      `${count} · ${backLink}`,
      ...intro,
      "",
      renderTable(sorted),
    ]);
    return;
  }

  const byLetter = groupBy(sorted, (e) => [letterOf(e.title)]);
  const letters = [...byLetter.keys()].sort();
  writePage(`${dirRel}/README.md`, [
    `# ${title}`,
    "",
    `${count} · ${backLink}`,
    ...intro,
    "",
    "| Section | Extensions |",
    "| --- | --- |",
    ...letters.map(
      (l) => `| [${title} — ${l}](./${l.toLowerCase()}.md) | ${byLetter.get(l).length} |`,
    ),
  ]);
  for (const letter of letters) {
    writePage(`${dirRel}/${letter.toLowerCase()}.md`, [
      `# ${title} — ${letter}`,
      "",
      letterNav(letters, letter),
      "",
      `${byLetter.get(letter).length} of ${count} · [← ${title}](./README.md)`,
      "",
      renderTable(byLetter.get(letter)),
    ]);
  }
}

function generateCatalog(entries) {
  const sorted = [...entries].sort(byTitle);

  for (const dir of ["categories", "alphabetical", "platforms", "publishers"]) {
    rmSync(path.join(CATALOG_DIR, dir), { recursive: true, force: true });
  }
  // Remove pages from the pre-directory layout, if any survive.
  rmSync(path.join(CATALOG_DIR, "authors.md"), { force: true });
  mkdirSync(path.join(CATALOG_DIR, "data"), { recursive: true });

  // ---- Categories (nested: category -> letter for large ones) ----
  const byCategory = groupBy(sorted, (e) => e.categories);
  const categoryNames = [...byCategory.keys()].sort((a, b) => a.localeCompare(b, "en"));
  for (const cat of categoryNames) {
    const items = byCategory.get(cat);
    const mac = items.filter((e) => e.platforms.includes("macOS")).length;
    const win = items.filter((e) => e.platforms.includes("Windows")).length;
    writeSection({
      dirRel: `categories/${slugify(cat)}`,
      title: cat,
      entries: items,
      backLink: "[← all categories](../README.md)",
      intro: ["", `macOS: ${mac} · Windows: ${win}`],
    });
  }
  writePage("categories/README.md", [
    "# Categories",
    "",
    `${categoryNames.length} categories · [← catalog index](../README.md)`,
    "",
    "| Category | Extensions |",
    "| --- | --- |",
    ...categoryNames.map(
      (c) => `| [${c}](./${slugify(c)}/README.md) | ${byCategory.get(c).length} |`,
    ),
  ]);

  // ---- Platforms (nested: platform -> category) ----
  const platformDefs = [
    ["macOS", "macos", (e) => e.platforms.includes("macOS")],
    ["Windows", "windows", (e) => e.platforms.includes("Windows")],
    [
      "Cross-platform",
      "cross-platform",
      (e) => e.platforms.includes("macOS") && e.platforms.includes("Windows"),
    ],
  ];
  for (const [label, slug, match] of platformDefs) {
    const items = sorted.filter(match);
    const byCat = groupBy(items, (e) => e.categories);
    const cats = [...byCat.keys()].sort((a, b) => a.localeCompare(b, "en"));
    for (const cat of cats) {
      writeSection({
        dirRel: `platforms/${slug}/${slugify(cat)}`,
        title: `${label} · ${cat}`,
        entries: byCat.get(cat),
        backLink: `[← ${label}](../README.md)`,
      });
    }
    writePage(`platforms/${slug}/README.md`, [
      `# ${label} extensions`,
      "",
      `${items.length} extensions · [← all platforms](../README.md)`,
      "",
      "| Category | Extensions |",
      "| --- | --- |",
      ...cats.map(
        (c) => `| [${c}](./${slugify(c)}/README.md) | ${byCat.get(c).length} |`,
      ),
    ]);
  }
  writePage("platforms/README.md", [
    "# Platforms",
    "",
    "[← catalog index](../README.md)",
    "",
    "| Platform | Extensions |",
    "| --- | --- |",
    ...platformDefs.map(
      ([label, slug, match]) =>
        `| [${label}](./${slug}/README.md) | ${sorted.filter(match).length} |`,
    ),
  ]);

  // ---- Publishers (letter -> publisher with their extensions) ----
  const byPublisher = groupBy(sorted, (e) => (e.owner || e.author ? [e.owner || e.author] : []));
  const publishers = [...byPublisher.keys()].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase(), "en") || a.localeCompare(b, "en"),
  );
  const pubByLetter = groupBy(publishers, (p) => [letterOf(p)]);
  const pubLetters = [...pubByLetter.keys()].sort();
  for (const letter of pubLetters) {
    const rows = pubByLetter.get(letter).map((p) => {
      const items = byPublisher.get(p).sort(byTitle);
      const links = items.map((e) => `[${mdEscape(e.title, 60)}](${e.source})`).join(", ");
      return `| [${mdEscape(p, 60)}](${STORE_BASE}/${p}) | ${items.length} | ${links} |`;
    });
    writePage(`publishers/${letter.toLowerCase()}.md`, [
      `# Publishers — ${letter}`,
      "",
      letterNav(pubLetters, letter),
      "",
      `${pubByLetter.get(letter).length} publishers · [← publisher index](./README.md)`,
      "",
      "| Publisher | Extensions | Titles |",
      "| --- | --- | --- |",
      ...rows,
    ]);
  }
  const topPublishers = publishers
    .map((p) => [p, byPublisher.get(p).length])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 25);
  writePage("publishers/README.md", [
    "# Publishers",
    "",
    `${publishers.length} publishers · [← catalog index](../README.md)`,
    "",
    letterNav(pubLetters, null),
    "",
    "## Most published",
    "",
    "| Publisher | Extensions |",
    "| --- | --- |",
    ...topPublishers.map(([p, n]) => `| [${p}](${STORE_BASE}/${p}) | ${n} |`),
  ]);

  // ---- Flat alphabetical listing ----
  const byLetter = groupBy(sorted, (e) => [letterOf(e.title)]);
  const letters = [...byLetter.keys()].sort();
  for (const letter of letters) {
    const items = byLetter.get(letter);
    writePage(`alphabetical/${letter.toLowerCase()}.md`, [
      `# Extensions — ${letter}`,
      "",
      letterNav(letters, letter),
      "",
      `${items.length} extension${items.length === 1 ? "" : "s"} · [← catalog index](../README.md)`,
      "",
      renderTable(items),
    ]);
  }

  // ---- Master index ----
  const macCount = sorted.filter((e) => e.platforms.includes("macOS")).length;
  const winCount = sorted.filter((e) => e.platforms.includes("Windows")).length;
  const crossCount = sorted.filter(
    (e) => e.platforms.includes("macOS") && e.platforms.includes("Windows"),
  ).length;
  writePage("README.md", [
    "# Raycast Extensions Catalog",
    "",
    `An organized, auto-maintained index of every extension in [raycast/extensions](${UPSTREAM_URL}).`,
    "",
    `**${sorted.length}** extensions · **${categoryNames.length}** categories · **${publishers.length}** publishers`,
    "",
    "## Browse",
    "",
    "| View | |",
    "| --- | --- |",
    `| [By category](./categories/README.md) | ${categoryNames.length} categories; large ones split A–Z |`,
    `| [By platform](./platforms/README.md) | macOS (${macCount}) · Windows (${winCount}) · cross-platform (${crossCount}), each by category |`,
    `| [By publisher](./publishers/README.md) | ${publishers.length} publishers with all their extensions |`,
    `| [Alphabetical](./alphabetical/${letters[0].toLowerCase()}.md) | every extension, A–Z |`,
    `| [Changelog](./CHANGELOG.md) | upstream additions, updates, removals per sync |`,
    "",
    "## Categories at a glance",
    "",
    "| Category | Extensions |",
    "| --- | --- |",
    ...categoryNames.map(
      (c) => `| [${c}](./categories/${slugify(c)}/README.md) | ${byCategory.get(c).length} |`,
    ),
    "",
    "## How this stays up to date",
    "",
    `A scheduled job runs \`node scripts/extension-catalog/sync.mjs --push\`, which fetches the latest upstream tree, diffs every extension's tree SHA against [\`data/extensions.json\`](./data/extensions.json), downloads only the changed manifests, regenerates these pages, and records additions/updates/removals in [CHANGELOG.md](./CHANGELOG.md). Runs that find no extension changes make no commit.`,
  ]);
}

// --- 5. Changelog -----------------------------------------------------------

function updateChangelog({ initial, added, updated, removed, commit, total }) {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [`## ${date} — upstream \`${commit.slice(0, 10)}\``, ""];
  if (initial) {
    lines.push(`Initial catalog build: ${total} extensions indexed.`, "");
  } else {
    const fmt = (list) =>
      list
        .map((e) => `[${mdEscape(e.title, 60)}](${e.source})`)
        .join(", ");
    if (added.length) lines.push(`**Added (${added.length}):** ${fmt(added)}`, "");
    if (updated.length) lines.push(`**Updated (${updated.length}):** ${fmt(updated)}`, "");
    if (removed.length)
      lines.push(
        `**Removed (${removed.length}):** ${removed.map((e) => mdEscape(e.title, 60)).join(", ")}`,
        "",
      );
  }
  const entry = lines.join("\n");

  const header = "# Catalog Changelog\n\nUpstream changes detected by each sync run, newest first.\n\n";
  let existing = "";
  if (existsSync(CHANGELOG_FILE)) {
    existing = readFileSync(CHANGELOG_FILE, "utf8").replace(header, "");
  }
  writeFileSync(CHANGELOG_FILE, `${header}${entry}\n${existing}`.trimEnd() + "\n");
}

// --- 6. Commit / push -------------------------------------------------------

function sleep(ms) {
  execFileSync("sleep", [String(ms / 1000)]);
}

function commitAndMaybePush(message) {
  git(["add", "catalog", "scripts/extension-catalog"]);
  const staged = git(["diff", "--cached", "--name-only"]).trim();
  if (!staged) {
    console.log("nothing to commit");
    return;
  }
  git(["commit", "-m", message]);
  console.log(`committed: ${message}`);
  if (!PUSH) return;

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  const delays = [2000, 4000, 8000, 16000];
  for (let attempt = 0; ; attempt++) {
    try {
      git(["push", "-u", "origin", branch], { stdio: ["ignore", "inherit", "inherit"] });
      console.log(`pushed to origin/${branch}`);
      return;
    } catch (err) {
      if (attempt >= delays.length) throw err;
      console.warn(`push failed, retrying in ${delays[attempt] / 1000}s...`);
      sleep(delays[attempt]);
    }
  }
}

// --- main -------------------------------------------------------------------

const ref = ensureUpstreamAndFetch();
const commit = git(["rev-parse", ref]).trim();
console.log(`source: ${ref} @ ${commit}`);

const trees = listExtensionTrees(ref);
console.log(`extensions upstream: ${trees.size}`);

let oldState = null;
if (existsSync(STATE_FILE)) {
  try {
    oldState = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    oldState = null;
  }
}
const oldEntries = new Map((oldState?.extensions ?? []).map((e) => [e.dir, e]));
const initial = oldEntries.size === 0;

const addedDirs = [];
const updatedDirs = [];
const removed = [];
for (const [dir, sha] of trees) {
  const prev = oldEntries.get(dir);
  if (!prev) addedDirs.push(dir);
  else if (prev.treeSha !== sha) updatedDirs.push(dir);
}
for (const [dir, e] of oldEntries) {
  if (!trees.has(dir)) removed.push(e);
}

const changed = addedDirs.length + updatedDirs.length + removed.length > 0;
if (!changed && !FORCE && existsSync(path.join(CATALOG_DIR, "README.md"))) {
  console.log("catalog is up to date — no extension changes upstream");
  process.exit(0);
}
console.log(
  `changes: +${addedDirs.length} added, ~${updatedDirs.length} updated, -${removed.length} removed`,
);

const entries = [];
const added = [];
const updated = [];
let refreshed = 0;
for (const [dir, sha] of trees) {
  const prev = oldEntries.get(dir);
  if (prev && prev.treeSha === sha && !FORCE) {
    entries.push(prev);
    continue;
  }
  const pkg = loadManifest(ref, dir);
  if (!pkg) {
    // Keep the stale entry rather than dropping the extension entirely.
    if (prev) entries.push({ ...prev, treeSha: sha });
    continue;
  }
  const entry = toEntry(dir, sha, pkg);
  entries.push(entry);
  if (!prev) added.push(entry);
  else if (prev.treeSha !== sha) updated.push(entry);
  refreshed++;
  if (refreshed % 250 === 0) console.log(`  manifests loaded: ${refreshed}`);
}

entries.sort((a, b) => a.dir.localeCompare(b.dir, "en"));
generateCatalog(entries);
if (changed || initial) {
  updateChangelog({ initial, added, updated, removed, commit, total: entries.length });
}

mkdirSync(path.dirname(STATE_FILE), { recursive: true });
writeFileSync(
  STATE_FILE,
  JSON.stringify(
    {
      upstream: UPSTREAM_URL,
      commit,
      generatedAt: new Date().toISOString(),
      count: entries.length,
      extensions: entries,
    },
    null,
    2,
  ) + "\n",
);
console.log(`catalog written: ${entries.length} extensions`);

if (COMMIT) {
  const parts = [];
  if (initial) parts.push(`initial build, ${entries.length} extensions`);
  if (!initial && added.length) parts.push(`${added.length} added`);
  if (!initial && updated.length) parts.push(`${updated.length} updated`);
  if (!initial && removed.length) parts.push(`${removed.length} removed`);
  const message = `catalog: sync with upstream (${parts.join(", ") || "regenerated"})`;
  commitAndMaybePush(message);
}
