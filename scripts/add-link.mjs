// Adds a link to links.yml from a "New link" issue form (body in ISSUE_BODY).
// Writes result/slug/url/domain/message to GITHUB_OUTPUT.
import fs from 'node:fs/promises';
import YAML from 'yaml';
import { LINKS_FILE, META_FIELDS, isHttpUrl, validateSlug } from './lib.mjs';

const FIELD_MAP = {
  'short name': 'slug',
  'destination url': 'url',
  'title': 'title',
  'description': 'description',
  'image url': 'image',
  'site name': 'site_name',
};

function parseIssueForm(body) {
  const out = {};
  const sections = body.replace(/\r\n/g, '\n').split(/^### /m).slice(1);
  for (const section of sections) {
    const [heading, ...rest] = section.split('\n');
    const key = FIELD_MAP[heading.replace(/\(optional\)/i, '').trim().toLowerCase()];
    let value = rest.join('\n').trim();
    if (key !== 'description') value = value.split('\n')[0].trim(); // single-line fields
    if (key && value && value !== '_No response_') out[key] = value;
  }
  return out;
}

async function output(values) {
  const lines = Object.entries(values).map(([k, v]) => `${k}=${String(v).replace(/\n/g, ' ')}`);
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}

const fields = parseIssueForm(process.env.ISSUE_BODY || '');
const doc = YAML.parseDocument(await fs.readFile(LINKS_FILE, 'utf8'));
const domain = doc.get('domain');

const fail = (message) => output({ result: 'error', message }).then(() => process.exit(0));

if (!fields.slug) await fail('Short name is missing.');
const slugErr = validateSlug(fields.slug);
if (slugErr) await fail(`Short name "${fields.slug}" ${slugErr}.`);
if (!isHttpUrl(fields.url)) await fail('Destination URL must start with http:// or https://.');
if (fields.image && !isHttpUrl(fields.image)) await fail('Image URL must start with http:// or https://.');
if (doc.hasIn(['links', fields.slug])) await fail(`"${fields.slug}" already exists. Edit links.yml to change it.`);

const entry = { url: fields.url };
for (const f of META_FIELDS) if (fields[f]) entry[f] = fields[f];

if (!YAML.isMap(doc.get('links'))) doc.set('links', doc.createNode({}));
doc.get('links').flow = false;
doc.setIn(['links', fields.slug], doc.createNode(entry));
await fs.writeFile(LINKS_FILE, doc.toString());

await output({ result: 'ok', slug: fields.slug, url: fields.url, domain });
