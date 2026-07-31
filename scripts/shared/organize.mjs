/**
 * Generic catalog organization engine: topical subcategories, auto-discovered
 * topic mining, and recursive nesting bounded only by the data.
 *
 * Shared by the Raycast extension catalog and the Glaze store catalog: a
 * curated keyword taxonomy provides the first split, then frequent-term mining
 * promotes emergent topics out of "General" and keeps splitting any group that
 * still yields two coherent subgroups.
 *
 * Everything here is parameterized over the entity shape, so it works for any
 * catalog that can supply an id and some searchable text per entry.
 */

// Terms too generic to name a topic group anywhere. Catalog-specific noise
// (a store's boilerplate phrasing, say) belongs in `extraStopwords` on the
// caller's options rather than here, so one catalog's boilerplate can't
// suppress another's legitimate topic.
const STOPWORDS = new Set(
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
  two under unofficial up update updates us use used user users using various
  very via view views want way we what when where which while will
  with within without workspace workspaces you your yourself
  access account accounts action actions add adds all allow allows also any
  app application applications apps available client companion command
  commands content current directly enabled feature features functionality
  generate generator generators specific using wrapper
  project projects manager managers inspect time text word words link links
  name names number numbers save saves saving`
    .split(/\s+/)
    .filter(Boolean),
);

const SHORT_OK = new Set(["ai", "3d", "2fa", "qr", "tv", "f1", "os"]);
const ACRONYMS = new Set(
  "ai api css html sql dns llm cli ide iot gif qr 2fa 3d tv vpn ssh seo ocr rss nft gpt url pdf npm ios sdk cdn mcp obs nba nfl mlb ffmpeg f1 os ui ux".split(" "),
);

function tokenOk(t, extra) {
  if (STOPWORDS.has(t) || extra?.has(t)) return false;
  if (/^\d+$/.test(t)) return false;
  return t.length >= 3 || SHORT_OK.has(t);
}

// Merge singular/plural surface forms ("server"/"servers") into one term.
function canonOf(t) {
  if (t.length > 3 && t.endsWith("s") && !/(ss|us|is)$/.test(t)) return t.slice(0, -1);
  return t;
}

function termsOf(text, surfaces, extra) {
  const raw = String(text).toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean);
  const terms = new Set();
  const seen = (canon, surface) => {
    terms.add(canon);
    if (!surfaces.has(canon)) surfaces.set(canon, new Map());
    const m = surfaces.get(canon);
    m.set(surface, (m.get(surface) || 0) + 1);
  };
  for (let i = 0; i < raw.length; i++) {
    if (!tokenOk(raw[i], extra)) continue;
    seen(canonOf(raw[i]), raw[i]);
    if (i + 1 < raw.length && tokenOk(raw[i + 1], extra)) {
      seen(`${canonOf(raw[i])} ${canonOf(raw[i + 1])}`, `${raw[i]} ${raw[i + 1]}`);
    }
  }
  return terms;
}

function titleize(term) {
  return term
    .split(" ")
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Groups entries by their most common distinguishing term (first match wins).
 * Terms present in every entry can't discriminate and are skipped.
 */
export function mineGroups(entries, usedSlugs, opts) {
  const { textOf, slugify, minGroup = 4, maxGroups = 15, extraStopwords } = opts;
  const surfaces = new Map();
  const termSets = new Map(entries.map((e) => [e, termsOf(textOf(e), surfaces, extraStopwords)]));
  const df = new Map();
  for (const terms of termSets.values()) for (const t of terms) df.set(t, (df.get(t) || 0) + 1);

  const candidates = [...df.entries()]
    .filter(([, n]) => n >= minGroup && n < entries.length)
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
    if (groups.length >= maxGroups) break;
    const surface = [...surfaces.get(term).entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0][0];
    const slug = slugify(surface);
    if (!slug || usedSlugs.has(slug)) continue;
    const members = entries.filter((e) => !assigned.has(e) && termSets.get(e).has(term));
    if (members.length < minGroup) continue;
    for (const m of members) assigned.add(m);
    usedSlugs.add(slug);
    groups.push({ title: titleize(surface), slug, entries: members.sort(opts.sortEntries) });
  }
  return { groups, residue: entries.filter((e) => !assigned.has(e)).sort(opts.sortEntries) };
}

/** Recursively splits an oversized group until mining stops yielding subgroups. */
function deepen(node, opts) {
  const { minGroup = 4 } = opts;
  if (node.entries.length < minGroup * 2) return;
  const { groups, residue } = mineGroups(node.entries, new Set([node.slug]), opts);
  if (groups.length < 2) return;
  node.children = groups.map((g) => ({ ...g, auto: true, children: [] }));
  if (residue.length) {
    node.children.push({ title: "General", slug: "general", auto: false, entries: residue, children: [] });
  }
  for (const c of node.children) if (c.slug !== "general") deepen(c, opts);
}

/**
 * Builds the topic tree for one category: curated subcategories first, then
 * emergent topics mined out of whatever the rules didn't classify.
 */
export function buildCategoryTree(entries, category, opts) {
  const { classify, subcategoriesOf, slugify, sortEntries } = opts;
  const bySub = new Map();
  for (const e of entries) {
    const k = classify(e, category);
    if (!bySub.has(k)) bySub.set(k, []);
    bySub.get(k).push(e);
  }

  const nodes = [];
  const usedSlugs = new Set();
  for (const sub of subcategoriesOf(category)) {
    if (sub === "General" || !bySub.has(sub)) continue;
    const slug = slugify(sub);
    usedSlugs.add(slug);
    nodes.push({ title: sub, slug, auto: false, entries: bySub.get(sub).sort(sortEntries), children: [] });
  }

  const general = (bySub.get("General") ?? []).sort(sortEntries);
  if (general.length) {
    const { groups, residue } = mineGroups(general, usedSlugs, opts);
    for (const g of groups) nodes.push({ ...g, auto: true, children: [] });
    if (residue.length) {
      nodes.push({ title: "General", slug: "general", auto: false, entries: residue, children: [] });
    }
  }
  for (const n of nodes) if (n.slug !== "general") deepen(n, opts);
  return nodes;
}

export const AUTO_BADGE = " ✦";
export const AUTO_LEGEND = "✦ auto-discovered topic group";
export const nodeLabel = (n) => `${n.title}${n.auto ? AUTO_BADGE : ""}`;

/**
 * Groups topic nodes under editorial sections. Nodes not covered by any
 * section fall into "More topics" so a renamed rule can't drop them; mined
 * groups go under "Discovered topics"; General is returned separately.
 */
export function sectionizeNodes(nodes, sections) {
  const byName = new Map(nodes.map((n) => [n.title, n]));
  const used = new Set();
  const out = [];
  for (const [title, subNames] of sections) {
    const list = subNames.map((s) => byName.get(s)).filter((n) => n && !n.auto);
    if (!list.length) continue;
    for (const n of list) used.add(n);
    out.push([title, list]);
  }
  const leftover = nodes.filter((n) => !used.has(n) && !n.auto && n.slug !== "general");
  if (leftover.length) out.push(["More topics", leftover]);
  const autos = nodes.filter((n) => n.auto);
  if (autos.length) out.push([`Discovered topics${AUTO_BADGE}`, autos]);
  return { sections: out, general: nodes.find((n) => n.slug === "general") ?? null };
}
