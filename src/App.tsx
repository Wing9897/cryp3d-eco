import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import BootScreen, { type BootPhase } from './components/BootScreen';
import ClusterNav from './components/ClusterNav';
import DetailCard from './components/DetailCard';
import KnowledgeGraph, { type GraphHandle } from './components/KnowledgeGraph';
import StatusBar from './components/StatusBar';
import TopDock from './components/TopDock';
import { filterGraphByEvmChain, type EvmChainId } from './data/filterGraph';
import { chainProfile, findRootNode, loadGraph, type ChainId } from './data/loadGraph';
import { extractDomain } from './graph/palette';
import { buildGraphView, type GraphView } from './graph/tree';
import type { GraphNode, LayoutMode, ThemeMode } from './types';

const NO_HITS: string[] = [];
const VALID_EVM_CHAINS = new Set<EvmChainId>(['ethereum', 'bnb', 'base', 'arbitrum']);
const VALID_LAYOUTS = new Set<LayoutMode>(['radial', 'tree', 'force']);

function readInitialUrlState(): {
  chain: ChainId;
  evmChain: EvmChainId | null;
  pillarId: string | null;
  selectedId: string | null;
  layoutMode: LayoutMode;
  theme: ThemeMode;
} {
  if (typeof window === 'undefined') {
    return {
      chain: 'solana',
      evmChain: null,
      pillarId: null,
      selectedId: null,
      layoutMode: 'radial',
      theme: 'dark',
    };
  }
  const params = new URLSearchParams(window.location.search);
  const rawChain = params.get('chain');
  const chain: ChainId = rawChain === 'evm' ? 'evm' : 'solana';
  const rawSub = params.get('subchain') as EvmChainId | null;
  const evmChain = chain === 'evm' && rawSub && VALID_EVM_CHAINS.has(rawSub) ? rawSub : null;
  const pillarId = params.get('pillar')?.trim() || null;
  const selectedId = params.get('node')?.trim() || null;
  const rawLayout = params.get('layout') as LayoutMode | null;
  const layoutMode: LayoutMode = rawLayout && VALID_LAYOUTS.has(rawLayout) ? rawLayout : 'radial';
  const rawTheme = params.get('theme');
  const theme: ThemeMode = rawTheme === 'light' ? 'light' : 'dark';
  return { chain, evmChain, pillarId, selectedId, layoutMode, theme };
}

/**
 * Dynamically builds a representative tour sequence from the active graph view:
 * root -> each visible pillar -> top 2-3 flagship protocols per pillar (ranked by connectivity & category diversity).
 */
function buildDynamicTourStops(view: GraphView, activePillarId: string | null): string[] {
  const { graph, index, neighbors, pillarIds, pillarMembers } = view;
  const stops: string[] = [];
  const added = new Set<string>();

  const pushStop = (id: string | null | undefined) => {
    if (!id || added.has(id) || !index.byId.has(id)) return;
    added.add(id);
    stops.push(id);
  };

  const root = findRootNode(graph.nodes);
  if (!activePillarId && root) {
    pushStop(root.id);
  }

  const targetPillars =
    activePillarId && pillarIds.includes(activePillarId) ? [activePillarId] : pillarIds;

  const scoreProtocol = (node: GraphNode): number => {
    const rels = neighbors.get(node.id) ?? [];
    let score = rels.length;
    for (const rel of rels) {
      if (rel.relation !== 'child-of') score += 2;
    }
    if (node.url) score += 1;
    return score;
  };

  for (const pid of targetPillars) {
    pushStop(pid);
    const memberIds = pillarMembers.get(pid);
    if (!memberIds) continue;

    const protocols: { node: GraphNode; score: number }[] = [];
    for (const memberId of memberIds) {
      const node = index.byId.get(memberId);
      if (node && node.type === 'protocol') {
        protocols.push({ node, score: scoreProtocol(node) });
      }
    }

    protocols.sort((a, b) => b.score - a.score);

    // Pick up to 3 flagship protocols from distinct categories first for rich coverage
    const usedCategories = new Set<string>();
    const pickedForPillar: string[] = [];

    for (const item of protocols) {
      if (pickedForPillar.length >= 3) break;
      const cat = item.node.parent ?? '';
      if (cat && !usedCategories.has(cat)) {
        usedCategories.add(cat);
        pickedForPillar.push(item.node.id);
      }
    }

    for (const item of protocols) {
      if (pickedForPillar.length >= 3) break;
      if (!pickedForPillar.includes(item.node.id)) {
        pickedForPillar.push(item.node.id);
      }
    }

    for (const protoId of pickedForPillar) {
      pushStop(protoId);
    }
  }

  if (stops.length === 0) {
    return graph.nodes.slice(0, 12).map((n) => n.id);
  }

  return stops;
}

export default function App() {
  const initialUrl = useMemo(readInitialUrlState, []);
  const [chain, setChain] = useState<ChainId>(initialUrl.chain);
  const [evmChain, setEvmChain] = useState<EvmChainId | null>(initialUrl.evmChain);
  const bundles = useMemo(() => {
    const all = buildGraphView(loadGraph(chain));
    const views: {
      all: GraphView;
      ethereum?: GraphView;
      bnb?: GraphView;
      base?: GraphView;
      arbitrum?: GraphView;
    } = { all };
    if (chain === 'evm') {
      views.ethereum = buildGraphView(filterGraphByEvmChain(all.graph, 'ethereum'));
      views.bnb = buildGraphView(filterGraphByEvmChain(all.graph, 'bnb'));
      views.base = buildGraphView(filterGraphByEvmChain(all.graph, 'base'));
      views.arbitrum = buildGraphView(filterGraphByEvmChain(all.graph, 'arbitrum'));
    }
    return views;
  }, [chain]);
  const view = chain === 'evm' && evmChain ? bundles[evmChain] ?? bundles.all : bundles.all;
  const visibleGraph = view.graph;
  const logoDomains = useMemo(() => {
    const domains = new Set<string>([
      'solana.com',
      'ethereum.org',
      'bnbchain.org',
      'base.org',
      'arbitrum.io',
    ]);
    for (const node of visibleGraph.nodes) {
      if (node.type !== 'protocol') continue;
      const domain = extractDomain(node.url, node.id);
      if (domain) domains.add(domain);
    }
    return [...domains];
  }, [visibleGraph]);
  const index = view.index;
  const visibleIds = chain === 'evm' && evmChain ? view.ids : null;
  const rootId = useMemo(() => findRootNode(visibleGraph.nodes)?.id ?? null, [visibleGraph.nodes]);
  const profile = chainProfile(chain);
  const evmPending = chain === 'evm' && bundles.all.graph.nodes.length === 0;

  const [query, setQuery] = useState('');
  const [pillarId, setPillarId] = useState<string | null>(initialUrl.pillarId);
  const [selectedId, setSelectedId] = useState<string | null>(initialUrl.selectedId);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(initialUrl.layoutMode);
  const [theme, setTheme] = useState<ThemeMode>(initialUrl.theme);
  const [showSemantic, setShowSemantic] = useState(true);
  const [showAllLabels, setShowAllLabels] = useState(true);
  const [navOpen, setNavOpen] = useState(true);
  const [tourActive, setTourActive] = useState(false);
  const [gathered, setGathered] = useState(false);
  // Default to true: lock 3D node pointer raycasting, dragging & auto-camera flight to prevent lag
  const [nodeLocked, setNodeLocked] = useState(true);
  const [bootPhase, setBootPhase] = useState<BootPhase>('cover');
  const [bootProgress, setBootProgress] = useState(8);
  const [graphMounted, setGraphMounted] = useState(false);

  const graphRef = useRef<GraphHandle>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const navOpenRef = useRef(navOpen);
  navOpenRef.current = navOpen;
  // Captured only on the false→true gathered edge. Null while not gathered, so a later
  // manual nav toggle is not overwritten and this effect does not need navOpen as a dep.
  const navOpenBeforeGatherRef = useRef<boolean | null>(null);
  const bootGen = useRef(0);
  const armedGen = useRef(0);
  const bootPhaseRef = useRef(bootPhase);
  bootPhaseRef.current = bootPhase;
  const bootActiveRef = useRef(true);
  const bootBlocking = bootPhase !== 'done' && bootPhase !== 'leave';
  bootActiveRef.current = bootBlocking;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const pillarIdRef = useRef(pillarId);
  pillarIdRef.current = pillarId;
  const nodeCountRef = useRef(visibleGraph.nodes.length);
  nodeCountRef.current = visibleGraph.nodes.length;

  const deferredQuery = useDeferredValue(query);

  const searchHitIds = useMemo(() => {
    if (!query.trim()) return NO_HITS;
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return NO_HITS;
    const hits: string[] = [];
    for (const item of view.searchHay) {
      if (item.hay.includes(q)) hits.push(item.id);
    }
    return hits;
  }, [view, query, deferredQuery]);

  // Dynamic tour stops for whichever chain / subchain / pillar is active
  const tourStopIds = useMemo(
    () => buildDynamicTourStops(view, pillarId),
    [view, pillarId],
  );

  const selected = selectedId ? index.byId.get(selectedId) ?? null : null;

  const focusNode = useCallback(
    (id: string) => {
      setTourActive(false);
      setSelectedId(id);
      setPillarId((currentPillar) => {
        if (currentPillar && id !== rootId && !view.pillarMembers.get(currentPillar)?.has(id)) {
          return null;
        }
        return currentPillar;
      });
      if (!gathered) {
        graphRef.current?.focusNode(id);
      }
    },
    [view.pillarMembers, gathered, rootId],
  );

  const flyToNodeExplicit = useCallback((id: string) => {
    setTourActive(false);
    setSelectedId(id);
    graphRef.current?.focusNode(id);
  }, []);

  const handleGraphSelect = useCallback((id: string | null) => {
    setTourActive(false);
    setSelectedId(id);
    if (!id) setGathered(false);
  }, []);

  const choosePillar = useCallback(
    (id: string | null) => {
      setTourActive(false);
      setPillarId(id);
      setSelectedId(id);
      if (!id) setGathered(false);
      if (id) {
        if (!gathered) graphRef.current?.focusNode(id);
      } else {
        graphRef.current?.resetView();
      }
    },
    [gathered],
  );

  const reset = useCallback(() => {
    setTourActive(false);
    setGathered(false);
    setQuery('');
    setPillarId(null);
    setSelectedId(null);
    setEvmChain(null);
    graphRef.current?.resetView();
  }, []);

  const startChainBoot = useCallback((next: ChainId) => {
    bootGen.current += 1;
    setGraphMounted(false);
    setBootPhase('cover');
    setBootProgress(8);
    setChain(next);
  }, []);

  const selectChain = useCallback(
    (next: ChainId) => {
      if (next === chain) return;
      setTourActive(false);
      setGathered(false);
      setQuery('');
      setPillarId(null);
      setSelectedId(null);
      setEvmChain(null);
      startChainBoot(next);
    },
    [chain, startChainBoot],
  );

  const selectEvmChain = useCallback(
    (next: EvmChainId | null) => {
      if (chain !== 'evm') {
        setTourActive(false);
        setGathered(false);
        setQuery('');
        setPillarId(null);
        setSelectedId(null);
        setEvmChain(next);
        startChainBoot('evm');
        return;
      }
      const nextIds = (next ? bundles[next]?.ids : bundles.all.ids) ?? null;
      if (!nextIds) return;
      const selectedNow = selectedIdRef.current;
      const pillarNow = pillarIdRef.current;
      const selectedDropped = !!selectedNow && !nextIds.has(selectedNow);
      const pillarDropped = !!pillarNow && !nextIds.has(pillarNow);
      if (selectedDropped || (pillarDropped && !selectedNow)) {
        graphRef.current?.resetView();
      }
      if (selectedDropped) setGathered(false);
      setEvmChain(next);
      setSelectedId((current) => (current && !nextIds.has(current) ? null : current));
      setPillarId((current) => (current && !nextIds.has(current) ? null : current));
    },
    [bundles, chain, startChainBoot],
  );

  const toggleNav = useCallback(() => {
    setNavOpen((value) => !value);
  }, []);

  const toggleNodeLock = useCallback(() => {
    setNodeLocked((prev) => !prev);
  }, []);

  const toggleGather = useCallback(() => {
    setTourActive(false);
    setGathered((prev) => {
      const next = !prev;
      if (next && !selectedIdRef.current && rootId) {
        setSelectedId(rootId);
      }
      return next;
    });
  }, [rootId]);

  // Collapse the left directory once when entering gathered view, then restore on exit.
  // DetailCard stays open. Manual nav toggles while gathered are left alone.
  useEffect(() => {
    if (gathered) {
      if (navOpenBeforeGatherRef.current === null) {
        navOpenBeforeGatherRef.current = navOpenRef.current;
        setNavOpen(false);
      }
      return;
    }
    if (navOpenBeforeGatherRef.current !== null) {
      const restore = navOpenBeforeGatherRef.current;
      navOpenBeforeGatherRef.current = null;
      setNavOpen(restore);
    }
  }, [gathered]);

  const closeDetail = useCallback(() => {
    setGathered(false);
    setSelectedId(null);
  }, []);

  const tourWasActive = useRef(false);

  const toggleTour = useCallback(() => {
    setTourActive((prev) => {
      const next = !prev;
      if (next) {
        setGathered(false);
        if (tourStopIds.length > 0) setSelectedId(tourStopIds[0]);
      }
      return next;
    });
  }, [tourStopIds]);

  // Focus after gather-exit has restored the saved camera. Doing it here, in the parent
  // effect, runs after KnowledgeGraph's restore and keeps the first stop on screen.
  useEffect(() => {
    const started = tourActive && !tourWasActive.current;
    tourWasActive.current = tourActive;
    if (!started || tourStopIds.length === 0) return;
    graphRef.current?.focusNode(tourStopIds[0]);
  }, [tourActive, tourStopIds]);

  // Auto-tour timer
  useEffect(() => {
    if (!tourActive || tourStopIds.length === 0) return;
    let step = 0;
    const timer = window.setInterval(() => {
      step = (step + 1) % tourStopIds.length;
      const targetId = tourStopIds[step];
      setSelectedId(targetId);
      graphRef.current?.focusNode(targetId);
    }, 3400);
    return () => window.clearInterval(timer);
  }, [tourActive, tourStopIds]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (bootActiveRef.current && event.key !== 'Escape') {
        event.preventDefault();
        return;
      }
      const target = event.target as HTMLElement | null;
      const isInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setNavOpen(true);
        window.requestAnimationFrame(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        });
        return;
      }

      if (event.key === 'Escape') {
        if (isInput && query) {
          setQuery('');
          return;
        }
        if (isInput) {
          target?.blur();
          return;
        }
        setTourActive(false);
        if (gathered) {
          setGathered(false);
        } else if (selectedId) {
          setSelectedId(null);
        } else if (pillarId) {
          setPillarId(null);
          graphRef.current?.resetView();
        }
        return;
      }

      if (isInput) return;

      if (event.key === '/') {
        event.preventDefault();
        setNavOpen(true);
        window.requestAnimationFrame(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        });
      } else if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setNavOpen((prev) => !prev);
      } else if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        toggleTour();
      } else if (event.key.toLowerCase() === 'l') {
        event.preventDefault();
        toggleNodeLock();
      } else if (event.key.toLowerCase() === 'g') {
        event.preventDefault();
        toggleGather();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [query, selectedId, pillarId, gathered, toggleTour, toggleNodeLock, toggleGather]);

  useEffect(() => {
    const gen = ++bootGen.current;
    setGraphMounted(false);
    setBootPhase('cover');
    setBootProgress(8);
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      if (bootGen.current !== gen) return;
      setBootPhase('data');
      setBootProgress(34);
      raf2 = window.requestAnimationFrame(() => {
        if (bootGen.current !== gen) return;
        if (nodeCountRef.current === 0) {
          setBootProgress(100);
          setBootPhase('leave');
          return;
        }
        armedGen.current = gen;
        setGraphMounted(true);
      });
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [chain]);

  useEffect(() => {
    if (!graphMounted) return;
    const gen = bootGen.current;
    const id = window.setTimeout(() => {
      if (bootGen.current !== gen) return;
      const phase = bootPhaseRef.current;
      if (phase !== 'data' && phase !== 'scene' && phase !== 'layout') return;
      setBootProgress(100);
      setBootPhase('leave');
    }, 15000);
    return () => window.clearTimeout(id);
  }, [graphMounted, chain]);

  const finishBoot = useCallback(() => {
    setBootPhase((current) => (current === 'leave' ? 'done' : current));
  }, []);

  const bootIsArmed = useCallback(() => bootGen.current === armedGen.current && armedGen.current !== 0, []);

  const onSceneReady = useCallback(() => {
    if (!bootIsArmed() || bootPhaseRef.current !== 'data') return;
    setBootPhase('scene');
    setBootProgress((value) => Math.max(value, 68));
  }, [bootIsArmed]);

  const onLayoutProgress = useCallback((ratio: number) => {
    if (!bootIsArmed()) return;
    const phase = bootPhaseRef.current;
    if (phase !== 'data' && phase !== 'scene' && phase !== 'layout') return;
    if (phase === 'data' || phase === 'scene') setBootPhase('layout');
    const next = 68 + Math.round(Math.min(1, ratio) * 28);
    setBootProgress((value) => Math.max(value, Math.min(96, next)));
  }, [bootIsArmed]);

  const onLayoutReady = useCallback(() => {
    if (!bootIsArmed()) return;
    const phase = bootPhaseRef.current;
    if (phase !== 'data' && phase !== 'scene' && phase !== 'layout') return;
    setBootProgress(100);
    setBootPhase('leave');
  }, [bootIsArmed]);

  const handleLayoutMode = useCallback((next: LayoutMode) => {
    setGathered(false);
    setLayoutMode(next);
  }, []);

  useEffect(() => {
    if (selectedId && !view.ids.has(selectedId)) {
      setSelectedId(null);
      setGathered(false);
    }
    if (pillarId && !view.ids.has(pillarId)) setPillarId(null);
  }, [view, selectedId, pillarId]);

  // Keep URL query parameters and document.title synchronized with active ecosystem & node state
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const subLabel = chain === 'evm' && evmChain ? ` · ${evmChain.toUpperCase()}` : '';
      document.title = `${profile.title}${subLabel}`;
    }
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (chain !== 'solana') params.set('chain', chain);
    if (chain === 'evm' && evmChain) params.set('subchain', evmChain);
    if (pillarId && view.ids.has(pillarId)) params.set('pillar', pillarId);
    if (selectedId && view.ids.has(selectedId)) params.set('node', selectedId);
    if (layoutMode !== 'radial') params.set('layout', layoutMode);
    if (theme !== 'dark') params.set('theme', theme);
    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, '', nextUrl);
    }
  }, [chain, evmChain, pillarId, selectedId, layoutMode, theme, view.ids]);

  const visiblePillarIds = view.pillarIds;

  return (
    <div className={`app shell theme-${theme}`}>
      <div className="graph-layer">
        {evmPending ? (
          <div className="graph-empty" role="status">
            <p>EVM 資料載入中</p>
          </div>
        ) : graphMounted ? (
          <KnowledgeGraph
            key={chain}
            ref={graphRef}
            nodes={bundles.all.graph.nodes}
            links={bundles.all.graph.links}
            visibleIds={visibleIds}
            selectedId={selectedId}
            pillarId={pillarId}
            searchHitIds={searchHitIds}
            layoutMode={layoutMode}
            theme={theme}
            showSemantic={showSemantic}
            showAllLabels={showAllLabels}
            gathered={gathered}
            nodeLocked={nodeLocked}
            navigationSuspended={bootBlocking}
            onSceneReady={onSceneReady}
            onLayoutProgress={onLayoutProgress}
            onLayoutReady={onLayoutReady}
            onSelect={handleGraphSelect}
          />
        ) : null}
      </div>

      <TopDock
        chain={chain}
        onChain={selectChain}
        evmChain={evmChain}
        onEvmChain={selectEvmChain}
        visiblePillarIds={visiblePillarIds}
        pillarId={pillarId}
        onPillar={choosePillar}
        layoutMode={layoutMode}
        onLayoutMode={handleLayoutMode}
        showSemantic={showSemantic}
        onSemantic={setShowSemantic}
        showAllLabels={showAllLabels}
        onShowAllLabels={setShowAllLabels}
        nodeLocked={nodeLocked}
        onToggleNodeLock={toggleNodeLock}
        gathered={gathered}
        onToggleGather={toggleGather}
        theme={theme}
        onTheme={setTheme}
        onReset={reset}
        nodeCount={visibleGraph.nodes.length}
        linkCount={visibleGraph.links.length}
        tourActive={tourActive}
        onToggleTour={toggleTour}
        logoDomains={logoDomains}
      />

      <ClusterNav
        directoryTitle={profile.directoryTitle}
        nodes={visibleGraph.nodes}
        index={view.index}
        selectedId={selectedId}
        query={query}
        onQuery={setQuery}
        theme={theme}
        open={navOpen}
        onToggle={toggleNav}
        onFocus={focusNode}
        searchInputRef={searchInputRef}
      />

      {selected ? (
        <DetailCard
          graph={visibleGraph}
          index={view.index}
          neighbors={view.neighbors}
          selected={selected}
          theme={theme}
          gathered={gathered}
          evmChain={evmChain}
          onSelectEvmChain={selectEvmChain}
          onToggleGather={toggleGather}
          onFocus={focusNode}
          onFlyToNode={flyToNodeExplicit}
          onClose={closeDetail}
        />
      ) : null}

      <StatusBar graph={visibleGraph} showSemantic={showSemantic} theme={theme} />

      {bootPhase !== 'done' ? (
        <BootScreen
          key={chain}
          title={profile.title}
          phase={bootPhase}
          progress={bootProgress}
          onExited={finishBoot}
        />
      ) : null}
    </div>
  );
}
