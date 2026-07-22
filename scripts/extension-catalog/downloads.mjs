/**
 * Resolves per-extension download counts + canonical store URLs from the
 * Raycast store backend.
 *
 * The bulk `store_listings` endpoint is fast but (a) silently omits some
 * extensions and (b) is only reliably matched by its exact, CASE-SENSITIVE
 * store-URL path — so a naive join drops or zeroes real data (e.g. kill-process
 * with 646k installs). This resolver therefore:
 *   1. bulk-fetches store_listings, keyed by case-sensitive "handle/name",
 *   2. joins each catalog entry by that path (then bare name as fallback),
 *   3. detail-fetches the few misses from extensions/{handle}/{name},
 *   4. leaves anything still unresolved as null (unknown — NOT zero), so
 *      extensions that aren't on the store render "—" and get no store link.
 *
 * Uses curl (already a dependency via git) so proxy/CA setups are respected.
 */
import { execFileSync } from "node:child_process";

const BULK = "https://backend.raycast.com/api/v1/store_listings?per_page=1000&page=";
const DETAIL = "https://backend.raycast.com/api/v1/extensions/";
const MARKER = "raycast.com/";
// Cap detail-fetches so a failed bulk fetch can't trigger thousands of calls.
const MAX_DETAIL = 300;

function curlJson(url) {
  const out = execFileSync("curl", ["-sS", "--fail", "--max-time", "45", url], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: 60_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out);
}

function storePath(storeUrl) {
  const i = String(storeUrl || "").indexOf(MARKER);
  return i < 0 ? null : storeUrl.slice(i + MARKER.length);
}

/**
 * @param entries catalog entries (need .dir, .name, .owner, .author)
 * @returns { map: Map<dir,{downloads:number|null, storeUrl:string|null}>,
 *            listings:number, detailFetched:number }
 */
export function resolveDownloads(entries) {
  const byPath = new Map();
  const byName = new Map();
  let listings = 0;
  for (let page = 1; page <= 15; page++) {
    const d = curlJson(`${BULK}${page}`);
    const items = Array.isArray(d) ? d : d.data ?? [];
    if (!items.length) break;
    for (const it of items) {
      listings++;
      const rec = {
        downloads: Number(it.download_count) || 0,
        storeUrl: it.store_url ?? null,
        seo: Array.isArray(it.seo_categories) ? it.seo_categories : [],
      };
      const p = storePath(it.store_url);
      if (p) byPath.set(p, rec);
      const n = String(it.name || "").toLowerCase();
      if (n && !byName.has(n)) byName.set(n, rec);
    }
    if (items.length < 1000) break;
  }
  if (!listings) throw new Error("store listings returned no rows");

  const map = new Map();
  const misses = [];
  for (const e of entries) {
    const handle = e.owner || e.author || "";
    const hit = (handle && byPath.get(`${handle}/${e.name}`)) || byName.get(String(e.name).toLowerCase());
    if (hit) map.set(e.dir, { downloads: hit.downloads, storeUrl: hit.storeUrl, seo: hit.seo });
    else misses.push(e);
  }

  let detailFetched = 0;
  for (const e of misses) {
    let res = { downloads: null, storeUrl: null, seo: [] };
    const handle = e.owner || e.author || "";
    if (handle && detailFetched < MAX_DETAIL) {
      detailFetched++;
      try {
        const d = curlJson(`${DETAIL}${encodeURIComponent(handle)}/${encodeURIComponent(e.name)}`);
        if (d && d.download_count != null && d.store_url) {
          res = {
            downloads: Number(d.download_count),
            storeUrl: d.store_url,
            seo: Array.isArray(d.seo_categories) ? d.seo_categories : [],
          };
        }
      } catch {
        // 404 / network — genuinely not resolvable, stays null (unknown).
      }
    }
    map.set(e.dir, res);
  }
  return { map, listings, detailFetched };
}
