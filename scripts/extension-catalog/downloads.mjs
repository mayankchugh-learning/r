/**
 * Fetches per-extension download counts from the Raycast store backend.
 *
 * The git manifests carry no download data, so it is pulled from the public
 * store-listings API (paginated, ~500/page). Counts change constantly, so the
 * caller refreshes them on a capped cadence rather than every run — see the
 * downloads-staleness gate in sync.mjs.
 *
 * Uses curl (already a dependency via git) so the proxy/CA setup in restricted
 * environments is respected; in CI plain outbound works the same way.
 */
import { execFileSync } from "node:child_process";

const API = "https://backend.raycast.com/api/v1/store_listings?per_page=500&page=";
const PATH_RE = /raycast\.com\/(.+)$/;

function fetchPage(page) {
  const out = execFileSync("curl", ["-sS", "--fail", "--max-time", "45", `${API}${page}`], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: 60_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const d = JSON.parse(out);
  return Array.isArray(d) ? d : d.data ?? [];
}

/**
 * Returns { byPath, byName }: download counts keyed by the store-URL path
 * ("handle/name", the precise key) and by bare name (fallback; deduped to the
 * max count when a name is shared across authors).
 */
export function fetchDownloads() {
  const byPath = new Map();
  const byName = new Map();
  let total = 0;
  for (let page = 1; page <= 40; page++) {
    const items = fetchPage(page);
    if (!items.length) break;
    for (const it of items) {
      const count = Number(it.download_count) || 0;
      total++;
      const m = String(it.store_url || "").match(PATH_RE);
      if (m) byPath.set(m[1].toLowerCase(), count);
      const name = String(it.name || "").toLowerCase();
      if (name) byName.set(name, Math.max(byName.get(name) ?? 0, count));
    }
    if (items.length < 500) break;
  }
  if (!total) throw new Error("store listings returned no rows");
  return { byPath, byName, total };
}

/** Download count for one catalog entry, or null if the store has no match. */
export function downloadsFor(entry, dl) {
  const m = String(entry.store || "").match(PATH_RE);
  if (m) {
    const hit = dl.byPath.get(m[1].toLowerCase());
    if (hit != null) return hit;
  }
  const byName = dl.byName.get(String(entry.name || "").toLowerCase());
  return byName != null ? byName : null;
}
