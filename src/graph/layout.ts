import type { GraphLink, GraphNode, LayoutMode } from '../types';

const PILLAR_ORDER = ['defi', 'cefi', 'infrastructure', 'consumer', 'developer'] as const;

// Five pillars. Wider categories (DeFi, consumer) keep a gap so their wedges do not cross.
const PILLAR_ANGLE: Record<string, number> = {
  defi: -2.5,
  cefi: -1.21,
  infrastructure: -0.12,
  consumer: 1.27,
  developer: 2.49,
};

const TREE_PILLAR_POS: Record<string, { x: number; y: number; z: number }> = {
  defi: { x: -500, y: 190, z: -180 },
  cefi: { x: 0, y: 190, z: -460 },
  infrastructure: { x: 500, y: 190, z: -180 },
  consumer: { x: -500, y: 190, z: 220 },
  developer: { x: 500, y: 190, z: 220 },
};

const FORCE_PILLAR_POS: Record<string, { x: number; y: number; z: number }> = {
  defi: { x: -210, y: 135, z: -155 },
  cefi: { x: 30, y: -240, z: -30 },
  infrastructure: { x: 215, y: 115, z: 150 },
  consumer: { x: -195, y: -135, z: 175 },
  developer: { x: 205, y: -125, z: -165 },
};

function assignHome(node: GraphNode, x: number, y: number, z: number, pin = false): void {
  node.homeX = x;
  node.homeY = y;
  node.homeZ = z;
  if (node.x === undefined) node.x = x;
  if (node.y === undefined) node.y = y;
  if (node.z === undefined) node.z = z;
  if (pin) {
    node.fx = x;
    node.fy = y;
    node.fz = z;
  } else {
    node.fx = undefined;
    node.fy = undefined;
    node.fz = undefined;
  }
}

function collectOrderedPillars(nodes: readonly GraphNode[], byId: ReadonlyMap<string, GraphNode>): GraphNode[] {
  const seen = new Set<string>();
  const ordered: GraphNode[] = [];
  for (const id of PILLAR_ORDER) {
    const pillar = byId.get(id);
    if (pillar) {
      ordered.push(pillar);
      seen.add(id);
    }
  }
  for (const node of nodes) {
    if (node.type === 'pillar' && !seen.has(node.id)) {
      ordered.push(node);
      seen.add(node.id);
    }
  }
  return ordered;
}

export type Point3D = {
  x: number;
  y: number;
  z: number;
};

const RELATION_GATHER_ORDER: Record<string, number> = {
  'child-of': 0,
  'also-in': 1,
  'routes-liquidity': 2,
  integrates: 3,
  'uses-oracle': 4,
  'wallet-support': 5,
  'built-on': 6,
  powers: 7,
  lists: 8,
  competes: 9,
};

const GROUP_GATHER_ORDER: Record<string, number> = {
  core: 0,
  defi: 1,
  infrastructure: 2,
  consumer: 3,
  developer: 4,
  cefi: 5,
};

type GatherNeighbor = {
  id: string;
  relation: string;
  direction: 'out' | 'in';
  node: GraphNode;
};

type GatherPoint = {
  id: string;
  x: number;
  y: number;
  theta: number;
  rx: number;
  ry: number;
};

export type GatheredLayout = {
  targets: Map<string, Point3D>;
  /** Vertical framing reach of the outermost ring, including a little card padding. */
  outerRadius: number;
};

/** Innermost ellipse, close to the center card. Further rings add a fixed step. */
const GATHER_RX0 = 40;
const GATHER_RY0 = 28;
const GATHER_DRX = 34;
const GATHER_DRY = 24;
/** Arc length reserved per card so neighbors on one ring do not overlap. */
const GATHER_CARD_PITCH = 26;

function wrapAngle(delta: number): number {
  const tau = Math.PI * 2;
  let wrapped = delta % tau;
  if (wrapped > Math.PI) wrapped -= tau;
  if (wrapped < -Math.PI) wrapped += tau;
  return wrapped;
}

function ellipseCircumference(rx: number, ry: number): number {
  const a = Math.max(rx, ry);
  const b = Math.min(rx, ry);
  const h = ((a - b) / (a + b)) ** 2;
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(Math.max(0, 4 - 3 * h))));
}

function ringCapacity(rx: number, ry: number): number {
  return Math.max(1, Math.floor(ellipseCircumference(rx, ry) / GATHER_CARD_PITCH));
}

/** Tiny nudge, then snap each card back onto its own ellipse. */
function relaxRings(placed: GatherPoint[], cx: number, cy: number): void {
  const maxAngle = 0.03;
  const minDist = 20;
  const maxPush = 2.2;

  for (let iter = 0; iter < 4; iter++) {
    for (let i = 0; i < placed.length; i++) {
      const a = placed[i];
      for (let j = i + 1; j < placed.length; j++) {
        const b = placed[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist >= minDist) continue;
        const push = Math.min(maxPush, (minDist - dist) * 0.1);
        const ux = dx / dist;
        const uy = dy / dist;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
      }
    }

    for (const point of placed) {
      const dx = point.x - cx;
      const dy = point.y - cy;
      let angle = Math.atan2(dy / point.ry, dx / point.rx);
      if (!Number.isFinite(angle)) angle = point.theta;
      const delta = Math.max(-maxAngle, Math.min(maxAngle, wrapAngle(angle - point.theta)));
      const theta = point.theta + delta;
      point.x = cx + Math.cos(theta) * point.rx;
      point.y = cy + Math.sin(theta) * point.ry;
    }
  }
}

function placeConcentricRings(neighborList: readonly GatherNeighbor[], cx: number, cy: number): GatherPoint[] {
  const placed: GatherPoint[] = [];
  let cursor = 0;
  let ring = 0;
  while (cursor < neighborList.length) {
    const rx = GATHER_RX0 + ring * GATHER_DRX;
    const ry = GATHER_RY0 + ring * GATHER_DRY;
    const count = Math.min(ringCapacity(rx, ry), neighborList.length - cursor);
    for (let i = 0; i < count; i++) {
      const theta = -Math.PI / 2 + (i / count) * Math.PI * 2;
      const item = neighborList[cursor + i];
      placed.push({
        id: item.id,
        theta,
        rx,
        ry,
        x: cx + Math.cos(theta) * rx,
        y: cy + Math.sin(theta) * ry,
      });
    }
    cursor += count;
    ring += 1;
  }
  relaxRings(placed, cx, cy);
  return placed;
}

function measureGatherReach(cx: number, cy: number, placed: readonly GatherPoint[]): number {
  let maxAbsX = 0;
  let maxAbsY = 0;
  for (const point of placed) {
    maxAbsX = Math.max(maxAbsX, Math.abs(point.x - cx));
    maxAbsY = Math.max(maxAbsY, Math.abs(point.y - cy));
  }
  const spanX = maxAbsX + 14;
  const spanY = maxAbsY + 8;
  return Math.max(spanY, spanX / 1.5, 26);
}

/**
 * Flat mind-map around `centerId`.
 * First-degree neighbors fill concentric ellipses from the inside out.
 * Gathered nodes share Z = center.z. Background nodes stay at Z <= center.z - 320.
 */
export function computeGatheredTargets(
  centerId: string,
  basePositions: ReadonlyMap<string, Point3D>,
  byId: ReadonlyMap<string, GraphNode>,
  neighborsMap: ReadonlyMap<string, readonly { id: string; relation: string; direction: 'out' | 'in' }[]>,
  visibleIds?: ReadonlySet<string> | null,
): GatheredLayout {
  const targets = new Map<string, Point3D>();
  const centerNode = byId.get(centerId);
  const centerBase = basePositions.get(centerId) ?? {
    x: centerNode?.homeX ?? 0,
    y: centerNode?.homeY ?? 0,
    z: centerNode?.homeZ ?? 0,
  };

  if (!centerNode) {
    for (const [id, pos] of basePositions.entries()) {
      targets.set(id, { ...pos });
    }
    return { targets, outerRadius: 26 };
  }

  const cx = centerBase.x;
  const cy = centerBase.y;
  const cz = centerBase.z;

  targets.set(centerId, { x: cx, y: cy, z: cz });

  // Deduplicate 1st-degree neighbors and pick primary relation priority
  const rawNeighbors = neighborsMap.get(centerId) ?? [];
  const uniqueMap = new Map<string, GatherNeighbor>();

  for (const item of rawNeighbors) {
    if (item.id === centerId) continue;
    if (visibleIds && !visibleIds.has(item.id)) continue;
    const node = byId.get(item.id);
    if (!node) continue;
    const existing = uniqueMap.get(item.id);
    const rank = RELATION_GATHER_ORDER[item.relation] ?? 99;
    const existingRank = existing ? (RELATION_GATHER_ORDER[existing.relation] ?? 99) : 999;
    if (!existing || rank < existingRank) {
      uniqueMap.set(item.id, { ...item, node });
    }
  }

  const neighborList = Array.from(uniqueMap.values()).sort((a, b) => {
    const relDiff = (RELATION_GATHER_ORDER[a.relation] ?? 99) - (RELATION_GATHER_ORDER[b.relation] ?? 99);
    if (relDiff !== 0) return relDiff;
    const groupDiff = (GROUP_GATHER_ORDER[a.node.group] ?? 99) - (GROUP_GATHER_ORDER[b.node.group] ?? 99);
    if (groupDiff !== 0) return groupDiff;
    return a.id.localeCompare(b.id);
  });

  const neighborIds = new Set(neighborList.map((n) => n.id));
  const placedCoords = placeConcentricRings(neighborList, cx, cy);

  for (const item of placedCoords) {
    targets.set(item.id, {
      x: item.x,
      y: item.y,
      z: cz,
    });
  }

  let reach = GATHER_RX0;
  for (const point of placedCoords) {
    reach = Math.max(reach, Math.hypot(point.x - cx, point.y - cy));
  }
  const clearRadiusXY = reach + 36;

  for (const [id, base] of basePositions.entries()) {
    if (id === centerId || neighborIds.has(id)) continue;
    const vx = base.x - cx;
    const vy = base.y - cy;
    const distXY = Math.hypot(vx, vy);
    let tx = base.x;
    let ty = base.y;
    if (distXY < clearRadiusXY) {
      const safeDist = distXY || 1;
      const pushXY = clearRadiusXY + (clearRadiusXY - distXY) * 0.35;
      tx = cx + (vx / safeDist) * pushXY;
      ty = cy + (vy / safeDist) * pushXY;
    }
    const tz = Math.min(base.z - 180, cz - 320);
    targets.set(id, { x: tx, y: ty, z: tz });
  }

  return { targets, outerRadius: measureGatherReach(cx, cy, placedCoords) };
}

export function computeLayout(
  nodes: GraphNode[],
  mode: LayoutMode = 'radial',
  snapImmediate = false,
  links: readonly GraphLink[] = [],
): void {
  const byId = new Map<string, GraphNode>();
  const children = new Map<string, GraphNode[]>();

  for (const node of nodes) {
    byId.set(node.id, node);
    if (!node.parent) continue;
    const list = children.get(node.parent);
    if (list) {
      list.push(node);
    } else {
      children.set(node.parent, [node]);
    }
  }

  const root = nodes.find((node) => node.type === 'root');
  const pillars = collectOrderedPillars(nodes, byId);
  const placed = new Set<string>();

  if (mode === 'tree') {
    if (root) {
      assignHome(root, 0, 360, 0, snapImmediate);
      placed.add(root.id);
    }

    pillars.forEach((pillar, pIdx) => {
      const fallbackAngle = (pIdx / Math.max(pillars.length, 1)) * Math.PI * 2;
      const pPos = TREE_PILLAR_POS[pillar.id] ?? {
        x: Math.cos(fallbackAngle) * 480,
        y: 190,
        z: Math.sin(fallbackAngle) * 200,
      };
      assignHome(pillar, pPos.x, pPos.y, pPos.z, snapImmediate);
      placed.add(pillar.id);

      const categories = children.get(pillar.id) ?? [];
      const cols = Math.max(2, Math.ceil(Math.sqrt(categories.length * 1.5)));
      categories.forEach((cat, cIdx) => {
        const cCol = cIdx % cols;
        const cRow = Math.floor(cIdx / cols);
        const catX = pPos.x + (cCol - (cols - 1) / 2) * 162;
        const catY = 22 - (cRow % 2) * 28;
        const catZ = pPos.z + (cRow - 0.8) * 138;
        assignHome(cat, catX, catY, catZ, false);
        placed.add(cat.id);

        const protocols = children.get(cat.id) ?? [];
        protocols.forEach((proto, protoIdx) => {
          const pCol = protoIdx % 2;
          const pRow = Math.floor(protoIdx / 2);
          const px = catX + (pCol - 0.5) * 68;
          const py = catY - 82 - pRow * 46;
          const pz = catZ + ((pRow % 2) - 0.5) * 42;
          assignHome(proto, px, py, pz, false);
          placed.add(proto.id);
        });
      });
    });
  } else if (mode === 'force') {
    // 3D Spherical Constellation / Organic Force Network Layout
    if (root) {
      assignHome(root, 0, 0, 0, false);
      placed.add(root.id);
    }

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    pillars.forEach((pillar, pIdx) => {
      const fallbackAngle = (pIdx / Math.max(pillars.length, 1)) * Math.PI * 2;
      const pPos = FORCE_PILLAR_POS[pillar.id] ?? {
        x: Math.cos(fallbackAngle) * 210,
        y: (pIdx % 2 === 0 ? 1 : -1) * 125,
        z: Math.sin(fallbackAngle) * 210,
      };
      assignHome(pillar, pPos.x, pPos.y, pPos.z, false);
      placed.add(pillar.id);

      const categories = children.get(pillar.id) ?? [];
      const outMag = Math.hypot(pPos.x, pPos.y, pPos.z) || 1;
      const outX = pPos.x / outMag;
      const outY = pPos.y / outMag;
      const outZ = pPos.z / outMag;

      categories.forEach((cat, cIdx) => {
        const count = Math.max(categories.length, 1);
        const yNorm = count <= 1 ? 0 : 1 - (cIdx / (count - 1)) * 1.65;
        const rSlice = Math.sqrt(Math.max(0.05, 1 - yNorm * yNorm));
        const theta = cIdx * goldenAngle + pIdx * 1.1;
        const localX = Math.cos(theta) * rSlice;
        const localY = yNorm;
        const localZ = Math.sin(theta) * rSlice;

        const catDist = 175 + (cIdx % 3) * 28;
        const cx = pPos.x + (outX * 0.55 + localX * 0.85) * catDist;
        const cy = pPos.y + (outY * 0.55 + localY * 0.85) * catDist;
        const cz = pPos.z + (outZ * 0.55 + localZ * 0.85) * catDist;
        assignHome(cat, cx, cy, cz, false);
        placed.add(cat.id);

        const protocols = children.get(cat.id) ?? [];
        const cMag = Math.hypot(cx - pPos.x, cy - pPos.y, cz - pPos.z) || 1;
        const cDirX = (cx - pPos.x) / cMag;
        const cDirY = (cy - pPos.y) / cMag;
        const cDirZ = (cz - pPos.z) / cMag;

        protocols.forEach((proto, protoIdx) => {
          const shell = Math.floor(protoIdx / 8);
          const idxInShell = protoIdx % 8;
          const shellCount = Math.min(8, protocols.length - shell * 8);
          const pyNorm =
            shellCount <= 1 ? 0 : 1 - ((idxInShell + 0.5) / shellCount) * 2;
          const prSlice = Math.sqrt(Math.max(0.08, 1 - pyNorm * pyNorm));
          const pTheta = protoIdx * goldenAngle * 1.3;
          const radius = 84 + shell * 52;

          const px = cx + cDirX * (38 + shell * 26) + Math.cos(pTheta) * prSlice * radius;
          const py = cy + cDirY * (28 + shell * 18) + pyNorm * radius * 0.88;
          const pz = cz + cDirZ * (38 + shell * 26) + Math.sin(pTheta) * prSlice * radius;
          assignHome(proto, px, py, pz, false);
          placed.add(proto.id);
        });
      });
    });

    // Organic semantic attraction: pull protocols with cross-sector semantic links toward their partners
    if (links.length > 0) {
      const semTargets = new Map<string, { sx: number; sy: number; sz: number; count: number }>();
      for (const link of links) {
        if (link.relation === 'child-of') continue;
        const srcId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
        const dstId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
        const a = byId.get(srcId);
        const b = byId.get(dstId);
        if (!a || !b) continue;
        if (a.homeX === undefined || b.homeX === undefined) continue;

        if (a.type === 'protocol') {
          const cur = semTargets.get(a.id) ?? { sx: 0, sy: 0, sz: 0, count: 0 };
          cur.sx += b.homeX;
          cur.sy += b.homeY ?? 0;
          cur.sz += b.homeZ ?? 0;
          cur.count += 1;
          semTargets.set(a.id, cur);
        }
        if (b.type === 'protocol') {
          const cur = semTargets.get(b.id) ?? { sx: 0, sy: 0, sz: 0, count: 0 };
          cur.sx += a.homeX;
          cur.sy += a.homeY ?? 0;
          cur.sz += a.homeZ ?? 0;
          cur.count += 1;
          semTargets.set(b.id, cur);
        }
      }

      for (const [id, acc] of semTargets.entries()) {
        const node = byId.get(id);
        if (!node || acc.count === 0) continue;
        const pull = Math.min(0.34, 0.14 + acc.count * 0.04);
        const tx = acc.sx / acc.count;
        const ty = acc.sy / acc.count;
        const tz = acc.sz / acc.count;
        node.homeX = (node.homeX ?? 0) * (1 - pull) + tx * pull;
        node.homeY = (node.homeY ?? 0) * (1 - pull) + ty * pull;
        node.homeZ = (node.homeZ ?? 0) * (1 - pull) + tz * pull;
      }
    }

    // Fast 3D collision relaxation so force-pulled nodes never overlap
    const minDist = 48;
    const minDistSq = minDist * minDist;
    for (let iter = 0; iter < 6; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        if (a.type === 'root' || a.type === 'pillar') continue;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          if (b.type === 'root' || b.type === 'pillar') continue;
          const dx = (b.homeX ?? 0) - (a.homeX ?? 0);
          const dy = (b.homeY ?? 0) - (a.homeY ?? 0);
          const dz = (b.homeZ ?? 0) - (a.homeZ ?? 0);
          const dSq = dx * dx + dy * dy + dz * dz;
          if (dSq >= minDistSq) continue;
          const d = Math.sqrt(dSq) || 1;
          const push = (minDist - d) * 0.35;
          const ux = dx / d;
          const uy = dy / d;
          const uz = dz / d;
          a.homeX = (a.homeX ?? 0) - ux * push;
          a.homeY = (a.homeY ?? 0) - uy * push;
          a.homeZ = (a.homeZ ?? 0) - uz * push;
          b.homeX = (b.homeX ?? 0) + ux * push;
          b.homeY = (b.homeY ?? 0) + uy * push;
          b.homeZ = (b.homeZ ?? 0) + uz * push;
        }
      }
    }
  } else {
    // 'radial' (3D Outward Mind Map)
    const pinStructure = snapImmediate;
    if (root) {
      assignHome(root, 0, 20, 0, true);
      placed.add(root.id);
    }

    const pillarRadius = 265;
    const categoryBaseRadius = 520;

    pillars.forEach((pillar, pillarIndex) => {
      const fallbackAngle = (pillarIndex / Math.max(pillars.length, 1)) * Math.PI * 2;
      const pAngle = PILLAR_ANGLE[pillar.id] ?? fallbackAngle;
      const px = Math.cos(pAngle) * pillarRadius;
      const pz = Math.sin(pAngle) * pillarRadius;
      assignHome(pillar, px, 6, pz, pinStructure);
      placed.add(pillar.id);

      const categories = children.get(pillar.id) ?? [];
      const spread = Math.min(1.32, Math.max(0.58, (categories.length - 1) * 0.13));

      categories.forEach((cat, cIdx) => {
        const t = categories.length <= 1 ? 0.5 : cIdx / (categories.length - 1);
        const cAngle = pAngle + (t - 0.5) * spread;
        const cRadius = categoryBaseRadius + (cIdx % 3) * 52;
        const cy = ((cIdx % 3) - 1) * 76;
        const cx = Math.cos(cAngle) * cRadius;
        const cz = Math.sin(cAngle) * cRadius;
        assignHome(cat, cx, cy, cz, false);
        placed.add(cat.id);

        const protocols = children.get(cat.id) ?? [];
        const dirX = Math.cos(cAngle);
        const dirZ = Math.sin(cAngle);
        const tanX = -dirZ;
        const tanZ = dirX;

        protocols.forEach((proto, protoIdx) => {
          const col = protoIdx % 3;
          const row = Math.floor(protoIdx / 3);
          const outward = 96 + row * 62;
          const side = (col - 1) * 58 + (row % 2 === 0 ? -10 : 10);
          const lift = ((protoIdx % 4) - 1.5) * 32 + (row % 2 === 0 ? 10 : -10);
          const protoX = cx + dirX * outward + tanX * side;
          const protoY = cy + lift;
          const protoZ = cz + dirZ * outward + tanZ * side;
          assignHome(proto, protoX, protoY, protoZ, false);
          placed.add(proto.id);
        });
      });
    });
  }

  // Fallback for any unplaced nodes
  nodes.forEach((node, index) => {
    if (placed.has(node.id)) return;
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
    assignHome(
      node,
      Math.cos(angle) * 660,
      ((index % 5) - 2) * 34,
      Math.sin(angle) * 660,
      false,
    );
    placed.add(node.id);
  });

  if (snapImmediate) {
    for (const node of nodes) {
      if (node.homeX !== undefined && node.homeY !== undefined && node.homeZ !== undefined) {
        node.x = node.homeX;
        node.y = node.homeY;
        node.z = node.homeZ;
        node.vx = 0;
        node.vy = 0;
        node.vz = 0;
      }
    }
  }
}

export function seedLayout(nodes: GraphNode[]): void {
  computeLayout(nodes, 'radial', true);
}
