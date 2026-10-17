import type { DomainFile, GraphLink, GraphNode, KnowledgeGraph } from '../types';
import { seedLayout } from '../graph/layout';

export type ChainId = 'solana' | 'evm';

export type ChainProfile = {
  id: ChainId;
  name: string;
  title: string;
  directoryTitle: string;
  faviconDomain: string;
};

export const CHAINS: readonly ChainProfile[] = [
  {
    id: 'solana',
    name: 'Solana',
    title: 'Solana 生態腦圖',
    directoryTitle: 'Solana 生態階層目錄',
    faviconDomain: 'solana.com',
  },
  {
    id: 'evm',
    name: 'EVM',
    title: 'EVM 生態腦圖',
    directoryTitle: 'EVM 生態階層目錄',
    faviconDomain: 'ethereum.org',
  },
];

const solanaModules = import.meta.glob('../../data/*.json', { eager: true });
const evmModules = import.meta.glob('../../data/evm/*.json', { eager: true });

export function chainProfile(id: ChainId): ChainProfile {
  return CHAINS.find((chain) => chain.id === id) ?? CHAINS[0];
}

export function findRootNode(nodes: readonly GraphNode[]): GraphNode | null {
  return nodes.find((node) => node.type === 'root') ?? null;
}

function readModule(mod: unknown): unknown {
  if (mod && typeof mod === 'object' && 'default' in mod) {
    return (mod as { default: unknown }).default;
  }
  return mod;
}

function isDomainFile(value: unknown): value is DomainFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<DomainFile>;
  return Array.isArray(file.nodes) && Array.isArray(file.links);
}

function isNode(value: unknown): value is GraphNode {
  if (!value || typeof value !== 'object') return false;
  const node = value as Partial<GraphNode>;
  return typeof node.id === 'string' && node.id.length > 0;
}

function isLink(value: unknown): value is GraphLink {
  if (!value || typeof value !== 'object') return false;
  const link = value as Partial<GraphLink>;
  return (
    typeof link.source === 'string' &&
    link.source.length > 0 &&
    typeof link.target === 'string' &&
    link.target.length > 0 &&
    typeof link.relation === 'string' &&
    link.relation.length > 0
  );
}

export function orderDataPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => {
    const rank = (path: string) => (path.replaceAll('\\', '/').endsWith('/core.json') ? 0 : 1);
    const byRank = rank(a) - rank(b);
    return byRank !== 0 ? byRank : a.localeCompare(b);
  });
}

export function mergeDomainFiles(files: DomainFile[]): KnowledgeGraph {
  const nodes: GraphNode[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    for (const candidate of file.nodes ?? []) {
      if (!isNode(candidate) || seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      nodes.push({
        ...candidate,
        tags: candidate.tags ? [...candidate.tags] : undefined,
        chains: candidate.chains ? [...candidate.chains] : undefined,
        x: undefined,
        y: undefined,
        z: undefined,
        vx: undefined,
        vy: undefined,
        vz: undefined,
        fx: undefined,
        fy: undefined,
        fz: undefined,
        homeX: undefined,
        homeY: undefined,
        homeZ: undefined,
      });
    }
  }

  const ids = new Set(nodes.map((node) => node.id));
  const links: GraphLink[] = [];
  const linkSeen = new Set<string>();

  const push = (link: GraphLink) => {
    if (!isLink(link)) return;
    if (link.source === link.target) return;
    if (!ids.has(link.source) || !ids.has(link.target)) return;
    const key = `${link.source}|${link.target}|${link.relation}`;
    if (linkSeen.has(key)) return;
    linkSeen.add(key);
    links.push({ source: link.source, target: link.target, relation: link.relation });
  };

  for (const node of nodes) {
    if (typeof node.parent === 'string' && node.parent.length > 0) {
      push({ source: node.id, target: node.parent, relation: 'child-of' });
    }
  }

  for (const file of files) {
    for (const link of file.links ?? []) push(link);
  }

  return { nodes, links };
}

export function loadGraph(chain: ChainId): KnowledgeGraph {
  const modules = chain === 'evm' ? evmModules : solanaModules;
  const paths = orderDataPaths(Object.keys(modules));
  const files = paths.map((path) => readModule(modules[path])).filter(isDomainFile);
  const graph = mergeDomainFiles(files);
  if (graph.nodes.length > 0) seedLayout(graph.nodes);
  return graph;
}
