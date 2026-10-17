import { memo } from 'react';
import type { KnowledgeGraph, ThemeMode } from '../types';
import { relationColor } from '../graph/palette';

type StatusBarProps = {
  graph: KnowledgeGraph;
  showSemantic: boolean;
  theme?: ThemeMode;
};

const COMPACT_RELATIONS = [
  { id: 'child-of', label: '階層' },
  { id: 'also-in', label: '跨賽道' },
  { id: 'routes-liquidity', label: '流動性' },
  { id: 'integrates', label: '整合' },
] as const;

const StatusBar = memo(function StatusBar({
  graph,
  showSemantic,
  theme = 'dark',
}: StatusBarProps) {
  const activeRelations = showSemantic
    ? COMPACT_RELATIONS
    : COMPACT_RELATIONS.slice(0, 1);

  return (
    <footer className="statusbar" aria-label="圖例與快捷鍵狀態列">
      <div className="status-capsule status-left">
        <div className="status-tiers" aria-label="節點階層圖例">
          <span className="tier-pill tier-root">🌐 核心</span>
          <span className="tier-sep" aria-hidden="true">·</span>
          <span className="tier-pill tier-pillar">🏛️ 領域</span>
          <span className="tier-sep" aria-hidden="true">·</span>
          <span className="tier-pill tier-cat">📂 賽道</span>
          <span className="tier-sep" aria-hidden="true">·</span>
          <span className="tier-pill tier-proto">🏢 協議</span>
        </div>

        <span className="status-divider" aria-hidden="true" />

        <div className="status-relations" aria-label="連線圖例">
          {activeRelations.map((rel) => (
            <span key={rel.id} className="legend-item">
              <i
                className="line-swatch"
                style={{ background: relationColor(rel.id, theme) }}
              />
              {rel.label}
            </span>
          ))}
        </div>
      </div>

      <div className="status-capsule status-right">
        <span className="status-node-count">
          {graph.nodes.length} 節點 · {graph.links.length} 關聯
        </span>
        <span className="status-divider" aria-hidden="true" />
        <div className="shortcut-pills" aria-label="鍵盤快捷鍵">
          <span className="kbd-pair"><kbd>WASD</kbd> 移動</span>
          <span className="kbd-pair"><kbd>G</kbd> 聚攏</span>
          <span className="kbd-pair"><kbd>L</kbd> 鎖定</span>
          <span className="kbd-pair"><kbd>/</kbd> 搜尋</span>
          <span className="kbd-pair"><kbd>B</kbd> 側欄</span>
          <span className="kbd-pair"><kbd>Esc</kbd> 重置</span>
        </div>
      </div>
    </footer>
  );
});

export default StatusBar;
