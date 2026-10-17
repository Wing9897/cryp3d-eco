import type { GraphLink, GraphNode, KnowledgeGraph } from '../types';

export type Neighbor = {
  id: string;
  relation: string;
  direction: 'out' | 'in';
};

export function indexNodes(nodes: GraphNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parent) continue;
    const list = children.get(node.parent) ?? [];
    list.push(node.id);
    children.set(node.parent, list);
  }
  return { byId, children };
}

export function subtreeIds(children: Map<string, string[]>, rootId: string): Set<string> {
  const kept = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || kept.has(id)) continue;
    kept.add(id);
    for (const child of children.get(id) ?? []) stack.push(child);
  }
  return kept;
}

export function ancestorChain(byId: Map<string, GraphNode>, id: string): GraphNode[] {
  const chain: GraphNode[] = [];
  let current = byId.get(id);
  const guard = new Set<string>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    chain.push(current);
    current = current.parent ? byId.get(current.parent) : undefined;
  }
  return chain.reverse();
}

export function endpointId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') return value.id;
  return '';
}

export function buildNeighborMap(links: GraphLink[]): Map<string, Neighbor[]> {
  const map = new Map<string, Neighbor[]>();
  const add = (id: string, item: Neighbor) => {
    const list = map.get(id) ?? [];
    list.push(item);
    map.set(id, list);
  };
  for (const link of links) {
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    if (!source || !target) continue;
    add(source, { id: target, relation: link.relation, direction: 'out' });
    add(target, { id: source, relation: link.relation, direction: 'in' });
  }
  return map;
}

export type NodeIndex = ReturnType<typeof indexNodes>;

export type GraphView = {
  graph: KnowledgeGraph;
  index: NodeIndex;
  neighbors: Map<string, Neighbor[]>;
  pillarIds: string[];
  pillarMembers: Map<string, Set<string>>;
  searchHay: { id: string; hay: string }[];
  ids: Set<string>;
};

/** Chain / domain indexes built once per graph, not during render. */
export function buildGraphView(graph: KnowledgeGraph): GraphView {
  const index = indexNodes(graph.nodes);
  const neighbors = buildNeighborMap(graph.links);
  const pillarIds: string[] = [];
  const searchHay: { id: string; hay: string }[] = [];
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    ids.add(node.id);
    if (node.type === 'pillar') pillarIds.push(node.id);
    searchHay.push({
      id: node.id,
      hay: [node.label, node.labelZh, node.summaryZh ?? '', node.id].join('\n').toLowerCase(),
    });
  }
  const pillarMembers = new Map<string, Set<string>>();
  for (const id of pillarIds) pillarMembers.set(id, subtreeIds(index.children, id));
  return { graph, index, neighbors, pillarIds, pillarMembers, searchHay, ids };
}

export function emphasisIds(
  index: NodeIndex,
  neighbors: Map<string, Neighbor[]>,
  selectedId: string | null,
  hoveredId: string | null,
  pillarId: string | null,
  searchHitIds: readonly string[],
): Set<string> | null {
  const { byId, children } = index;
  const around = (id: string) => {
    const set = new Set<string>([id]);
    for (const item of neighbors.get(id) ?? []) set.add(item.id);
    const node = byId.get(id);
    if (node?.type === 'category' || node?.type === 'pillar') {
      for (const child of subtreeIds(children, id)) set.add(child);
    }
    for (const anc of ancestorChain(byId, id)) set.add(anc.id);
    return set;
  };

  if (hoveredId && byId.has(hoveredId)) return around(hoveredId);
  if (searchHitIds.length > 0) {
    const set = selectedId && byId.has(selectedId) ? around(selectedId) : new Set<string>();
    for (const id of searchHitIds) {
      set.add(id);
      for (const node of ancestorChain(byId, id)) set.add(node.id);
    }
    return set;
  }
  if (selectedId && byId.has(selectedId)) return around(selectedId);
  if (pillarId && byId.has(pillarId)) {
    const set = subtreeIds(children, pillarId);
    for (const node of byId.values()) {
      if (node.type === 'root') set.add(node.id);
    }
    return set;
  }
  return null;
}

export function protocolLabelVisible(
  node: GraphNode,
  byId: Map<string, GraphNode>,
  neighbors: Map<string, Neighbor[]>,
  selectedId: string | null,
  hoveredId: string | null,
  searchHitIds: ReadonlySet<string>,
  showAllLabels = true,
): boolean {
  if (node.type !== 'protocol') return true;
  if (showAllLabels) return true;
  if (node.id === hoveredId || node.id === selectedId) return true;
  if (searchHitIds.has(node.id)) return true;
  const focusId = hoveredId ?? selectedId;
  if (!focusId) return false;
  const focus = byId.get(focusId);
  if (!focus) return false;
  if ((focus.type === 'category' || focus.type === 'pillar') && node.parent === focus.id) return true;
  return (neighbors.get(focusId) ?? []).some((item) => item.id === node.id);
}
