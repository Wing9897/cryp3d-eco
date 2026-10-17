import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { GraphNode, ThemeMode } from '../types';
import { nodeMatches } from '../data/filterGraph';
import { findRootNode } from '../data/loadGraph';
import {
  PILLARS,
  categoryIcon,
  getProtocolRoleBadge,
  groupColor,
  isRedundantBilingual,
  pillarIcon,
} from '../graph/palette';
import { indexNodes, subtreeIds, type NodeIndex } from '../graph/tree';
import NodeLogoBadge from './NodeLogoBadge';

type ClusterNavProps = {
  directoryTitle: string;
  nodes: GraphNode[];
  index?: NodeIndex;
  selectedId: string | null;
  query: string;
  onQuery: (value: string) => void;
  theme: ThemeMode;
  open: boolean;
  onToggle: () => void;
  onFocus: (id: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
};

const ClusterNav = memo(function ClusterNav({
  directoryTitle,
  nodes,
  index: providedIndex,
  selectedId,
  query,
  onQuery,
  theme,
  open,
  onToggle,
  onFocus,
  searchInputRef,
}: ClusterNavProps) {
  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = searchInputRef ?? internalInputRef;
  const asideRef = useRef<HTMLElement | null>(null);

  const {
    byId,
    categoriesByPillar,
    protocolsByCategory,
    pillarProtocolCounts,
    allCategoryIds,
  } = useMemo(() => {
    const { byId: mapById, children } = providedIndex ?? indexNodes(nodes);

    const catMap = new Map<string, GraphNode[]>();
    const protoMap = new Map<string, GraphNode[]>();
    const counts = new Map<string, number>();
    const catIds: string[] = [];

    for (const pillar of PILLARS) {
      catMap.set(pillar.id, []);
      let count = 0;
      for (const nodeId of subtreeIds(children, pillar.id)) {
        if (mapById.get(nodeId)?.type === 'protocol') count += 1;
      }
      counts.set(pillar.id, count);
    }

    for (const node of nodes) {
      if (node.type === 'category' && node.parent) {
        catIds.push(node.id);
        const list = catMap.get(node.parent);
        if (list) list.push(node);
        else catMap.set(node.parent, [node]);
        if (!protoMap.has(node.id)) protoMap.set(node.id, []);
      } else if (node.type === 'protocol' && node.parent) {
        const list = protoMap.get(node.parent);
        if (list) list.push(node);
        else protoMap.set(node.parent, [node]);
      }
    }

    return {
      byId: mapById,
      categoriesByPillar: catMap,
      protocolsByCategory: protoMap,
      pillarProtocolCounts: counts,
      allCategoryIds: catIds,
    };
  }, [nodes, providedIndex]);

  const [expandedPillars, setExpandedPillars] = useState<Set<string>>(
    () => new Set(['defi', 'cefi', 'infrastructure', 'consumer', 'developer']),
  );
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () =>
      new Set([
        'amm',
        'clmm',
        'aggregator',
        'wallet',
        'mobile',
        'payments',
        'card-finance',
        'card-payfi',
      ]),
  );

  // Auto-expand parent pillar and category when a node is selected from 3D graph or DetailCard
  useEffect(() => {
    if (!selectedId) return;
    const node = byId.get(selectedId);
    if (!node) return;

    if (node.type === 'protocol' && node.parent) {
      const cat = byId.get(node.parent);
      setExpandedCategories((prev) => {
        if (prev.has(node.parent!)) return prev;
        const next = new Set(prev);
        next.add(node.parent!);
        return next;
      });
      if (cat?.parent) {
        setExpandedPillars((prev) => {
          if (prev.has(cat.parent!)) return prev;
          const next = new Set(prev);
          next.add(cat.parent!);
          return next;
        });
      }
    } else if (node.type === 'category' && node.parent) {
      setExpandedPillars((prev) => {
        if (prev.has(node.parent!)) return prev;
        const next = new Set(prev);
        next.add(node.parent!);
        return next;
      });
    }

    const timer = window.setTimeout(() => {
      const container = asideRef.current;
      if (!container) return;
      const activeEl = container.querySelector<HTMLElement>(
        '.proto-btn.active, .cat-title.active, .pillar-title.active, .tree-leaf.active',
      );
      activeEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [selectedId, byId]);

  const rootNode = useMemo(() => findRootNode(nodes), [nodes]);
  const rootLabel = rootNode
    ? isRedundantBilingual(rootNode.label, rootNode.labelZh)
      ? rootNode.label
      : `${rootNode.label} · ${rootNode.labelZh}`.trim()
    : '';

  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = query.trim() ? deferredQuery.trim().toLowerCase() : '';

  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    return nodes.filter((node) => nodeMatches(node, normalizedQuery));
  }, [nodes, normalizedQuery]);

  const togglePillar = useCallback((id: string) => {
    setExpandedPillars((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleCategory = useCallback((id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedPillars(new Set(PILLARS.map((p) => p.id)));
    setExpandedCategories(new Set(allCategoryIds));
  }, [allCategoryIds]);

  const collapseCategories = useCallback(() => {
    setExpandedPillars(new Set(PILLARS.map((p) => p.id)));
    setExpandedCategories(new Set());
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedPillars(new Set());
    setExpandedCategories(new Set());
  }, []);

  return (
    <>
      <button
        type="button"
        className={
          open
            ? 'sidebar-collapsed-btn icon-only-btn hidden'
            : 'sidebar-collapsed-btn icon-only-btn'
        }
        onClick={onToggle}
        aria-label="展開生態樹狀目錄 (快捷鍵 B)"
        title={`展開生態樹狀目錄 (${nodes.length} 節點 · 快捷鍵 B)`}
      >
        <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
          <path d="M9 4v16M13 9l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>

      <aside
        ref={asideRef}
        className={open ? 'sidebar is-open' : 'sidebar is-collapsed'}
        aria-label="生態樹狀目錄"
        aria-hidden={!open}
      >
        <div className="sidebar-header">
          <div>
            <strong>{directoryTitle}</strong>
            <small>🏛️ 核心領域 ▸ 📂 賽道分類 ▸ 協議與項目</small>
          </div>
          <button
            type="button"
            className="icon-btn icon-only-btn"
            onClick={onToggle}
            aria-label="收合側邊欄 (快捷鍵 B)"
            title="收合側邊欄 (全螢幕瀏覽 3D 腦圖 · 快捷鍵 B)"
          >
            <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
              <path d="M9 4v16M15 9l-3 3 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </button>
        </div>

        <div className="sidebar-search">
          <span className="search-icon" aria-hidden="true">
            ⌕
          </span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="搜尋賽道、協議或機構 (AMM, Visa, Jupiter, Uniswap)..."
            aria-label="搜尋節點"
          />
          {query ? (
            <button
              type="button"
              className="clear-btn"
              onClick={() => {
                onQuery('');
                inputRef.current?.focus();
              }}
              title="清除搜尋字詞"
              aria-label="清除搜尋字詞"
            >
              <svg className="svg-icon-sm" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          ) : (
            <kbd className="kbd-hint" title="按 / 或 Ctrl+K 快速搜尋">
              /
            </kbd>
          )}
        </div>

        {normalizedQuery ? (
          <div className="sidebar-scroll">
            <div className="search-summary">
              <span>
                找到 <strong>{searchResults.length}</strong> 個符合節點
              </span>
              {searchResults.length > 0 ? <small>點擊定位</small> : null}
            </div>
            <ul className="search-list">
              {searchResults.map((node) => {
                const isProto = node.type === 'protocol';
                const isCat = node.type === 'category';
                const isPillar = node.type === 'pillar';
                const entity = isProto ? getProtocolRoleBadge(node) : null;
                const primaryName = isCat ? node.labelZh || node.label : node.label;
                const subName = isCat
                  ? !isRedundantBilingual(node.label, node.labelZh)
                    ? node.label
                    : null
                  : !isRedundantBilingual(node.label, node.labelZh)
                    ? node.labelZh
                    : null;

                return (
                  <li key={node.id} className="search-item-anim">
                    <button
                      type="button"
                      className={selectedId === node.id ? 'tree-leaf active' : 'tree-leaf'}
                      onClick={() => onFocus(node.id)}
                    >
                      {isProto ? (
                        <NodeLogoBadge node={node} size={20} />
                      ) : isCat ? (
                        <span className="cat-folder-icon" aria-hidden="true">
                          {categoryIcon(node)}
                        </span>
                      ) : (
                        <span className="pillar-glyph-icon" aria-hidden="true">
                          {pillarIcon(node.id)}
                        </span>
                      )}
                      <span className="leaf-main">
                        <b>{primaryName}</b>
                        {subName ? <small>{subName}</small> : null}
                      </span>
                      {isCat ? (
                        <em className="type-tag tag-cat">📂 賽道</em>
                      ) : isPillar ? (
                        <em className="type-tag tag-pillar">🏛️ 領域</em>
                      ) : entity ? (
                        <em className="type-tag tag-proto">{entity.shortLabel}</em>
                      ) : (
                        <em className="type-tag">🌐 核心</em>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <>
            <div className="sidebar-QuickBar">
              <div className="root-and-actions-row">
                {rootNode ? (
                  <button
                    type="button"
                    className={selectedId === rootNode.id ? 'root-btn active' : 'root-btn'}
                    onClick={() => onFocus(rootNode.id)}
                  >
                    <span className="root-globe" aria-hidden="true">
                      🌐
                    </span>
                    <span className="root-label-text">{rootLabel}</span>
                    <em className="root-tag">生態核心</em>
                  </button>
                ) : null}
                <div className="quick-actions" role="group" aria-label="樹狀目錄展開與收合">
                  <button
                    type="button"
                    className="icon-only-btn tree-ctrl-btn"
                    onClick={expandAll}
                    title="展開全部領域與賽道項目"
                    aria-label="展開全部領域與賽道項目"
                  >
                    <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M7 6l5 5 5-5M7 13l5 5 5-5"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="icon-only-btn tree-ctrl-btn"
                    onClick={collapseCategories}
                    title="僅展開核心領域與賽道分類（收合底層項目列表）"
                    aria-label="僅展開核心領域與賽道分類"
                  >
                    <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M4 7h16M4 12h16M4 17h10"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        fill="none"
                      />
                      <circle cx="18" cy="17" r="2" fill="currentColor" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="icon-only-btn tree-ctrl-btn"
                    onClick={collapseAll}
                    title="收合全部領域與賽道"
                    aria-label="收合全部領域與賽道"
                  >
                    <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M17 18l-5-5-5 5M17 11l-5-5-5 5"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="sidebar-scroll">
              {PILLARS.map((pillar) => {
                const pillarNode = byId.get(pillar.id);
                if (!pillarNode) return null;
                const categories = (categoriesByPillar.get(pillar.id) ?? []).filter(
                  (category) => (protocolsByCategory.get(category.id) ?? []).length > 0,
                );
                if (categories.length === 0) return null;
                const isPillarOpen = expandedPillars.has(pillar.id);
                const color = groupColor(pillar.id, theme);
                const pEn = pillarNode.label || pillar.id;
                const pZh = pillarNode.labelZh || pillar.label;
                const showPillarEn = !isRedundantBilingual(pEn, pZh);

                return (
                  <section
                    key={pillar.id}
                    className={isPillarOpen ? 'tree-pillar is-open' : 'tree-pillar'}
                    style={{ '--pillar-color': color } as React.CSSProperties}
                  >
                    <div className="tree-pillar-row">
                      <button
                        type="button"
                        className={isPillarOpen ? 'caret-btn open' : 'caret-btn'}
                        onClick={() => togglePillar(pillar.id)}
                        aria-label="展開或收合領域"
                        title={isPillarOpen ? '收合此領域' : '展開此領域'}
                      >
                        <span className="caret-glyph">▸</span>
                      </button>
                      <button
                        type="button"
                        className={selectedId === pillar.id ? 'pillar-title active' : 'pillar-title'}
                        onClick={() => {
                          if (!isPillarOpen || selectedId === pillar.id) togglePillar(pillar.id);
                          onFocus(pillar.id);
                        }}
                      >
                        <span className="pillar-icon-badge" aria-hidden="true">
                          {pillar.icon}
                        </span>
                        <span className="pillar-text-wrap">
                          <b>{pZh}</b>
                          {showPillarEn ? <small className="pillar-en">{pEn}</small> : null}
                        </span>
                        <em title="此領域涵蓋的生態項目總數">
                          {pillarProtocolCounts.get(pillar.id) ?? 0}
                        </em>
                      </button>
                    </div>

                    <div className={isPillarOpen ? 'accordion-wrap open' : 'accordion-wrap'}>
                      <div className="accordion-inner">
                        <ul className="tree-categories">
                          {categories.map((cat) => {
                            const protocols = protocolsByCategory.get(cat.id) ?? [];
                            const isCatOpen = expandedCategories.has(cat.id);
                            const catGlyph = categoryIcon(cat);
                            const catPrimary = cat.labelZh || cat.label;
                            const catSub = !isRedundantBilingual(cat.label, cat.labelZh)
                              ? cat.label
                              : null;

                            return (
                              <li key={cat.id} className="tree-cat-item">
                                <div className="tree-cat-row">
                                  <button
                                    type="button"
                                    className={isCatOpen ? 'caret-btn open' : 'caret-btn'}
                                    onClick={() => toggleCategory(cat.id)}
                                    aria-label="展開或收合賽道"
                                    title={isCatOpen ? '收合此賽道' : '展開此賽道'}
                                  >
                                    <span className="caret-glyph">▸</span>
                                  </button>
                                  <button
                                    type="button"
                                    className={
                                      selectedId === cat.id ? 'cat-title active' : 'cat-title'
                                    }
                                    onClick={() => {
                                      if (!isCatOpen || selectedId === cat.id) toggleCategory(cat.id);
                                      onFocus(cat.id);
                                    }}
                                  >
                                    <span className="cat-name">
                                      <span className="cat-icon-glyph" aria-hidden="true">
                                        {catGlyph}
                                      </span>
                                      <span className="cat-text-wrap">
                                        <b>{catPrimary}</b>
                                        {catSub ? <small>{catSub}</small> : null}
                                      </span>
                                    </span>
                                    <em title="此賽道底下的項目數量">{protocols.length}</em>
                                  </button>
                                </div>

                                {protocols.length > 0 ? (
                                  <div
                                    className={
                                      isCatOpen ? 'accordion-wrap open' : 'accordion-wrap'
                                    }
                                  >
                                    <div className="accordion-inner">
                                      <ul className="tree-protocols">
                                        {protocols.map((proto) => {
                                          const entity = getProtocolRoleBadge(proto);
                                          const showZhSub = !isRedundantBilingual(
                                            proto.label,
                                            proto.labelZh,
                                          );
                                          return (
                                            <li key={proto.id}>
                                              <button
                                                type="button"
                                                className={
                                                  selectedId === proto.id
                                                    ? 'proto-btn active'
                                                    : 'proto-btn'
                                                }
                                                onClick={() => onFocus(proto.id)}
                                              >
                                                <NodeLogoBadge node={proto} size={18} />
                                                <span className="proto-main-text">
                                                  <span className="proto-name">{proto.label}</span>
                                                  {showZhSub ? (
                                                    <small className="proto-zh">
                                                      {proto.labelZh}
                                                    </small>
                                                  ) : null}
                                                </span>
                                                <span className="proto-entity-tag">
                                                  {entity.shortLabel}
                                                </span>
                                              </button>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    </div>
                                  </div>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </aside>
    </>
  );
});

export default ClusterNav;
