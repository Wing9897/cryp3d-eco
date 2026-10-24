import {
  Component,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import ForceGraph3D from 'react-force-graph-3d';
import { Vector3, type Camera, type Scene } from 'three';
import type { GraphLink, GraphNode, LayoutMode, ThemeMode } from '../types';
import { computeGatheredTargets, computeLayout, type Point3D } from '../graph/layout';
import {
  AMBIENT_PALETTE,
  categoryIcon,
  getProtocolRoleBadge,
  groupColor,
  relationColor,
  relationLabel,
} from '../graph/palette';
import {
  buildNeighborMap,
  emphasisIds,
  endpointId,
  indexNodes,
  protocolLabelVisible,
  type Neighbor,
} from '../graph/tree';
import {
  applyVisuals,
  createMindMapNode,
  disposeNodeRecords,
  ensureAmbientStage,
  formatNodeDisplayText,
  startLogoBackfill,
  type AmbientStage,
  type NodeVisual,
} from '../graph/visuals';

export type GraphHandle = {
  focusNode: (id: string) => void;
  resetView: () => void;
};

type GraphApi = {
  cameraPosition: (
    position: { x: number; y: number; z: number },
    lookAt?: { x: number; y: number; z: number },
    ms?: number,
  ) => void;
  camera: () => Camera;
  scene: () => Scene;
  d3Force: (name: string, force?: ((alpha: number) => void) | null) => unknown;
  d3ReheatSimulation?: () => void;
  d3AlphaTarget?: (alpha: number) => unknown;
  refresh: () => void;
  controls: () => {
    autoRotate: boolean;
    autoRotateSpeed: number;
    enableDamping?: boolean;
    dampingFactor?: number;
    target?: { x: number; y: number; z: number };
  };
};

type MoveDir = 'w' | 'a' | 's' | 'd' | 'up' | 'down';

const MOVE_SPEED = 280;
const _forward = new Vector3();
const _right = new Vector3();
const _move = new Vector3();
const _worldUp = new Vector3(0, 1, 0);

const WASD_KEYS = [
  { dir: 'w', label: 'W', phone: '前', title: '往前', className: 'wasd-w' },
  { dir: 'a', label: 'A', phone: '左', title: '往左', className: 'wasd-a' },
  { dir: 's', label: 'S', phone: '後', title: '往後', className: 'wasd-s' },
  { dir: 'd', label: 'D', phone: '右', title: '往右', className: 'wasd-d' },
  { dir: 'up', label: '上', phone: '上', title: '往上', className: 'wasd-up' },
  { dir: 'down', label: '下', phone: '下', title: '往下', className: 'wasd-down' },
] as const;

const HOME_RADIAL = { x: 0, y: 540, z: 980 };
const HOME_TREE = { x: 0, y: 220, z: 1120 };
const HOME_FORCE = { x: 0, y: 240, z: 760 };
const LOOK_ORIGIN = { x: 0, y: 0, z: 0 };

function homeCameraForMode(mode: LayoutMode): Point3D {
  if (mode === 'tree') return HOME_TREE;
  if (mode === 'force') return HOME_FORCE;
  return HOME_RADIAL;
}

function moveDirFromCode(code: string): MoveDir | null {
  switch (code) {
    case 'KeyW':
      return 'w';
    case 'KeyA':
      return 'a';
    case 'KeyS':
      return 's';
    case 'KeyD':
      return 'd';
    case 'KeyC':
      return 'down';
    default:
      return null;
  }
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea')) return true;
  const editable = target.closest('[contenteditable]');
  return editable instanceof HTMLElement && editable.isContentEditable;
}

function orbitTarget(api: GraphApi): { x: number; y: number; z: number } | null {
  try {
    const target = api.controls()?.target;
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number' || typeof target.z !== 'number') {
      return null;
    }
    return target;
  } catch {
    return null;
  }
}

function translateView(
  camera: Camera,
  target: { x: number; y: number; z: number },
  forwardAxis: number,
  strafeAxis: number,
  verticalAxis: number,
  distance: number,
): void {
  _move.set(0, 0, 0);

  if (forwardAxis !== 0 || strafeAxis !== 0) {
    camera.getWorldDirection(_forward);
    _forward.y = 0;
    if (_forward.lengthSq() < 1e-6) {
      const elements = camera.matrixWorld.elements;
      _forward.set(elements[4], 0, elements[6]);
    }
    if (_forward.lengthSq() >= 1e-6) {
      _forward.normalize();
      _right.crossVectors(_forward, _worldUp);
      if (_right.lengthSq() >= 1e-6) {
        _right.normalize();
        if (forwardAxis !== 0) _move.addScaledVector(_forward, forwardAxis);
        if (strafeAxis !== 0) _move.addScaledVector(_right, strafeAxis);
      }
    }
  }

  if (verticalAxis !== 0) _move.y += verticalAxis;

  const length = _move.length();
  if (length < 1e-6) return;
  const scale = distance / length;
  const dx = _move.x * scale;
  const dy = _move.y * scale;
  const dz = _move.z * scale;
  camera.position.x += dx;
  camera.position.y += dy;
  camera.position.z += dz;
  target.x += dx;
  target.y += dy;
  target.z += dz;
}

function asApi(value: unknown): GraphApi | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<GraphApi>;
  if (
    typeof candidate.cameraPosition !== 'function' ||
    typeof candidate.scene !== 'function' ||
    typeof candidate.d3Force !== 'function' ||
    typeof candidate.refresh !== 'function'
  ) {
    return null;
  }
  return candidate as GraphApi;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function relationOf(link: object): string {
  const relation = (link as { relation?: unknown }).relation;
  return typeof relation === 'string' ? relation : '';
}

function gatheredSpokeVisible(link: object, centerId: string): boolean {
  const srcId = endpointId((link as { source?: unknown }).source);
  const dstId = endpointId((link as { target?: unknown }).target);
  if (!srcId || !dstId || srcId === dstId) return false;
  return srcId === centerId || dstId === centerId;
}

function withAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

type BoundGraphLink = {
  source: GraphNode;
  target: GraphNode;
  relation: string;
};

/**
 * Pure helper that filters out dangling edges and clones each link with live node references
 * so ForceGraph3D / d3-force never mutates caller arrays or throws "node not found".
 */
function buildSafeGraphModel(nodes: GraphNode[], rawLinks: readonly GraphLink[]) {
  const index = indexNodes(nodes);
  const safeLinks: BoundGraphLink[] = [];
  const normalizedLinks: GraphLink[] = [];

  for (const link of rawLinks) {
    const sourceId = endpointId(link.source);
    const targetId = endpointId(link.target);
    const source = index.byId.get(sourceId);
    const target = index.byId.get(targetId);
    if (!source || !target) continue;
    const relation = typeof link.relation === 'string' ? link.relation : '';
    safeLinks.push({ source, target, relation });
    normalizedLinks.push({ source: sourceId, target: targetId, relation });
  }

  const neighbors = buildNeighborMap(normalizedLinks);
  return {
    data: { nodes, links: safeLinks },
    index,
    neighbors,
  };
}

function flyTo(
  api: GraphApi,
  node: GraphNode,
  byId: ReadonlyMap<string, GraphNode>,
  childrenMap: ReadonlyMap<string, string[]>,
  neighborsMap: ReadonlyMap<string, Neighbor[]>,
  layoutMode: LayoutMode,
): void {
  const x = node.x ?? node.homeX ?? 0;
  const y = node.y ?? node.homeY ?? 0;
  const z = node.z ?? node.homeZ ?? 0;

  if (node.type === 'root') {
    api.cameraPosition(homeCameraForMode(layoutMode), LOOK_ORIGIN, 950);
    return;
  }

  let lookX = x;
  let lookY = y;
  let lookZ = z;
  if (node.type === 'category' || node.type === 'pillar') {
    const childIds = childrenMap.get(node.id) ?? [];
    if (childIds.length > 0) {
      let sx = x;
      let sy = y;
      let sz = z;
      let count = 1;
      for (const cid of childIds) {
        const k = byId.get(cid);
        if (!k) continue;
        sx += k.x ?? k.homeX ?? x;
        sy += k.y ?? k.homeY ?? y;
        sz += k.z ?? k.homeZ ?? z;
        count += 1;
      }
      lookX = x * 0.5 + (sx / count) * 0.5;
      lookY = y * 0.5 + (sy / count) * 0.5;
      lookZ = z * 0.5 + (sz / count) * 0.5;
    }
  } else if (node.type === 'protocol') {
    const nbrs = neighborsMap.get(node.id) ?? [];
    if (nbrs.length > 0) {
      let sx = x;
      let sy = y;
      let sz = z;
      let count = 1;
      for (const n of nbrs.slice(0, 5)) {
        const target = byId.get(n.id);
        if (target) {
          sx += target.x ?? target.homeX ?? x;
          sy += target.y ?? target.homeY ?? y;
          sz += target.z ?? target.homeZ ?? z;
          count += 1;
        }
      }
      lookX = x * 0.78 + (sx / count) * 0.22;
      lookY = y * 0.78 + (sy / count) * 0.22;
      lookZ = z * 0.78 + (sz / count) * 0.22;
    }
  }

  if (layoutMode === 'tree') {
    const distZ = node.type === 'protocol' ? 145 : node.type === 'category' ? 245 : 440;
    const liftY = node.type === 'protocol' ? 38 : node.type === 'category' ? 78 : 135;
    api.cameraPosition(
      { x: lookX, y: lookY + liftY, z: lookZ + distZ },
      { x: lookX, y: lookY, z: lookZ },
      920,
    );
    return;
  }

  const flat = Math.hypot(lookX, lookZ) || 1;
  const outward = node.type === 'protocol' ? 120 : node.type === 'category' ? 215 : 365;
  const side = node.type === 'protocol' ? 36 : node.type === 'category' ? 62 : 92;
  const lift = node.type === 'protocol' ? 48 : node.type === 'category' ? 96 : 172;

  api.cameraPosition(
    {
      x: lookX + (lookX / flat) * outward + (-lookZ / flat) * side,
      y: lookY + lift,
      z: lookZ + (lookZ / flat) * outward + (lookX / flat) * side,
    },
    { x: lookX, y: lookY, z: lookZ },
    920,
  );
}

/** Right detail panel clearance. Distance follows the outermost gather ring. */
const GATHER_DETAIL_PANEL_PX = 390;

function flyToGatheredCluster(api: GraphApi, center: Point3D, outerRadius: number): void {
  const cam = typeof api.camera === 'function' ? api.camera() : null;
  cam?.up.set(0, 1, 0);

  const fov =
    cam && 'fov' in cam && typeof (cam as { fov?: unknown }).fov === 'number' ? (cam as { fov: number }).fov : 50;
  const aspectRaw =
    cam && 'aspect' in cam && typeof (cam as { aspect?: unknown }).aspect === 'number'
      ? (cam as { aspect: number }).aspect
      : 1.6;
  const aspect = aspectRaw > 0.4 ? aspectRaw : 1.6;
  const tanHalf = Math.tan(((fov * Math.PI) / 180) / 2);
  const safeTan = tanHalf > 0.05 ? tanHalf : 0.4663;
  const viewWidth = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1440;
  const panelFraction = Math.min(0.46, GATHER_DETAIL_PANEL_PX / viewWidth);
  const usableAspect = aspect * (1 - panelFraction);
  const widthBoost = usableAspect < 1.5 ? 1.5 / Math.max(usableAspect, 0.75) : 1;
  const dist = Math.min(520, Math.max(76, (Math.max(outerRadius, 26) * 1.08 * widthBoost) / safeTan));
  const visibleWidth = 2 * dist * safeTan * aspect;
  const shift = (GATHER_DETAIL_PANEL_PX / 2 / viewWidth) * visibleWidth;

  api.cameraPosition(
    { x: center.x + shift, y: center.y, z: center.z + dist },
    { x: center.x + shift, y: center.y, z: center.z },
    560,
  );
}

type KnowledgeGraphProps = {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedId: string | null;
  pillarId: string | null;
  searchHitIds: string[];
  layoutMode: LayoutMode;
  theme: ThemeMode;
  showSemantic: boolean;
  showAllLabels: boolean;
  gathered?: boolean;
  nodeLocked?: boolean;
  navigationSuspended?: boolean;
  visibleIds?: ReadonlySet<string> | null;
  onSceneReady?: () => void;
  onLayoutProgress?: (ratio: number) => void;
  onLayoutReady?: () => void;
  onSelect: (id: string | null) => void;
};

const KnowledgeGraphView = forwardRef<GraphHandle, KnowledgeGraphProps>(function KnowledgeGraphView(
  {
    nodes,
    links,
    selectedId,
    pillarId,
    searchHitIds,
    layoutMode,
    theme,
    showSemantic,
    showAllLabels,
    gathered = false,
    nodeLocked = true,
    navigationSuspended = false,
    visibleIds = null,
    onSceneReady,
    onLayoutProgress,
    onLayoutReady,
    onSelect,
  },
  ref,
) {
  const fgRef = useRef<unknown>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const keyHeld = useRef<Record<MoveDir, boolean>>({
    w: false,
    a: false,
    s: false,
    d: false,
    up: false,
    down: false,
  });
  const pointerHeld = useRef<Record<MoveDir, boolean>>({
    w: false,
    a: false,
    s: false,
    d: false,
    up: false,
    down: false,
  });
  const navigationSuspendedRef = useRef(navigationSuspended);
  navigationSuspendedRef.current = navigationSuspended;
  const onSceneReadyRef = useRef(onSceneReady);
  onSceneReadyRef.current = onSceneReady;
  const onLayoutProgressRef = useRef(onLayoutProgress);
  onLayoutProgressRef.current = onLayoutProgress;
  const onLayoutReadyRef = useRef(onLayoutReady);
  onLayoutReadyRef.current = onLayoutReady;
  const layoutNotified = useRef(false);
  const layoutTicks = useRef(0);
  const records = useRef<Map<string, NodeVisual>>(new Map());
  const stageRef = useRef<AmbientStage | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const linksRef = useRef(links);
  linksRef.current = links;
  const isFirstLayout = useRef(true);
  const visibleIdsRef = useRef<ReadonlySet<string> | null>(visibleIds);
  visibleIdsRef.current = visibleIds;
  const layoutBudgetRef = useRef(layoutMode === 'force' ? 36 : 14);
  layoutBudgetRef.current = layoutMode === 'force' ? 36 : 14;
  const basePositionsRef = useRef<Map<string, Point3D>>(new Map());
  const wasGatheredRef = useRef(false);
  const gatherTweenRafRef = useRef(0);
  const savedCameraRef = useRef<{ position: Point3D; lookAt: Point3D; up: Point3D } | null>(null);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [padHost, setPadHost] = useState<HTMLElement | null>(null);
  const [padPressed, setPadPressed] = useState<Record<MoveDir, boolean>>({
    w: false,
    a: false,
    s: false,
    d: false,
    up: false,
    down: false,
  });
  const [layoutArmed, setLayoutArmed] = useState(false);
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  useEffect(() => {
    const map = records.current;
    return () => {
      if (gatherTweenRafRef.current) {
        window.cancelAnimationFrame(gatherTweenRafRef.current);
        gatherTweenRafRef.current = 0;
      }
      disposeNodeRecords(map);
    };
  }, []);

  useEffect(() => {
    if (nodeLocked) {
      setHoveredId(null);
      if (!wasGatheredRef.current && gatherTweenRafRef.current === 0 && !isFirstLayout.current) {
        for (const node of nodesRef.current) {
          if (node.x !== undefined && node.y !== undefined && node.z !== undefined) {
            node.fx = node.x;
            node.fy = node.y;
            node.fz = node.z;
            node.vx = 0;
            node.vy = 0;
            node.vz = 0;
          }
        }
      }
      return;
    }

    if (!wasGatheredRef.current && gatherTweenRafRef.current === 0) {
      const rootNode = nodesRef.current.find((n) => n.type === 'root');
      for (const node of nodesRef.current) {
        if (stateRef.current.layoutMode === 'radial' && rootNode && node.id === rootNode.id) {
          continue;
        }
        node.fx = undefined;
        node.fy = undefined;
        node.fz = undefined;
      }
      asApi(fgRef.current)?.d3ReheatSimulation?.();
    }
  }, [nodeLocked]);

  useEffect(() => {
    if (!visibleIds) return;
    setHoveredId((current) => (current && !visibleIds.has(current) ? null : current));
  }, [visibleIds]);

  const model = useMemo(() => buildSafeGraphModel(nodes, links), [nodes, links]);
  const indexRef = useRef(model.index);
  indexRef.current = model.index;

  const hoveredInView = hoveredId && (!visibleIds || visibleIds.has(hoveredId)) ? hoveredId : null;
  const effectiveHoveredId = nodeLocked ? null : hoveredInView;

  const emphasis = useMemo(() => {
    if (gathered && selectedId && model.index.byId.has(selectedId)) {
      const set = new Set<string>([selectedId]);
      for (const n of model.neighbors.get(selectedId) ?? []) {
        set.add(n.id);
      }
      return set;
    }
    return emphasisIds(
      model.index,
      model.neighbors,
      selectedId,
      effectiveHoveredId,
      pillarId,
      searchHitIds,
    );
  }, [gathered, model.index, model.neighbors, selectedId, effectiveHoveredId, pillarId, searchHitIds]);

  const focusId = gathered && selectedId ? selectedId : (effectiveHoveredId ?? selectedId);
  const stateRef = useRef({
    showSemantic,
    focusId,
    selectedId,
    hoveredId: effectiveHoveredId,
    pillarId,
    theme,
    layoutMode,
    emphasis,
    nodeLocked,
    gathered,
  });
  stateRef.current = {
    showSemantic,
    focusId,
    selectedId,
    hoveredId: effectiveHoveredId,
    pillarId,
    theme,
    layoutMode,
    emphasis,
    nodeLocked,
    gathered,
  };

  useImperativeHandle(ref, () => ({
    focusNode: (id: string) => {
      const api = asApi(fgRef.current);
      const node = indexRef.current.byId.get(id);
      if (!api || !node) return;
      if (stateRef.current.gathered && stateRef.current.selectedId === id) {
        const layout = computeGatheredTargets(
          id,
          basePositionsRef.current,
          indexRef.current.byId,
          model.neighbors,
          visibleIdsRef.current,
        );
        const center = layout.targets.get(id) ?? {
          x: node.x ?? node.homeX ?? 0,
          y: node.y ?? node.homeY ?? 0,
          z: node.z ?? node.homeZ ?? 0,
        };
        flyToGatheredCluster(api, center, layout.outerRadius);
        return;
      }
      flyTo(api, node, indexRef.current.byId, indexRef.current.children, model.neighbors, layoutMode);
    },
    resetView: () => {
      const api = asApi(fgRef.current);
      if (!api) return;
      savedCameraRef.current = null;
      const cam = typeof api.camera === 'function' ? api.camera() : null;
      cam?.up.set(0, 1, 0);
      api.cameraPosition(homeCameraForMode(layoutMode), LOOK_ORIGIN, 900);
    },
  }));

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!navigationSuspended) return;
    keyHeld.current.w = false;
    keyHeld.current.a = false;
    keyHeld.current.s = false;
    keyHeld.current.d = false;
    keyHeld.current.up = false;
    keyHeld.current.down = false;
    pointerHeld.current.w = false;
    pointerHeld.current.a = false;
    pointerHeld.current.s = false;
    pointerHeld.current.d = false;
    pointerHeld.current.up = false;
    pointerHeld.current.down = false;
    setPadPressed({ w: false, a: false, s: false, d: false, up: false, down: false });
  }, [navigationSuspended]);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let attempts = 0;
    const watch = () => {
      if (cancelled) return;
      const api = asApi(fgRef.current);
      let ready = false;
      try {
        ready = !!api?.scene();
      } catch {
        ready = false;
      }
      if (ready) {
        raf = window.requestAnimationFrame(() => {
          if (!cancelled) onSceneReadyRef.current?.();
        });
        return;
      }
      attempts += 1;
      if (attempts > 180) {
        onSceneReadyRef.current?.();
        return;
      }
      raf = window.requestAnimationFrame(watch);
    };
    raf = window.requestAnimationFrame(watch);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, []);

  useLayoutEffect(() => {
    const host = shellRef.current?.closest('.app');
    if (host instanceof HTMLElement) setPadHost(host);
  }, []);

  useEffect(() => {
    const held = keyHeld.current;
    const clearKeys = () => {
      held.w = false;
      held.a = false;
      held.s = false;
      held.d = false;
      held.up = false;
      held.down = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        navigationSuspendedRef.current ||
        event.isComposing ||
        isTextEntry(event.target) ||
        isTextEntry(document.activeElement)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const code = event.code;
      if (code === 'Space') {
        held.up = true;
        event.preventDefault();
        return;
      }

      const dir = moveDirFromCode(code);
      if (!dir) return;
      held[dir] = true;
      event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') held.up = false;
      const dir = moveDirFromCode(event.code);
      if (dir) held[dir] = false;
    };
    const onFocusIn = (event: FocusEvent) => {
      if (isTextEntry(event.target)) clearKeys();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('focusin', onFocusIn);
      clearKeys();
    };
  }, []);

  useEffect(() => {
    const api = asApi(fgRef.current);
    if (!api) return;
    try {
      const controls = api.controls();
      if (controls) {
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.autoRotate = false;
        controls.autoRotateSpeed = 0.22;
      }
    } catch {
      // ignore if controls not ready yet
    }
  }, []);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    let last = start;

    const releasePointers = () => {
      pointerHeld.current.w = false;
      pointerHeld.current.a = false;
      pointerHeld.current.s = false;
      pointerHeld.current.d = false;
      pointerHeld.current.up = false;
      pointerHeld.current.down = false;
      setPadPressed((prev) =>
        prev.w || prev.a || prev.s || prev.d || prev.up || prev.down
          ? { w: false, a: false, s: false, d: false, up: false, down: false }
          : prev,
      );
    };

    const animate = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;

      if (typeof document !== 'undefined' && document.hidden) {
        raf = window.requestAnimationFrame(animate);
        return;
      }

      const api = asApi(fgRef.current);
      if (api) {
        const allowKeys = !navigationSuspendedRef.current && !isTextEntry(document.activeElement);
        const keys = keyHeld.current;
        const pointers = pointerHeld.current;
        const forward =
          (pointers.w || (allowKeys && keys.w) ? 1 : 0) -
          (pointers.s || (allowKeys && keys.s) ? 1 : 0);
        const strafe =
          (pointers.d || (allowKeys && keys.d) ? 1 : 0) -
          (pointers.a || (allowKeys && keys.a) ? 1 : 0);
        const vertical =
          (pointers.up || (allowKeys && keys.up) ? 1 : 0) -
          (pointers.down || (allowKeys && keys.down) ? 1 : 0);

        if (!navigationSuspendedRef.current && (forward !== 0 || strafe !== 0 || vertical !== 0) && dt > 0) {
          const camera = typeof api.camera === 'function' ? api.camera() : null;
          const target = orbitTarget(api);
          if (camera && target) translateView(camera, target, forward, strafe, vertical, MOVE_SPEED * dt);
        }

        if (!stageRef.current || stageRef.current.theme !== stateRef.current.theme) {
          stageRef.current = ensureAmbientStage(api.scene(), stateRef.current.theme);
        }
        const elapsedSec = (now - start) * 0.001;
        const cam = typeof api.camera === 'function' ? api.camera() : undefined;
        const radarVisible = stateRef.current.layoutMode === 'radial' && !stateRef.current.gathered;
        stageRef.current.update(
          elapsedSec,
          cam,
          records.current,
          stateRef.current.selectedId,
          stateRef.current.hoveredId,
          radarVisible,
        );
      }
      raf = window.requestAnimationFrame(animate);
    };

    window.addEventListener('blur', releasePointers);
    raf = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('blur', releasePointers);
      releasePointers();
    };
  }, []);

  const startPositionTween = useCallback(
    (targets: ReadonlyMap<string, Point3D>, durationMs: number, keepPinnedWhenDone: boolean) => {
      const api = asApi(fgRef.current);
      if (!api) return;

      if (gatherTweenRafRef.current) {
        window.cancelAnimationFrame(gatherTweenRafRef.current);
        gatherTweenRafRef.current = 0;
      }

      const startPositions = new Map<string, Point3D>();
      for (const node of nodesRef.current) {
        startPositions.set(node.id, {
          x: node.x ?? node.homeX ?? 0,
          y: node.y ?? node.homeY ?? 0,
          z: node.z ?? node.homeZ ?? 0,
        });
      }

      const startTime = performance.now();

      const stepTween = (now: number) => {
        const rawT = Math.min(1, Math.max(0, (now - startTime) / durationMs));
        const ease = 1 - Math.pow(1 - rawT, 3);

        for (const node of nodesRef.current) {
          const start = startPositions.get(node.id);
          const end = targets.get(node.id);
          if (!start || !end) continue;
          const nx = start.x + (end.x - start.x) * ease;
          const ny = start.y + (end.y - start.y) * ease;
          const nz = start.z + (end.z - start.z) * ease;
          node.x = nx;
          node.y = ny;
          node.z = nz;
          node.fx = nx;
          node.fy = ny;
          node.fz = nz;
          node.vx = 0;
          node.vy = 0;
          node.vz = 0;
        }

        api.d3ReheatSimulation?.();

        if (rawT < 1) {
          gatherTweenRafRef.current = window.requestAnimationFrame(stepTween);
        } else {
          gatherTweenRafRef.current = 0;
          if (!keepPinnedWhenDone && !stateRef.current.nodeLocked) {
            const rootNode = nodesRef.current.find((n) => n.type === 'root');
            for (const node of nodesRef.current) {
              if (stateRef.current.layoutMode === 'radial' && rootNode && node.id === rootNode.id) {
                continue;
              }
              node.fx = undefined;
              node.fy = undefined;
              node.fz = undefined;
            }
          }
        }
      };

      gatherTweenRafRef.current = window.requestAnimationFrame(stepTween);
    },
    [],
  );

  useLayoutEffect(() => {
    const api = asApi(fgRef.current);
    if (!api) return;
    wasGatheredRef.current = false;
    savedCameraRef.current = null;
    stageRef.current = ensureAmbientStage(api.scene(), theme);

    const snapImmediate = isFirstLayout.current;
    isFirstLayout.current = false;

    // Preserve current rendered coordinates before computing new home coordinates
    const prevCoords = new Map<string, Point3D>();
    if (!snapImmediate) {
      for (const node of nodesRef.current) {
        prevCoords.set(node.id, {
          x: node.x ?? node.homeX ?? 0,
          y: node.y ?? node.homeY ?? 0,
          z: node.z ?? node.homeZ ?? 0,
        });
      }
    }

    computeLayout(nodesRef.current, layoutMode, snapImmediate, linksRef.current);

    // Snapshot home coordinates into basePositionsRef right away
    const nextTargets = new Map<string, Point3D>();
    basePositionsRef.current.clear();
    for (const node of nodesRef.current) {
      const target = {
        x: node.homeX ?? node.x ?? 0,
        y: node.homeY ?? node.y ?? 0,
        z: node.homeZ ?? node.z ?? 0,
      };
      basePositionsRef.current.set(node.id, target);
      nextTargets.set(node.id, target);
      if (!snapImmediate) {
        const prev = prevCoords.get(node.id);
        if (prev) {
          node.x = prev.x;
          node.y = prev.y;
          node.z = prev.z;
        }
      }
    }

    // Both seeded ('radial', 'tree') and 3D constellation ('force') precompute exact 3D home coordinates
    // in computeLayout, so we disable d3's O(N log N) charge repulsion and link pull to prevent fighting tweens.
    const linkForce = api.d3Force('link') as {
      strength?: (value: number) => unknown;
    } | null;
    api.d3Force('charge', null);
    linkForce?.strength?.(0);

    const center = api.d3Force('center') as { strength?: (value: number) => unknown } | null;
    center?.strength?.(0);

    const pull = 0.85;
    api.d3Force('home', (alpha: number) => {
      const gain = pull * Math.max(alpha, 0.16);
      for (const node of nodesRef.current) {
        if (node.fx !== undefined) continue;
        const x = node.homeX;
        const y = node.homeY;
        const z = node.homeZ;
        if (x === undefined || y === undefined || z === undefined) continue;
        const dx = x - (node.x ?? 0);
        const dy = y - (node.y ?? 0);
        const dz = z - (node.z ?? 0);
        if (dx * dx + dy * dy + dz * dz < 0.25) continue;
        node.vx = (node.vx ?? 0) + dx * gain;
        node.vy = (node.vy ?? 0) + dy * gain;
        node.vz = (node.vz ?? 0) + dz * gain;
      }
    });

    const cam = typeof api.camera === 'function' ? api.camera() : null;
    cam?.up.set(0, 1, 0);
    api.cameraPosition(homeCameraForMode(layoutMode), LOOK_ORIGIN, snapImmediate ? 850 : 720);

    if (snapImmediate) {
      api.d3ReheatSimulation?.();
    } else {
      startPositionTween(nextTargets, 520, false);
    }
  }, [layoutMode, startPositionTween]);

  useEffect(() => {
    const api = asApi(fgRef.current);
    if (!api) return;
    stageRef.current = ensureAmbientStage(api.scene(), theme);
  }, [theme]);

  // Smooth 60FPS gather & restore position tweening
  useEffect(() => {
    const api = asApi(fgRef.current);
    if (!api) return;

    const shouldGather = Boolean(gathered && selectedId && model.index.byId.has(selectedId));
    if (!shouldGather && !wasGatheredRef.current) return;

    // Snapshot original base positions and camera state before entering gather mode from normal state.
    // Only snapshot live node.x/y/z if no tween is currently in flight; otherwise use homeX/Y/Z.
    if (shouldGather && !wasGatheredRef.current) {
      const inFlight = gatherTweenRafRef.current !== 0;
      for (const node of nodesRef.current) {
        basePositionsRef.current.set(node.id, {
          x: (inFlight ? node.homeX : node.x) ?? node.homeX ?? 0,
          y: (inFlight ? node.homeY : node.y) ?? node.homeY ?? 0,
          z: (inFlight ? node.homeZ : node.z) ?? node.homeZ ?? 0,
        });
      }
      const cam = typeof api.camera === 'function' ? api.camera() : null;
      const target = orbitTarget(api) ?? LOOK_ORIGIN;
      if (cam) {
        savedCameraRef.current = {
          position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
          lookAt: { x: target.x, y: target.y, z: target.z },
          up: { x: cam.up.x, y: cam.up.y, z: cam.up.z },
        };
      }
    }

    const gatheredLayout =
      shouldGather && selectedId
        ? computeGatheredTargets(
            selectedId,
            basePositionsRef.current,
            model.index.byId,
            model.neighbors,
            visibleIds,
          )
        : null;
    const targets = gatheredLayout ? gatheredLayout.targets : basePositionsRef.current;

    const exitingGather = !shouldGather && wasGatheredRef.current;
    wasGatheredRef.current = shouldGather;

    if (shouldGather && selectedId && gatheredLayout) {
      const centerTarget = gatheredLayout.targets.get(selectedId);
      if (centerTarget) {
        flyToGatheredCluster(api, centerTarget, gatheredLayout.outerRadius);
      }
    } else if (exitingGather && savedCameraRef.current) {
      const saved = savedCameraRef.current;
      savedCameraRef.current = null;
      const cam = typeof api.camera === 'function' ? api.camera() : null;
      cam?.up.set(saved.up.x, saved.up.y, saved.up.z);
      api.cameraPosition(saved.position, saved.lookAt, 600);
    }

    startPositionTween(targets, 500, shouldGather);
  }, [gathered, selectedId, visibleIds, model.index.byId, model.neighbors, startPositionTween]);

  useLayoutEffect(() => {
    const ids = visibleIdsRef.current;
    for (const rec of records.current.values()) {
      rec.group.visible = !ids || ids.has(rec.id);
    }
  }, [visibleIds]);

  useEffect(() => {
    const hits = new Set(searchHitIds);
    applyVisuals(
      records.current,
      emphasis,
      selectedId,
      effectiveHoveredId,
      (id) => {
        const node = indexRef.current.byId.get(id);
        if (!node) return false;
        return protocolLabelVisible(
          node,
          indexRef.current.byId,
          model.neighbors,
          selectedId,
          effectiveHoveredId,
          hits,
          showAllLabels,
        );
      },
      visibleIds,
      gathered,
    );
  }, [emphasis, selectedId, effectiveHoveredId, searchHitIds, showAllLabels, theme, model.neighbors, visibleIds, gathered]);

  const renderNodeObject = useCallback(
    (node: object) => {
      const item = node as GraphNode;
      const childCount = indexRef.current.children.get(item.id)?.length ?? 0;
      const obj = createMindMapNode(item, records.current, theme, childCount);
      const ids = visibleIdsRef.current;
      if (ids && !ids.has(item.id)) obj.visible = false;
      const emp = stateRef.current.emphasis;
      const active = !emp || emp.has(item.id);
      const isSelected = item.id === stateRef.current.selectedId;
      const isHovered = item.id === stateRef.current.hoveredId;
      const rec = records.current.get(item.id);
      if (rec) {
        rec.dot.opacity = active ? 1 : 0.14;
        rec.ringMesh.visible = isSelected || isHovered;
        rec.pulseMesh.visible = isSelected || isHovered;
      }
      return obj;
    },
    [theme],
  );

  // Depends on focusId so three-forcegraph cleanly updates active link widths & particles on selection/hover
  const linkHot = useCallback(
    (link: object) => {
      if (!focusId) return false;
      return (
        endpointId((link as { source?: unknown }).source) === focusId ||
        endpointId((link as { target?: unknown }).target) === focusId
      );
    },
    [focusId],
  );

  const linkInEmphasis = useCallback(
    (link: object) => {
      if (!emphasis) return true;
      const src = endpointId((link as { source?: unknown }).source);
      const dst = endpointId((link as { target?: unknown }).target);
      return emphasis.has(src) && emphasis.has(dst);
    },
    [emphasis],
  );

  const linkVisibility = useCallback(
    (link: object) => {
      if (visibleIds) {
        const src = endpointId((link as { source?: unknown }).source);
        const dst = endpointId((link as { target?: unknown }).target);
        if (!visibleIds.has(src) || !visibleIds.has(dst)) return false;
      }
      if (gathered && selectedId) return gatheredSpokeVisible(link, selectedId);
      const relation = relationOf(link);
      if (relation === 'child-of') return true;
      return showSemantic || linkHot(link);
    },
    [visibleIds, gathered, selectedId, showSemantic, linkHot],
  );

  // Straight lines (0) in 2D gather mode or for parent-child hierarchy; subtle 0.08 arc for 3D semantic links
  const linkCurvature = useCallback(
    (link: object) => {
      if (gathered && selectedId) return 0;
      return relationOf(link) === 'child-of' ? 0 : 0.08;
    },
    [gathered, selectedId],
  );

  // Native 1px THREE.Line (width = 0) in 2D gather mode and by default; 1.4 width only in 3D mode for active links
  const linkWidth = useCallback(
    (link: object) => {
      if (gathered && selectedId) return 0;
      return linkHot(link) ? 1.4 : 0;
    },
    [gathered, selectedId, linkHot],
  );

  // Directional energy particles only on active links directly connected to focusId
  const linkParticles = useCallback(
    (link: object) => {
      if (!linkHot(link)) return 0;
      if (gathered && selectedId) return 1;
      return relationOf(link) === 'child-of' ? 2 : 3;
    },
    [gathered, selectedId, linkHot],
  );

  const linkParticleWidth = useCallback(
    () => (gathered && selectedId ? 1.0 : 1.8),
    [gathered, selectedId],
  );

  const linkParticleSpeed = useCallback(() => 0.01, []);

  const linkParticleColor = useCallback((link: object) => {
    const rel = relationOf(link);
    if (rel === 'child-of') {
      const srcId = endpointId((link as { source?: unknown }).source);
      const srcNode = indexRef.current.byId.get(srcId);
      return srcNode ? groupColor(srcNode.group, stateRef.current.theme) : '#38bdf8';
    }
    return relationColor(rel, stateRef.current.theme);
  }, []);

  const linkColor = useCallback(
    (link: object) => {
      const relation = relationOf(link);
      const isChild = relation === 'child-of';
      const hot = linkHot(link);
      const inEmp = linkInEmphasis(link);

      let baseColor: string;
      if (isChild) {
        const srcId = endpointId((link as { source?: unknown }).source);
        const srcNode = indexRef.current.byId.get(srcId);
        baseColor = srcNode
          ? groupColor(srcNode.group, theme)
          : theme === 'light'
            ? '#64748b'
            : '#94a3b8';
      } else {
        baseColor = relationColor(relation, theme);
      }

      // 1. Direct 1st-degree connections of selected/hovered node
      if (hot) {
        if (gathered && selectedId) return withAlpha(baseColor, 0.52);
        return withAlpha(baseColor, 0.9);
      }

      // 2. When a node is selected/hovered, dim background links to 0.04 (keep ancestor/subtree hierarchy softly visible)
      if (focusId) {
        if (isChild && inEmp) {
          return withAlpha(baseColor, theme === 'light' ? 0.22 : 0.18);
        }
        return withAlpha(baseColor, 0.04);
      }

      // 3. When a pillar/search filter is active, fade out non-matching links
      if (emphasis && !inEmp) {
        return withAlpha(baseColor, 0.04);
      }

      // 4. Default unselected state: clear 1px hierarchy lines (0.28~0.35) & whisper-quiet semantic threads (0.07~0.10)
      if (isChild) {
        return withAlpha(baseColor, theme === 'light' ? 0.35 : 0.32);
      }
      return withAlpha(baseColor, theme === 'light' ? 0.1 : 0.08);
    },
    [theme, focusId, emphasis, linkHot, linkInEmphasis, gathered, selectedId],
  );

  const handleEngineTick = useCallback(() => {
    if (layoutNotified.current) return;
    layoutTicks.current += 1;
    if (layoutTicks.current % 2 !== 0) return;
    onLayoutProgressRef.current?.(Math.min(1, layoutTicks.current / layoutBudgetRef.current));
  }, []);

  const handleEngineStop = useCallback(() => {
    const api = asApi(fgRef.current);
    api?.d3AlphaTarget?.(0);
    if (!wasGatheredRef.current && gatherTweenRafRef.current === 0) {
      for (const node of nodesRef.current) {
        if (node.x !== undefined && node.y !== undefined && node.z !== undefined) {
          basePositionsRef.current.set(node.id, {
            x: node.x,
            y: node.y,
            z: node.z,
          });
        }
      }
    }
    if (stateRef.current.nodeLocked && gatherTweenRafRef.current === 0) {
      for (const node of nodesRef.current) {
        if (node.x !== undefined && node.y !== undefined && node.z !== undefined) {
          node.fx = node.x;
          node.fy = node.y;
          node.fz = node.z;
          node.vx = 0;
          node.vy = 0;
          node.vz = 0;
        }
      }
    }
    startLogoBackfill();
    setLayoutArmed(true);
    if (!layoutNotified.current) {
      layoutNotified.current = true;
      onLayoutReadyRef.current?.();
    }
  }, []);

  const bgColor = AMBIENT_PALETTE[theme].bg;

  const setPointerDir = (dir: MoveDir, down: boolean) => {
    pointerHeld.current[dir] = down;
    setPadPressed((prev) => (prev[dir] === down ? prev : { ...prev, [dir]: down }));
  };

  return (
    <div className="graph-canvas" ref={shellRef}>
      <ForceGraph3D
        ref={fgRef as never}
        width={size.width}
        height={size.height}
        graphData={model.data}
        backgroundColor={bgColor}
        showNavInfo={false}
        controlType="orbit"
        enableNavigationControls={!navigationSuspended}
        enableNodeDrag={!nodeLocked && !navigationSuspended}
        enablePointerInteraction={!navigationSuspended}
        warmupTicks={0}
        cooldownTicks={layoutMode === 'force' ? 36 : layoutArmed ? 48 : 14}
        cooldownTime={layoutMode === 'force' ? 2200 : 480}
        d3AlphaDecay={layoutMode === 'force' ? 0.08 : 0.22}
        d3VelocityDecay={0.5}
        onEngineTick={handleEngineTick}
        onEngineStop={handleEngineStop}
        rendererConfig={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        nodeThreeObject={renderNodeObject}
        nodeLabel={(node: object) => {
          if (stateRef.current.nodeLocked) return '';
          const item = node as GraphNode;
          const title = formatNodeDisplayText(item);
          const childCount = model.index.children.get(item.id)?.length ?? 0;
          let roleHtml = '';
          if (item.type === 'root') {
            roleHtml = '<span class="tip-badge tip-root">🌐 生態核心</span>';
          } else if (item.type === 'pillar') {
            roleHtml = `<span class="tip-badge tip-pillar">🏛️ 核心領域 · 涵蓋 ${childCount} 大賽道</span>`;
          } else if (item.type === 'category') {
            roleHtml = `<span class="tip-badge tip-category">📂 賽道分類 ${categoryIcon(item)} · ▸ ${childCount} 個項目</span>`;
          } else {
            const entity = getProtocolRoleBadge(item);
            roleHtml = `<span class="tip-badge tip-protocol">${escapeHtml(entity.label)}</span>`;
          }
          const rawSummary = item.summaryZh ?? '';
          const summary = rawSummary
            ? `<p>${escapeHtml(rawSummary.length > 88 ? `${rawSummary.slice(0, 88)}…` : rawSummary)}</p>`
            : '';
          return `<div class="node-tip">${roleHtml}<b>${escapeHtml(title)}</b>${summary}</div>`;
        }}
        onNodeClick={(node: object) => {
          const item = node as GraphNode;
          const ids = visibleIdsRef.current;
          if (ids && !ids.has(item.id)) return;
          onSelect(item.id);
          if (!stateRef.current.nodeLocked && !stateRef.current.gathered) {
            const api = asApi(fgRef.current);
            if (api) {
              flyTo(
                api,
                item,
                indexRef.current.byId,
                indexRef.current.children,
                model.neighbors,
                layoutMode,
              );
            }
          }
        }}
        onNodeHover={
          nodeLocked
            ? undefined
            : (node: object | null) => {
                const item = node as GraphNode | null;
                const nextId = item?.id ?? null;
                setHoveredId((prev) => (prev === nextId ? prev : nextId));
              }
        }
        onBackgroundClick={() => {
          setHoveredId(null);
          onSelect(null);
        }}
        linkVisibility={linkVisibility}
        linkCurvature={linkCurvature}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={1}
        linkLabel={(link: object) => {
          if (stateRef.current.nodeLocked) return '';
          const rel = relationOf(link);
          return `<div class="node-tip"><b>${escapeHtml(relationLabel(rel))}</b></div>`;
        }}
        linkDirectionalParticles={linkParticles}
        linkDirectionalParticleWidth={linkParticleWidth}
        linkDirectionalParticleSpeed={linkParticleSpeed}
        linkDirectionalParticleColor={linkParticleColor}
      />
      {padHost
        ? createPortal(
            <div className={`wasd-pad${selectedId ? ' is-beside-detail' : ''}`} role="group" aria-label="鏡頭移動">
              {WASD_KEYS.map(({ dir, label, phone, title, className }) => (
                <button
                  key={dir}
                  type="button"
                  className={`wasd-key ${className}${padPressed[dir] ? ' is-held' : ''}`}
                  title={title}
                  aria-label={title}
                  onContextMenu={(event) => event.preventDefault()}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setPointerDir(dir, true);
                  }}
                  onPointerUp={() => setPointerDir(dir, false)}
                  onPointerCancel={() => setPointerDir(dir, false)}
                  onLostPointerCapture={() => setPointerDir(dir, false)}
                  onPointerLeave={(event) => {
                    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                      setPointerDir(dir, false);
                    }
                  }}
                >
                  <span className="wasd-label-desk">{label}</span>
                  <span className="wasd-label-phone">{phone}</span>
                </button>
              ))}
            </div>,
            padHost,
          )
        : null}
    </div>
  );
});

class GraphErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="graph-empty" role="alert">
          <p>圖載入失敗，請重新整理</p>
        </div>
      );
    }
    return this.props.children;
  }
}

const KnowledgeGraph = forwardRef<GraphHandle, KnowledgeGraphProps>(function KnowledgeGraph(props, ref) {
  return (
    <GraphErrorBoundary>
      <KnowledgeGraphView {...props} ref={ref} />
    </GraphErrorBoundary>
  );
});

export default KnowledgeGraph;
