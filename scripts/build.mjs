// Builds the static site into _site/.
// Preview tags: manual values in links.yml > freshly copied > last good copy (cache).
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, META_FIELDS, loadConfig, fetchMeta, renderRedirect, NOT_FOUND_HTML } from './lib.mjs';

const OUT = path.join(ROOT, '_site');
const CACHE_FILE = path.join(ROOT, '.cache', 'meta.json');
const CONCURRENCY = 5;

const config = await loadConfig();

let cache = {};
try { cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8')); } catch { /* first run */ }

const entries = [
  { slug: '', entry: config.root },
  ...Object.entries(config.links).map(([slug, entry]) => ({ slug, entry })),
];

// Copy tags from each unique destination.
const urls = [...new Set(entries.map((e) => e.entry.url))];
const fresh = {};
const failures = [];
let next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < urls.length) {
    const url = urls[next++];
    try {
      fresh[url] = await fetchMeta(url);
      cache[url] = { ...fresh[url], fetched_at: new Date().toISOString() };
    } catch (err) {
      failures.push(`${url}: ${err.message}`);
    }
  }
}));

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });

for (const { slug, entry } of entries) {
  const copied = fresh[entry.url] ?? cache[entry.url] ?? {};
  const meta = {};
  for (const f of META_FIELDS) {
    const manual = entry[f];
    meta[f] = (typeof manual === 'string' && manual.trim()) ? manual.trim() : copied[f];
  }
  const html = renderRedirect({ dest: entry.url, shortUrl: `https://${config.domain}/${slug}`, meta });
  const dir = path.join(OUT, slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), html);
}

await fs.writeFile(path.join(OUT, '404.html'), NOT_FOUND_HTML);
await fs.writeFile(path.join(OUT, 'CNAME'), config.domain + '\n');
await fs.writeFile(path.join(OUT, '.nojekyll'), '');

// Keep cache only for destinations still in use.
const keep = Object.fromEntries(Object.entries(cache).filter(([u]) => urls.includes(u)));
await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
await fs.writeFile(CACHE_FILE, JSON.stringify(keep, null, 2));

console.log(`Built ${entries.length - 1} link(s) + root.`);
if (failures.length) {
  console.log(`::warning::Couldn't copy preview tags from ${failures.length} destination(s); used last good copy where available.`);
  for (const f of failures) console.log(`  - ${f}`);
}
