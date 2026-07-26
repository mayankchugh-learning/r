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
 *   categories/<slug>/        one section per category, organized into
 *                             topical subcategories (see taxonomy.mjs);
 *                             large categories get one page per subcategory
 *   platforms/<platform>/     macOS / Windows / cross-platform, broken down
 *                             by category and the same subcategories
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
import { CATEGORY_SECTIONS, classify, sectionsForCategory, subcategoriesOf } from "./taxonomy.mjs";
import { resolveDownloads } from "./downloads.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CATALOG_DIR = path.join(ROOT, "catalog");
const STATE_FILE = path.join(CATALOG_DIR, "data", "extensions.json");
const CHANGELOG_FILE = path.join(CATALOG_DIR, "CHANGELOG.md");
const UPSTREAM_URL = "https://github.com/raycast/extensions";
const SOURCE_BASE = "https://github.com/raycast/extensions/tree/main/extensions";
const STORE_BASE = "https://www.raycast.com";

// Sections larger than this get one page per subcategory instead of inline
// subcategory sections on a single page.
const SPLIT_THRESHOLD = 200;
// Auto-discovered groups need at least this many members. This is also the
// only thing that bounds recursion depth: every group is split again until
// mining can no longer produce two subgroups of this size.
const MIN_GROUP = 4;
const MAX_GROUPS = 15;

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
  const manifestCategories = Array.isArray(pkg.categories) && pkg.categories.length
    ? pkg.categories.map(String)
    : null;
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
    categories: manifestCategories ?? ["Uncategorized"],
    // True when the manifest itself declared categories. Kept separate from
    // `categories` (which store-enrichment may later overwrite) so re-runs
    // can tell "genuinely manifest-categorized" apart from "was enriched
    // from the store last time" — see needsStoreCategoryEnrichment below.
    manifestCategorized: manifestCategories !== null,
    platforms,
    store: handle ? `${STORE_BASE}/${handle}/${pkg.name || dir}` : null,
    source: `${SOURCE_BASE}/${encodeURIComponent(dir)}`,
    treeSha,
  };
}

// Raycast's top-level store categories, keyed by their seo_categories slug so
// store data can be normalized back to the canonical display names. Used to
// enrich extensions whose git manifest omitted `categories` (which the store
// still categorizes) — eliminating most of the "Uncategorized" bucket.
const CANONICAL_CATEGORIES = new Map([
  ["ai", "AI"],
  ["applications", "Applications"],
  ["communication", "Communication"],
  ["data", "Data"],
  ["design-tools", "Design Tools"],
  ["developer-tools", "Developer Tools"],
  ["documentation", "Documentation"],
  ["finance", "Finance"],
  ["fun", "Fun"],
  ["media", "Media"],
  ["news", "News"],
  ["productivity", "Productivity"],
  ["security", "Security"],
  ["system", "System"],
  ["web", "Web"],
  ["other", "Other"],
]);

// Maps store seo_categories (mixed case, plus finer SEO tags) to canonical
// top-level category names, dropping tags that aren't real categories.
function canonicalCategories(seo) {
  const out = [];
  for (const s of seo ?? []) {
    const c = CANONICAL_CATEGORIES.get(String(s).toLowerCase().replace(/\s+/g, "-"));
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

const UNCATEGORIZED = "Uncategorized";

// True when the manifest gave no categories, so store data should keep
// filling the gap on every run (not just once) — the extension's store
// categorization can change later even though its manifest never does.
// Entries reused unchanged from before `manifestCategorized` existed fall
// back to the old categories-based heuristic: identical to prior behavior
// (no regression) until that entry's manifest is next re-read, at which
// point toEntry() computes the flag correctly from raw manifest data.
function needsStoreCategoryEnrichment(e) {
  if (typeof e.manifestCategorized === "boolean") return !e.manifestCategorized;
  return e.categories.length === 1 && e.categories[0] === UNCATEGORIZED;
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

// Downloads are number | null (unknown — not on the store). null renders as
// "—" and sorts last, and is never conflated with a genuine 0.
function fmtNum(n) {
  return n == null ? "—" : Number(n).toLocaleString("en-US");
}

function dlOf(e) {
  return e.downloads == null ? -1 : e.downloads;
}

function extRow(e) {
  const title = `[${mdEscape(e.title, 60)}](${e.source})`;
  const store = e.store ? `[store](${e.store})` : "—";
  const by = e.owner ? `${e.owner} (org)` : e.author || "—";
  const platforms = e.platforms.join(", ");
  return `| ${title} | ${fmtNum(e.downloads)} | ${mdEscape(e.description)} | ${mdEscape(by, 40)} | ${platforms} | ${store} |`;
}

const TABLE_HEADER = [
  "| Extension | Downloads | Description | Author | Platforms | Store |",
  "| --- | --- | --- | --- | --- | --- |",
];

// Every extension table is ordered by downloads (desc), title as tiebreak.
function renderTable(entries) {
  return [...TABLE_HEADER, ...[...entries].sort(byDownloads).map(extRow)].join("\n");
}

function letterOf(s) {
  const c = String(s).trim().charAt(0).toUpperCase();
  return c >= "A" && c <= "Z" ? c : "0-9";
}

function byTitle(a, b) {
  return a.title.localeCompare(b.title, "en") || a.dir.localeCompare(b.dir, "en");
}

function byDownloads(a, b) {
  return dlOf(b) - dlOf(a) || byTitle(a, b);
}

// Dirs of the top N entries by downloads. Used to detect whether a downloads
// refresh moved anything worth regenerating the markdown catalog for — the
// tail is thick with near-ties that reorder constantly and mean nothing.
function topNDirs(entries, n) {
  return [...entries].sort(byDownloads).slice(0, n).map((e) => e.dir);
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
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
 * Groups topic nodes (curated subcategories, auto-discovered groups, General)
 * under the per-category editorial sections from taxonomy.mjs. Returns
 * [sectionTitle, nodes[]] pairs plus the General node separately.
 */
function sectionizeNodes(category, nodes) {
  const byName = new Map(nodes.map((n) => [n.title, n]));
  const used = new Set();
  const sections = [];
  for (const [secTitle, subNames] of sectionsForCategory(category)) {
    const list = subNames.map((s) => byName.get(s)).filter((n) => n && !n.auto);
    if (!list.length) continue;
    for (const n of list) used.add(n);
    sections.push([secTitle, list]);
  }
  const leftover = nodes.filter((n) => !used.has(n) && !n.auto && n.slug !== "general");
  if (leftover.length) sections.push(["More topics", leftover]);
  const autos = nodes.filter((n) => n.auto);
  if (autos.length) sections.push(["Discovered topics ✦", autos]);
  return { sections, general: nodes.find((n) => n.slug === "general") ?? null };
}

/** Sectioned "table of topics" for an index page. */
function sectionedTopicLines(category, nodes, linkOf) {
  const { sections, general } = sectionizeNodes(category, nodes);
  const lines = [];
  for (const [secTitle, list] of sections) {
    lines.push(
      "",
      `## ${secTitle}`,
      "",
      "| Topic | Extensions |",
      "| --- | --- |",
      ...list.map((n) => `| [${nodeLabel(n)}](${linkOf(n)}) | ${n.entries.length} |`),
    );
  }
  if (general) {
    lines.push(
      "",
      `Plus [General](${linkOf(general)}) — ${general.entries.length} extension${general.entries.length === 1 ? "" : "s"} that don't fit a topic yet.`,
    );
  }
  if (nodes.some((n) => n.auto)) lines.push("", `*${AUTO_LEGEND}*`);
  return lines;
}

/**
 * Writes one platform×category slice organized by topical subcategory and
 * grouped under the category's editorial sections. Small slices are one page
 * with inline sections; above SPLIT_THRESHOLD each subcategory gets its own
 * page behind a sectioned index.
 */
function writeSection({ dirRel, title, category, entries, backLink, intro = [] }) {
  const sorted = [...entries].sort(byTitle);
  const count = `${sorted.length} extension${sorted.length === 1 ? "" : "s"}`;

  const bySub = groupBy(sorted, (e) => [classify(e, category)]);
  const subs = subcategoriesOf(category).filter((s) => bySub.has(s));
  const nodes = subs.map((s) => ({
    title: s,
    slug: slugify(s),
    auto: false,
    entries: bySub.get(s),
    children: [],
  }));

  if (sorted.length <= SPLIT_THRESHOLD) {
    const lines = [`# ${title}`, "", `${count} · ${backLink}`, ...intro];
    if (nodes.length > 1) {
      const { sections, general } = sectionizeNodes(category, nodes);
      const all = general ? [...sections, ["", [general]]] : sections;
      lines.push(
        "",
        nodes.map((n) => `[${n.title}](#${slugify(n.title)}) (${n.entries.length})`).join(" · "),
      );
      for (const [secTitle, list] of all) {
        if (secTitle) lines.push("", `## ${secTitle}`);
        for (const n of list) {
          lines.push("", `### ${n.title}`, "", renderTable(n.entries));
        }
      }
    } else {
      lines.push("", renderTable(sorted));
    }
    writePage(`${dirRel}/README.md`, lines);
    return;
  }

  writePage(`${dirRel}/README.md`, [
    `# ${title}`,
    "",
    `${count} · ${backLink}`,
    ...intro,
    ...sectionedTopicLines(category, nodes, (n) => `./${n.slug}.md`),
  ]);
  for (const node of nodes) {
    const nav = nodes
      .map((n) => (n === node ? `**${n.title}**` : `[${n.title}](./${n.slug}.md)`))
      .join(" · ");
    writePage(`${dirRel}/${node.slug}.md`, [
      `# ${title} · ${node.title}`,
      "",
      nav,
      "",
      `${node.entries.length} of ${count} · [← ${title}](./README.md)`,
      "",
      renderTable(node.entries),
    ]);
  }
}

// --- Auto-discovered topic mining ------------------------------------------
// Deterministically finds frequent terms (unigrams/bigrams of title +
// description) among a set of extensions and groups them by the most common
// term, first match wins. Used to promote emergent topics out of "General"
// and to split any oversized group into deeper levels.

const MINE_STOPWORDS = new Set(
  `a an and are as at be been before best both browse browser by can check
  checks click com control convert copy create created currently custom data
  different direct directly display do does done down easily easy each edit
  enable enables every extension extensions extention fast fastest favorite
  favorites few file files find first for free from fully get gets give gives
  has have help helps here how in info information inside instantly integrate
  integration interact into is it item items its just keep keeps last latest
  launch less let lets like list lists look looking mac macos made make makes
  manage management many menu more most much multiple my need needs new no
  not now of official on one only open opens or osx other our out over own
  paste per plugin popular powerful quick quickly raycast read right run runs
  search searches see select selected set sets show shows simple so some
  status straight support supported supports switch than that the their them
  then these they things this those through to today toolbar tool tools track
  tracking two under unofficial up update updates us use used user users using
  various very via view views want way we what when where which while will
  with within without workspace workspaces you your yourself
  access account accounts action actions add adds all allow allows also any
  app application applications apps available client companion command
  commands content current directly enabled feature features functionality
  generate generator generators right specific using wrapper
  project projects manager managers inspect time text word words link links
  name names number numbers save saves saving`
    .split(/\s+/)
    .filter(Boolean),
);
const MINE_SHORT_OK = new Set(["ai", "3d", "2fa", "qr", "tv"]);
const MINE_ACRONYMS = new Set(
  "ai api css html sql dns llm cli ide iot gif qr 2fa 3d tv vpn ssh seo ocr rss nft gpt url pdf npm ios sdk cdn mcp obs nba nfl mlb ffmpeg".split(" "),
);

function mineTokenOk(t) {
  if (MINE_STOPWORDS.has(t)) return false;
  if (/^\d+$/.test(t)) return false;
  return t.length >= 3 || MINE_SHORT_OK.has(t);
}

// Merge singular/plural surface forms ("server"/"servers") into one term.
function mineCanonOf(t) {
  if (t.length > 3 && t.endsWith("s") && !/(ss|us|is)$/.test(t)) return t.slice(0, -1);
  return t;
}

function mineTermsOf(entry, surfaces) {
  const raw = `${entry.title} ${entry.description}`
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter(Boolean);
  const terms = new Set();
  const seen = (canon, surface) => {
    terms.add(canon);
    if (!surfaces.has(canon)) surfaces.set(canon, new Map());
    const m = surfaces.get(canon);
    m.set(surface, (m.get(surface) || 0) + 1);
  };
  for (let i = 0; i < raw.length; i++) {
    if (!mineTokenOk(raw[i])) continue;
    seen(mineCanonOf(raw[i]), raw[i]);
    if (i + 1 < raw.length && mineTokenOk(raw[i + 1])) {
      seen(`${mineCanonOf(raw[i])} ${mineCanonOf(raw[i + 1])}`, `${raw[i]} ${raw[i + 1]}`);
    }
  }
  return terms;
}

function mineTitle(term) {
  return term
    .split(" ")
    .map((w) => (MINE_ACRONYMS.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

function mineGroups(entries, usedSlugs) {
  const surfaces = new Map();
  const termSets = new Map(entries.map((e) => [e, mineTermsOf(e, surfaces)]));
  const df = new Map();
  for (const terms of termSets.values()) {
    for (const t of terms) df.set(t, (df.get(t) || 0) + 1);
  }
  const candidates = [...df.entries()]
    // Terms present in every entry (e.g. the term that defined this group)
    // cannot discriminate, so they are skipped.
    .filter(([, n]) => n >= MIN_GROUP && n < entries.length)
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        (b[0].includes(" ") ? 1 : 0) - (a[0].includes(" ") ? 1 : 0) ||
        a[0].localeCompare(b[0]),
    )
    .map(([t]) => t);

  const assigned = new Set();
  const groups = [];
  for (const term of candidates) {
    if (groups.length >= MAX_GROUPS) break;
    // Name the group after the most common surface form of the term.
    const surface = [...surfaces.get(term).entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0][0];
    const slug = slugify(surface);
    if (!slug || usedSlugs.has(slug)) continue;
    const members = entries.filter((e) => !assigned.has(e) && termSets.get(e).has(term));
    if (members.length < MIN_GROUP) continue;
    for (const m of members) assigned.add(m);
    usedSlugs.add(slug);
    groups.push({ title: mineTitle(surface), slug, entries: members.sort(byTitle) });
  }
  return { groups, residue: entries.filter((e) => !assigned.has(e)).sort(byTitle) };
}

// --- Recursive category tree ------------------------------------------------
// Level 1: curated taxonomy (taxonomy.mjs). Emergent topics are promoted out
// of "General" as auto-discovered groups (marked with a badge). Any group
// still larger than LEAF_SPLIT is split again by topic mining, recursively.

function deepen(node) {
  if (node.entries.length < MIN_GROUP * 2) return;
  const { groups, residue } = mineGroups(node.entries, new Set([node.slug]));
  if (groups.length < 2) return;
  node.children = groups.map((g) => ({ ...g, auto: true, children: [] }));
  if (residue.length) {
    node.children.push({ title: "General", slug: "general", auto: false, entries: residue, children: [] });
  }
  for (const c of node.children) {
    if (c.slug !== "general") deepen(c);
  }
}

function buildCategoryTree(entries, category) {
  const bySub = groupBy(entries, (e) => [classify(e, category)]);
  const nodes = [];
  const usedSlugs = new Set();
  for (const sub of subcategoriesOf(category)) {
    if (sub === "General" || !bySub.has(sub)) continue;
    const slug = slugify(sub);
    usedSlugs.add(slug);
    nodes.push({ title: sub, slug, auto: false, entries: bySub.get(sub).sort(byTitle), children: [] });
  }
  const general = (bySub.get("General") ?? []).sort(byTitle);
  if (general.length) {
    const { groups, residue } = mineGroups(general, usedSlugs);
    for (const g of groups) nodes.push({ ...g, auto: true, children: [] });
    if (residue.length) {
      nodes.push({ title: "General", slug: "general", auto: false, entries: residue, children: [] });
    }
  }
  for (const n of nodes) {
    if (n.slug !== "general") deepen(n);
  }
  return nodes;
}

const AUTO_BADGE = " ✦";
const AUTO_LEGEND = "✦ auto-discovered topic group";

function nodeLabel(node) {
  return `${node.title}${node.auto ? AUTO_BADGE : ""}`;
}

/**
 * Renders a tree node. Leaves become a table page; internal nodes small
 * enough (and with only leaf children) become one page with inline sections;
 * anything else becomes a directory with an index README plus child pages.
 * Returns the relative link target for the node from its parent's directory.
 */
function renderNode(node, parentDirRel, parentTitle) {
  const total = node.entries.length;
  const count = `${total} extension${total === 1 ? "" : "s"}`;
  const backSameDir = `[← ${parentTitle}](./README.md)`;
  const backUpDir = `[← ${parentTitle}](../README.md)`;

  if (!node.children.length) {
    writePage(`${parentDirRel}/${node.slug}.md`, [
      `# ${nodeLabel(node)}`,
      "",
      `${count} · ${backSameDir}`,
      ...(node.auto ? ["", `*${AUTO_LEGEND}*`] : []),
      "",
      renderTable(node.entries),
    ]);
    return `./${node.slug}.md`;
  }

  const allLeaves = node.children.every((c) => !c.children.length);
  if (total <= SPLIT_THRESHOLD && allLeaves) {
    const lines = [
      `# ${nodeLabel(node)}`,
      "",
      `${count} · ${backSameDir}`,
      "",
      node.children.map((c) => `[${nodeLabel(c)}](#${slugify(c.title)}) (${c.entries.length})`).join(" · "),
    ];
    if (node.children.some((c) => c.auto)) lines.push("", `*${AUTO_LEGEND}*`);
    for (const c of node.children) {
      lines.push("", `## ${nodeLabel(c)}`, "", renderTable(c.entries));
    }
    writePage(`${parentDirRel}/${node.slug}.md`, lines);
    return `./${node.slug}.md`;
  }

  const dirRel = `${parentDirRel}/${node.slug}`;
  const childLinks = node.children.map((c) => renderNode(c, dirRel, node.title));
  const lines = [
    `# ${nodeLabel(node)}`,
    "",
    `${count} · ${backUpDir}`,
    "",
    "| Topic | Extensions |",
    "| --- | --- |",
    ...node.children.map((c, i) => `| [${nodeLabel(c)}](${childLinks[i]}) | ${c.entries.length} |`),
  ];
  if (node.children.some((c) => c.auto)) lines.push("", `*${AUTO_LEGEND}*`);
  writePage(`${dirRel}/README.md`, lines);
  return `./${node.slug}/README.md`;
}

/**
 * Renders a list of categories grouped under the editorial sections from
 * taxonomy.mjs (largest category first within each section) instead of one
 * flat alphabetical table. Categories not present are skipped; categories not
 * covered by any section land in a trailing "More" section.
 */
function categorySectionLines(catNames, countOf, linkOf) {
  const present = new Set(catNames);
  const covered = new Set(CATEGORY_SECTIONS.flatMap(([, cats]) => cats));
  const sections = CATEGORY_SECTIONS.map(([title, cats]) => [
    title,
    cats.filter((c) => present.has(c)),
  ]);
  const extra = catNames.filter((c) => !covered.has(c));
  if (extra.length) sections.push(["More", extra]);

  const lines = [];
  for (const [title, cats] of sections) {
    if (!cats.length) continue;
    const ordered = [...cats].sort((a, b) => countOf(b) - countOf(a) || a.localeCompare(b, "en"));
    lines.push(
      "",
      `### ${title}`,
      "",
      "| Category | Extensions |",
      "| --- | --- |",
      ...ordered.map((c) => `| [${c}](${linkOf(c)}) | ${countOf(c)} |`),
    );
  }
  return lines;
}

function generateCatalog(entries) {
  const sorted = [...entries].sort(byTitle);

  for (const dir of ["categories", "alphabetical", "platforms", "publishers"]) {
    rmSync(path.join(CATALOG_DIR, dir), { recursive: true, force: true });
  }
  // Remove pages from the pre-directory layout, if any survive.
  rmSync(path.join(CATALOG_DIR, "authors.md"), { force: true });
  mkdirSync(path.join(CATALOG_DIR, "data"), { recursive: true });

  // ---- Categories (recursive: curated subcategories, auto-discovered topic
  // groups promoted out of General, oversized groups split further) ----
  const byCategory = groupBy(sorted, (e) => e.categories);
  const categoryNames = [...byCategory.keys()].sort((a, b) => a.localeCompare(b, "en"));
  for (const cat of categoryNames) {
    const items = byCategory.get(cat);
    const mac = items.filter((e) => e.platforms.includes("macOS")).length;
    const win = items.filter((e) => e.platforms.includes("Windows")).length;
    const tree = buildCategoryTree(items, cat);
    const dirRel = `categories/${slugify(cat)}`;
    const linkOf = new Map(tree.map((n) => [n, renderNode(n, dirRel, cat)]));
    writePage(`${dirRel}/README.md`, [
      `# ${cat}`,
      "",
      `${items.length} extension${items.length === 1 ? "" : "s"} · [← all categories](../README.md)`,
      "",
      `macOS: ${mac} · Windows: ${win}`,
      ...sectionedTopicLines(cat, tree, (n) => linkOf.get(n)),
    ]);
  }
  writePage("categories/README.md", [
    "# Categories",
    "",
    `${categoryNames.length} categories · [← catalog index](../README.md)`,
    ...categorySectionLines(
      categoryNames,
      (c) => byCategory.get(c).length,
      (c) => `./${slugify(c)}/README.md`,
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
        category: cat,
        entries: byCat.get(cat),
        backLink: `[← ${label}](../README.md)`,
      });
    }
    writePage(`platforms/${slug}/README.md`, [
      `# ${label} extensions`,
      "",
      `${items.length} extensions · [← all platforms](../README.md)`,
      ...categorySectionLines(
        cats,
        (c) => byCat.get(c).length,
        (c) => `./${slugify(c)}/README.md`,
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

  // ---- Publishers ----
  // Org-owned extensions count under the org handle, otherwise the author.
  const byPublisher = groupBy(sorted, (e) => (e.owner || e.author ? [e.owner || e.author] : []));
  const publishers = [...byPublisher.keys()];
  // Sum only known counts; a publisher whose extensions are all unknown → null.
  const pubDownloads = (p) => {
    const known = byPublisher.get(p).filter((e) => e.downloads != null);
    return known.length ? known.reduce((s, e) => s + e.downloads, 0) : null;
  };
  // Canonical store handle (correct case), from a resolved store URL, so
  // publisher links never 404; publishers with no store presence aren't linked.
  const pubHandle = (p) => {
    for (const e of byPublisher.get(p)) {
      const m = String(e.store || "").match(/raycast\.com\/([^/]+)/);
      if (m) return m[1];
    }
    return null;
  };
  const pubLinked = (p) => {
    const h = pubHandle(p);
    return h ? `[${mdEscape(p, 60)}](${STORE_BASE}/${h})` : mdEscape(p, 60);
  };

  // Publishers with enough extensions get their own page, where extensions are
  // organised by category and — for large categories — a further subcategory
  // level. Each extension is filed under its PRIMARY (first) category only, so
  // it appears once rather than under every category it lists.
  const BIG_PUBLISHER = 10;
  const isBig = (p) => byPublisher.get(p).length >= BIG_PUBLISHER;
  const pubSlug = new Map();
  {
    const used = new Set();
    for (const p of publishers.filter(isBig)) {
      let s = slugify(p) || "publisher";
      while (used.has(s)) s += "-x";
      used.add(s);
      pubSlug.set(p, s);
    }
  }
  const pubDisplay = (p) =>
    isBig(p) ? `[${mdEscape(p, 60)}](./id/${pubSlug.get(p)}.md)` : pubLinked(p);
  const primaryCat = (e) => e.categories[0];

  for (const p of publishers.filter(isBig)) {
    const items = byPublisher.get(p);
    const byCat = groupBy(items, (e) => [primaryCat(e)]);
    const catDl = (c) => byCat.get(c).reduce((s, e) => s + (e.downloads || 0), 0);
    const cats = [...byCat.keys()].sort((a, b) => catDl(b) - catDl(a) || a.localeCompare(b, "en"));
    const h = pubHandle(p);
    const lines = [
      `# ${mdEscape(p, 80)}`,
      "",
      `${items.length} extensions · ${fmtNum(pubDownloads(p))} downloads` +
        (h ? ` · [store](${STORE_BASE}/${h})` : "") +
        " · [← publishers](../README.md)",
    ];
    for (const c of cats) {
      const cItems = byCat.get(c);
      lines.push("", `## ${c} (${cItems.length})`);
      if (cItems.length > 15) {
        const bySub = groupBy(cItems, (e) => [classify(e, c)]);
        for (const sub of subcategoriesOf(c)) {
          if (!bySub.has(sub)) continue;
          lines.push("", `### ${sub}`, "", renderTable(bySub.get(sub)));
        }
      } else {
        lines.push("", renderTable(cItems));
      }
    }
    writePage(`publishers/id/${pubSlug.get(p)}.md`, lines);
  }

  // Letter pages (A–Z lookup): one row per publisher. Big publishers link to
  // their page; small ones inline their extensions by primary category.
  const alphaPublishers = [...publishers].sort(
    (a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), "en") || a.localeCompare(b, "en"),
  );
  const pubByLetter = groupBy(alphaPublishers, (p) => [letterOf(p)]);
  const pubLetters = [...pubByLetter.keys()].sort();
  for (const letter of pubLetters) {
    const rows = pubByLetter.get(letter).map((p) => {
      const items = byPublisher.get(p);
      let cell;
      if (isBig(p)) {
        cell = `[see all ${items.length} →](./id/${pubSlug.get(p)}.md)`;
      } else {
        const byCat = groupBy(items, (e) => [primaryCat(e)]);
        const cats = [...byCat.keys()].sort(
          (a, b) =>
            byCat.get(b).reduce((s, e) => s + (e.downloads || 0), 0) -
              byCat.get(a).reduce((s, e) => s + (e.downloads || 0), 0) || a.localeCompare(b, "en"),
        );
        cell = cats
          .map((c) => {
            const titles = [...byCat.get(c)]
              .sort(byDownloads)
              .map((e) => `[${mdEscape(e.title, 50)}](${e.source})`)
              .join(", ");
            return `**${c}:** ${titles}`;
          })
          .join("<br>");
      }
      return `| ${pubDisplay(p)} | ${items.length} | ${fmtNum(pubDownloads(p))} | ${cell} |`;
    });
    writePage(`publishers/${letter.toLowerCase()}.md`, [
      `# Publishers — ${letter}`,
      "",
      letterNav(pubLetters, letter),
      "",
      `${pubByLetter.get(letter).length} publishers · A–Z · extensions by primary category, sorted by downloads · [← publisher index](./README.md)`,
      "",
      "| Publisher | Extensions | Downloads | By category |",
      "| --- | --- | --- | --- |",
      ...rows,
    ]);
  }

  // Leaderboard — every publisher, two orderings (toggle): by downloads and by
  // extension count (downloads as tiebreaker).
  const dlKey = (x) => (x == null ? -1 : x);
  const stats = publishers.map((p) => ({
    p,
    count: byPublisher.get(p).length,
    downloads: pubDownloads(p),
  }));
  const byDl = [...stats].sort(
    (a, b) =>
      dlKey(b.downloads) - dlKey(a.downloads) ||
      b.count - a.count ||
      a.p.toLowerCase().localeCompare(b.p.toLowerCase(), "en"),
  );
  const byCount = [...stats].sort(
    (a, b) =>
      b.count - a.count ||
      dlKey(b.downloads) - dlKey(a.downloads) ||
      a.p.toLowerCase().localeCompare(b.p.toLowerCase(), "en"),
  );
  const pubRow = (r, i) => `| ${i + 1} | ${pubDisplay(r.p)} | ${r.count} | ${fmtNum(r.downloads)} |`;
  const pubHead = (activeDownloads) => [
    "# Publishers",
    "",
    `${publishers.length} publishers · [← catalog index](../README.md)`,
    "",
    "**Sort:** " +
      (activeDownloads ? "**Downloads**" : "[Downloads](./README.md)") +
      " · " +
      (activeDownloads ? "[Extensions](./by-extensions.md)" : "**Extensions**"),
    "",
    letterNav(pubLetters, null),
    "",
    "| # | Publisher | Extensions | Downloads |",
    "| --- | --- | --- | --- |",
  ];
  writePage("publishers/README.md", [...pubHead(true), ...byDl.map(pubRow)]);
  writePage("publishers/by-extensions.md", [...pubHead(false), ...byCount.map(pubRow)]);

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

  // ---- All extensions, ranked by downloads (paginated, slim table) ----
  const ranked = [...sorted].sort(byDownloads);
  const RANK_PAGE = 500;
  const rankPages = Math.max(1, Math.ceil(ranked.length / RANK_PAGE));
  const rankNav = (active) =>
    Array.from({ length: rankPages }, (_, i) =>
      i + 1 === active ? `**${i + 1}**` : `[${i + 1}](./${i + 1}.md)`,
    ).join(" · ");
  const rankRow = (e, rank) =>
    `| ${rank} | [${mdEscape(e.title, 60)}](${e.source}) | ${fmtNum(e.downloads)} | ${primaryCat(e)} | ${
      e.owner ? `${e.owner} (org)` : e.author || "—"
    } |`;
  for (let pageI = 0; pageI < rankPages; pageI++) {
    const slice = ranked.slice(pageI * RANK_PAGE, (pageI + 1) * RANK_PAGE);
    const from = pageI * RANK_PAGE + 1;
    writePage(`ranked/${pageI + 1}.md`, [
      `# Extensions by downloads — ${from}–${from + slice.length - 1}`,
      "",
      `of ${ranked.length} · [← catalog index](../README.md)`,
      "",
      rankPages > 1 ? rankNav(pageI + 1) : "",
      "",
      "| # | Extension | Downloads | Category | Author |",
      "| --- | --- | --- | --- | --- |",
      ...slice.map((e, j) => rankRow(e, from + j)),
    ]);
  }
  writePage("ranked/README.md", [
    "# Extensions by downloads",
    "",
    `All ${ranked.length} extensions ranked by installs · [← catalog index](../README.md)`,
    "",
    rankNav(0),
    "",
    "Begin at [page 1](./1.md) for the most-installed extensions.",
  ]);

  // ---- Master index ----
  const macCount = sorted.filter((e) => e.platforms.includes("macOS")).length;
  const winCount = sorted.filter((e) => e.platforms.includes("Windows")).length;
  const crossCount = sorted.filter(
    (e) => e.platforms.includes("macOS") && e.platforms.includes("Windows"),
  ).length;
  // Distinct-extension count per editorial section (for the compact root
  // summary; the full per-category breakdown lives in categories/README.md).
  const coveredCats = new Set(CATEGORY_SECTIONS.flatMap(([, cats]) => cats));
  const sectionSummary = [
    ...CATEGORY_SECTIONS.map(([title, cats]) => [title, cats.filter((c) => byCategory.has(c))]),
    ["More", categoryNames.filter((c) => !coveredCats.has(c))],
  ]
    .filter(([, cats]) => cats.length)
    .map(([title, cats]) => {
      const set = new Set();
      for (const c of cats) for (const e of byCategory.get(c)) set.add(e.dir);
      return [title, cats, set.size];
    });
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
    `| [By downloads](./ranked/README.md) | every extension ranked by installs |`,
    `| [By category](./categories/README.md) | ${categoryNames.length} categories → curated subcategories → auto-discovered topic groups (✦), nested as deep as the data supports |`,
    `| [By platform](./platforms/README.md) | macOS (${macCount}) · Windows (${winCount}) · cross-platform (${crossCount}), each by category |`,
    `| [By publisher](./publishers/README.md) | ${publishers.length} publishers, sortable by downloads or extension count; big publishers get their own page |`,
    `| [Alphabetical](./alphabetical/${letters[0].toLowerCase()}.md) | every extension, A–Z |`,
    `| [Changelog](./CHANGELOG.md) | upstream additions, updates, removals per sync |`,
    "",
    "## By section",
    "",
    `${categoryNames.length} categories in ${sectionSummary.length} sections — full per-category breakdown in [categories/](./categories/README.md).`,
    "",
    "| Section | Categories | Extensions |",
    "| --- | --- | --- |",
    ...sectionSummary.map(
      ([title, cats, count]) => `| ${title} | ${cats.join(", ")} | ${fmtNum(count)} |`,
    ),
    "",
    "## How this stays up to date",
    "",
    `A scheduled job runs \`node scripts/extension-catalog/sync.mjs --push\`, which fetches the latest upstream tree, diffs every extension's tree SHA against [\`data/extensions.json\`](./data/extensions.json), downloads only the changed manifests, regenerates these pages, and records additions/updates/removals in [CHANGELOG.md](./CHANGELOG.md). Runs that find no extension changes make no commit.`,
    "",
    `Subcategories are not a fixed list: curated keyword rules (\`scripts/extension-catalog/taxonomy.mjs\`) provide the first split, then frequent-term mining promotes emergent topics out of "General" (marked ✦) and recursively splits every group for as long as it still yields at least two coherent subgroups of ${MIN_GROUP}+ extensions — depth is bounded only by the data, so new tools trending upstream get their own group automatically on a future sync.`,
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

// Pushes once, capturing output so a non-fast-forward rejection (an
// overlapping trigger won the race) can be told apart from a transient
// failure (network blip, timeout).
function tryPush(branch) {
  try {
    const out = execFileSync("git", ["push", "-u", "origin", branch], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (out) process.stdout.write(out);
    return { ok: true };
  } catch (err) {
    const combined = `${err.stdout || ""}${err.stderr || ""}`;
    process.stderr.write(combined);
    return { ok: false, rejected: /\[rejected\]|fetch first|non-fast-forward/i.test(combined), err };
  }
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
    const res = tryPush(branch);
    if (res.ok) {
      console.log(`pushed to origin/${branch}`);
      return;
    }
    if (res.rejected) {
      // An overlapping trigger (poller + web-cron, two manual dispatches,
      // etc.) already pushed a fresh regeneration to this branch. Every run
      // rebuilds the whole catalog from scratch, so that commit is equally
      // current — rebasing this run's commit on top would just conflict on
      // regenerated content (timestamps, reordered tables) for no benefit.
      // Skip cleanly; the next run stays in sync regardless.
      console.warn(
        `push rejected: origin/${branch} already has a newer regeneration from an overlapping trigger. Skipping — the next run stays in sync.`,
      );
      return;
    }
    if (attempt >= delays.length) throw res.err;
    console.warn(`push failed, retrying in ${delays[attempt] / 1000}s...`);
    sleep(delays[attempt]);
  }
}

// --- main -------------------------------------------------------------------

const ref = ensureUpstreamAndFetch();
const commit = git(["rev-parse", ref]).trim();
console.log(`source: ${ref} @ ${commit}`);

let oldState = null;
if (existsSync(STATE_FILE)) {
  try {
    oldState = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    oldState = null;
  }
}

// Download counts drift constantly, so they're fetched on a capped cadence
// rather than every run; manifest changes still apply immediately.
const DOWNLOADS_REFRESH_MS = 20 * 60 * 60 * 1000; // ~daily
const lastDownloadsAt = Date.parse(oldState?.downloadsRefreshedAt ?? "") || 0;
const downloadsStale = Date.now() - lastDownloadsAt > DOWNLOADS_REFRESH_MS;

// A fetched refresh always updates the JSON ground truth (data/extensions.json),
// but only regenerates the 500+ markdown pages when it's actually worth
// rewriting them for: the top RANK_WATCH_N ordering changed (the tail is
// thick with near-ties that reorder constantly and mean nothing — see
// catalog/CHANGELOG.md), or it's been a while regardless (so displayed
// numbers don't visibly rot during a quiet stretch with a stable top).
const RANK_WATCH_N = 250;
const DOWNLOADS_MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Cheap guard: if upstream HEAD is unchanged and downloads aren't due, there is
// nothing to do — so a blind every-minute web-cron trigger costs ~one git fetch
// and exits here, without listing 3k trees or hitting the store API.
if (
  oldState?.commit === commit &&
  !downloadsStale &&
  !FORCE &&
  existsSync(path.join(CATALOG_DIR, "README.md"))
) {
  console.log("catalog is up to date — upstream unchanged");
  process.exit(0);
}

const trees = listExtensionTrees(ref);
console.log(`extensions upstream: ${trees.size}`);

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
if (!changed && !downloadsStale && !FORCE && existsSync(path.join(CATALOG_DIR, "README.md"))) {
  console.log("catalog is up to date — no extension changes upstream");
  process.exit(0);
}
console.log(
  `changes: +${addedDirs.length} added, ~${updatedDirs.length} updated, -${removed.length} removed` +
    (downloadsStale ? " · refreshing downloads" : ""),
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

// Resolve download counts + canonical store URLs (best-effort). On success,
// every entry's downloads/store are set authoritatively (null = unknown, not
// on the store). On failure, entries keep whatever they carried from last run.
let resolved = null;
try {
  resolved = resolveDownloads(entries);
  console.log(
    `downloads resolved: ${resolved.listings} listings, ${resolved.detailFetched} detail-fetched`,
  );
} catch (err) {
  console.warn(`warn: download resolve failed, reusing stored values: ${err.message}`);
}
for (const entry of entries) {
  if (resolved) {
    const r = resolved.map.get(entry.dir);
    entry.downloads = r ? r.downloads : null;
    entry.store = r ? r.storeUrl : null;
    // Categorize from the store when the git manifest gave no categories.
    if (r && needsStoreCategoryEnrichment(entry)) {
      const c = canonicalCategories(r.seo);
      if (c.length) entry.categories = c;
    }
  } else if (entry.downloads === undefined) {
    entry.downloads = null;
  }
}
const downloadsRefreshedAt = resolved
  ? new Date().toISOString()
  : oldState?.downloadsRefreshedAt ?? null;

// Did the refresh move the watched top-N ordering? (Skipped — and assumed
// unchanged — when nothing was actually fetched this run.)
const rankChanged =
  resolved && !arraysEqual(topNDirs([...oldEntries.values()], RANK_WATCH_N), topNDirs(entries, RANK_WATCH_N));
const pastMaxStale = resolved && Date.now() - lastDownloadsAt > DOWNLOADS_MAX_STALE_MS;
const downloadsWorthRegenerating = resolved && (rankChanged || pastMaxStale);
const shouldRegenerateMarkdown = changed || initial || downloadsWorthRegenerating || FORCE;

entries.sort((a, b) => a.dir.localeCompare(b.dir, "en"));
if (shouldRegenerateMarkdown) {
  generateCatalog(entries);
  if (changed || initial) {
    updateChangelog({ initial, added, updated, removed, commit, total: entries.length });
  }
} else {
  console.log(`downloads refreshed, no top ${RANK_WATCH_N} change — updating data only, catalog pages untouched`);
}

mkdirSync(path.dirname(STATE_FILE), { recursive: true });
writeFileSync(
  STATE_FILE,
  JSON.stringify(
    {
      upstream: UPSTREAM_URL,
      commit,
      generatedAt: new Date().toISOString(),
      downloadsRefreshedAt,
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
  let message;
  if (parts.length) {
    message = `catalog: sync with upstream (${parts.join(", ")})`;
  } else if (rankChanged) {
    message = `catalog: refresh downloads (top ${RANK_WATCH_N} ranking changed)`;
  } else if (pastMaxStale) {
    message = `catalog: refresh downloads (periodic, ${Math.round(DOWNLOADS_MAX_STALE_MS / 86_400_000)}d since last meaningful change)`;
  } else {
    message = "catalog: update download counts (no ranking change)";
  }
  commitAndMaybePush(message);
}
