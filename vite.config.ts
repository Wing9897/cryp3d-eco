import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain', 'local']);
const BLOCKED_SUFFIXES = [
  '.local',
  '.localhost',
  '.internal',
  '.intranet',
  '.lan',
  '.home',
  '.corp',
  '.localdomain',
  '.home.arpa',
  '.arpa',
  '.invalid',
  '.test',
  '.example',
  '.onion',
];
const NEGATIVE_TTL_MS = 45 * 1000;
const FETCH_TIMEOUT_MS = 1800;
const REFRESH_CONCURRENCY = 6;
const SUCCESS_CACHE_CONTROL = 'public, max-age=0, must-revalidate';
const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const LOGO_DIR = path.join(PROJECT_ROOT, 'cache', 'logos');
const TYPE_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
};
const EXT_TYPE: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};
const LOGO_EXTS = Object.keys(EXT_TYPE);

type CachedLogo = { type: string; body: Uint8Array };
type NegativeLogo = { error: true; at: number };

const memoryCache = new Map<string, CachedLogo | NegativeLogo>();
const inflight = new Map<string, Promise<CachedLogo | null>>();
const fetchGeneration = new Map<string, number>();

function generationOf(domain: string): number {
  return fetchGeneration.get(domain) ?? 0;
}

function bumpGeneration(domain: string): number {
  const next = generationOf(domain) + 1;
  fetchGeneration.set(domain, next);
  return next;
}

function cachedLogo(domain: string): CachedLogo | null {
  const cached = memoryCache.get(domain);
  if (cached && !('error' in cached)) return cached;
  return null;
}

function etagFor(body: Uint8Array): string {
  let hash = 2166136261;
  for (let i = 0; i < body.length; i += 1) {
    hash ^= body[i];
    hash = Math.imul(hash, 16777619);
  }
  return `W/"${(hash >>> 0).toString(16)}-${body.length}"`;
}

function etagMatches(header: string | string[] | undefined, etag: string): boolean {
  const raw = Array.isArray(header) ? header.join(',') : header;
  if (!raw) return false;
  return raw.split(',').some((part) => part.trim() === etag);
}

function isBlockedPublicSuffix(domain: string): boolean {
  if (BLOCKED_HOSTS.has(domain)) return true;
  return BLOCKED_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

function isSafeDomain(domain: string): boolean {
  if (domain.length === 0 || domain.length > 253 || domain.includes('..')) return false;
  if (!DOMAIN_RE.test(domain) || isBlockedPublicSuffix(domain)) return false;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(domain)) return false;
  return true;
}

function sniffImageType(body: Uint8Array): string | null {
  if (body.length >= 8 && body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47) {
    return 'image/png';
  }
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return 'image/jpeg';
  if (body.length >= 6) {
    const head = String.fromCharCode(...body.slice(0, 6));
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  }
  if (
    body.length >= 12 &&
    body[0] === 0x52 &&
    body[1] === 0x49 &&
    body[2] === 0x46 &&
    body[3] === 0x46 &&
    body[8] === 0x57 &&
    body[9] === 0x45 &&
    body[10] === 0x42 &&
    body[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (body.length >= 6 && body[0] === 0 && body[1] === 0 && body[2] === 1 && body[3] === 0) return 'image/x-icon';
  if (body.length >= 32) {
    const head = Buffer.from(body.slice(0, 160)).toString('utf8').trim().toLowerCase();
    if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
      return 'image/svg+xml';
    }
  }
  return null;
}

function logoFileBase(domain: string): string | null {
  const safe = domain.replace(/[^a-z0-9.-]/g, '');
  if (!safe || safe.includes('..') || safe.startsWith('.') || safe.endsWith('.')) return null;
  return safe;
}

function extensionForType(type: string): string | null {
  return TYPE_EXT[type] ?? null;
}

function readProjectLogo(domain: string): CachedLogo | null {
  const candidates = [domain];
  const parts = domain.split('.');
  if (parts.length > 2) {
    candidates.push(parts.slice(-2).join('.'));
  }
  for (const candidate of candidates) {
    const base = logoFileBase(candidate);
    if (!base) continue;
    for (const ext of LOGO_EXTS) {
      try {
        const body = new Uint8Array(readFileSync(path.join(LOGO_DIR, base + ext)));
        if (body.length === 0) continue;
        const type = sniffImageType(body) ?? EXT_TYPE[ext] ?? null;
        if (!type) continue;
        return { type, body };
      } catch {
        // This extension is not on disk.
      }
    }
  }
  return null;
}

function writeProjectLogo(domain: string, logo: CachedLogo) {
  const base = logoFileBase(domain);
  if (!base) return;
  const type = sniffImageType(logo.body) ?? logo.type;
  const ext = extensionForType(type);
  if (!ext) return;
  try {
    mkdirSync(LOGO_DIR, { recursive: true });
    for (const other of LOGO_EXTS) {
      if (other === ext) continue;
      const stale = path.join(LOGO_DIR, base + other);
      try {
        unlinkSync(stale);
      } catch {
        // No older file with this extension.
      }
    }
    writeFileSync(path.join(LOGO_DIR, base + ext), logo.body);
  } catch {
    // Memory cache still serves this process if the disk is unavailable.
  }
}

async function fetchOne(source: string): Promise<CachedLogo | null> {
  try {
    const response = await fetch(source, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      },
    });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 160 || bytes.length > 1_000_000) return null;
    const headerType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const type = sniffImageType(bytes) ?? (headerType.startsWith('image/') ? headerType : null);
    if (!type) return null;
    return { type, body: bytes };
  } catch {
    return null;
  }
}

function rememberLogo(domain: string, logo: CachedLogo): CachedLogo {
  memoryCache.set(domain, logo);
  writeProjectLogo(domain, logo);
  return logo;
}

async function fetchRemote(domain: string, generation: number): Promise<CachedLogo | null> {
  const sources = [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://${domain}/favicon.ico`,
  ];
  const found = await new Promise<CachedLogo | null>((resolve) => {
    let pending = sources.length;
    let settled = false;
    const finish = (logo: CachedLogo | null) => {
      if (settled) return;
      if (logo) {
        settled = true;
        resolve(logo);
        return;
      }
      pending -= 1;
      if (pending <= 0) {
        settled = true;
        resolve(null);
      }
    };
    for (const source of sources) void fetchOne(source).then(finish);
  });
  if (generationOf(domain) !== generation) return cachedLogo(domain);
  if (!found) {
    if (generationOf(domain) !== generation) return cachedLogo(domain);
    memoryCache.set(domain, { error: true, at: Date.now() });
    return null;
  }
  if (generationOf(domain) !== generation) return cachedLogo(domain);
  return rememberLogo(domain, found);
}

function trackFetch(domain: string, generation: number): Promise<CachedLogo | null> {
  let job: Promise<CachedLogo | null>;
  job = fetchRemote(domain, generation).finally(() => {
    if (inflight.get(domain) === job) inflight.delete(domain);
  });
  inflight.set(domain, job);
  return job;
}

async function forceFetchLogo(domain: string): Promise<CachedLogo | null> {
  const generation = bumpGeneration(domain);
  memoryCache.delete(domain);
  return trackFetch(domain, generation);
}

async function refreshDomains(domains: string[]): Promise<{ ok: number; failed: number; total: number }> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const item of domains) {
    const domain = item.trim().toLowerCase();
    if (!domain || seen.has(domain) || !isSafeDomain(domain)) continue;
    seen.add(domain);
    unique.push(domain);
  }
  let ok = 0;
  let failed = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < unique.length) {
      const domain = unique[cursor];
      cursor += 1;
      const logo = await forceFetchLogo(domain);
      if (logo) ok += 1;
      else failed += 1;
    }
  };
  const workers = Math.min(REFRESH_CONCURRENCY, unique.length);
  if (workers > 0) await Promise.all(Array.from({ length: workers }, () => worker()));
  return { ok, failed, total: unique.length };
}

function readRequestBody(req: IncomingMessage, limit = 262144): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      size += buf.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function fetchLogo(domain: string): Promise<CachedLogo | null> {
  const fresh = cachedLogo(domain);
  if (fresh) return fresh;

  const pending = inflight.get(domain);
  if (pending) return pending;

  const generation = generationOf(domain);
  const project = readProjectLogo(domain);
  if (generationOf(domain) !== generation) {
    const newer = inflight.get(domain);
    if (newer) return newer;
    return cachedLogo(domain) ?? project;
  }
  if (project) {
    const raced = cachedLogo(domain);
    if (raced) return raced;
    memoryCache.set(domain, project);
    return project;
  }

  const cached = memoryCache.get(domain);
  if (cached && 'error' in cached && Date.now() - cached.at < NEGATIVE_TTL_MS) return null;

  const again = inflight.get(domain);
  if (again) return again;
  return trackFetch(domain, generationOf(domain));
}

const logoMiddleware: Connect.NextHandleFunction = (req, res, next) => {
  const raw = req.url ?? '';
  const pathname = raw.split('?')[0];
  if (pathname === '/api/logo/refresh') {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('method not allowed');
      return;
    }
    void readRequestBody(req)
      .then((body) => {
        const parsed = JSON.parse(body) as { domains?: unknown };
        const domains = Array.isArray(parsed.domains)
          ? parsed.domains.filter((item): item is string => typeof item === 'string')
          : [];
        return refreshDomains(domains);
      })
      .then((result) => {
        if (res.writableEnded) return;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(result));
      })
      .catch(() => {
        if (res.writableEnded) return;
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('bad request');
      });
    return;
  }
  if (pathname !== '/api/logo') {
    next();
    return;
  }

  let domain = '';
  let refresh = false;
  try {
    const params = new URL(raw, 'http://localhost').searchParams;
    domain = params.get('domain')?.trim().toLowerCase() ?? '';
    refresh = params.get('refresh') === '1';
  } catch {
    domain = '';
  }

  if (!isSafeDomain(domain)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('bad domain');
    return;
  }

  void (refresh ? forceFetchLogo(domain) : fetchLogo(domain))
    .then((logo) => {
      if (!logo) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=30');
        res.end('logo not found');
        return;
      }
      const etag = etagFor(logo.body);
      if (!refresh && etagMatches(req.headers['if-none-match'], etag)) {
        res.statusCode = 304;
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', SUCCESS_CACHE_CONTROL);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end();
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', logo.type);
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', refresh ? 'no-store' : SUCCESS_CACHE_CONTROL);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(logo.body);
    })
    .catch(() => {
      if (res.writableEnded) return;
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('logo not found');
    });
};

const VIRTUAL_MANIFEST_ID = 'virtual:logo-manifest';
const RESOLVED_VIRTUAL_MANIFEST_ID = '\0' + VIRTUAL_MANIFEST_ID;

function readLogoManifestFromDisk(): Record<string, string> {
  const manifest: Record<string, string> = {};
  try {
    const entries = readdirSync(LOGO_DIR);
    for (const file of entries) {
      const lower = file.toLowerCase();
      const ext = LOGO_EXTS.find((candidate) => lower.endsWith(candidate));
      if (!ext) continue;
      const domain = lower.slice(0, -ext.length);
      if (!domain || !isSafeDomain(domain)) continue;
      manifest[domain] = file;
    }
  } catch {
    // Directory may not exist yet.
  }
  return manifest;
}

function logoProxyPlugin(): Plugin {
  let outDir = path.join(PROJECT_ROOT, 'dist');
  return {
    name: 'logo-proxy',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    resolveId(id) {
      if (id === VIRTUAL_MANIFEST_ID) return RESOLVED_VIRTUAL_MANIFEST_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_MANIFEST_ID) {
        const manifest = readLogoManifestFromDisk();
        return `export default ${JSON.stringify(manifest)};`;
      }
      return null;
    },
    closeBundle() {
      // copyFileSync one file at a time. cpSync of this folder crashes Node on Windows.
      let entries: string[];
      try {
        entries = readdirSync(LOGO_DIR);
      } catch {
        return;
      }
      const dest = path.join(outDir, 'logos');
      mkdirSync(dest, { recursive: true });
      for (const file of entries) {
        const from = path.join(LOGO_DIR, file);
        if (!statSync(from).isFile()) continue;
        copyFileSync(from, path.join(dest, file));
      }
    },
    configureServer(server) {
      server.middlewares.use(logoMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(logoMiddleware);
    },
  };
}

const pagesBase = '/cryp3d-eco/';

export default defineConfig(({ command }) => ({
  plugins: [react(), logoProxyPlugin()],
  // Project site is https://wing9897.github.io/cryp3d-eco/
  // Dev stays at / so the local server and /api/logo keep working.
  base: command === 'build' ? pagesBase : '/',
  build: {
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const norm = id.replaceAll('\\', '/');
          if (norm.includes('/node_modules/')) {
            if (
              norm.includes('/three/') ||
              norm.includes('/three-') ||
              norm.includes('/react-force-graph-3d/') ||
              norm.includes('/3d-force-graph/') ||
              norm.includes('/d3-')
            ) {
              return 'vendor-3d';
            }
            if (norm.includes('/react/') || norm.includes('/react-dom/') || norm.includes('/scheduler/')) {
              return 'vendor-react';
            }
          }
          if (norm.includes('/data/evm/') && norm.endsWith('.json')) {
            return 'data-evm';
          }
          if (norm.includes('/data/') && norm.endsWith('.json')) {
            return 'data-solana';
          }
          return undefined;
        },
      },
    },
  },
}));
