import { memo, useMemo } from 'react';
import type { GraphNode, KnowledgeGraph, ThemeMode } from '../types';
import { EVM_CHAIN_FILTERS, type EvmChainId } from '../data/filterGraph';
import {
  categoryIcon,
  getProtocolRoleBadge,
  groupColor,
  groupLabel,
  isRedundantBilingual,
  pillarIcon,
  relationColor,
  relationLabel,
  typeLabel,
} from '../graph/palette';
import {
  ancestorChain,
  buildNeighborMap,
  indexNodes,
  type Neighbor,
  type NodeIndex,
} from '../graph/tree';
import NodeLogoBadge from './NodeLogoBadge';

type DetailCardProps = {
  graph: KnowledgeGraph;
  index?: NodeIndex;
  neighbors?: Map<string, Neighbor[]>;
  selected: GraphNode;
  theme?: ThemeMode;
  gathered?: boolean;
  evmChain?: EvmChainId | null;
  onSelectEvmChain?: (chain: EvmChainId | null) => void;
  onToggleGather?: () => void;
  onFocus: (id: string) => void;
  onFlyToNode?: (id: string) => void;
  onClose: () => void;
};

const SECTIONS: {
  title: string;
  relation: string;
  match: (relation: string, direction: 'out' | 'in') => boolean;
}[] = [
  {
    title: '所屬賽道 / 子項目',
    relation: 'child-of',
    match: (relation, direction) => relation === 'child-of' && direction === 'in',
  },
  {
    title: '🏷️ 跨賽道歸屬 (Multi-Category)',
    relation: 'also-in',
    match: (relation) => relation === 'also-in',
  },
  {
    title: '所屬上層分類',
    relation: 'child-of',
    match: (relation, direction) => relation === 'child-of' && direction === 'out',
  },
  {
    title: '💧 路由流動性至',
    relation: 'routes-liquidity',
    match: (relation) => relation === 'routes-liquidity',
  },
  {
    title: '🔗 生態整合與串接',
    relation: 'integrates',
    match: (relation) => relation === 'integrates',
  },
  {
    title: '🔮 採用預言機餵價',
    relation: 'uses-oracle',
    match: (relation) => relation === 'uses-oracle',
  },
  {
    title: '👛 錢包原生支援',
    relation: 'wallet-support',
    match: (relation) => relation === 'wallet-support',
  },
  {
    title: '🧱 建構於底層',
    relation: 'built-on',
    match: (relation) => relation === 'built-on',
  },
  {
    title: '⚡ 底層技術驅動',
    relation: 'powers',
    match: (relation) => relation === 'powers',
  },
  {
    title: '📋 上架與資產支援',
    relation: 'lists',
    match: (relation) => relation === 'lists',
  },
  {
    title: '⚔️ 同賽道競爭',
    relation: 'competes',
    match: (relation) => relation === 'competes',
  },
];

function safeUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

const DetailCard = memo(function DetailCard({
  graph,
  index: providedIndex,
  neighbors: providedNeighbors,
  selected,
  theme = 'dark',
  gathered = false,
  evmChain = null,
  onSelectEvmChain,
  onToggleGather,
  onFocus,
  onFlyToNode,
  onClose,
}: DetailCardProps) {
  const { byId, neighbors } = useMemo(
    () => ({
      byId: (providedIndex ?? indexNodes(graph.nodes)).byId,
      neighbors: providedNeighbors ?? buildNeighborMap(graph.links),
    }),
    [graph, providedIndex, providedNeighbors],
  );

  const crumbs = useMemo(() => ancestorChain(byId, selected.id), [byId, selected.id]);
  const related = useMemo(() => neighbors.get(selected.id) ?? [], [neighbors, selected.id]);
  const url = useMemo(() => safeUrl(selected.url), [selected.url]);
  const accent = groupColor(selected.group, theme);
  const entityBadge = useMemo(
    () => (selected.type === 'protocol' ? getProtocolRoleBadge(selected) : null),
    [selected],
  );

  // Primary parent category & prominent cross-category ('also-in') memberships
  const parentNode = useMemo(
    () => (selected.parent ? byId.get(selected.parent) ?? null : null),
    [byId, selected.parent],
  );

  const crossNodes = useMemo(() => {
    const items = related.filter((item) => item.relation === 'also-in');
    const result: GraphNode[] = [];
    for (const item of items) {
      const node = byId.get(item.id);
      if (node) result.push(node);
    }
    return result;
  }, [related, byId]);

  const primaryTitle =
    selected.type === 'category' ? selected.labelZh || selected.label : selected.label;
  const secondarySubtitle =
    selected.type === 'category'
      ? !isRedundantBilingual(selected.label, selected.labelZh)
        ? selected.label
        : null
      : !isRedundantBilingual(selected.label, selected.labelZh)
        ? selected.labelZh
        : null;

  return (
    <aside
      className="detail-panel"
      aria-label="節點詳細資訊"
      style={{ '--detail-accent': accent } as React.CSSProperties}
    >
      <div className="sheet-grabber" aria-hidden="true" />
      <div className="detail-top">
        <nav className="crumbs" aria-label="階層路徑">
          {crumbs.map((node, index) => (
            <span key={node.id}>
              {index > 0 ? <em> › </em> : null}
              <button type="button" onClick={() => onFocus(node.id)}>
                {node.type === 'category'
                  ? `📂 ${node.labelZh || node.label}`
                  : !isRedundantBilingual(node.label, node.labelZh)
                    ? `${node.label} (${node.labelZh})`
                    : node.label}
              </button>
            </span>
          ))}
        </nav>
        <button
          type="button"
          className="close-btn icon-only-btn"
          onClick={onClose}
          aria-label="關閉詳情面板 (Esc)"
          title="關閉詳情面板 (Esc)"
        >
          <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Keyed by selected.id so switching nodes triggers a subtle stagger fade-in transition */}
      <div key={selected.id} className="detail-body-transition">
        <div className="detail-header stagger-1">
          <div className="badge-row">
            <span
              className="domain-badge"
              style={{
                color: accent,
                borderColor: accent,
              }}
            >
              <i className="dot" style={{ background: accent }} />
              {groupLabel(selected.group)}
            </span>

            {selected.type === 'category' ? (
              <span className="type-badge type-badge-category">
                📂 賽道分類 {categoryIcon(selected)}
              </span>
            ) : selected.type === 'pillar' ? (
              <span className="type-badge type-badge-pillar">
                {pillarIcon(selected.id)} 核心領域
              </span>
            ) : selected.type === 'protocol' && entityBadge ? (
              <span className="type-badge type-badge-protocol">{entityBadge.label}</span>
            ) : (
              <span className="type-badge">{typeLabel(selected.type)}</span>
            )}
          </div>

          <div className="detail-identity-row">
            {selected.type === 'protocol' ? (
              <NodeLogoBadge node={selected} size={44} />
            ) : selected.type === 'category' ? (
              <span className="detail-tier-avatar cat-avatar" aria-hidden="true">
                {categoryIcon(selected)}
              </span>
            ) : (
              <span className="detail-tier-avatar pillar-avatar" aria-hidden="true">
                {pillarIcon(selected.id)}
              </span>
            )}

            <div className="detail-title-block">
              <h2>{primaryTitle}</h2>
              {secondarySubtitle ? <p className="subtitle-zh">{secondarySubtitle}</p> : null}
            </div>

            {onToggleGather ? (
              <button
                type="button"
                className={gathered ? 'fly-node-btn icon-only-btn is-active' : 'fly-node-btn icon-only-btn'}
                onClick={onToggleGather}
                aria-pressed={gathered}
                title={gathered ? '還原節點原位 (快捷鍵 G)' : '聚攏關聯節點 (快捷鍵 G)'}
                aria-label={gathered ? '還原節點原位 (快捷鍵 G)' : '聚攏關聯節點 (快捷鍵 G)'}
              >
                {gathered ? (
                  <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                    <path
                      d="M9 9L4.5 4.5M4.5 4.5H8.5M4.5 4.5V8.5M15 9l4.5-4.5M19.5 4.5H15.5M19.5 4.5V8.5M9 15l-4.5 4.5M4.5 19.5H8.5M4.5 19.5V15.5M15 15l4.5 4.5M19.5 19.5H15.5M19.5 19.5V15.5"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                ) : (
                  <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="2.6" fill="currentColor" />
                    <path
                      d="M4.5 4.5L9.2 9.2M9.2 9.2H5.8M9.2 9.2V5.8M19.5 4.5L14.8 9.2M14.8 9.2H18.2M14.8 9.2V5.8M4.5 19.5L9.2 14.8M9.2 14.8H5.8M9.2 14.8V18.2M19.5 19.5L14.8 14.8M14.8 14.8H18.2M14.8 14.8V18.2"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                )}
              </button>
            ) : null}

            {onFlyToNode ? (
              <button
                type="button"
                className="fly-node-btn icon-only-btn"
                onClick={() => onFlyToNode(selected.id)}
                title="鏡頭對焦此節點"
                aria-label="鏡頭對焦此節點"
              >
                <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.9" fill="none" />
                  <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                  <path
                    d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : null}
          </div>

          {/* Prominent Sector & Cross-Sector (also-in) Banner right at the top */}
          {(parentNode && selected.type === 'protocol') ||
          crossNodes.length > 0 ||
          (selected.chains && selected.chains.length > 0) ? (
            <div className="sector-affiliation-box">
              {parentNode && selected.type === 'protocol' ? (
                <div className="sector-row">
                  <span className="sector-row-label">主屬賽道：</span>
                  <button
                    type="button"
                    className="sector-chip primary-sector-chip"
                    onClick={() => onFocus(parentNode.id)}
                  >
                    <span>{categoryIcon(parentNode)}</span>
                    <span>{parentNode.labelZh || parentNode.label}</span>
                  </button>
                </div>
              ) : null}

              {crossNodes.length > 0 ? (
                <div className="sector-row">
                  <span className="sector-row-label">
                    {selected.type === 'category' ? '🏷️ 跨賽道項目：' : '🏷️ 同時屬於：'}
                  </span>
                  <div className="sector-chip-list">
                    {crossNodes.map((cNode) => (
                      <button
                        key={cNode.id}
                        type="button"
                        className="sector-chip cross-sector-chip"
                        onClick={() => onFocus(cNode.id)}
                        title="點擊切換至此跨賽道節點"
                      >
                        <span>
                          {cNode.type === 'category'
                            ? categoryIcon(cNode)
                            : getProtocolRoleBadge(cNode).icon}
                        </span>
                        <span>
                          {cNode.type === 'category'
                            ? cNode.labelZh || cNode.label
                            : cNode.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {selected.chains && selected.chains.length > 0 ? (
                <div className="sector-row">
                  <span className="sector-row-label">🌐 部署網路：</span>
                  <div className="sector-chip-list">
                    {EVM_CHAIN_FILTERS.filter((item) =>
                      selected.chains?.some((c) => c.toLowerCase() === item.id),
                    ).map((item) => {
                      const active = evmChain === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="sector-chip cross-sector-chip"
                          aria-pressed={active}
                          onClick={() => onSelectEvmChain?.(active ? null : item.id)}
                          title={active ? '點擊顯示全部 EVM 鏈' : `點擊篩選 ${item.label} 生態`}
                        >
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <p className="detail-summary stagger-2">{selected.summaryZh || '尚無中文摘要。'}</p>

        {(selected.tags ?? []).length > 0 ? (
          <ul className="detail-tags stagger-2">
            {(selected.tags ?? []).map((tag) => (
              <li key={tag}>#{tag}</li>
            ))}
          </ul>
        ) : null}

        {url ? (
          <a
            className="official-link stagger-2"
            href={url}
            target="_blank"
            rel="noreferrer noopener"
          >
            <span>前往官方網站</span>
            <small>{url.replace(/^https?:\/\//, '')} ↗</small>
          </a>
        ) : null}

        <div className="detail-relations stagger-3">
          {SECTIONS.map((section) => {
            const items = related.filter(
              (item) => section.match(item.relation, item.direction) && byId.has(item.id),
            );
            if (items.length === 0) return null;
            const relColor = relationColor(section.relation, theme);

            return (
              <section key={section.title} className="rel-section">
                <h3>
                  <span className="rel-bar" style={{ background: relColor }} />
                  <span>{section.title}</span>
                  <em>{items.length}</em>
                </h3>
                <ul className="rel-grid">
                  {items.map((item) => {
                    const node = byId.get(item.id);
                    if (!node) return null;
                    const isProto = node.type === 'protocol';
                    const isCat = node.type === 'category';
                    const protoBadge = isProto ? getProtocolRoleBadge(node) : null;
                    const cardMainTitle = isCat ? node.labelZh || node.label : node.label;
                    const cardSubTitle = isCat
                      ? !isRedundantBilingual(node.label, node.labelZh)
                        ? node.label
                        : null
                      : !isRedundantBilingual(node.label, node.labelZh)
                        ? node.labelZh
                        : null;

                    return (
                      <li key={`${section.title}-${item.direction}-${item.id}`}>
                        <button
                          type="button"
                          className="rel-card"
                          onClick={() => onFocus(node.id)}
                        >
                          <div className="rel-card-head">
                            {isProto ? (
                              <NodeLogoBadge node={node} size={20} />
                            ) : isCat ? (
                              <span className="rel-cat-icon" aria-hidden="true">
                                {categoryIcon(node)}
                              </span>
                            ) : (
                              <span className="rel-cat-icon" aria-hidden="true">
                                {pillarIcon(node.id)}
                              </span>
                            )}
                            <b>{cardMainTitle}</b>
                            {isCat ? (
                              <span className="rel-role-tag cat">📂 賽道分類</span>
                            ) : protoBadge ? (
                              <span className="rel-role-tag proto">{protoBadge.shortLabel}</span>
                            ) : null}
                            {item.relation !== 'child-of' ? (
                              <span className="rel-dir">
                                {item.direction === 'out' ? '→' : '←'} {relationLabel(item.relation)}
                              </span>
                            ) : (
                              <span className="rel-arrow">→</span>
                            )}
                          </div>
                          {cardSubTitle ? <small>{cardSubTitle}</small> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </aside>
  );
});

export default DetailCard;
