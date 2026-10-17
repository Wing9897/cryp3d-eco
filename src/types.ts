export type LayoutMode = 'radial' | 'tree' | 'force';
export type ThemeMode = 'dark' | 'light';

export interface GraphNode {
  id: string;
  label: string;
  labelZh: string;
  type: 'root' | 'pillar' | 'category' | 'protocol' | string;
  parent: string | null;
  group: string;
  summaryZh?: string;
  url?: string;
  tags?: string[];
  /** EVM networks this protocol runs on. Absent means show on every chain filter. */
  chains?: string[];
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  fx?: number;
  fy?: number;
  fz?: number;
  homeX?: number;
  homeY?: number;
  homeZ?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  relation: string;
}

export interface DomainFile {
  domain?: string;
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  links: GraphLink[];
}
