import { memo, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { LayoutMode, ThemeMode } from '../types';
import { bumpLogoStamp, getLogoStamp, subscribeLogoStamp } from '../graph/logoStamp';
import { PILLARS, getDomainLogoUrl, groupColor } from '../graph/palette';
import { reloadSubscribedLogos } from '../graph/visuals';
import { EVM_CHAIN_FILTERS, type EvmChainId } from '../data/filterGraph';
import { CHAINS, chainProfile, type ChainId } from '../data/loadGraph';

type TopDockProps = {
  chain: ChainId;
  onChain: (chain: ChainId) => void;
  evmChain: EvmChainId | null;
  onEvmChain: (chain: EvmChainId | null) => void;
  visiblePillarIds: readonly string[];
  pillarId: string | null;
  onPillar: (id: string | null) => void;
  layoutMode: LayoutMode;
  onLayoutMode: (mode: LayoutMode) => void;
  showSemantic: boolean;
  onSemantic: (value: boolean) => void;
  showAllLabels: boolean;
  onShowAllLabels: (value: boolean) => void;
  nodeLocked: boolean;
  onToggleNodeLock: () => void;
  gathered?: boolean;
  onToggleGather?: () => void;
  theme: ThemeMode;
  onTheme: (theme: ThemeMode) => void;
  onReset: () => void;
  nodeCount: number;
  linkCount: number;
  tourActive?: boolean;
  onToggleTour?: () => void;
  logoDomains: readonly string[];
};

const PILLAR_SHORT: Record<string, string> = {
  defi: 'DeFi',
  cefi: 'CeFi',
  infrastructure: '基礎設施',
  consumer: '應用消費',
  developer: '開發者',
};

const EVM_CHAIN_MARK: Record<EvmChainId, { short: string; domain: string }> = {
  ethereum: { short: 'Ethereum', domain: 'ethereum.org' },
  bnb: { short: 'BNB', domain: 'bnbchain.org' },
  base: { short: 'Base', domain: 'base.org' },
  arbitrum: { short: 'Arbitrum', domain: 'arbitrum.io' },
};

const LAYOUT_OPTIONS: { id: LayoutMode; label: string }[] = [
  { id: 'radial', label: '放射腦圖佈局' },
  { id: 'tree', label: '樹狀階層佈局' },
  { id: 'force', label: '自由網路佈局' },
];

function useLogoStamp(): number {
  const [stamp, setStamp] = useState(getLogoStamp);
  useEffect(() => subscribeLogoStamp(() => setStamp(getLogoStamp())), []);
  return stamp;
}

function LayoutIcon({ mode }: { mode: LayoutMode }) {
  if (mode === 'radial') {
    return (
      <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
        <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="1.7" strokeDasharray="2.5 2.5" fill="none" />
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.7" fill="none" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (mode === 'tree') {
    return (
      <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="9.5" y="2.5" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.8" fill="none" />
        <path d="M12 6.5v4.5M5 11h14M5 11v4M12 11v4M19 11v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x="2.5" y="15" width="5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.8" fill="none" />
        <rect x="9.5" y="15" width="5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.8" fill="none" />
        <rect x="16.5" y="15" width="5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.8" fill="none" />
      </svg>
    );
  }
  return (
    <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 7.5L13 5.5L18.5 10.5L15.5 18L7.5 16.5L6.5 7.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="none" />
      <path d="M6.5 7.5L15.5 18M13 5.5L7.5 16.5" stroke="currentColor" strokeWidth="1.4" opacity="0.7" />
      <circle cx="6.5" cy="7.5" r="2.3" fill="currentColor" />
      <circle cx="13" cy="5.5" r="2.1" fill="currentColor" />
      <circle cx="18.5" cy="10.5" r="2.3" fill="currentColor" />
      <circle cx="15.5" cy="18" r="2.3" fill="currentColor" />
      <circle cx="7.5" cy="16.5" r="2.1" fill="currentColor" />
    </svg>
  );
}

function ChainMark({ domain, size }: { domain: string; size: number }) {
  const stamp = useLogoStamp();
  const src = getDomainLogoUrl(domain, stamp);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) {
    return <span className="chain-mark chain-mark-fallback" style={{ width: size, height: size }} aria-hidden="true" />;
  }
  return (
    <img
      key={src}
      className="chain-mark"
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
      style={{ width: size, height: size }}
      onError={() => setFailedSrc(src)}
    />
  );
}

function ChevronIcon() {
  return (
    <svg className="brand-chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="chain-check" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5l4.2 4.2L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DockButton({
  label,
  pressed,
  busy,
  className,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  busy?: boolean;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const classes = ['dock-btn', 'has-tip'];
  if (className) classes.push(className);
  if (busy) classes.push('is-busy');
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-tooltip={label}
      aria-label={label}
      aria-pressed={pressed}
      aria-busy={busy || undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const TopDock = memo(function TopDock({
  chain,
  onChain,
  evmChain,
  onEvmChain,
  visiblePillarIds,
  pillarId,
  onPillar,
  layoutMode,
  onLayoutMode,
  showSemantic,
  onSemantic,
  showAllLabels,
  onShowAllLabels,
  nodeLocked,
  onToggleNodeLock,
  gathered = false,
  onToggleGather,
  theme,
  onTheme,
  onReset,
  nodeCount,
  linkCount,
  tourActive = false,
  onToggleTour,
  logoDomains,
}: TopDockProps) {
  const [chainOpen, setChainOpen] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoBusyRef = useRef(false);
  const refreshLogos = async () => {
    if (logoBusyRef.current || logoDomains.length === 0) return;
    logoBusyRef.current = true;
    setLogoBusy(true);
    try {
      const response = await fetch('/api/logo/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: logoDomains }),
      });
      if (!response.ok) return;
      reloadSubscribedLogos();
      bumpLogoStamp();
    } catch {
      // Keep the logos already stored in the project.
    } finally {
      logoBusyRef.current = false;
      setLogoBusy(false);
    }
  };
  const brandRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const activeChain = chainProfile(chain);
  const domainPillars = PILLARS.filter((pillar) => visiblePillarIds.includes(pillar.id));
  const activeSubchainMark = chain === 'evm' && evmChain ? EVM_CHAIN_MARK[evmChain] : null;
  const headline = activeSubchainMark
    ? `${activeChain.title} · ${activeSubchainMark.short}`
    : activeChain.title;

  useEffect(() => {
    if (!chainOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (brandRef.current?.contains(target)) return;
      setChainOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setChainOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [chainOpen]);

  const lockTip = nodeLocked ? '節點已鎖定，點擊解鎖拖曳' : '節點已解鎖，點擊重新鎖定';
  const gatherTip = gathered ? '還原節點原位 (快捷鍵 G)' : '聚攏關聯節點 (快捷鍵 G)';
  const tourTip = tourActive ? '暫停焦點巡覽' : '開始焦點巡覽';
  const labelsTip = showAllLabels ? '正在顯示全部名稱，點擊改為焦點名稱' : '顯示全部節點名稱';
  const semanticTip = showSemantic ? '正在顯示跨領域關聯，點擊改為階層線' : '顯示跨領域關聯線';
  const themeTip = theme === 'dark' ? '切換為淺色主題' : '切換為深色主題';

  const pickChain = (next: ChainId) => {
    onChain(next);
    setChainOpen(false);
  };

  const pickEvmChain = (next: EvmChainId | null) => {
    onEvmChain(next);
    setChainOpen(false);
  };

  return (
    <header className="toolbar topbar">
      <div className="dock-island dock-brand">
        <div className="toolbar-brand-slot" ref={brandRef}>
          <button
            type="button"
            className={chainOpen ? 'toolbar-brand is-open' : 'toolbar-brand'}
            aria-haspopup="menu"
            aria-expanded={chainOpen}
            aria-controls={menuId}
            aria-label={`${headline}，${nodeCount} 節點，選擇要看的鏈`}
            onClick={() => setChainOpen((open) => !open)}
          >
            <ChainMark
              domain={activeSubchainMark ? activeSubchainMark.domain : activeChain.faviconDomain}
              size={24}
            />
            <h1>{headline}</h1>
            <ChevronIcon />
            <span className="brand-count">{nodeCount} 節點</span>
          </button>

          {chainOpen ? (
            <div
              className="chain-menu brand-menu"
              id={menuId}
              role="menu"
              aria-label="選擇鏈"
            >
              <p className="chain-menu-label">生態網路</p>
              {CHAINS.map((item) => {
                const selected = item.id === chain;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className={selected ? 'chain-option is-selected' : 'chain-option'}
                    onClick={() => pickChain(item.id)}
                  >
                    <ChainMark domain={item.faviconDomain} size={22} />
                    <span className="chain-option-text">
                      <strong>{item.title}</strong>
                      <small>
                        {selected
                          ? `${nodeCount} 節點 · ${linkCount} 關聯`
                          : `切換載入 ${item.name} 生態圖譜`}
                      </small>
                    </span>
                    {selected ? <CheckIcon /> : null}
                  </button>
                );
              })}

              <p className="chain-menu-label">EVM 子鏈篩選</p>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={chain === 'evm' && evmChain === null}
                className={
                  chain === 'evm' && evmChain === null ? 'chain-option is-selected' : 'chain-option'
                }
                onClick={() => pickEvmChain(null)}
              >
                <span className="chain-dot chain-dot-all" aria-hidden="true" />
                <span className="chain-option-text">
                  <strong>全部 EVM 鏈</strong>
                  <small>顯示全部 EVM 生態協議</small>
                </span>
                {chain === 'evm' && evmChain === null ? <CheckIcon /> : null}
              </button>
              {EVM_CHAIN_FILTERS.map((item) => {
                const mark = EVM_CHAIN_MARK[item.id];
                const selected = chain === 'evm' && evmChain === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className={selected ? 'chain-option is-selected' : 'chain-option'}
                    onClick={() => pickEvmChain(item.id)}
                  >
                    <ChainMark domain={mark.domain} size={18} />
                    <span className="chain-option-text">
                      <strong>{mark.short}</strong>
                      <small>{item.label}</small>
                    </span>
                    {selected ? <CheckIcon /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="dock-island dock-domains dock-center" role="group" aria-label="主領域篩選">
        <button
          type="button"
          className={pillarId === null ? 'domain-pill has-tip is-on' : 'domain-pill has-tip'}
          data-tooltip="顯示全部領域節點"
          aria-pressed={pillarId === null}
          onClick={() => onPillar(null)}
        >
          全部 <em className="pill-count">({nodeCount})</em>
        </button>
        {domainPillars.map((pillar) => {
          const isActive = pillarId === pillar.id;
          const color = groupColor(pillar.id, theme);
          const short = PILLAR_SHORT[pillar.id] ?? pillar.label;
          return (
            <button
              key={pillar.id}
              type="button"
              className={isActive ? 'domain-pill has-tip is-on' : 'domain-pill has-tip'}
              style={{ '--pill-accent': color } as React.CSSProperties}
              data-tooltip={`篩選領域：${pillar.labelFull}`}
              aria-pressed={isActive}
              onClick={() => onPillar(isActive ? null : pillar.id)}
            >
              <i className="dot" style={{ background: color }} />
              {short}
            </button>
          );
        })}
      </div>

      <div className="dock-island dock-controls dock-tools" role="toolbar" aria-label="視圖與控制">
        <div className="dock-seg" role="group" aria-label="佈局模式">
          {LAYOUT_OPTIONS.map((opt) => (
            <DockButton
              key={opt.id}
              label={opt.label}
              pressed={layoutMode === opt.id}
              className={layoutMode === opt.id ? 'is-selected' : undefined}
              onClick={() => onLayoutMode(opt.id)}
            >
              <LayoutIcon mode={opt.id} />
            </DockButton>
          ))}
        </div>
        <span className="dock-divider" aria-hidden="true" />
        <div className="dock-seg" role="group" aria-label="互動與顯示">
          <DockButton
            label={lockTip}
            pressed={nodeLocked}
            className={nodeLocked ? 'is-on' : 'is-alert'}
            onClick={onToggleNodeLock}
          >
            {nodeLocked ? (
              <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2.2" stroke="currentColor" strokeWidth="1.9" fill="none" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" fill="none" />
                <circle cx="12" cy="16" r="1.5" fill="currentColor" />
              </svg>
            ) : (
              <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2.2" stroke="currentColor" strokeWidth="1.9" fill="none" />
                <path d="M8 11V7a4 4 0 0 1 7.6-1.7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" fill="none" />
                <circle cx="12" cy="16" r="1.5" fill="currentColor" />
              </svg>
            )}
            <i className={nodeLocked ? 'lock-status-dot locked' : 'lock-status-dot unlocked'} />
          </DockButton>
          {onToggleGather ? (
            <DockButton
              label={gatherTip}
              pressed={gathered}
              className={gathered ? 'is-on' : undefined}
              onClick={onToggleGather}
            >
              {gathered ? (
                <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                  <path
                    d="M9 9L4.5 4.5M4.5 4.5H8.5M4.5 4.5V8.5M15 9l4.5-4.5M19.5 4.5H15.5M19.5 4.5V8.5M9 15l-4.5 4.5M4.5 19.5H8.5M4.5 19.5V15.5M15 15l4.5 4.5M19.5 19.5H15.5M19.5 19.5V15.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
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
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              )}
            </DockButton>
          ) : null}
          {onToggleTour ? (
            <DockButton
              label={tourTip}
              pressed={tourActive}
              className={tourActive ? 'is-on' : undefined}
              onClick={onToggleTour}
            >
              {tourActive ? (
                <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
                  <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
                </svg>
              ) : (
                <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 5.5v13l11-6.5-11-6.5z" fill="currentColor" />
                </svg>
              )}
            </DockButton>
          ) : null}
          <DockButton
            label={labelsTip}
            pressed={showAllLabels}
            className={showAllLabels ? 'is-on' : undefined}
            onClick={() => onShowAllLabels(!showAllLabels)}
          >
            <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <circle cx="7" cy="7" r="1.6" fill="currentColor" />
            </svg>
          </DockButton>
          <DockButton
            label={semanticTip}
            pressed={showSemantic}
            className={showSemantic ? 'is-on' : undefined}
            onClick={() => onSemantic(!showSemantic)}
          >
            <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="6" cy="18" r="2.6" stroke="currentColor" strokeWidth="1.8" fill="none" />
              <circle cx="18" cy="6" r="2.6" stroke="currentColor" strokeWidth="1.8" fill="none" />
              <circle cx="6" cy="6" r="2.2" fill="currentColor" />
              <circle cx="18" cy="18" r="2.2" fill="currentColor" />
              <path
                d="M8.2 16.4C11.5 14 12.5 10 15.8 7.6M8 6h7.2M6 8.2v7.2"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </DockButton>
        </div>
        <span className="dock-divider" aria-hidden="true" />
        <div className="dock-seg" role="group" aria-label="環境">
          <DockButton label="更新 Logo" busy={logoBusy} onClick={() => void refreshLogos()}>
            <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M20.5 12a8.5 8.5 0 0 1-14.2 6.3L4.5 16.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <path
                d="M3.5 12a8.5 8.5 0 0 1 14.2-6.3L19.5 7.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <path d="M4.5 16.5v3.2H7.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M19.5 7.5V4.3H16.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </DockButton>
          <DockButton label={themeTip} onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? (
              <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" fill="none" />
                <path
                  d="M12 2.5v2.3M12 19.2v2.3M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.3M19.2 12h2.3M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            )}
          </DockButton>
          <DockButton label="重置視角與篩選" onClick={onReset}>
            <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5"
                stroke="currentColor"
                strokeWidth="1.85"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <path
                d="M3.5 4v4.5H8"
                stroke="currentColor"
                strokeWidth="1.85"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </DockButton>
        </div>
      </div>
    </header>
  );
});

export default TopDock;
