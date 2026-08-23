'use strict';

/**
 * The buckets a shop is actually likely to point Khayt at.
 *
 * `lib/s3-client.js` already speaks to every one of these — they are all SigV4,
 * and not one of them needed a line of protocol code. What they needed was for
 * the endpoint not to be a blank box. "https://<account>.r2.cloudflarestorage.com"
 * is a placeholder nobody can fill in without leaving the app to go and read
 * Cloudflare's docs, and a mistyped endpoint fails exactly like a wrong secret:
 * a 403 that says nothing about which of the six fields is wrong.
 *
 * So this is a lookup table, not an integration. Pick a provider, type the one
 * thing only you know (an account id, a region), and the endpoint is built for
 * you. `custom` stays at the end because this list will always be missing
 * someone's provider — a regional host, a company MinIO — and refusing to let
 * them type a URL would be a downgrade from what shipped before it.
 *
 * ── On the numbers ──────────────────────────────────────────────────────────
 * `cost` is a ROUGH HINT at 500 GB, checked on PRICED_ON below. It is here
 * because the choice between these is mostly a cost choice and the spread is
 * more than 5×; a shop picking from a list of bare brand names picks the brand
 * it recognises, which is reliably the most expensive one on the list.
 *
 * It is a hint and the UI says so. Providers reprice, every one of them has a
 * free tier or a minimum that these strings cannot express, and a figure in a
 * dropdown that claims more precision than that would be a lie with a currency
 * symbol on it. `egress` is the field worth trusting longest: whether downloads
 * are billed is a pricing *philosophy* and changes far more slowly than a rate.
 * The dated table with the real conditions lives in docs/CLOUD-STORAGE.md.
 *
 * Egress matters more than storage here and it is worth saying why once: a print
 * library is re-read constantly. Every reprint of a year-old order pulls the
 * model back down, and with tiering (lib/print-library-tier.js) that is the
 * normal path rather than the exception. A provider that bills downloads bills
 * this app's busiest hour.
 *
 * Pure: no network, no fs, no Electron.
 */

const PRICED_ON = '2026-08-23';

const str = (v) => String(v == null ? '' : v).trim();

/**
 * `vars` are the parts of an endpoint that only the shop knows. Each carries a
 * `hint` because "Account ID" is not self-locating — the entire point is to
 * save a trip to the provider's dashboard, so the field says where to look.
 *
 * `egress`:
 *   'free'      downloads are never billed
 *   'allowance' free up to some quota, billed past it
 *   'metered'   billed per GB from the first byte
 *   'self'      your own hardware and your own bandwidth
 */
const PROVIDERS = [
  {
    id: 'r2',
    label: 'Cloudflare R2',
    endpoint: 'https://{account}.r2.cloudflarestorage.com',
    region: 'auto',
    vars: [{ key: 'account', label: 'Account ID', hint: 'Cloudflare dashboard → R2 → Overview, right-hand sidebar' }],
    cost: '~$7.50/mo for 500 GB',
    egress: 'free',
    note: 'Downloads are never billed, at any volume.',
    // Recommended is not a tie-break between near-equals. R2 is the only entry
    // where re-reading the library can never produce a bill, and re-reading the
    // library is what this app does.
    recommended: true,
  },
  {
    id: 'b2',
    label: 'Backblaze B2',
    endpoint: 'https://s3.{region}.backblazeb2.com',
    region: '',
    vars: [{ key: 'region', label: 'Region', hint: "In your bucket's endpoint, e.g. us-west-004" }],
    cost: '~$3.00/mo for 500 GB',
    egress: 'allowance',
    note: 'Downloads free up to 3× what you store — 1.5 TB/mo on a 500 GB library.',
    recommended: true,
  },
  {
    id: 'idrive',
    label: 'IDrive e2',
    // No template, deliberately. e2 issues every account its OWN endpoint host —
    // r4a6.or5.idrivee2-75.com, u6a5.bn.idrivee2-61.com — and even the numeric
    // suffix on the domain varies. There is no pattern to fill in, so this preset
    // sets the region and the cost note and asks for the endpoint.
    endpoint: '',
    endpointFromDashboard: true,
    endpointHint: 'e2 dashboard → your bucket → its endpoint, e.g. r4a6.or5.idrivee2-75.com. '
      + 'Every account gets a different one; do not copy another shop\'s.',
    region: '',
    vars: [],
    cost: '~$2.00/mo for 500 GB',
    egress: 'allowance',
    note: 'Among the cheapest per GB. Downloads free up to what you store.',
  },
  {
    id: 'wasabi',
    label: 'Wasabi',
    endpoint: 'https://s3.{region}.wasabisys.com',
    region: '',
    vars: [{ key: 'region', label: 'Region', hint: 'e.g. us-east-1, eu-central-1, ap-southeast-1' }],
    cost: '~$7/mo minimum',
    egress: 'free',
    // Stated rather than omitted. Wasabi's headline rate is competitive and a
    // shop will find it anyway; the two minimums are what make it a bad fit for
    // a library that is under 1 TB or that churns, and they are not on the
    // pricing page's front page.
    note: 'Bills a 1 TB minimum, so a 500 GB library pays for 1 TB — and a deleted '
      + 'file keeps billing for 90 days. Good above 1 TB, poor below it.',
  },
  {
    id: 'storj',
    label: 'Storj',
    endpoint: 'https://gateway.storjshare.io',
    region: 'us-east-1',
    vars: [],
    cost: '~$2.00/mo for 500 GB',
    egress: 'metered',
    note: 'Cheap per GB, but bills per segment — a library of many small thumbnails '
      + 'costs more than its size suggests. Downloads are billed.',
  },
  {
    id: 'hetzner',
    label: 'Hetzner Object Storage',
    endpoint: 'https://{location}.your-objectstorage.com',
    region: '',
    vars: [{ key: 'location', label: 'Location', hint: 'fsn1, nbg1 or hel1 — wherever you made the bucket' }],
    cost: '~$6/mo floor (includes 1 TB + 1 TB traffic)',
    egress: 'allowance',
    note: 'Flat base fee rather than per-GB, so it is poor value well under 1 TB '
      + 'and good value approaching it. EU only.',
    residency: 'EU',
  },
  {
    id: 'scaleway',
    label: 'Scaleway',
    endpoint: 'https://s3.{region}.scw.cloud',
    region: '',
    vars: [{ key: 'region', label: 'Region', hint: 'fr-par, nl-ams or pl-waw' }],
    cost: 'free under 75 GB',
    egress: 'allowance',
    note: 'A real free tier (75 GB storage and egress), which makes it the cheapest '
      + 'way to try tiering before committing. EU sovereign.',
    residency: 'EU',
  },
  {
    id: 'ovh',
    label: 'OVHcloud',
    endpoint: 'https://s3.{region}.io.cloud.ovh.net',
    region: '',
    vars: [{ key: 'region', label: 'Region', hint: 'e.g. gra, sbg, de, uk' }],
    cost: '~$4–6/mo for 500 GB',
    egress: 'allowance',
    note: 'EU sovereign, with an archive tier for genuinely cold models.',
    residency: 'EU',
  },
  {
    id: 'do',
    label: 'DigitalOcean Spaces',
    endpoint: 'https://{region}.digitaloceanspaces.com',
    region: '',
    vars: [{ key: 'region', label: 'Region', hint: 'nyc3, ams3, sgp1, fra1, sfo3 or syd1' }],
    cost: '~$10/mo for 500 GB',
    egress: 'allowance',
    note: 'Flat $5 covers the first 250 GB and 1 TB of transfer, then per-GB.',
  },
  {
    id: 'linode',
    label: 'Akamai / Linode',
    endpoint: 'https://{region}.linodeobjects.com',
    region: '',
    vars: [{ key: 'region', label: 'Region', hint: 'e.g. us-east-1, eu-central-1, ap-south-1' }],
    cost: '~$10/mo for 500 GB',
    egress: 'allowance',
    note: 'Like Spaces: a flat tier covering 250 GB and 1 TB of transfer, then per-GB.',
  },
  {
    id: 'aws',
    label: 'Amazon S3',
    endpoint: 'https://s3.{region}.amazonaws.com',
    region: '',
    vars: [{ key: 'region', label: 'Region', hint: 'e.g. me-central-1, eu-central-1, us-east-1' }],
    cost: '~$11.50/mo for 500 GB, plus downloads',
    egress: 'metered',
    // Named honestly. S3 is what people reach for because it is the name they
    // know; here it is roughly 4× R2 and bills every download on top.
    note: 'Every download billed at ~$0.09/GB on top. Widest region coverage — '
      + 'pick it if your IT requires it, or if you need a region nobody else has.',
  },
  {
    id: 'gcs',
    label: 'Google Cloud Storage',
    endpoint: 'https://storage.googleapis.com',
    region: 'auto',
    vars: [],
    cost: '~$10/mo for 500 GB, plus downloads',
    egress: 'metered',
    note: 'Needs an HMAC key from Cloud Storage → Settings → Interoperability, '
      + 'not an ordinary service-account key.',
  },
  {
    id: 'oci',
    label: 'Oracle Cloud (OCI)',
    endpoint: 'https://{namespace}.compat.objectstorage.{region}.oraclecloud.com',
    region: '',
    vars: [
      { key: 'namespace', label: 'Object storage namespace', hint: 'Tenancy details → Object storage namespace' },
      { key: 'region', label: 'Region', hint: 'e.g. me-jeddah-1, eu-frankfurt-1, us-ashburn-1' },
    ],
    cost: '~$12/mo for 500 GB',
    egress: 'allowance',
    note: 'A large monthly egress allowance, and a generous always-free tier.',
  },
  {
    id: 'synology',
    label: 'Synology C2',
    endpoint: 'https://{region}.s3.synologyc2.net',
    region: '',
    vars: [{ key: 'region', label: 'Region', hint: 'The left-most part of your C2 endpoint, e.g. eu-003' }],
    cost: '~$3/mo for 500 GB',
    egress: 'free',
    note: 'Worth a look if the shop already runs Synology gear. EU and US regions.',
  },
  {
    id: 'minio',
    label: 'MinIO / NAS (self-hosted)',
    endpoint: 'http://{host}:{port}',
    region: 'us-east-1',
    vars: [
      { key: 'host', label: 'Host or IP', hint: 'e.g. nas.local or 192.168.1.20' },
      { key: 'port', label: 'Port', hint: 'MinIO defaults to 9000' },
    ],
    cost: 'your own hardware',
    egress: 'self',
    // The one entry that is not off-site, and the caveat is load-bearing: a shop
    // that tiers cold models onto the NAS in the same room has moved its files
    // off the laptop, which is the disk problem solved — but it has not made a
    // backup, and a fire takes both.
    note: 'A NAS in the shop (MinIO, TrueNAS, Synology, QNAP). Frees the laptop\'s '
      + 'disk, but it is in the same building — pair it with an off-site copy.',
    selfHosted: true,
  },
  {
    id: 'custom',
    label: 'Other (S3-compatible)',
    endpoint: '',
    region: 'auto',
    vars: [],
    cost: '',
    egress: '',
    note: 'Any provider that speaks S3. Type the endpoint exactly as they give it.',
  },
];

const list = () => PROVIDERS.map((p) => ({ ...p, vars: p.vars.map((v) => ({ ...v })) }));

const byId = (id) => PROVIDERS.find((p) => p.id === str(id)) || null;

/**
 * Build a provider's endpoint from the values the shop typed.
 *
 * Reports every missing variable at once rather than the first — a form that
 * complains one field at a time is a form people fill in three times.
 *
 * @param {string} id
 * @param {Record<string,string>} vars
 * @returns {{ok: true, endpoint: string, region: string}
 *          |{ok: false, missing: string[], error: string}}
 */
function resolveEndpoint(id, vars = {}) {
  const p = byId(id);
  if (!p) return { ok: false, missing: [], error: `Unknown storage provider: ${str(id)}` };
  // 'custom', and providers whose endpoint is per-account (IDrive e2), keep
  // whatever the shop typed. Returning '' here instead would silently erase a
  // working endpoint every time any other field on the page was saved.
  if (!p.endpoint) {
    return { ok: true, endpoint: str(vars.endpoint), region: str(vars.region) || p.region || 'auto' };
  }

  const missing = p.vars.filter((v) => !str(vars[v.key])).map((v) => v.key);
  if (missing.length) {
    const names = p.vars.filter((v) => missing.includes(v.key)).map((v) => v.label);
    return { ok: false, missing, error: `${p.label} also needs: ${names.join(', ')}.` };
  }

  const endpoint = p.endpoint.replace(/\{(\w+)\}/g, (_m, k) => str(vars[k]));
  // A provider whose endpoint carries its region must be signed against THAT
  // region. B2 and friends reject 'auto' with a signature error, which reads to
  // the shop as a wrong secret and sends them to re-copy a key that was fine.
  const region = str(vars.region) || p.region || 'auto';
  return { ok: true, endpoint, region };
}

/**
 * Which preset does an already-saved endpoint correspond to?
 *
 * Without this, opening Settings on a shop that configured its bucket by hand
 * six months ago shows the dropdown parked on the first entry regardless of what
 * the endpoint says — and saving anything else on the page would rewrite a
 * working endpoint into a broken one. Matching on the distinctive host suffix
 * keeps the dropdown honest about what is actually configured.
 *
 * Ordered longest-suffix-first where two could both match.
 *
 * @param {string} endpoint
 * @returns {string} a provider id; 'custom' when nothing matches, '' when empty
 */
const SUFFIXES = [
  ['.r2.cloudflarestorage.com', 'r2'],
  ['.backblazeb2.com', 'b2'],
  ['.wasabisys.com', 'wasabi'],
  ['gateway.storjshare.io', 'storj'],
  ['.your-objectstorage.com', 'hetzner'],
  ['.scw.cloud', 'scaleway'],
  ['.io.cloud.ovh.net', 'ovh'],
  ['.digitaloceanspaces.com', 'do'],
  ['.linodeobjects.com', 'linode'],
  ['.oraclecloud.com', 'oci'],
  ['.s3.synologyc2.net', 'synology'],
  ['storage.googleapis.com', 'gcs'],
  ['.amazonaws.com', 'aws'],
];

/**
 * e2 gets a pattern rather than a suffix: the domain itself carries a varying
 * numeric suffix (idrivee2-75.com, idrivee2-61.com) and a plain endsWith would
 * miss every account but the ones on the unnumbered domain.
 */
const IDRIVE_HOST = /(^|\.)idrivee2(-\d+)?\.com$/i;

function detect(endpoint) {
  const host = str(endpoint).replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
  if (!host) return '';
  const bare = host.split(':')[0];
  for (const [suffix, id] of SUFFIXES) if (bare.endsWith(suffix)) return id;
  if (IDRIVE_HOST.test(bare)) return 'idrive';
  // A bare host or an IP with a port is overwhelmingly a NAS or a MinIO box, and
  // calling that 'custom' would hide the one caveat worth showing about it.
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(bare) || bare.endsWith('.local') || !bare.includes('.')) return 'minio';
  return 'custom';
}

/**
 * Pull the variable values back out of a saved endpoint, so re-opening Settings
 * shows the account id that is in use rather than an empty box that would
 * overwrite it on save.
 *
 * @param {string} id
 * @param {string} endpoint
 * @returns {Record<string,string>}
 */
function extractVars(id, endpoint) {
  const p = byId(id);
  const out = {};
  if (!p || !p.endpoint) return out;
  const pattern = p.endpoint
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')          // literal-escape first…
    .replace(/\\\{(\w+)\\\}/g, '(?<$1>[^./:]+)');    // …then re-open the placeholders
  const m = new RegExp(`^${pattern}$`, 'i').exec(str(endpoint));
  if (!m || !m.groups) return out;
  for (const [k, v] of Object.entries(m.groups)) if (v) out[k] = v;
  return out;
}

module.exports = { PROVIDERS, PRICED_ON, list, byId, resolveEndpoint, detect, extractVars };
