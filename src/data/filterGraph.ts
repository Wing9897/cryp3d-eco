import type { GraphNode, KnowledgeGraph } from '../types';
import { indexNodes } from '../graph/tree';
import { findRootNode } from './loadGraph';

export const EVM_CHAIN_FILTERS = [
  { id: 'ethereum', label: 'Ethereum' },
  { id: 'bnb', label: 'BNB Chain' },
  { id: 'base', label: 'Base' },
  { id: 'arbitrum', label: 'Arbitrum' },
] as const;

export type EvmChainId = (typeof EVM_CHAIN_FILTERS)[number]['id'];

function protocolShownOnEvmChain(node: GraphNode, chainId: EvmChainId): boolean {
  const listed = node.chains;
  if (!Array.isArray(listed)) return true;
  return listed.some((item) => typeof item === 'string' && item.toLowerCase() === chainId);
}

export function nodeMatches(node: GraphNode, query: string): boolean {
  const haystack = [node.label, node.labelZh, node.summaryZh ?? '', node.id]
    .join('\n')
    .toLowerCase();
  return haystack.includes(query);
}

/** Keep protocols for one EVM network. Untagged protocols stay. Drop empty branches and dangling links. */
export function filterGraphByEvmChain(
  graph: KnowledgeGraph,
  chainId: EvmChainId | null,
): KnowledgeGraph {
  if (!chainId) return graph;

  const { byId } = indexNodes(graph.nodes);
  const keep = new Set<string>();

  for (const node of graph.nodes) {
    if (node.type !== 'protocol' || !protocolShownOnEvmChain(node, chainId)) continue;
    keep.add(node.id);
    let parent = node.parent;
    const guard = new Set<string>([node.id]);
    while (parent && !guard.has(parent)) {
      guard.add(parent);
      const parentNode = byId.get(parent);
      if (!parentNode) break;
      keep.add(parent);
      parent = parentNode.parent;
    }
  }

  const root = findRootNode(graph.nodes);
  if (root && keep.size > 0) keep.add(root.id);

  const children = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (!node.parent || !keep.has(node.id) || !keep.has(node.parent)) continue;
    const list = children.get(node.parent) ?? [];
    list.push(node.id);
    children.set(node.parent, list);
  }

  const hasProtocol = (id: string): boolean => {
    const stack = [...(children.get(id) ?? [])];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || seen.has(current)) continue;
      seen.add(current);
      const child = byId.get(current);
      if (!child || !keep.has(current)) continue;
      if (child.type === 'protocol') return true;
      for (const next of children.get(current) ?? []) stack.push(next);
    }
    return false;
  };

  for (const id of [...keep]) {
    const node = byId.get(id);
    if (!node || node.type === 'protocol' || node.type === 'root') continue;
    if (!hasProtocol(id)) keep.delete(id);
  }

  const nodes = graph.nodes.filter((node) => keep.has(node.id));
  const ids = new Set(nodes.map((node) => node.id));
  const links = graph.links.filter((link) => ids.has(link.source) && ids.has(link.target));
  return { nodes, links };
}
