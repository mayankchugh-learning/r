#!/usr/bin/env node
/**
 * Glaze app store catalog generator & sync.
 *
 * Companion to scripts/extension-catalog for https://www.glaze.app/store.
 * Same idea — an organized, auto-maintained, install-ranked index that only
 * commits when something meaningful changed — but deliberately much flatter:
 * the Glaze store is ~69 apps across 6 first-party categories, where the
 * Raycast catalog covers ~3,100 across 16. Recursive topic-mining and
 * per-publisher pages would be cargo-culting at this size (most publishers
 * ship exactly one app), so this generates ~10 pages, not ~650.
 *
 * Outputs (all under glaze/):
 *   data/apps.json          machine-readable state, used for diffing runs
 *   README.md               stats + index + top installs
 *   ranked.md               every app ranked by installs
 *   categories/<slug>.md    one page per Glaze category
 *   publishers.md           every publisher, ranked by total installs
 *   recent.md               recently published/updated apps
 *   CHANGELOG.md            added/removed/updated log, newest first
 *
 * Usage: node scripts/glaze-catalog/sync.mjs [--force] [--commit] [--push]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchGlazeApps } from "./fetch.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = path.join(ROOT, "glaze");
const STATE_FILE = path.join(OUT_DIR, "data", "apps.json");
const CHANGELOG_FILE = path.join(OUT_DIR, "CHANGELOG.md");
const STORE_URL = "https://www.glaze.app/store";

// Install counts creep constantly. Regenerate the markdown when the top of the
// ranking actually moves, or as a periodic floor so displayed numbers don't
// visibly rot — otherwise update the JSON ground truth only.
const RANK_WATCH_N = 25;
const MAX_STALE_MS = 24 * 60 * 60 * 1000;

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

// Glaze displays binary units (9.7 MB for 10,206,602 bytes), so match that.
const fmtSize = (b) => (b == null ? "—" : `${(b / 1048576).toFixed(1)} MB`);

const fmtDate = (s) => {
  if (!s) return "—";
  const d = new Date(String(s).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
};

const slugOf = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const installsOf = (a) => (a.installs == null ? -1 : a.installs);

function byName(a, b) {
  return a.name.localeCompare(b.name, "en") || a.publicId.localeCompare(b.publicId);
}
function byInstalls(a, b) {
  return installsOf(b) - installsOf(a) || byName(a, b);
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
  rmSync(path.join(OUT_DIR, "categories"), { recursive: true, force: true });
  mkdirSync(path.join(OUT_DIR, "data"), { recursive: true });

  const ranked = [...apps].sort(byInstalls);
  const totalInstalls = apps.reduce((s, a) => s + (a.installs ?? 0), 0);

  const byCat = groupBy(apps, (a) => a.category);
  const catInstalls = (c) => byCat.get(c).reduce((s, a) => s + (a.installs ?? 0), 0);
  const cats = [...byCat.keys()].sort(
    (a, b) => byCat.get(b).length - byCat.get(a).length || a.localeCompare(b, "en"),
  );

  const byPub = groupBy(
    apps.filter((a) => a.publisher),
    (a) => a.publisher,
  );
  const pubInstalls = (p) => byPub.get(p).reduce((s, a) => s + (a.installs ?? 0), 0);

  // ---- categories ----
  for (const c of cats) {
    const items = byCat.get(c);
    writePage(`categories/${slugOf(c)}.md`, [
      `# ${c}`,
      "",
      `${items.length} app${items.length === 1 ? "" : "s"} · ${fmtNum(catInstalls(c))} installs · sorted by installs · [← Glaze catalog](../README.md)`,
      "",
      detailTable(items),
    ]);
  }

  // ---- ranked ----
  writePage("ranked.md", [
    "# Glaze apps by installs",
    "",
    `All ${ranked.length} apps · ${fmtNum(totalInstalls)} installs total · [← Glaze catalog](./README.md)`,
    "",
    "| # | App | Installs | Category | Publisher | Version |",
    "| --- | --- | --- | --- | --- | --- |",
    ...ranked.map(
      (a, i) =>
        `| ${i + 1} | ${appLink(a)} | ${fmtNum(a.installs)} | ${a.category} | ${mdEscape(
          a.publisher ?? "—",
          40,
        )} | ${a.version ?? "—"} |`,
    ),
  ]);

  // ---- publishers ----
  const pubRows = [...byPub.keys()]
    .sort(
      (a, b) =>
        pubInstalls(b) - pubInstalls(a) ||
        byPub.get(b).length - byPub.get(a).length ||
        a.toLowerCase().localeCompare(b.toLowerCase(), "en"),
    )
    .map((p, i) => {
      const items = [...byPub.get(p)].sort(byInstalls);
      return `| ${i + 1} | ${mdEscape(p, 60)} | ${items.length} | ${fmtNum(pubInstalls(p))} | ${items
        .map(appLink)
        .join(", ")} |`;
    });
  writePage("publishers.md", [
    "# Publishers",
    "",
    `${byPub.size} publishers, ranked by total installs · [← Glaze catalog](./README.md)`,
    "",
    "| # | Publisher | Apps | Installs | Apps |",
    "| --- | --- | --- | --- | --- |",
    ...pubRows,
  ]);

  // ---- recent ----
  const recent = [...apps].sort(byUpdated).slice(0, 30);
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
  writePage("README.md", [
    "# Glaze Store Catalog",
    "",
    `An organized, auto-maintained index of every public app in the [Glaze Store](${STORE_URL}).`,
    "",
    `**${apps.length}** apps · **${cats.length}** categories · **${byPub.size}** publishers · **${fmtNum(
      totalInstalls,
    )}** installs`,
    "",
    "## Browse",
    "",
    "| View | |",
    "| --- | --- |",
    "| [By installs](./ranked.md) | every app ranked by install count |",
    "| [By category](#categories) | the store's own categories, install-sorted |",
    "| [By publisher](./publishers.md) | every publisher, ranked by total installs |",
    "| [Recent](./recent.md) | newest releases and updates |",
    "| [Changelog](./CHANGELOG.md) | apps added, removed, and updated per sync |",
    "",
    "## Categories",
    "",
    "| Category | Apps | Installs |",
    "| --- | --- | --- |",
    ...cats.map(
      (c) => `| [${c}](./categories/${slugOf(c)}.md) | ${byCat.get(c).length} | ${fmtNum(catInstalls(c))} |`,
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
    `A scheduled job runs \`node scripts/glaze-catalog/sync.mjs --push\`. Glaze's backend requires an API key, so the store page's server-rendered payload is parsed instead — one request, no credentials. Every run diffs against [\`data/apps.json\`](./data/apps.json); the JSON always tracks current install counts, while these pages are regenerated when an app is added, removed or updated, when the top ${RANK_WATCH_N} install ranking moves, or once a day regardless. Runs that find nothing meaningful make no commit.`,
  ]);
}

// --- changelog --------------------------------------------------------------

function updateChangelog({ initial, added, removed, changed, total }) {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [`## ${date}`, ""];
  if (initial) {
    lines.push(`Initial catalog build: ${total} apps indexed.`, "");
  } else {
    const list = (xs) => xs.map((a) => `[${mdEscape(a.name, 60)}](${a.url})`).join(", ");
    if (added.length) lines.push(`**Added (${added.length}):** ${list(added)}`, "");
    if (removed.length)
      lines.push(`**Removed (${removed.length}):** ${removed.map((a) => mdEscape(a.name, 60)).join(", ")}`, "");
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
