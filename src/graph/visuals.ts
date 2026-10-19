import * as THREE from 'three';
import type { GraphNode, ThemeMode } from '../types';
import { getLogoStamp } from './logoStamp';
import {
  AMBIENT_PALETTE,
  CATEGORY_FRAME_COLOR,
  categoryIcon,
  getNodeLogoUrl,
  getNodeMonogram,
  getProtocolRoleBadge,
  groupColor,
  isRedundantBilingual,
  nodeRadius,
  pillarIcon,
} from './palette';

export type BadgeVariant = 'normal' | 'active';

export type NodeVisual = {
  id: string;
  type: string;
  theme: ThemeMode;
  group: THREE.Group;
  dotMesh: THREE.Mesh;
  dot: THREE.MeshStandardMaterial;
  label: THREE.Sprite;
  labelMat: THREE.SpriteMaterial;
  labelBaseWidth: number;
  labelBaseHeight: number;
  labelBaseY: number;
  texNormal: THREE.CanvasTexture;
  texActive: THREE.CanvasTexture | null;
  ensureActive: () => THREE.CanvasTexture;
  disposed: boolean;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  pulseMesh: THREE.Mesh;
  pulseMat: THREE.MeshBasicMaterial;
  auraMesh: THREE.Mesh | null;
  auraMat: THREE.MeshBasicMaterial | null;
  phase: number;
  releaseLogo: () => void;
};

// ============================================================================
// Shared Geometry Pool
// ============================================================================

const GEO_CACHE = new Map<string, THREE.BufferGeometry>();

function getCachedGeo<T extends THREE.BufferGeometry>(key: string, create: () => T): T {
  const existing = GEO_CACHE.get(key) as T | undefined;
  if (existing) return existing;
  const geo = create();
  GEO_CACHE.set(key, geo);
  geo.addEventListener('dispose', () => {
    if (GEO_CACHE.get(key) === geo) GEO_CACHE.delete(key);
  });
  return geo;
}

function getTierGeo(type: string, radius: number): THREE.BufferGeometry {
  const key = `tier_${type}_${radius.toFixed(2)}`;
  return getCachedGeo(key, () => {
    if (type === 'root') return new THREE.OctahedronGeometry(radius * 1.15, 0);
    if (type === 'pillar') return new THREE.DodecahedronGeometry(radius * 1.08, 0);
    if (type === 'category') return new THREE.BoxGeometry(radius * 1.38, radius * 0.95, radius * 1.38);
    return new THREE.SphereGeometry(radius, 18, 14);
  });
}

function getRingGeo(inner: number, outer: number): THREE.RingGeometry {
  const key = `ring_${inner.toFixed(2)}_${outer.toFixed(2)}`;
  return getCachedGeo(key, () => new THREE.RingGeometry(inner, outer, 36));
}

function getTorusGeo(radius: number, tube: number): THREE.TorusGeometry {
  const key = `torus_${radius.toFixed(2)}_${tube.toFixed(2)}`;
  return getCachedGeo(key, () => new THREE.TorusGeometry(radius, tube, 12, 48));
}

// ============================================================================
// Background Logo Queue (Concurrency-Limited)
// ============================================================================

const LOGO_CONCURRENCY = 6;
const LOGO_TIMEOUT_MS = 5000;

type LogoWaiter = {
  onLoad: (img: HTMLImageElement) => void;
  onFail?: () => void;
};

type LogoSlot = {
  status: 'queued' | 'loading' | 'loaded' | 'error';
  img: HTMLImageElement | null;
  waiters: LogoWaiter[];
  holders: LogoWaiter[];
  queued: boolean;
  bust: string;
  gen: number;
};

const logoSlots = new Map<string, LogoSlot>();
const logoQueue: string[] = [];
let logoActive = 0;
let logoPumping = false;
let logoPumpScheduled = false;

function logoUrlVersionIsStale(url: string): boolean {
  try {
    const version = new URL(url, window.location.href).searchParams.get('v');
    if (!version) return false;
    return version !== String(getLogoStamp());
  } catch {
    return false;
  }
}

/** Drop decoded images for stamp URLs nothing is using. The unversioned slot stays cached. */
function releaseSlotIfStale(url: string, slot: LogoSlot): void {
  if (slot.holders.length > 0 || slot.waiters.length > 0) return;
  if (slot.status === 'loading') return;
  if (!logoUrlVersionIsStale(url)) return;
  slot.img = null;
  logoSlots.delete(url);
}

function enqueueLogoUrl(url: string): void {
  const slot = logoSlots.get(url);
  if (!slot || slot.queued || slot.status === 'loading' || slot.status === 'loaded' || slot.status === 'error') {
    return;
  }
  slot.queued = true;
  slot.status = 'queued';
  logoQueue.push(url);
}

function pumpLogos(): void {
  if (!logoPumping) return;
  while (logoActive < LOGO_CONCURRENCY && logoQueue.length > 0) {
    const url = logoQueue.shift();
    if (!url) break;
    const slot = logoSlots.get(url);
    if (!slot) continue;
    slot.queued = false;
    if (slot.status === 'loaded' || slot.status === 'error' || slot.status === 'loading') continue;
    if (slot.waiters.length === 0) continue;

    slot.status = 'loading';
    logoActive += 1;
    const gen = slot.gen;
    const img = new Image();
    let settled = false;
    let timer = 0;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      logoActive = Math.max(0, logoActive - 1);
      img.onload = null;
      img.onerror = null;
      if (slot.gen !== gen) {
        pumpLogos();
        return;
      }
      const waiters = slot.waiters.splice(0);
      slot.bust = '';
      if (ok && img.naturalWidth > 0 && img.naturalHeight > 0) {
        slot.status = 'loaded';
        slot.img = img;
        for (const waiter of waiters) waiter.onLoad(img);
      } else {
        slot.status = 'error';
        slot.img = null;
        img.src = '';
        for (const waiter of waiters) waiter.onFail?.();
      }
      releaseSlotIfStale(url, slot);
      pumpLogos();
    };

    timer = window.setTimeout(() => finish(false), LOGO_TIMEOUT_MS);
    img.crossOrigin = 'anonymous';
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = slot.bust || url;
  }
}

function scheduleLogoPump(): void {
  if (!logoPumping || logoPumpScheduled) return;
  logoPumpScheduled = true;
  queueMicrotask(() => {
    logoPumpScheduled = false;
    pumpLogos();
  });
}

export function subscribeNodeLogo(
  url: string,
  onLoad: (img: HTMLImageElement) => void,
  onFail?: () => void,
): () => void {
  let slot = logoSlots.get(url);
  if (!slot) {
    slot = { status: 'queued', img: null, waiters: [], holders: [], queued: false, bust: '', gen: 0 };
    logoSlots.set(url, slot);
  }
  const waiter: LogoWaiter = { onLoad, onFail };
  slot.holders.push(waiter);
  const unsubscribe = () => {
    const current = logoSlots.get(url);
    if (!current) return;
    const holderIndex = current.holders.indexOf(waiter);
    if (holderIndex >= 0) current.holders.splice(holderIndex, 1);
    const waiterIndex = current.waiters.indexOf(waiter);
    if (waiterIndex >= 0) current.waiters.splice(waiterIndex, 1);
    releaseSlotIfStale(url, current);
  };
  if (slot.status === 'loaded' && slot.img) {
    onLoad(slot.img);
    return unsubscribe;
  }
  if (slot.status === 'error') {
    onFail?.();
    return unsubscribe;
  }
  slot.waiters.push(waiter);
  enqueueLogoUrl(url);
  scheduleLogoPump();
  return unsubscribe;
}

function logoRequestUrl(url: string, version: number): string {
  const versionText = String(version);
  try {
    const parsed = new URL(url, window.location.href);
    const apiPath = parsed.pathname === '/api/logo' || parsed.pathname.endsWith('/api/logo');
    if (apiPath) {
      const domain = parsed.searchParams.get('domain')?.trim().toLowerCase();
      if (domain) return `/api/logo?domain=${encodeURIComponent(domain)}&v=${versionText}`;
    }
    if (!import.meta.env.PROD && parsed.pathname.includes('/logos/')) {
      const file = decodeURIComponent(parsed.pathname.split('/').pop() ?? '');
      const dot = file.lastIndexOf('.');
      const domain = (dot > 0 ? file.slice(0, dot) : file).trim().toLowerCase();
      if (domain && !domain.includes('..') && !domain.includes('/')) {
        return `/api/logo?domain=${encodeURIComponent(domain)}&v=${versionText}`;
      }
    }
  } catch {
    // Fall back to a cache-bust on the original URL.
  }
  return `${url}${url.includes('?') ? '&' : '?'}v=${versionText}`;
}

export function reloadSubscribedLogos(): void {
  const stamp = Date.now();
  for (const [url, slot] of logoSlots) {
    if (slot.holders.length === 0) continue;
    slot.gen += 1;
    slot.bust = logoRequestUrl(url, stamp);
    slot.status = 'queued';
    slot.img = null;
    slot.queued = false;
    slot.waiters = slot.holders.slice();
    enqueueLogoUrl(url);
  }
  logoPumping = true;
  scheduleLogoPump();
}

export function startLogoBackfill(): void {
  logoPumping = true;
  scheduleLogoPump();
}

// ============================================================================
// Canvas Badge Drawing Helpers
// ============================================================================

const FONT_STACK = '"Inter", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
/** Protocol, category, pillar, and root share one card size. */
const BADGE_TITLE_FONT = `700 20px ${FONT_STACK}`;
const BADGE_META_FONT = `600 12.5px ${FONT_STACK}`;
const BADGE_BOX_H = 54;
const BADGE_WORLD_H = 5.8;
const BADGE_LOGO = 38;
const BADGE_STRIPE_W = 6;
let measureCtx: CanvasRenderingContext2D | null | undefined;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  const canvas = document.createElement('canvas');
  measureCtx = canvas.getContext('2d');
  return measureCtx;
}

/** Dark chip behind near-white logo ink. The card itself stays white. */
const LIGHT_LOGO_PLATE = '#1e293b';
const LOGO_SAMPLE = 32;
const nearWhiteLogos = new WeakMap<HTMLImageElement, boolean>();
let logoSampleCanvas: HTMLCanvasElement | null = null;

/**
 * True when the opaque ink is clearly white or near-white and the image
 * still has transparent ground, so a plate behind the icon can show through.
 * Opaque photos and dark or colorful marks stay false.
 */
export function logoSubjectIsNearWhite(img: HTMLImageElement): boolean {
  const cached = nearWhiteLogos.get(img);
  if (cached !== undefined) return cached;
  const result = measureLogoSubjectIsNearWhite(img);
  nearWhiteLogos.set(img, result);
  return result;
}

function measureLogoSubjectIsNearWhite(img: HTMLImageElement): boolean {
  if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return false;
  if (!logoSampleCanvas) {
    logoSampleCanvas = document.createElement('canvas');
    logoSampleCanvas.width = LOGO_SAMPLE;
    logoSampleCanvas.height = LOGO_SAMPLE;
  }
  const ctx = logoSampleCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.clearRect(0, 0, LOGO_SAMPLE, LOGO_SAMPLE);
  ctx.drawImage(img, 0, 0, LOGO_SAMPLE, LOGO_SAMPLE);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, LOGO_SAMPLE, LOGO_SAMPLE).data;
  } catch {
    return false;
  }

  const total = LOGO_SAMPLE * LOGO_SAMPLE;
  let opaque = 0;
  let darkOrColor = 0;
  let lumaSum = 0;
  let satSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 28) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    opaque += 1;
    lumaSum += luma;
    satSum += sat;
    if (luma < 170 || sat > 0.22) darkOrColor += 1;
  }
  if (opaque < total * 0.02) return false;
  if ((total - opaque) / total < 0.04) return false;
  if (darkOrColor / opaque > 0.18) return false;
  return lumaSum / opaque >= 200 && satSum / opaque <= 0.16;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawDiagonalGridPattern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.save();
  roundRect(ctx, x, y, w, h, 10);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  const step = 14;
  for (let i = -h; i < w + h; i += step) {
    ctx.beginPath();
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + h, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

function createCanvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function formatNodeDisplayText(node: GraphNode): string {
  const en = (node.label || node.id).trim();
  const zh = (node.labelZh || '').trim();
  const redundant = isRedundantBilingual(en, zh);

  if (node.type === 'root') {
    return !redundant ? `${en} · ${zh}` : en;
  }
  if (node.type === 'pillar') {
    return !redundant ? `${zh} · ${en}` : zh || en;
  }
  if (node.type === 'category') {
    return zh || en;
  }
  if (!redundant && zh.length <= 8) {
    return `${en} (${zh})`;
  }
  return en;
}

type BadgeBundle = {
  texNormal: THREE.CanvasTexture;
  ensureActive: () => THREE.CanvasTexture;
  applyLogo?: (img: HTMLImageElement) => void;
  aspect: number;
  worldHeight: number;
};

function createLazyBadgeBundle(
  width: number,
  height: number,
  worldHeight: number,
  draw: (ctx: CanvasRenderingContext2D, variant: BadgeVariant) => void,
): BadgeBundle {
  const ratio = 2;
  const buildVariant = (variant: BadgeVariant): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      draw(ctx, variant);
    }
    return createCanvasTexture(canvas);
  };

  const texNormal = buildVariant('normal');
  let texActive: THREE.CanvasTexture | null = null;

  return {
    texNormal,
    ensureActive: () => {
      if (!texActive) texActive = buildVariant('active');
      return texActive;
    },
    aspect: width / height,
    worldHeight,
  };
}

function measureBadgeBox(title: string, meta: string): { boxW: number; metaW: number } {
  const mCtx = getMeasureCtx();
  let titleW = 140;
  let metaW = 110;
  if (mCtx) {
    mCtx.font = BADGE_TITLE_FONT;
    titleW = mCtx.measureText(title).width;
    mCtx.font = BADGE_META_FONT;
    metaW = mCtx.measureText(meta).width + 16;
  }
  const contentW = Math.max(titleW, metaW);
  const boxW = Math.ceil(BADGE_STRIPE_W + 12 + BADGE_LOGO + 12 + contentW + 18);
  return { boxW, metaW };
}

function drawBadgeIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  glyph: string,
  fill: string,
  stroke: string,
  glyphColor: string,
): number {
  const logoX = x + BADGE_STRIPE_W + 10;
  const logoY = y + (BADGE_BOX_H - BADGE_LOGO) / 2;
  ctx.save();
  roundRect(ctx, logoX, logoY, BADGE_LOGO, BADGE_LOGO, 9);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.font = `20px ${FONT_STACK}`;
  ctx.fillStyle = glyphColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, logoX + BADGE_LOGO / 2, logoY + BADGE_LOGO / 2 + 0.5);
  ctx.restore();
  return logoX + BADGE_LOGO + 11;
}

function drawBadgeTitleAndMeta(
  ctx: CanvasRenderingContext2D,
  textX: number,
  y: number,
  title: string,
  meta: string,
  metaW: number,
  titleColor: string,
  metaColor: string,
  pillFill: string,
  pillStroke: string,
): void {
  ctx.font = BADGE_TITLE_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = titleColor;
  ctx.fillText(title, textX, y + 18);

  const pillH = 19;
  const pillY = y + 30;
  roundRect(ctx, textX, pillY, metaW, pillH, 6);
  ctx.fillStyle = pillFill;
  ctx.fill();
  ctx.strokeStyle = pillStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = BADGE_META_FONT;
  ctx.fillStyle = metaColor;
  ctx.fillText(meta, textX + 8, pillY + pillH / 2 + 0.5);
}

function createBadgeTextures(
  node: GraphNode,
  accent: string,
  theme: ThemeMode,
  childCount = 0,
): BadgeBundle {
  const glowMargin = 10;

  // 1. ROOT NODE (Tier 0) — same card height and type size as protocol
  if (node.type === 'root') {
    const titleText = formatNodeDisplayText(node);
    const metaText = '生態核心';
    const { boxW, metaW } = measureBadgeBox(titleText, metaText);
    const boxH = BADGE_BOX_H;
    const width = boxW + glowMargin * 2;
    const height = boxH + glowMargin * 2;

    return createLazyBadgeBundle(width, height, BADGE_WORLD_H, (ctx, variant) => {
      const x = glowMargin;
      const y = glowMargin;
      const radius = 11;

      ctx.save();
      if (variant === 'active') {
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 14;
      }
      roundRect(ctx, x, y, boxW, boxH, radius);
      const grad = ctx.createLinearGradient(x, y, x + boxW, y + boxH);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#0f172a');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      ctx.save();
      roundRect(ctx, x, y, boxW, boxH, radius);
      ctx.clip();
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x, y, BADGE_STRIPE_W, boxH);
      ctx.restore();

      roundRect(ctx, x, y, boxW, boxH, radius);
      ctx.strokeStyle = variant === 'active' ? '#ffffff' : '#fbbf24';
      ctx.lineWidth = variant === 'active' ? 2.8 : 1.5;
      ctx.stroke();

      const textX = drawBadgeIcon(ctx, x, y, '🌐', 'rgba(251, 191, 36, 0.18)', '#fbbf24', '#fde68a');
      drawBadgeTitleAndMeta(
        ctx,
        textX,
        y,
        titleText,
        metaText,
        metaW,
        '#ffffff',
        '#fde68a',
        'rgba(251, 191, 36, 0.22)',
        '#fbbf24',
      );
    });
  }

  // 2. PILLAR NODE (Tier 1) — same card height and type size as protocol
  if (node.type === 'pillar') {
    const icon = pillarIcon(node.id);
    const titleText = formatNodeDisplayText(node);
    const metaText = childCount > 0 ? `核心領域 · 涵蓋 ${childCount} 大賽道` : '核心領域';
    const { boxW, metaW } = measureBadgeBox(titleText, metaText);
    const boxH = BADGE_BOX_H;
    const width = boxW + glowMargin * 2;
    const height = boxH + glowMargin * 2;

    return createLazyBadgeBundle(width, height, BADGE_WORLD_H, (ctx, variant) => {
      const x = glowMargin;
      const y = glowMargin;
      const radius = 11;

      ctx.save();
      if (variant === 'active') {
        ctx.shadowColor = accent;
        ctx.shadowBlur = 14;
      }
      roundRect(ctx, x, y, boxW, boxH, radius);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.restore();

      ctx.save();
      roundRect(ctx, x, y, boxW, boxH, radius);
      ctx.clip();
      ctx.fillStyle = accent;
      ctx.fillRect(x, y, BADGE_STRIPE_W, boxH);
      ctx.restore();

      roundRect(ctx, x, y, boxW, boxH, radius);
      ctx.strokeStyle = variant === 'active' ? '#ffffff' : accent;
      ctx.lineWidth = variant === 'active' ? 2.8 : 1.5;
      ctx.stroke();

      const textX = drawBadgeIcon(ctx, x, y, icon, 'rgba(255, 255, 255, 0.12)', accent, '#ffffff');
      drawBadgeTitleAndMeta(
        ctx,
        textX,
        y,
        titleText,
        metaText,
        metaW,
        '#ffffff',
        accent,
        'rgba(255, 255, 255, 0.1)',
        accent,
      );
    });
  }

  // 3. CATEGORY NODE (Tier 2) — same card height and type size as protocol
  if (node.type === 'category') {
    const catIcon = categoryIcon(node);
    const zh = (node.labelZh || '').trim();
    const en = (node.label || node.id).trim();
    const titleText = zh || en;
    const showEnSub = Boolean(zh && en && !isRedundantBilingual(en, zh));
    const countText = childCount > 0 ? `${childCount} 個項目` : '賽道目錄';
    const metaText = showEnSub ? `${en} · ${countText}` : `賽道分類 · ${countText}`;
    const { boxW, metaW } = measureBadgeBox(titleText, metaText);
    const boxH = BADGE_BOX_H;
    const width = boxW + glowMargin * 2;
    const height = boxH + glowMargin * 2;
    const pal = CATEGORY_FRAME_COLOR[theme];

    return createLazyBadgeBundle(width, height, BADGE_WORLD_H, (ctx, variant) => {
      const x = glowMargin;
      const y = glowMargin;
      const radius = 11;

      ctx.save();
      if (variant === 'active') {
        ctx.shadowColor = pal.border;
        ctx.shadowBlur = 14;
      }
      roundRect(ctx, x, y, boxW, boxH, radius);
      ctx.fillStyle = pal.bodyBg;
      ctx.fill();
      ctx.restore();

      drawDiagonalGridPattern(
        ctx,
        x,
        y,
        boxW,
        boxH,
        theme === 'light' ? 'rgba(217, 119, 6, 0.08)' : 'rgba(245, 158, 11, 0.09)',
      );

      ctx.save();
      roundRect(ctx, x, y, boxW, boxH, radius);
      ctx.clip();
      ctx.fillStyle = pal.border;
      ctx.fillRect(x, y, BADGE_STRIPE_W, boxH);
      ctx.restore();

      roundRect(ctx, x, y, boxW, boxH, radius);
      ctx.strokeStyle = variant === 'active' ? '#ffffff' : pal.border;
      ctx.lineWidth = variant === 'active' ? 2.8 : 1.5;
      ctx.stroke();

      const textX = drawBadgeIcon(
        ctx,
        x,
        y,
        catIcon,
        pal.headerBg,
        pal.border,
        theme === 'light' ? '#92400e' : '#fcd34d',
      );
      drawBadgeTitleAndMeta(
        ctx,
        textX,
        y,
        titleText,
        metaText,
        metaW,
        theme === 'light' ? '#0f172a' : '#ffffff',
        pal.countText,
        pal.headerBg,
        pal.border,
      );
    });
  }

  // 4. PROTOCOL / MERCHANT NODE (Tier 3)
  const entity = getProtocolRoleBadge(node);
  const monogram = getNodeMonogram(node);
  const titleText = formatNodeDisplayText(node);
  const roleBadgeText = entity.label;
  const { boxW, metaW: badgeW } = measureBadgeBox(titleText, roleBadgeText);
  const width = boxW + glowMargin * 2;
  const height = BADGE_BOX_H + glowMargin * 2;
  const ratio = 2;

  const drawProtocolCard = (
    canvas: HTMLCanvasElement,
    variant: BadgeVariant,
    logoImg: HTMLImageElement | null,
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(ratio, ratio);

    const x = glowMargin;
    const y = glowMargin;
    const radius = 11;

    ctx.save();
    if (variant === 'active') {
      ctx.shadowColor = accent;
      ctx.shadowBlur = 14;
    }
    roundRect(ctx, x, y, boxW, BADGE_BOX_H, radius);
    ctx.fillStyle =
      variant === 'active'
        ? '#ffffff'
        : theme === 'light'
          ? 'rgba(255, 255, 255, 0.98)'
          : 'rgba(248, 250, 252, 0.95)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(ctx, x, y, boxW, BADGE_BOX_H, radius);
    ctx.clip();
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, BADGE_STRIPE_W, BADGE_BOX_H);
    ctx.restore();

    roundRect(ctx, x, y, boxW, BADGE_BOX_H, radius);
    ctx.strokeStyle = variant === 'active' ? accent : 'rgba(100, 116, 139, 0.45)';
    ctx.lineWidth = variant === 'active' ? 2.8 : 1.5;
    ctx.stroke();

    const logoX = x + BADGE_STRIPE_W + 10;
    const logoY = y + (BADGE_BOX_H - BADGE_LOGO) / 2;

    if (logoImg) {
      const lightLogo = logoSubjectIsNearWhite(logoImg);
      ctx.save();
      roundRect(ctx, logoX, logoY, BADGE_LOGO, BADGE_LOGO, 9);
      ctx.fillStyle = lightLogo ? LIGHT_LOGO_PLATE : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.38)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.clip();
      ctx.drawImage(logoImg, logoX + 3, logoY + 3, BADGE_LOGO - 6, BADGE_LOGO - 6);
      ctx.restore();
    } else {
      ctx.save();
      roundRect(ctx, logoX, logoY, BADGE_LOGO, BADGE_LOGO, 9);
      ctx.fillStyle = monogram.bg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.font = `800 16px ${FONT_STACK}`;
      ctx.fillStyle = monogram.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(monogram.text, logoX + BADGE_LOGO / 2, logoY + BADGE_LOGO / 2 + 0.5);
      ctx.restore();
    }

    drawBadgeTitleAndMeta(
      ctx,
      logoX + BADGE_LOGO + 11,
      y,
      titleText,
      roleBadgeText,
      badgeW,
      '#0f172a',
      entity.colorLight,
      'rgba(15, 23, 42, 0.07)',
      entity.colorLight,
    );
  };

  const hasLogo = Boolean(getNodeLogoUrl(node));
  if (!hasLogo) {
    return createLazyBadgeBundle(width, height, BADGE_WORLD_H, (_ctx, variant) => {
      drawProtocolCard(_ctx.canvas, variant, null);
    });
  }

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = width * ratio;
  normalCanvas.height = height * ratio;
  drawProtocolCard(normalCanvas, 'normal', null);
  const texNormal = createCanvasTexture(normalCanvas);

  let activeCanvas: HTMLCanvasElement | null = null;
  let texActive: THREE.CanvasTexture | null = null;
  let currentLogo: HTMLImageElement | null = null;

  const ensureActive = () => {
    if (texActive && activeCanvas) return texActive;
    activeCanvas = document.createElement('canvas');
    activeCanvas.width = width * ratio;
    activeCanvas.height = height * ratio;
    drawProtocolCard(activeCanvas, 'active', currentLogo);
    texActive = createCanvasTexture(activeCanvas);
    return texActive;
  };

  const applyLogo = (img: HTMLImageElement) => {
    currentLogo = img;
    drawProtocolCard(normalCanvas, 'normal', currentLogo);
    texNormal.needsUpdate = true;
    if (activeCanvas && texActive) {
      drawProtocolCard(activeCanvas, 'active', currentLogo);
      texActive.needsUpdate = true;
    }
  };

  return {
    texNormal,
    ensureActive,
    applyLogo,
    aspect: width / height,
    worldHeight: BADGE_WORLD_H,
  };
}

function hashPhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 628) / 100;
}

function disposeSingleNodeRecord(rec: NodeVisual): void {
  if (rec.disposed) return;
  rec.disposed = true;
  rec.releaseLogo();
  rec.texNormal.dispose();
  rec.texActive?.dispose();
  rec.labelMat.dispose();
  rec.dot.dispose();
  rec.ringMat.dispose();
  rec.pulseMat.dispose();
  rec.auraMat?.dispose();
}

export function createMindMapNode(
  node: GraphNode,
  records: Map<string, NodeVisual>,
  theme: ThemeMode = 'dark',
  childCount = 0,
): THREE.Group {
  const cached = records.get(node.id);
  if (cached && cached.theme === theme && !cached.disposed) return cached.group;
  if (cached) disposeSingleNodeRecord(cached);

  const radius = nodeRadius(node.type);
  const accent =
    node.type === 'category'
      ? CATEGORY_FRAME_COLOR[theme].border
      : groupColor(node.group, theme);
  const color = new THREE.Color(accent);
  const group = new THREE.Group();
  group.name = node.id;

  const geometry = getTierGeo(node.type, radius);
  const dot = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: theme === 'light' ? 0.25 : 0.48,
    roughness: node.type === 'category' || node.type === 'root' ? 0.18 : 0.28,
    metalness: node.type === 'root' || node.type === 'pillar' ? 0.35 : 0.18,
    transparent: true,
    opacity: 1,
  });
  const mesh = new THREE.Mesh(geometry, dot);
  if (node.type === 'category') {
    mesh.rotation.y = Math.PI / 4;
    mesh.rotation.x = Math.PI / 8;
  }
  mesh.name = 'dot';
  group.add(mesh);

  const ringMat = new THREE.MeshBasicMaterial({
    color: theme === 'light' ? accent : '#ffffff',
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ringMesh = new THREE.Mesh(getRingGeo(radius * 1.32, radius * 1.72), ringMat);
  ringMesh.name = 'select-ring';
  ringMesh.visible = false;
  group.add(ringMesh);

  const pulseMat = new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const pulseMesh = new THREE.Mesh(getRingGeo(radius * 1.75, radius * 2.15), pulseMat);
  pulseMesh.name = 'pulse-ring';
  pulseMesh.visible = false;
  group.add(pulseMesh);

  let auraMesh: THREE.Mesh | null = null;
  let auraMat: THREE.MeshBasicMaterial | null = null;
  if (node.type === 'root' || node.type === 'pillar' || node.type === 'category') {
    auraMat = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: theme === 'light' ? 0.35 : 0.48,
      depthWrite: false,
    });
    auraMesh = new THREE.Mesh(
      getTorusGeo(
        radius * (node.type === 'root' ? 1.65 : node.type === 'pillar' ? 1.48 : 1.38),
        node.type === 'root' ? 0.22 : node.type === 'pillar' ? 0.16 : 0.11,
      ),
      auraMat,
    );
    auraMesh.rotation.x = Math.PI * 0.42;
    auraMesh.name = 'aura-ring';
    group.add(auraMesh);
  }

  const { texNormal, ensureActive, applyLogo, aspect, worldHeight } = createBadgeTextures(
    node,
    groupColor(node.group, theme),
    theme,
    childCount,
  );
  const labelMat = new THREE.SpriteMaterial({
    map: texNormal,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    opacity: 1,
  });
  const labelBaseWidth = worldHeight * aspect;
  const labelBaseHeight = worldHeight;
  const labelBaseY = radius + 0.95;
  const label = new THREE.Sprite(labelMat);
  label.name = 'label';
  label.scale.set(labelBaseWidth, labelBaseHeight, 1);
  label.center.set(0.5, 0);
  label.position.y = labelBaseY;
  label.renderOrder =
    node.type === 'root' ? 40 : node.type === 'pillar' ? 34 : node.type === 'category' ? 28 : 22;
  group.add(label);

  const visual: NodeVisual = {
    id: node.id,
    type: node.type,
    theme,
    group,
    dotMesh: mesh,
    dot,
    label,
    labelMat,
    labelBaseWidth,
    labelBaseHeight,
    labelBaseY,
    texNormal,
    texActive: null,
    ensureActive: () => {
      if (!visual.texActive) {
        visual.texActive = ensureActive();
      }
      return visual.texActive;
    },
    disposed: false,
    ringMesh,
    ringMat,
    pulseMesh,
    pulseMat,
    auraMesh,
    auraMat,
    phase: hashPhase(node.id),
    releaseLogo: () => {},
  };

  let releaseLogoSub = () => {};
  visual.releaseLogo = () => releaseLogoSub();
  records.set(node.id, visual);
  if (node.type === 'protocol' && applyLogo) {
    const logoUrl = getNodeLogoUrl(node);
    if (logoUrl) {
      releaseLogoSub = subscribeNodeLogo(logoUrl, (img) => {
        if (visual.disposed) return;
        applyLogo(img);
      });
    }
  }
  return group;
}

export function disposeNodeRecords(records: Map<string, NodeVisual>): void {
  for (const rec of records.values()) {
    disposeSingleNodeRecord(rec);
  }
  records.clear();
}

export function applyVisuals(
  records: Map<string, NodeVisual>,
  emphasis: Set<string> | null,
  selectedId: string | null,
  hoveredId: string | null,
  labelVisible: (id: string) => boolean,
  visibleIds?: ReadonlySet<string> | null,
  gathered = false,
): void {
  const hasFilter = emphasis !== null;
  const gatherActive = gathered && selectedId !== null && hasFilter;

  for (const record of records.values()) {
    if (record.disposed) continue;
    const shown = !visibleIds || visibleIds.has(record.id);
    record.group.visible = shown;
    if (!shown) continue;

    const active = !hasFilter || emphasis.has(record.id);
    const isSelected = record.id === selectedId;
    const isHovered = record.id === hoveredId;
    const isHot = isSelected || isHovered || (gatherActive && active);

    if (gatherActive) {
      if (active) {
        // Cards are the gather visual. Every active node uses the same card size and the same small sphere.
        const dotRadius = nodeRadius(record.type) || 2;
        record.dotMesh.scale.setScalar(0.85 / dotRadius);
        record.dot.opacity = 0.4;
        record.dot.emissiveIntensity = 0.32;

        const targetTex = isSelected || isHovered ? record.ensureActive() : record.texNormal;
        if (record.labelMat.map !== targetTex) {
          record.labelMat.map = targetTex;
          record.labelMat.needsUpdate = true;
        }
        record.label.visible = true;
        record.labelMat.opacity = 1;
        record.labelMat.depthTest = false;
        record.label.renderOrder = isSelected ? 32 : isHovered ? 30 : 28;

        record.label.center.set(0.5, 0.5);
        record.label.position.y = 0;
        record.label.scale.set(record.labelBaseWidth, record.labelBaseHeight, 1);

        record.pulseMesh.visible = false;
        record.ringMesh.visible = false;
        if (record.auraMesh) record.auraMesh.visible = false;
        if (record.auraMat) record.auraMat.opacity = 0;
        record.group.scale.setScalar(1);
      } else {
        // Hide unrelated labels and deeply dim background nodes so the 2D mind-map plane is crystal clear
        record.dotMesh.scale.setScalar(0.6);
        record.dot.opacity = 0.02;
        record.dot.emissiveIntensity = 0.01;
        record.label.visible = false;
        record.labelMat.opacity = 0.01;
        record.label.center.set(0.5, 0);
        record.label.position.y = record.labelBaseY;
        record.label.scale.set(record.labelBaseWidth, record.labelBaseHeight, 1);
        record.ringMesh.visible = false;
        record.pulseMesh.visible = false;
        if (record.auraMesh) record.auraMesh.visible = false;
        if (record.auraMat) {
          record.auraMat.opacity = 0.01;
        }
        record.group.scale.setScalar(0.7);
      }
      continue;
    }

    record.dotMesh.scale.setScalar(1);
    if (record.auraMesh) record.auraMesh.visible = true;
    record.label.center.set(0.5, 0);
    record.label.position.y = record.labelBaseY;
    record.label.renderOrder =
      isSelected ? 55 : isHovered ? 48 : record.type === 'root' ? 40 : record.type === 'pillar' ? 34 : record.type === 'category' ? 28 : 22;
    record.label.scale.set(record.labelBaseWidth, record.labelBaseHeight, 1);
    record.dot.opacity = active ? 1 : 0.14;
    record.dot.emissiveIntensity = isHot
      ? record.theme === 'light'
        ? 0.55
        : 0.9
      : active
        ? record.theme === 'light'
          ? 0.22
          : 0.45
        : 0.05;

    const showLabel = labelVisible(record.id);
    record.label.visible = showLabel;
    if (showLabel) {
      const targetTex = isHot ? record.ensureActive() : record.texNormal;
      if (record.labelMat.map !== targetTex) {
        record.labelMat.map = targetTex;
        record.labelMat.needsUpdate = true;
      }
      record.labelMat.opacity = isHot ? 1 : active ? 0.96 : 0.14;
    }

    record.ringMesh.visible = isHot;
    record.pulseMesh.visible = isHot;

    if (record.auraMat) {
      record.auraMat.opacity = active ? (record.theme === 'light' ? 0.42 : 0.55) : 0.08;
    }

    const baseScale = isSelected ? 1.22 : isHovered ? 1.12 : 1;
    record.group.scale.setScalar(baseScale);
  }
}

// ============================================================================
// 3D Ambient Stage (Starfield, Nebulae, Galaxy, Polar Radar Grid & Lighting)
// ============================================================================

export type AmbientStage = {
  group: THREE.Group;
  theme: ThemeMode;
  update: (
    timeSec: number,
    camera?: THREE.Camera,
    records?: Map<string, NodeVisual>,
    selectedId?: string | null,
    hoveredId?: string | null,
    radarVisible?: boolean,
  ) => void;
};

function disposeStageObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material?.dispose();
  });
}

let nebulaMap: THREE.CanvasTexture | null = null;

function getNebulaMap(): THREE.CanvasTexture {
  if (nebulaMap) return nebulaMap;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    nebulaMap = new THREE.CanvasTexture(canvas);
    return nebulaMap;
  }
  const blobs = [
    { x: 0.5, y: 0.5, r: 0.46, a: 0.72 },
    { x: 0.32, y: 0.42, r: 0.3, a: 0.46 },
    { x: 0.68, y: 0.58, r: 0.28, a: 0.4 },
    { x: 0.46, y: 0.28, r: 0.22, a: 0.32 },
  ];
  for (const blob of blobs) {
    const cx = blob.x * size;
    const cy = blob.y * size;
    const radius = blob.r * size;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${blob.a})`);
    gradient.addColorStop(0.42, `rgba(255,255,255,${blob.a * 0.38})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  nebulaMap = texture;
  return texture;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type SkyLayer = {
  points: THREE.Points;
  galaxy: THREE.Group;
  nebulae: THREE.Sprite[];
  nebulaBase: THREE.Vector3[];
  nebulaOpacity: number[];
};

const NEBULA_SPECS: Record<
  ThemeMode,
  { color: string; opacity: number; scale: number; position: [number, number, number] }[]
> = {
  dark: [
    { color: '#c4b5fd', opacity: 0.5, scale: 2600, position: [-3976, 2886, -4104] },
    { color: '#67e8f9', opacity: 0.38, scale: 3100, position: [5677, 757, -4996] },
    { color: '#818cf8', opacity: 0.46, scale: 3600, position: [1318, 6854, -5362] },
  ],
  light: [
    { color: '#5c7394', opacity: 0.34, scale: 2600, position: [-3976, 2886, -4104] },
    { color: '#8d78a6', opacity: 0.26, scale: 3100, position: [5677, 757, -4996] },
    { color: '#6a82a8', opacity: 0.3, scale: 3600, position: [1318, 6854, -5362] },
  ],
};

const DISTANT_POINT_VERTEX = `
  attribute float aSize;
  attribute float aPhase;
  attribute float aTwinkle;
  attribute float aAlpha;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vPhase;
  varying float vTwinkle;
  varying float vAlpha;
  void main() {
    vColor = color;
    vPhase = aPhase;
    vTwinkle = aTwinkle;
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * (720.0 / max(-mvPosition.z, 80.0)), 1.0, 64.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_Position.z = gl_Position.w * 0.997;
  }
`;

const DISTANT_POINT_FRAGMENT = `
  varying vec3 vColor;
  varying float vPhase;
  varying float vTwinkle;
  varying float vAlpha;
  uniform float uTime;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float body = smoothstep(0.5, 0.05, d);
    float core = smoothstep(0.18, 0.0, d);
    float tw = mix(1.0, 0.74 + 0.26 * sin(uTime * 0.8 + vPhase), vTwinkle);
    gl_FragColor = vec4(vColor, body * (0.72 + 0.28 * core) * tw * vAlpha);
  }
`;

function createDistantPointMaterial(blending: THREE.Blending): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    blending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: DISTANT_POINT_VERTEX,
    fragmentShader: DISTANT_POINT_FRAGMENT,
  });
}

function createGalaxyArm(theme: ThemeMode, material: THREE.ShaderMaterial): THREE.Group {
  const rand = mulberry32(0x6a1a);
  const dark = theme === 'dark';
  const palette = dark
    ? ['#c4b5fd', '#818cf8', '#67e8f9', '#a5b4fc']
    : ['#6d84a3', '#8ea0b8', '#7d92ae', '#9aabbe'];
  const perArm = 740;
  const arms = 2;
  const count = perArm * arms;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const twinkles = new Float32Array(count);
  const alphas = new Float32Array(count);
  const color = new THREE.Color();

  let index = 0;
  for (let arm = 0; arm < arms; arm++) {
    for (let i = 0; i < perArm; i++) {
      const t = i / (perArm - 1);
      const theta = arm * Math.PI + t * Math.PI * 2.6;
      const radius = 5200 + t * 3600;
      const spread = 180 + t * 320;
      const fade = Math.sin(t * Math.PI);
      positions[index * 3] = Math.cos(theta) * radius + (rand() - 0.5) * spread;
      positions[index * 3 + 1] = (rand() - 0.5) * (240 + t * 420);
      positions[index * 3 + 2] = Math.sin(theta) * radius + (rand() - 0.5) * spread;
      color.set(palette[Math.floor(rand() * palette.length)]);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
      sizes[index] = 28 + rand() * 40;
      phases[index] = rand() * Math.PI * 2;
      twinkles[index] = 0;
      alphas[index] = (dark ? 0.32 + fade * 0.4 : 0.2 + fade * 0.26) * (0.8 + rand() * 0.2);
      index += 1;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkles, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.computeBoundingSphere();

  const points = new THREE.Points(geometry, material);
  points.name = 'sol-galaxy-arm';
  points.frustumCulled = false;
  points.renderOrder = -880;

  const group = new THREE.Group();
  group.name = 'sol-galaxy';
  group.rotation.x = 0.58;
  group.rotation.z = 0.16;
  group.add(points);
  return group;
}

function createSky(theme: ThemeMode): SkyLayer {
  const rand = mulberry32(0x51a7);
  const dark = theme === 'dark';
  const palette = dark
    ? ['#f4f8ff', '#d5e4f6', '#9ec8ee', '#c4b5fd']
    : ['#3d5572', '#5a7090', '#6c6286', '#4a607c'];
  const layers = [
    { count: 1500, minR: 6600, maxR: 9600, minSize: 18, maxSize: 34, alpha: dark ? 0.62 : 0.55 },
    { count: 420, minR: 5400, maxR: 6600, minSize: 36, maxSize: 62, alpha: dark ? 0.84 : 0.7 },
    { count: 100, minR: 4800, maxR: 5400, minSize: 64, maxSize: 96, alpha: dark ? 1 : 0.8 },
  ];
  const count = layers.reduce((sum, layer) => sum + layer.count, 0);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const twinkles = new Float32Array(count);
  const alphas = new Float32Array(count);
  const color = new THREE.Color();
  let cursor = 0;

  for (const layer of layers) {
    for (let i = 0; i < layer.count; i++) {
      const radius = layer.minR + rand() * (layer.maxR - layer.minR);
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      const index = cursor + i;
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.72;
      positions[index * 3 + 2] = radius * Math.cos(phi);
      color.set(palette[Math.floor(rand() * palette.length)]);
      const shade = 0.82 + rand() * 0.18;
      colors[index * 3] = color.r * shade;
      colors[index * 3 + 1] = color.g * shade;
      colors[index * 3 + 2] = color.b * shade;
      sizes[index] = layer.minSize + rand() * (layer.maxSize - layer.minSize);
      phases[index] = rand() * Math.PI * 2;
      twinkles[index] = rand() > 0.86 ? 1 : 0;
      alphas[index] = layer.alpha;
    }
    cursor += layer.count;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkles, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.computeBoundingSphere();

  const blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
  const material = createDistantPointMaterial(blending);

  const points = new THREE.Points(geometry, material);
  points.name = 'sol-starfield';
  points.frustumCulled = false;
  points.renderOrder = -900;

  const map = getNebulaMap();
  const nebulae: THREE.Sprite[] = [];
  const nebulaBase: THREE.Vector3[] = [];
  const nebulaOpacity: number[] = [];

  for (const spec of NEBULA_SPECS[theme]) {
    const spriteMat = new THREE.SpriteMaterial({
      map,
      color: new THREE.Color(spec.color),
      transparent: true,
      opacity: spec.opacity,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      blending,
    });
    spriteMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <fog_vertex>',
        '#include <fog_vertex>\ngl_Position.z = gl_Position.w * 0.997;',
      );
    };
    const sprite = new THREE.Sprite(spriteMat);
    sprite.name = 'sol-nebula';
    sprite.position.set(spec.position[0], spec.position[1], spec.position[2]);
    sprite.scale.setScalar(spec.scale);
    sprite.renderOrder = -860;
    nebulae.push(sprite);
    nebulaBase.push(sprite.position.clone());
    nebulaOpacity.push(spec.opacity);
  }

  const galaxy = createGalaxyArm(theme, createDistantPointMaterial(blending));
  return { points, galaxy, nebulae, nebulaBase, nebulaOpacity };
}

function createRadialBackdrop(theme: ThemeMode): THREE.Mesh {
  const pal = AMBIENT_PALETTE[theme];
  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uGlow: { value: new THREE.Color(pal.bgGlow) },
      uCenter: { value: new THREE.Color(pal.bgCenter) },
      uEdge: { value: new THREE.Color(pal.bg) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 uGlow;
      uniform vec3 uCenter;
      uniform vec3 uEdge;
      void main() {
        vec2 p = (vUv - 0.5) * vec2(1.35, 1.12);
        float d = clamp(length(p), 0.0, 1.0);
        float falloff = smoothstep(0.12, 1.0, d);
        float halo = smoothstep(0.38, 0.0, d);
        vec3 col = mix(uCenter, uEdge, falloff);
        col = mix(col, uGlow, halo * 0.42);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sol-backdrop';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}

export function ensureAmbientStage(scene: THREE.Scene, theme: ThemeMode): AmbientStage {
  scene.fog = null;
  scene.background = null;

  const existing = scene.getObjectByName('sol-ambient-stage');
  if (existing && existing.userData?.theme === theme && existing.userData?.stage) {
    return existing.userData.stage as AmbientStage;
  }
  if (existing) {
    scene.remove(existing);
    disposeStageObject(existing);
  }

  const pal = AMBIENT_PALETTE[theme];
  const stageGroup = new THREE.Group();
  stageGroup.name = 'sol-ambient-stage';
  stageGroup.add(createRadialBackdrop(theme));

  const sky = createSky(theme);
  stageGroup.add(sky.points);
  stageGroup.add(sky.galaxy);
  for (const nebula of sky.nebulae) stageGroup.add(nebula);
  const starMat = sky.points.material as THREE.ShaderMaterial;

  // 1. Soft 3D Lighting
  const ambientLight = new THREE.AmbientLight(
    theme === 'light' ? 0xffffff : 0xdbeafe,
    theme === 'light' ? 1.35 : 1.1,
  );
  stageGroup.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(
    theme === 'light' ? 0xffffff : 0x93c5fd,
    theme === 'light' ? 0.65 : 0.8,
  );
  keyLight.position.set(320, 620, 440);
  stageGroup.add(keyLight);

  const corePointLight = new THREE.PointLight(
    theme === 'light' ? 0x0284c7 : 0x38bdf8,
    theme === 'light' ? 0.8 : 1.4,
    950,
  );
  corePointLight.position.set(0, 40, 0);
  stageGroup.add(corePointLight);

  // 2. Polar Radar Base Platform (Concentric rings + radial spokes)
  const radarGroup = new THREE.Group();
  radarGroup.position.set(0, -240, 0);
  stageGroup.add(radarGroup);

  const radii = [265, 520, 780, 1040];
  radii.forEach((r, idx) => {
    const segments = 96;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(theta) * r, 0, Math.sin(theta) * r));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const isMajor = idx === 0 || idx === 1;
    const mat = new THREE.LineBasicMaterial({
      color: isMajor ? pal.ringGlow : pal.gridPrimary,
      transparent: true,
      opacity: theme === 'light' ? (isMajor ? 0.34 : 0.22) : isMajor ? 0.2 : 0.12,
      depthWrite: false,
    });
    radarGroup.add(new THREE.Line(geo, mat));
  });

  const orbitPts: THREE.Vector3[] = [];
  const orbitSegs = 120;
  for (let i = 0; i < orbitSegs; i += 2) {
    const t1 = (i / orbitSegs) * Math.PI * 2;
    const t2 = ((i + 1) / orbitSegs) * Math.PI * 2;
    orbitPts.push(new THREE.Vector3(Math.cos(t1) * 390, 0, Math.sin(t1) * 390));
    orbitPts.push(new THREE.Vector3(Math.cos(t2) * 390, 0, Math.sin(t2) * 390));
  }
  const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPts);
  const orbitMat = new THREE.LineBasicMaterial({
    color: pal.ringGlow,
    transparent: true,
    opacity: theme === 'light' ? 0.26 : 0.14,
    depthWrite: false,
  });
  radarGroup.add(new THREE.LineSegments(orbitGeo, orbitMat));

  const axisPts: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    axisPts.push(new THREE.Vector3(Math.cos(angle) * 120, 0, Math.sin(angle) * 120));
    axisPts.push(new THREE.Vector3(Math.cos(angle) * 1040, 0, Math.sin(angle) * 1040));
  }
  const axisGeo = new THREE.BufferGeometry().setFromPoints(axisPts);
  const axisMat = new THREE.LineBasicMaterial({
    color: pal.gridPrimary,
    transparent: true,
    opacity: theme === 'light' ? 0.16 : 0.09,
    depthWrite: false,
  });
  radarGroup.add(new THREE.LineSegments(axisGeo, axisMat));

  const stage: AmbientStage = {
    group: stageGroup,
    theme,
    update: (timeSec, camera, records, selectedId, hoveredId, radarVisible = true) => {
      radarGroup.visible = radarVisible;
      corePointLight.intensity =
        (theme === 'light' ? 0.75 : 1.35) + Math.sin(timeSec * 1.8) * 0.2;

      starMat.uniforms.uTime.value = timeSec;
      sky.points.rotation.y = timeSec * 0.012;
      sky.points.rotation.x = Math.sin(timeSec * 0.045) * 0.035;
      sky.galaxy.rotation.y = timeSec * 0.008;

      for (let i = 0; i < sky.nebulae.length; i++) {
        const base = sky.nebulaBase[i];
        const nebula = sky.nebulae[i];
        nebula.position.set(
          base.x + Math.sin(timeSec * 0.05 + i * 1.7) * 110,
          base.y + Math.cos(timeSec * 0.04 + i) * 70,
          base.z + Math.sin(timeSec * 0.033 + i * 0.6) * 90,
        );
        const mat = nebula.material as THREE.SpriteMaterial;
        mat.opacity = sky.nebulaOpacity[i] * (0.9 + Math.sin(timeSec * 0.25 + i) * 0.1);
      }

      if (!records) return;

      for (const rec of records.values()) {
        if (rec.disposed || !rec.group.visible) continue;
        const isSelected = rec.id === selectedId;
        const isHovered = rec.id === hoveredId;
        if (!rec.auraMesh && !isSelected && !isHovered) continue;

        if (rec.auraMesh) {
          const wave = Math.sin(timeSec * 2.0 + rec.phase);
          rec.auraMesh.rotation.z = timeSec * (rec.type === 'root' ? 0.55 : 0.38) + rec.phase;
          rec.auraMesh.rotation.y = Math.cos(timeSec * 0.7 + rec.phase) * 0.28;
          rec.auraMesh.scale.setScalar(1 + wave * 0.045);
        }

        if (isSelected || isHovered) {
          if (camera) {
            rec.ringMesh.quaternion.copy(camera.quaternion);
            rec.pulseMesh.quaternion.copy(camera.quaternion);
          }
          const cycle = (timeSec * 1.45) % 1;
          const easeOut = 1 - Math.pow(1 - cycle, 2);
          rec.pulseMesh.scale.setScalar(1 + easeOut * 0.85);
          rec.pulseMat.opacity = (1 - easeOut) * (isSelected ? 0.78 : 0.55);

          const innerBreath = 1 + Math.sin(timeSec * 4.2) * 0.06;
          rec.ringMesh.scale.setScalar(innerBreath);
        }
      }
    },
  };

  stageGroup.userData = { theme, stage };
  scene.add(stageGroup);
  return stage;
}
