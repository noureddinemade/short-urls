import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { parse } from 'node-html-parser';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LINKS_FILE = path.join(ROOT, 'links.yml');

export const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const META_FIELDS = ['title', 'description', 'image', 'site_name'];
const RESERVED = new Set(['404', 'index', 'CNAME']);

const USER_AGENT = 'Mozilla/5.0 (compatible; zhr.au link-preview bot)';
const FETCH_TIMEOUT_MS = 15000;

export function isHttpUrl(value) {
  if (typeof value !== 'string' || /\s/.test(value)) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateSlug(slug) {
  if (!SLUG_RE.test(slug)) return 'may only contain letters, numbers, "-" and "_", and must start with a letter or number';
  if (RESERVED.has(slug)) return 'is reserved';
  return null;
}

/** Load and validate links.yml. Throws on any problem. */
export async function loadConfig() {
  const raw = YAML.parse(await fs.readFile(LINKS_FILE, 'utf8')) ?? {};
  const errors = [];

  if (typeof raw.domain !== 'string' || !raw.domain) errors.push('`domain` is missing');
  if (!raw.root || !isHttpUrl(raw.root.url)) errors.push('`root.url` must be an http(s) URL');

  const links = raw.links ?? {};
  if (typeof links !== 'object' || Array.isArray(links)) errors.push('`links` must be a mapping');

  for (const [slug, entry] of Object.entries(links)) {
    const slugErr = validateSlug(slug);
    if (slugErr) errors.push(`link "${slug}" ${slugErr}`);
    if (!entry || !isHttpUrl(entry.url)) errors.push(`link "${slug}" needs an http(s) \`url\``);
  }

  if (errors.length) throw new Error('links.yml is invalid:\n  - ' + errors.join('\n  - '));
  return { domain: raw.domain, root: raw.root, links };
}

/** Fetch a page and pull out its preview tags. */
export async function fetchMeta(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const type = res.headers.get('content-type') || '';
  if (!type.includes('html')) return {}; // e.g. a PDF: nothing to copy, not an error

  return extractMeta((await res.text()).slice(0, 2_000_000), res.url || url);
}

export function extractMeta(html, baseUrl) {
  const doc = parse(html);
  const tags = {};
  for (const el of doc.querySelectorAll('meta')) {
    const key = (el.getAttribute('property') || el.getAttribute('name') || '').trim().toLowerCase();
    const content = el.getAttribute('content')?.trim();
    if (key && content && !(key in tags)) tags[key] = content;
  }

  const pick = (...keys) => keys.map((k) => tags[k]).find(Boolean);
  const out = {
    title: pick('og:title', 'twitter:title') || doc.querySelector('title')?.text.trim() || undefined,
    description: pick('og:description', 'twitter:description', 'description'),
    image: pick('og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'),
    site_name: pick('og:site_name'),
  };
  if (out.image) {
    try { out.image = new URL(out.image, baseUrl).href; } catch { delete out.image; }
  }
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Safe inside a <script> block.
const jsString = (s) => JSON.stringify(String(s)).replace(/</g, '\\u003c');

export function renderRedirect({ dest, shortUrl, meta }) {
  const d = escapeHtml(dest);
  const title = meta.title || new URL(dest).hostname;
  const tags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${escapeHtml(shortUrl)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    meta.description && `<meta property="og:description" content="${escapeHtml(meta.description)}">`,
    meta.description && `<meta name="description" content="${escapeHtml(meta.description)}">`,
    meta.image && `<meta property="og:image" content="${escapeHtml(meta.image)}">`,
    meta.site_name && `<meta property="og:site_name" content="${escapeHtml(meta.site_name)}">`,
    `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    meta.description && `<meta name="twitter:description" content="${escapeHtml(meta.description)}">`,
    meta.image && `<meta name="twitter:image" content="${escapeHtml(meta.image)}">`,
  ].filter(Boolean);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${d}">
${tags.join('\n')}
<script>location.replace(${jsString(dest)});</script>
</head>
<body>
<p>Redirecting to <a href="${d}">${d}</a></p>
</body>
</html>
`;
}

export const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Link not found</title>
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#333}</style>
</head>
<body><p>This link doesn't exist.</p></body>
</html>
`;
