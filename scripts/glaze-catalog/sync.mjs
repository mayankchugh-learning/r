#!/usr/bin/env node
/**
 * Glaze app store catalog generator & sync.
 *
 * Companion to scripts/extension-catalog for https://www.glaze.app/store,
 * organized the same way: categories grouped under editorial sections, each
 * category split into curated topics (taxonomy.mjs) with emergent topics
 * mined out of the remainder and nested as deep as the data supports
 * (../shared/organize.mjs), plus publisher, alphabetical and ranked views.
 * Glaze ships only 7 flat categories and no sub-structure of its own, so that
 * second level is derived here.
 *
 * Outputs (all under glaze/):
 *   data/apps.json           machine-readable state, used for diffing runs
 *   README.md                stats + section summary + top installs
 *   categories/<slug>/       topic tree per category (nested)
 *   ranked/                  every app ranked by installs (paginated)
 *   sizes/                   every app ranked by download size (paginated)
 *   publishers/              leaderboard (2 orderings), A–Z, per-publisher pages
 *   alphabetical/<letter>.md every app, A–Z
 *   recent.md                recently published/updated apps
 *   CHANGELOG.md             added/removed/updated log, newest first
 *
 * Usage: node scripts/glaze-catalog/sync.mjs [--force] [--commit] [--push]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchGlazeApps } from "./fetch.mjs";
import { classify, subcategoriesOf, sectionsForCategory, CATEGORY_SECTIONS } from "./taxonomy.mjs";
import {
  AUTO_LEGEND,
  buildCategoryTree,
  nodeLabel,
  sectionizeNodes,
} from "../shared/organize.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = path.join(ROOT, "glaze");
const STATE_FILE = path.join(OUT_DIR, "data", "apps.json");
const CHANGELOG_FILE = path.join(OUT_DIR, "CHANGELOG.md");
const STORE_URL = "https://www.glaze.app/store";

// Install counts creep constantly. Regenerate the markdown when the top of the
// ranking actually moves, or as a periodic floor so displayed numbers don't
// visibly rot — otherwise update the JSON ground truth only.
const RANK_WATCH_N = 50;
const MAX_STALE_MS = 24 * 60 * 60 * 1000;
// Rows per page in the ranked view (the store is ~1.5k apps).
const RANK_PAGE = 500;
// A topic node bigger than this gets its own page per child instead of inline
// sections; auto-discovered groups need at least MIN_GROUP members.
const SPLIT_THRESHOLD = 120;
const MIN_GROUP = 4;
// Publishers with at least this many apps get their own page.
const BIG_PUBLISHER = 4;

// Phrasing that shows up in most Glaze listings and so names no real topic.
// Scoped to this catalog rather than the shared engine — "note", say, is
// boilerplate here but a genuine topic in the extension catalog.
const STORE_BOILERPLATE = new Set(
  `key keys highlight highlights overview note notes
   work works working stay stays real really across automatically automatic
   powered powering entire later turn turns bring brings built building
   designed seamlessly effortlessly never always plus whether once again
   based including include includes such well also either both`
    .split(/\s+/)
    .filter(Boolean),
);

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const PUSH = args.has("--push");
const COMMIT = args.has("--commit") || PUSH;

function git(a, opts = {}) {
  return execFileSync("git", a, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

// --- formatting -------------------------------------------------------------

function mdEscape(text, max = 150) {
  let s = String(text ?? "").replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
  if (s.length > max) s = `${s.slice(0, max - 1).trimEnd()}…`;
  return s;
}

const fmtNum = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

// Binary units, matching Glaze's own display (it shows 9.7 MB for 10,206,602
// bytes). Scaled rather than MB-only because 87% of the store is under 1 MB
// (median ~85 KB), which MB-only would flatten to a uniform "0.1 MB".
function fmtSize(b) {
  if (b == null) return "—";
  const KB = 1024, MB = KB * 1024, GB = MB * 1024;
  if (b >= GB) return `${(b / GB).toFixed(2)} GB`;
  if (b >= MB) return `${(b / MB).toFixed(1)} MB`;
  return `${Math.round(b / KB).toLocaleString("en-US")} KB`;
}

const fmtDate = (s) => {
  if (!s) return "—";
  const d = new Date(String(s).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
};

const slugOf = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const installsOf = (a) => (a.installs == null ? -1 : a.installs);

/** First letter for A–Z bucketing; anything non-alphabetic lands in "0-9". */
function letterOf(s) {
  const c = String(s).trim().charAt(0).toUpperCase();
  return c >= "A" && c <= "Z" ? c : "0-9";
}

function letterNav(letters, current, prefix = "./") {
  return letters
    .map((l) => (l === current ? `**${l}**` : `[${l}](${prefix}${l.toLowerCase()}.md)`))
    .join(" · ");
}

function byName(a, b) {
  return a.name.localeCompare(b.name, "en") || a.publicId.localeCompare(b.publicId);
}
function byInstalls(a, b) {
  return installsOf(b) - installsOf(a) || byName(a, b);
}
const bytesOf = (a) => (a.sizeBytes == null ? -1 : a.sizeBytes);
function bySize(a, b) {
  return bytesOf(b) - bytesOf(a) || byName(a, b);
}
function byUpdated(a, b) {
  return String(b.publishedAt ?? b.updatedAt ?? "").localeCompare(String(a.publishedAt ?? a.updatedAt ?? "")) || byName(a, b);
}

function groupBy(items, keyOf) {
  const m = new Map();
  for (const it of items) {
    const k = keyOf(it);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  return m;
}

function writePage(rel, lines) {
  const file = path.join(OUT_DIR, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${lines.filter((l) => l !== undefined).join("\n")}\n`);
}

const appLink = (a) => `[${mdEscape(a.name, 60)}](${a.url})`;

// Detail table used on category pages.
const DETAIL_HEAD = [
  "| App | Installs | Description | Publisher | Version | Size | Updated |",
  "| --- | --- | --- | --- | --- | --- | --- |",
];
const detailRow = (a) =>
  `| ${appLink(a)} | ${fmtNum(a.installs)} | ${mdEscape(a.tagline)} | ${mdEscape(a.publisher ?? "—", 40)} | ${
    a.version ?? "—"
  } | ${fmtSize(a.sizeBytes)} | ${fmtDate(a.publishedAt ?? a.updatedAt)} |`;

const detailTable = (apps) => [...DETAIL_HEAD, ...[...apps].sort(byInstalls).map(detailRow)].join("\n");

// --- page generation --------------------------------------------------------
function generate(apps) {
  for (const d of ["categories", "ranked", "sizes", "publishers", "alphabetical"]) {
    rmSync(path.join(OUT_DIR, d), { recursive: true, force: true });
  }
  // Older builds emitted flat pages at these paths; drop them so they can't linger.
  for (const f of ["ranked.md", "publishers.md"]) rmSync(path.join(OUT_DIR, f), { force: true });
  mkdirSync(path.join(OUT_DIR, "data"), { recursive: true });

  const ranked = [...apps].sort(byInstalls);
  const totalInstalls = apps.reduce((s, a) => s + (a.installs ?? 0), 0);
  const knownBytes = apps.map((a) => a.sizeBytes).filter((b) => b != null).sort((x, y) => x - y);
  const totalBytes = knownBytes.reduce((s, b) => s + b, 0);
  const medianBytes = knownBytes.length ? knownBytes[Math.floor(knownBytes.length / 2)] : null;

  const byCat = groupBy(apps, (a) => a.category);
  const catInstalls = (c) => byCat.get(c).reduce((s, a) => s + (a.installs ?? 0), 0);
  const cats = [...byCat.keys()];

  const treeOpts = {
    classify,
    subcategoriesOf,
    slugify: slugOf,
    sortEntries: byInstalls,
    textOf: (a) => `${a.name} ${a.tagline} ${a.description}`,
    minGroup: MIN_GROUP,
    extraStopwords: STORE_BOILERPLATE,
  };

  // ---- categories: sections -> curated subcategories -> mined topics ----
  for (const c of cats) {
    const items = byCat.get(c);
    const tree = buildCategoryTree(items, c, treeOpts);
    const dirRel = `categories/${slugOf(c)}`;
    const linkOf = new Map(tree.map((n) => [n, renderNode(n, dirRel, c)]));
    writePage(`${dirRel}/README.md`, [
      `# ${c}`,
      "",
      `${items.length} app${items.length === 1 ? "" : "s"} · ${fmtNum(catInstalls(c))} installs · [← all categories](../README.md)`,
      ...sectionedTopicLines(c, tree, (n) => linkOf.get(n)),
    ]);
  }
  writePage("categories/README.md", [
    "# Categories",
    "",
    `${cats.length} categories · [← Glaze catalog](../README.md)`,
    ...categorySectionLines(cats, (c) => byCat.get(c).length, (c) => `./${slugOf(c)}/README.md`, catInstalls),
  ]);

  // ---- rankings (paginated): by installs and by size, cross-linked ----
  const RANKINGS = [
    {
      dir: "ranked",
      label: "Installs",
      title: "installs",
      order: byInstalls,
      metric: "Installs",
      valueOf: (a) => fmtNum(a.installs),
      summary: `${fmtNum(totalInstalls)} installs total`,
      lead: "most-installed",
    },
    {
      dir: "sizes",
      label: "Size",
      title: "size",
      order: bySize,
      metric: "Size",
      valueOf: (a) => fmtSize(a.sizeBytes),
      summary: `${fmtSize(totalBytes)} total · median ${fmtSize(medianBytes)}`,
      lead: "largest",
    },
  ];
  for (const view of RANKINGS) {
    const list = [...apps].sort(view.order);
    const pages = Math.max(1, Math.ceil(list.length / RANK_PAGE));
    const nav = (active) =>
      Array.from({ length: pages }, (_, i) =>
        i + 1 === active ? `**${i + 1}**` : `[${i + 1}](./${i + 1}.md)`,
      ).join(" · ");
    // Toggle between the two orderings, mirroring the publishers leaderboard.
    const toggle = (self) =>
      "**Sort:** " +
      RANKINGS.map((v) =>
        v.dir === self ? `**${v.label}**` : `[${v.label}](../${v.dir}/README.md)`,
      ).join(" · ");

    for (let p = 0; p < pages; p++) {
      const slice = list.slice(p * RANK_PAGE, (p + 1) * RANK_PAGE);
      const from = p * RANK_PAGE + 1;
      writePage(`${view.dir}/${p + 1}.md`, [
        `# Glaze apps by ${view.title} — ${from}–${from + slice.length - 1}`,
        "",
        `of ${list.length} apps · ${view.summary} · [← Glaze catalog](../README.md)`,
        "",
        toggle(view.dir),
        "",
        pages > 1 ? nav(p + 1) : undefined,
        "",
        `| # | App | ${view.metric} | Category | Publisher | Version |`,
        "| --- | --- | --- | --- | --- | --- |",
        ...slice.map(
          (a, j) =>
            `| ${from + j} | ${appLink(a)} | ${view.valueOf(a)} | ${a.category} | ${mdEscape(
              a.publisher ?? "—",
              40,
            )} | ${a.version ?? "—"} |`,
        ),
      ]);
    }
    writePage(`${view.dir}/README.md`, [
      `# Glaze apps by ${view.title}`,
      "",
      `All ${list.length} apps ranked by ${view.title} · [← Glaze catalog](../README.md)`,
      "",
      toggle(view.dir),
      "",
      nav(0),
      "",
      `Start at [page 1](./1.md) for the ${view.lead} apps.`,
    ]);
  }

  // ---- publishers: leaderboard (two orderings) + A–Z + pages for big ones ----
  const byPub = groupBy(apps.filter((a) => a.publisher), (a) => a.publisher);
  const publishers = [...byPub.keys()];
  const pubInstalls = (p) => byPub.get(p).reduce((s, a) => s + (a.installs ?? 0), 0);
  const isBig = (p) => byPub.get(p).length >= BIG_PUBLISHER;

  const pubSlug = new Map();
  {
    const used = new Set();
    for (const p of publishers.filter(isBig)) {
      let s = slugOf(p) || "publisher";
      while (used.has(s)) s += "-x";
      used.add(s);
      pubSlug.set(p, s);
    }
  }
  const pubDisplay = (p) =>
    isBig(p) ? `[${mdEscape(p, 60)}](./id/${pubSlug.get(p)}.md)` : mdEscape(p, 60);

  // A page per prolific publisher, their apps grouped by category.
  for (const p of publishers.filter(isBig)) {
    const items = byPub.get(p);
    const grouped = groupBy(items, (a) => a.category);
    const gcats = [...grouped.keys()].sort(
      (a, b) =>
        grouped.get(b).reduce((s, x) => s + (x.installs ?? 0), 0) -
          grouped.get(a).reduce((s, x) => s + (x.installs ?? 0), 0) || a.localeCompare(b, "en"),
    );
    const lines = [
      `# ${mdEscape(p, 80)}`,
      "",
      `${items.length} apps · ${fmtNum(pubInstalls(p))} installs · [← publishers](../README.md)`,
    ];
    for (const c of gcats) {
      lines.push("", `## ${c} (${grouped.get(c).length})`, "", detailTable(grouped.get(c)));
    }
    writePage(`publishers/id/${pubSlug.get(p)}.md`, lines);
  }

  // A–Z lookup pages.
  const alphaPubs = [...publishers].sort(
    (a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), "en") || a.localeCompare(b, "en"),
  );
  const pubByLetter = groupBy(alphaPubs, (p) => letterOf(p));
  const pubLetters = [...pubByLetter.keys()].sort();
  for (const letter of pubLetters) {
    const rows = pubByLetter.get(letter).map((p) => {
      const items = [...byPub.get(p)].sort(byInstalls);
      const cell = isBig(p)
        ? `[see all ${items.length} →](./id/${pubSlug.get(p)}.md)`
        : items.map((a) => `${appLink(a)} *(${a.category})*`).join(", ");
      return `| ${pubDisplay(p)} | ${items.length} | ${fmtNum(pubInstalls(p))} | ${cell} |`;
    });
    writePage(`publishers/${letter.toLowerCase()}.md`, [
      `# Publishers — ${letter}`,
      "",
      letterNav(pubLetters, letter),
      "",
      `${pubByLetter.get(letter).length} publishers · [← publisher index](./README.md)`,
      "",
      "| Publisher | Apps | Installs | Apps |",
      "| --- | --- | --- | --- |",
      ...rows,
    ]);
  }

  const stats = publishers.map((p) => ({ p, count: byPub.get(p).length, installs: pubInstalls(p) }));
  const byInst = [...stats].sort(
    (a, b) => b.installs - a.installs || b.count - a.count || a.p.toLowerCase().localeCompare(b.p.toLowerCase(), "en"),
  );
  const byCount = [...stats].sort(
    (a, b) => b.count - a.count || b.installs - a.installs || a.p.toLowerCase().localeCompare(b.p.toLowerCase(), "en"),
  );
  const pubRow = (r, i) => `| ${i + 1} | ${pubDisplay(r.p)} | ${r.count} | ${fmtNum(r.installs)} |`;
  const pubHead = (activeInstalls) => [
    "# Publishers",
    "",
    `${publishers.length} publishers · [← Glaze catalog](../README.md)`,
    "",
    "**Sort:** " +
      (activeInstalls ? "**Installs**" : "[Installs](./README.md)") +
      " · " +
      (activeInstalls ? "[Apps](./by-apps.md)" : "**Apps**"),
    "",
    letterNav(pubLetters, null),
    "",
    "| # | Publisher | Apps | Installs |",
    "| --- | --- | --- | --- |",
  ];
  writePage("publishers/README.md", [...pubHead(true), ...byInst.map(pubRow)]);
  writePage("publishers/by-apps.md", [...pubHead(false), ...byCount.map(pubRow)]);

  // ---- alphabetical ----
  const byLetter = groupBy(apps, (a) => letterOf(a.name));
  const letters = [...byLetter.keys()].sort();
  for (const letter of letters) {
    const items = [...byLetter.get(letter)].sort((a, b) => byName(a, b));
    writePage(`alphabetical/${letter.toLowerCase()}.md`, [
      `# Apps — ${letter}`,
      "",
      letterNav(letters, letter),
      "",
      `${items.length} app${items.length === 1 ? "" : "s"} · [← Glaze catalog](../README.md)`,
      "",
      detailTable(items),
    ]);
  }

  // ---- recent ----
  const recent = [...apps].sort(byUpdated).slice(0, 60);
  writePage("recent.md", [
    "# Recently published & updated",
    "",
    `Newest ${recent.length} of ${apps.length} apps by last release · [← Glaze catalog](./README.md)`,
    "",
    "| App | Released | Version | Installs | Category | Publisher |",
    "| --- | --- | --- | --- | --- | --- |",
    ...recent.map(
      (a) =>
        `| ${appLink(a)} | ${fmtDate(a.publishedAt ?? a.updatedAt)} | ${a.version ?? "—"} | ${fmtNum(
          a.installs,
        )} | ${a.category} | ${mdEscape(a.publisher ?? "—", 40)} |`,
    ),
  ]);

  // ---- index ----
  const coveredCats = new Set(CATEGORY_SECTIONS.flatMap(([, cs]) => cs));
  const sectionSummary = [
    ...CATEGORY_SECTIONS.map(([title, cs]) => [title, cs.filter((c) => byCat.has(c))]),
    ["More", cats.filter((c) => !coveredCats.has(c))],
  ]
    .filter(([, cs]) => cs.length)
    .map(([title, cs]) => [
      title,
      cs,
      cs.reduce((s, c) => s + byCat.get(c).length, 0),
      cs.reduce((s, c) => s + catInstalls(c), 0),
    ]);

  writePage("README.md", [
    "# Glaze Store Catalog",
    "",
    `An organized, auto-maintained index of every public app in the [Glaze Store](${STORE_URL}).`,
    "",
    `**${fmtNum(apps.length)}** apps · **${cats.length}** categories · **${fmtNum(
      publishers.length,
    )}** publishers · **${fmtNum(totalInstalls)}** installs · **${fmtSize(totalBytes)}** total, median **${fmtSize(
      medianBytes,
    )}**`,
    "",
    "## Browse",
    "",
    "| View | |",
    "| --- | --- |",
    "| [By installs](./ranked/README.md) | every app ranked by install count |",
    "| [By size](./sizes/README.md) | every app ranked by download size |",
    `| [By category](./categories/README.md) | ${cats.length} categories → curated topics → auto-discovered groups (✦), nested as deep as the data supports |`,
    `| [By publisher](./publishers/README.md) | ${fmtNum(publishers.length)} publishers, sortable by installs or app count |`,
    `| [Alphabetical](./alphabetical/${letters[0].toLowerCase()}.md) | every app, A–Z |`,
    "| [Recent](./recent.md) | newest releases and updates |",
    "| [Changelog](./CHANGELOG.md) | apps added, removed, and updated per sync |",
    "",
    "## By section",
    "",
    "| Section | Categories | Apps | Installs |",
    "| --- | --- | --- | --- |",
    ...sectionSummary.map(
      ([title, cs, n, inst]) => `| ${title} | ${cs.join(", ")} | ${fmtNum(n)} | ${fmtNum(inst)} |`,
    ),
    "",
    "## Most installed",
    "",
    "| # | App | Installs | Category | Publisher |",
    "| --- | --- | --- | --- | --- |",
    ...ranked
      .slice(0, 10)
      .map(
        (a, i) =>
          `| ${i + 1} | ${appLink(a)} | ${fmtNum(a.installs)} | ${a.category} | ${mdEscape(
            a.publisher ?? "—",
            40,
          )} |`,
      ),
    "",
    "## How this stays up to date",
    "",
    `A scheduled job runs \`node scripts/glaze-catalog/sync.mjs --push\`. Glaze's backend requires an API key, so the store's own public search endpoint is queried per category — one request each, no credentials — and the union is the whole store. Every run diffs against [\`data/apps.json\`](./data/apps.json); the JSON always tracks current install counts, while these pages are regenerated when an app is added, removed or updated, when the top ${RANK_WATCH_N} install ranking moves, or once a day regardless.`,
    "",
    `Topics below each category are not a fixed list: curated keyword rules (\`scripts/glaze-catalog/taxonomy.mjs\`) provide the first split, then frequent-term mining promotes emergent topics out of "General" (marked ✦) and keeps splitting any group that still yields at least two coherent subgroups of ${MIN_GROUP}+ apps.`,
  ]);
}

/** Sectioned "table of topics" for a category index page. */
function sectionedTopicLines(category, nodes, linkOf) {
  const { sections, general } = sectionizeNodes(nodes, sectionsForCategory(category));
  const lines = [];
  for (const [title, list] of sections) {
    lines.push(
      "",
      `## ${title}`,
      "",
      "| Topic | Apps | Installs |",
      "| --- | --- | --- |",
      ...list.map(
        (n) =>
          `| [${nodeLabel(n)}](${linkOf(n)}) | ${n.entries.length} | ${fmtNum(
            n.entries.reduce((s, a) => s + (a.installs ?? 0), 0),
          )} |`,
      ),
    );
  }
  if (general) {
    lines.push(
      "",
      `Plus [General](${linkOf(general)}) — ${general.entries.length} app${
        general.entries.length === 1 ? "" : "s"
      } that don't fit a topic yet.`,
    );
  }
  if (nodes.some((n) => n.auto)) lines.push("", `*${AUTO_LEGEND}*`);
  return lines;
}

/** Categories grouped under editorial sections instead of one flat table. */
function categorySectionLines(catNames, countOf, linkOf, installsOfCat) {
  const present = new Set(catNames);
  const covered = new Set(CATEGORY_SECTIONS.flatMap(([, cs]) => cs));
  const sections = CATEGORY_SECTIONS.map(([title, cs]) => [title, cs.filter((c) => present.has(c))]);
  const extra = catNames.filter((c) => !covered.has(c));
  if (extra.length) sections.push(["More", extra]);

  const lines = [];
  for (const [title, cs] of sections) {
    if (!cs.length) continue;
    const ordered = [...cs].sort((a, b) => countOf(b) - countOf(a) || a.localeCompare(b, "en"));
    lines.push(
      "",
      `## ${title}`,
      "",
      "| Category | Apps | Installs |",
      "| --- | --- | --- |",
      ...ordered.map((c) => `| [${c}](${linkOf(c)}) | ${countOf(c)} | ${fmtNum(installsOfCat(c))} |`),
    );
  }
  return lines;
}

/**
 * Renders a topic node. Leaves become a table page; small internal nodes
 * render inline sections on one page; larger ones become a directory with an
 * index plus child pages. Returns the link target from the parent's directory.
 */
function renderNode(node, parentDirRel, parentTitle) {
  const total = node.entries.length;
  const count = `${total} app${total === 1 ? "" : "s"}`;
  const backSame = `[← ${parentTitle}](./README.md)`;
  const backUp = `[← ${parentTitle}](../README.md)`;

  if (!node.children.length) {
    writePage(`${parentDirRel}/${node.slug}.md`, [
      `# ${nodeLabel(node)}`,
      "",
      `${count} · ${backSame}`,
      ...(node.auto ? ["", `*${AUTO_LEGEND}*`] : []),
      "",
      detailTable(node.entries),
    ]);
    return `./${node.slug}.md`;
  }

  const allLeaves = node.children.every((c) => !c.children.length);
  if (total <= SPLIT_THRESHOLD && allLeaves) {
    const lines = [
      `# ${nodeLabel(node)}`,
      "",
      `${count} · ${backSame}`,
      "",
      node.children.map((c) => `[${nodeLabel(c)}](#${slugOf(c.title)}) (${c.entries.length})`).join(" · "),
    ];
    if (node.children.some((c) => c.auto)) lines.push("", `*${AUTO_LEGEND}*`);
    for (const c of node.children) lines.push("", `## ${nodeLabel(c)}`, "", detailTable(c.entries));
    writePage(`${parentDirRel}/${node.slug}.md`, lines);
    return `./${node.slug}.md`;
  }

  const dirRel = `${parentDirRel}/${node.slug}`;
  const childLinks = node.children.map((c) => renderNode(c, dirRel, node.title));
  const lines = [
    `# ${nodeLabel(node)}`,
    "",
    `${count} · ${backUp}`,
    "",
    "| Topic | Apps |",
    "| --- | --- |",
    ...node.children.map((c, i) => `| [${nodeLabel(c)}](${childLinks[i]}) | ${c.entries.length} |`),
  ];
  if (node.children.some((c) => c.auto)) lines.push("", `*${AUTO_LEGEND}*`);
  writePage(`${dirRel}/README.md`, lines);
  return `./${node.slug}/README.md`;
}

// --- changelog --------------------------------------------------------------

function updateChangelog({ initial, added, removed, changed, total }) {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [`## ${date}`, ""];
  if (initial) {
    lines.push(`Initial catalog build: ${total} apps indexed.`, "");
  } else {
    // Cap long lists — a bulk change can span >1k apps, which is unreadable
    // and bloats the file; the full set is always in data/apps.json.
    const CAP = 40;
    const cap = (xs, render) => {
      const shown = xs.slice(0, CAP).map(render).join(", ");
      return xs.length > CAP ? `${shown} …and ${xs.length - CAP} more` : shown;
    };
    const link = (a) => `[${mdEscape(a.name, 60)}](${a.url})`;
    if (added.length) lines.push(`**Added (${added.length}):** ${cap(added, link)}`, "");
    if (removed.length)
      lines.push(`**Removed (${removed.length}):** ${cap(removed, (a) => mdEscape(a.name, 60))}`, "");
    for (const c of changed) {
      if (c.notes.length) lines.push(`**${mdEscape(c.app.name, 60)}:** ${c.notes.join("; ")}`, "");
    }
  }
  const header = "# Glaze Catalog Changelog\n\nStore changes detected by each sync run, newest first.\n\n";
  let existing = "";
  if (existsSync(CHANGELOG_FILE)) existing = readFileSync(CHANGELOG_FILE, "utf8").replace(header, "");
  writeFileSync(CHANGELOG_FILE, `${header}${lines.join("\n")}\n${existing}`.trimEnd() + "\n");
}

// --- commit / push ----------------------------------------------------------

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
  git(["add", "glaze", "scripts/glaze-catalog"]);
  if (!git(["diff", "--cached", "--name-only"]).trim()) {
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
      // An overlapping trigger already published an equally-fresh rebuild;
      // rebasing regenerated content on top would only conflict for nothing.
      console.warn(`push rejected: origin/${branch} already has a newer rebuild. Skipping — the next run stays in sync.`);
      return;
    }
    if (attempt >= delays.length) throw res.err;
    console.warn(`push failed, retrying in ${delays[attempt] / 1000}s...`);
    execFileSync("sleep", [String(delays[attempt] / 1000)]);
  }
}

// --- main -------------------------------------------------------------------

let oldState = null;
if (existsSync(STATE_FILE)) {
  try {
    oldState = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    oldState = null;
  }
}

const { apps, fetchedAt } = fetchGlazeApps();
apps.sort((a, b) => a.publicId.localeCompare(b.publicId));
console.log(`fetched ${apps.length} apps from the Glaze store`);

const oldApps = new Map((oldState?.apps ?? []).map((a) => [a.publicId, a]));
const initial = oldApps.size === 0;
const current = new Map(apps.map((a) => [a.publicId, a]));

const added = apps.filter((a) => !oldApps.has(a.publicId));
const removed = [...oldApps.values()].filter((a) => !current.has(a.publicId));

// Metadata changes worth a changelog line (install drift is not one).
const WATCH_FIELDS = [
  ["version", "version"],
  ["name", "name"],
  ["tagline", "tagline"],
  ["category", "category"],
  ["publisher", "publisher"],
];
const changed = [];
for (const a of apps) {
  const prev = oldApps.get(a.publicId);
  if (!prev) continue;
  const notes = [];
  for (const [field, label] of WATCH_FIELDS) {
    if (prev[field] !== a[field] && (prev[field] || a[field])) {
      notes.push(`${label} ${mdEscape(prev[field] ?? "—", 40)} → ${mdEscape(a[field] ?? "—", 40)}`);
    }
  }
  if (notes.length) changed.push({ app: a, notes });
}

const metaChanged = added.length + removed.length + changed.length > 0;

const topN = (list) => [...list].sort(byInstalls).slice(0, RANK_WATCH_N).map((a) => a.publicId);
const oldTop = topN([...oldApps.values()]);
const newTop = topN(apps);
const rankChanged =
  !initial && (oldTop.length !== newTop.length || oldTop.some((id, i) => id !== newTop[i]));

const lastGen = Date.parse(oldState?.pagesGeneratedAt ?? "") || 0;
const pastMaxStale = Date.now() - lastGen > MAX_STALE_MS;
const installsChanged = apps.some((a) => oldApps.get(a.publicId)?.installs !== a.installs);

const regenerate = initial || metaChanged || rankChanged || pastMaxStale || FORCE;

if (!regenerate && !installsChanged) {
  console.log("catalog is up to date — nothing changed in the store");
  process.exit(0);
}

if (regenerate) {
  generate(apps);
  if (initial || metaChanged) {
    updateChangelog({ initial, added, removed, changed, total: apps.length });
  }
} else {
  console.log(`installs moved but top ${RANK_WATCH_N} unchanged — updating data only, pages untouched`);
}

mkdirSync(path.dirname(STATE_FILE), { recursive: true });
writeFileSync(
  STATE_FILE,
  JSON.stringify(
    {
      source: STORE_URL,
      fetchedAt,
      pagesGeneratedAt: regenerate ? new Date().toISOString() : oldState?.pagesGeneratedAt ?? null,
      count: apps.length,
      totalInstalls: apps.reduce((s, a) => s + (a.installs ?? 0), 0),
      apps,
    },
    null,
    2,
  ) + "\n",
);
console.log(`glaze catalog written: ${apps.length} apps`);

if (COMMIT) {
  const parts = [];
  if (initial) parts.push(`initial build, ${apps.length} apps`);
  if (!initial && added.length) parts.push(`${added.length} added`);
  if (!initial && removed.length) parts.push(`${removed.length} removed`);
  if (!initial && changed.length) parts.push(`${changed.length} updated`);
  let message;
  if (parts.length) message = `glaze: sync store (${parts.join(", ")})`;
  else if (rankChanged) message = `glaze: refresh installs (top ${RANK_WATCH_N} ranking changed)`;
  else if (pastMaxStale) message = "glaze: refresh installs (periodic)";
  else message = "glaze: update install counts (no ranking change)";
  commitAndMaybePush(message);
}
