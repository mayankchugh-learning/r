/**
 * Fetches the Glaze app store catalog from https://www.glaze.app/store.
 *
 * Glaze's backend (api.glazeapp.com) is Supabase/PostgREST and requires an API
 * key, so this reads the store page's server-rendered payload instead — no
 * credentials needed. The store route (TanStack Start) embeds every public
 * app's full record in a `$R[n]=` reference graph: a JS object literal, not
 * JSON, so it can't be JSON.parse'd. Rather than eval'ing remote script (never
 * do that), this walks the text with a string-aware brace scanner:
 *
 *   1. record the span of every {...} object in the document
 *   2. every real app record contains `installs_count:` — section entries only
 *      reference apps by public_id — so the *smallest* object span enclosing
 *      each `installs_count:` occurrence is exactly one app record
 *   3. pull known scalar fields out of that span by targeted match
 *
 * Verified against the rendered pages: counts and sizes match what the site
 * displays (e.g. Icon Keeper 335 installs, 9.7 MiB).
 */
import { execFileSync } from "node:child_process";

const STORE_URL = "https://www.glaze.app/store";
export const APP_BASE = "https://www.glaze.app/app";

// Glaze's category slugs → display names.
const CATEGORY_NAMES = new Map([
  ["utilities", "Utilities"],
  ["developer-tools", "Developer Tools"],
  ["productivity", "Productivity"],
  ["media", "Media"],
  ["design", "Design"],
  ["lifestyle", "Lifestyle"],
  ["games", "Games"],
  ["education", "Education"],
  ["social", "Social"],
  ["finance", "Finance"],
]);

/** Display name for a category slug; unknown slugs are title-cased. */
export function categoryName(slug) {
  if (!slug) return "Uncategorized";
  return (
    CATEGORY_NAMES.get(slug) ??
    slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

function fetchStoreHtml() {
  return execFileSync(
    "curl",
    ["-sS", "--fail", "--compressed", "--max-time", "45", STORE_URL],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60_000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

/** Spans of every {...} object in the text, ignoring braces inside strings. */
function objectSpans(text) {
  const spans = [];
  const stack = [];
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") stack.push(i);
    else if (ch === "}" && stack.length) spans.push([stack.pop(), i + 1]);
  }
  return spans;
}

function unescapeJs(s) {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(["'`\\/])/g, "$1");
}

function strField(obj, key) {
  const m = obj.match(new RegExp(`\\b${key}:"((?:[^"\\\\]|\\\\.)*)"`));
  return m ? unescapeJs(m[1]) : null;
}

function numField(obj, key) {
  const m = obj.match(new RegExp(`\\b${key}:(-?\\d+)`));
  return m ? Number(m[1]) : null;
}

/**
 * @returns {{apps: Array<object>, fetchedAt: string}} every public store app
 */
export function fetchGlazeApps() {
  const html = fetchStoreHtml();
  const spans = objectSpans(html);
  // Smallest spans first, so the first hit enclosing an anchor is the tightest.
  spans.sort((a, b) => a[1] - a[0] - (b[1] - b[0]));

  // The page links apps as /app/<slug>-<publicId>. Both that and the bare
  // /app/<publicId> resolve, but prefer the site's own canonical path so links
  // read the way Glaze presents them. Keyed by the trailing public id.
  const canonical = new Map();
  for (const m of html.matchAll(/href="\/app\/([A-Za-z0-9-]+-)?([A-Za-z0-9]{6})"/g)) {
    canonical.set(m[2], `${APP_BASE}/${m[1] ?? ""}${m[2]}`);
  }

  const byId = new Map();
  const anchor = /installs_count:/g;
  let m;
  while ((m = anchor.exec(html)) !== null) {
    const at = m.index;
    const span = spans.find(([st, en]) => st < at && at < en);
    if (!span) continue;
    const obj = html.slice(span[0], span[1]);
    const publicId = strField(obj, "public_id");
    if (!publicId || byId.has(publicId)) continue;

    // profiles:{...} holds the publisher; scope publisher lookups to it so its
    // display_name can't be confused with the app's own.
    const prof = obj.match(/profiles:(?:\$R\[\d+\]=)?\{((?:[^{}]|\{[^{}]*\})*)\}/);
    const pblock = prof ? prof[1] : "";

    const slug = strField(obj, "category");
    const name = strField(obj, "display_name");
    if (!name) continue;

    byId.set(publicId, {
      publicId,
      name,
      tagline: strField(obj, "description") ?? "",
      description: strField(obj, "full_description") ?? "",
      categorySlug: slug,
      category: categoryName(slug),
      installs: numField(obj, "installs_count"),
      sizeBytes: numField(obj, "build_size_bytes"),
      version: strField(obj, "latest_version"),
      updatedAt: strField(obj, "updated_at"),
      createdAt: strField(obj, "created_at"),
      publishedAt: strField(obj, "last_version_published_at"),
      publisher: strField(pblock, "display_name") || strField(pblock, "username") || null,
      publisherHandle: strField(pblock, "username") || null,
      publisherWebsite: strField(pblock, "website_url") || null,
      aiCapability: strField(obj, "ai_capability"),
      url: canonical.get(publicId) ?? `${APP_BASE}/${publicId}`,
    });
  }

  const apps = [...byId.values()];
  if (!apps.length) throw new Error("no apps parsed from store payload (page structure may have changed)");
  return { apps, fetchedAt: new Date().toISOString() };
}
