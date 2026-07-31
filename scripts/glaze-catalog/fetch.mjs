/**
 * Fetches the Glaze app store catalog from https://www.glaze.app.
 *
 * Uses the store's own public search endpoint — the one the store UI calls
 * when you pick a category — rather than scraping the page. This matters:
 * the store page only server-renders a curated subset (~69 apps across
 * featured/trending/latest), so scraping it under-reports the store by ~20x.
 * Querying every category instead returns the full ~1,550 apps, and since
 * each app carries exactly one `category`, the union of all categories is
 * the whole store.
 *
 * (There is a second, similar-looking endpoint returning ~513 apps that all
 * carry `is_awards_entry` — that's the Awards collection, not the store, and
 * it excludes most store apps. Don't confuse the two.)
 *
 * Glaze is a TanStack Start app, so server functions live at
 * `/_serverFn/<id>` and speak seroval-encoded JSON (not plain JSON) with an
 * `x-tsr-serverFn: true` header. Both the encoding for our payload shape and
 * the decoding of the response subset are implemented here in a few lines, so
 * this has no npm dependencies and runs on a bare Node in CI. (Verified
 * byte-identical to seroval's own `toJSON` output for these payloads.)
 *
 * Function ids are build-time hashes that change when Glaze redeploys, so the
 * search function is *discovered at runtime* from the client bundle, with a
 * known-good id tried first.
 */
import { execFileSync } from "node:child_process";

const ORIGIN = "https://www.glaze.app";
export const APP_BASE = `${ORIGIN}/app`;

// Last known-good id for the public store-search server function.
const FALLBACK_SEARCH_FN = "5ab82a3e34e3be6afe0dadc58c0c9c825b809b3f9093508eb5ac2c08b9b9c286";

// Search requires a category (an empty query returns nothing), so the catalog
// is assembled by querying each. Seeded with the known slugs and extended at
// runtime with any slug seen on the store page, so a newly added category is
// picked up rather than silently dropped.
const SEED_CATEGORY_SLUGS = [
  "productivity",
  "utilities",
  "developer-tools",
  "media",
  "design",
  "games-and-fun",
  "lifestyle",
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

// Glaze's category slugs → display names.
const CATEGORY_NAMES = new Map([
  ["utilities", "Utilities"],
  ["developer-tools", "Developer Tools"],
  ["productivity", "Productivity"],
  ["media", "Media"],
  ["design", "Design"],
  ["lifestyle", "Lifestyle"],
  ["games-and-fun", "Games & Fun"],
  ["education", "Education"],
  ["social", "Social"],
  ["finance", "Finance"],
  ["health", "Health"],
]);

/** Display name for a category slug; unknown slugs are title-cased. */
export function categoryName(slug) {
  if (!slug) return "Uncategorized";
  return (
    CATEGORY_NAMES.get(slug) ??
    slug
      .split("-")
      .map((w) => (w === "and" ? "&" : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(" ")
  );
}

function curl(args) {
  return execFileSync("curl", ["-sS", "--fail", "--compressed", "--max-time", "60", ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: 90_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// --- seroval codec (only the subset these endpoints use) --------------------

/** Encodes {data:{...}} of string/number values exactly as seroval's toJSON. */
function encodePayload(data) {
  const keys = Object.keys(data);
  const values = keys.map((k) => {
    const v = data[k];
    return typeof v === "number" ? { t: 0, s: v } : { t: 1, s: String(v) };
  });
  return {
    t: {
      t: 10,
      i: 0,
      p: {
        k: ["data"],
        v: [{ t: 10, i: 1, p: { k: keys, v: values }, o: 0 }],
      },
      o: 0,
    },
    f: 127,
    m: [],
  };
}

const CONSTANTS = { 1: null, 2: true, 3: false };

/** Decodes the seroval node tree returned by these endpoints. */
function decode(node, reg = new Map()) {
  if (node == null) return node;
  switch (node.t) {
    case 10:
    case 11: {
      const o = {};
      if (node.i != null) reg.set(node.i, o);
      const k = node.p?.k ?? [];
      const v = node.p?.v ?? [];
      k.forEach((key, i) => {
        o[key] = decode(v[i], reg);
      });
      return o;
    }
    case 9: {
      const a = [];
      if (node.i != null) reg.set(node.i, a);
      for (const x of node.a ?? []) a.push(decode(x, reg));
      return a;
    }
    case 0:
    case 1:
      return node.s;
    case 2:
      return CONSTANTS[node.s] ?? null;
    case 4:
      return reg.get(node.i);
    default:
      return node.s !== undefined ? node.s : null;
  }
}

function callServerFn(id, data) {
  const payload = encodeURIComponent(JSON.stringify(encodePayload(data)));
  const body = curl([
    "-H",
    "x-tsr-serverFn: true",
    "-H",
    `user-agent: ${UA}`,
    "-H",
    `referer: ${ORIGIN}/store`,
    "-H",
    `origin: ${ORIGIN}`,
    "-H",
    "accept: application/json",
    `${ORIGIN}/_serverFn/${id}?payload=${payload}`,
  ]);
  const decoded = decode(JSON.parse(body));
  if (decoded?.error) throw new Error(`server function returned an error: ${JSON.stringify(decoded.error).slice(0, 200)}`);
  return decoded?.result ?? {};
}

/**
 * Server function ids are build-time hashes that change on redeploy, so find
 * the store-search function by probing ids from the current client bundle for
 * one that returns apps for a known category. Falls back to the known-good id.
 *
 * The probe deliberately requires a non-empty result for a real category:
 * the Awards listing has the same {apps,total} shape, so shape alone would
 * pick the wrong endpoint.
 */
function discoverSearchFn(html) {
  let ids = [];
  try {
    const entry = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    if (entry) {
      const bundle = curl([`${ORIGIN}${entry[0]}`]);
      ids = [...new Set([...bundle.matchAll(/`([0-9a-f]{64})`/g)].map((m) => m[1]))];
    }
  } catch {
    // fall through to the known-good id
  }
  const probe = SEED_CATEGORY_SLUGS[0];
  for (const id of [FALLBACK_SEARCH_FN, ...ids.filter((i) => i !== FALLBACK_SEARCH_FN)]) {
    try {
      const r = callServerFn(id, { category: probe });
      const apps = r.apps ?? [];
      if (apps.length && apps.every((a) => !a.is_awards_entry)) return id;
    } catch {
      // not this one
    }
  }
  throw new Error("could not locate the Glaze store-search server function");
}

function toApp(raw, canonical) {
  const slug = raw.category ?? null;
  const publicId = raw.public_id;
  const prof = raw.profiles ?? {};
  return {
    publicId,
    name: raw.display_name,
    tagline: raw.description ?? "",
    description: raw.full_description ?? "",
    categorySlug: slug,
    category: categoryName(slug),
    installs: raw.installs_count ?? null,
    sizeBytes: raw.build_size_bytes ?? null,
    version: raw.latest_version ?? null,
    updatedAt: raw.updated_at ?? null,
    createdAt: raw.created_at ?? null,
    publishedAt: raw.last_version_published_at ?? null,
    publisher: prof.display_name || prof.username || null,
    publisherHandle: prof.username || null,
    publisherWebsite: prof.website_url || null,
    aiCapability: raw.ai_capability ?? null,
    screenshots: Array.isArray(raw.screenshot_urls) ? raw.screenshot_urls.length : 0,
    awardsEntry: Boolean(raw.is_awards_entry),
    url: canonical.get(publicId) ?? `${APP_BASE}/${publicId}`,
  };
}

/**
 * @returns {{apps: Array<object>, categories: Array<string>, fetchedAt: string}}
 */
export function fetchGlazeApps() {
  let html = "";
  try {
    html = curl([`${ORIGIN}/store`]);
  } catch {
    // the store page is only needed for canonical links + category discovery
  }

  // The store page links apps as /app/<slug>-<publicId>; both that and the
  // bare id resolve, but prefer the site's own canonical path where known.
  const canonical = new Map();
  for (const m of html.matchAll(/href="\/app\/([A-Za-z0-9-]+-)?([A-Za-z0-9]{6})"/g)) {
    canonical.set(m[2], `${APP_BASE}/${m[1] ?? ""}${m[2]}`);
  }

  // Category slugs: the seeds plus anything the store page mentions, so a new
  // category appearing in featured/latest is queried rather than missed.
  const slugs = new Set(SEED_CATEGORY_SLUGS);
  for (const m of html.matchAll(/category:"([a-z][a-z0-9-]{2,40})"/g)) slugs.add(m[1]);

  const searchFn = discoverSearchFn(html);
  const seen = new Map();
  const counts = new Map();
  const queried = new Set();
  const queue = [...slugs];

  while (queue.length) {
    const slug = queue.shift();
    if (queried.has(slug)) continue;
    queried.add(slug);

    let res;
    try {
      res = callServerFn(searchFn, { category: slug });
    } catch (err) {
      console.warn(`warn: category "${slug}" failed: ${err.message.slice(0, 120)}`);
      continue;
    }
    const batch = res.apps ?? [];
    if (!batch.length) continue;
    counts.set(slug, batch.length);
    if (res.total != null && batch.length < res.total) {
      console.warn(`warn: category "${slug}" returned ${batch.length} of ${res.total}`);
    }
    for (const raw of batch) {
      if (!raw?.public_id || seen.has(raw.public_id)) continue;
      seen.set(raw.public_id, toApp(raw, canonical));
      // Any unfamiliar category slug on a returned app gets queried too.
      if (raw.category && !queried.has(raw.category)) queue.push(raw.category);
    }
  }

  const apps = [...seen.values()];
  if (!apps.length) throw new Error("Glaze store search returned no apps");
  console.log(
    `categories: ${[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(", ")}`,
  );
  return { apps, categories: [...counts.keys()], fetchedAt: new Date().toISOString() };
}
