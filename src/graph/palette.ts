import logoManifest from 'virtual:logo-manifest';
import type { ThemeMode } from '../types';
import { getLogoStamp } from './logoStamp';

export const GROUP_COLOR_DARK: Record<string, string> = {
  core: '#38bdf8',
  defi: '#818cf8',
  cefi: '#fb7185',
  infrastructure: '#38bdf8',
  consumer: '#34d399',
  developer: '#fbbf24',
};

export const GROUP_COLOR_LIGHT: Record<string, string> = {
  core: '#0284c7',
  defi: '#4f46e5',
  cefi: '#e11d48',
  infrastructure: '#0284c7',
  consumer: '#059669',
  developer: '#d97706',
};

// Distinct tier colors so Category (子層) never looks identical to Protocol (子子層) or Pillar (母層)
export const CATEGORY_FRAME_COLOR = {
  dark: {
    border: '#f59e0b', // Amber gold folder frame
    headerBg: 'rgba(245, 158, 11, 0.24)',
    bodyBg: 'rgba(15, 23, 42, 0.94)',
    countText: '#fbbf24',
  },
  light: {
    border: '#d97706',
    headerBg: 'rgba(245, 158, 11, 0.18)',
    bodyBg: 'rgba(255, 251, 235, 0.97)',
    countText: '#b45309',
  },
} as const;

export const GROUP_LABEL: Record<string, string> = {
  core: '核心網路',
  defi: 'DeFi 金融',
  cefi: '中心化金融',
  infrastructure: '基礎設施',
  consumer: '應用與消費',
  developer: '開發者工具',
};

export const TYPE_LABEL: Record<string, string> = {
  root: '🌐 生態核心',
  pillar: '🏛️ 核心領域',
  category: '📂 賽道分類',
  protocol: '🏢 生態項目 / 協議',
};

export const PILLAR_ICONS: Record<string, string> = {
  core: '🌐',
  solana: '🌐',
  evm: '🌐',
  defi: '🏛️',
  cefi: '💼',
  infrastructure: '⚡',
  consumer: '🛍️',
  developer: '🛠️',
};

export const CATEGORY_ICONS: Record<string, string> = {
  amm: '🔄',
  clmm: '📊',
  'orderbook-dex': '📈',
  aggregator: '🧭',
  lending: '🏦',
  'liquid-staking': '💧',
  restaking: '🛡️',
  perps: '📈',
  yield: '🌾',
  stablecoin: '💵',
  launchpad: '🚀',
  options: '🎯',
  wallet: '👛',
  mobile: '📱',
  rpc: '🖥️',
  'validator-client': '⚙️',
  oracle: '🔮',
  bridge: '🌉',
  indexer: '🗂️',
  identity: '🪪',
  sdk: '🛠️',
  framework: '🧱',
  explorer: '📊',
  security: '🛡️',
  'data-api': '📊',
  'nft-marketplace': '🖼️',
  gaming: '🎮',
  social: '💬',
  payments: '💸',
  'card-payfi': '💳',
  'cards-payfi': '💳',
  'card-finance': '💳',
  'crypto-card': '💳',
  cards: '💳',
  payfi: '💳',
  depin: '📡',
  rwa: '🏛️',
  meme: '🐕',
  dao: '⚖️',
  cex: '🏦',
  'custody-prime': '🔐',
  'broker-dealer': '📜',
  ai: '🤖',
};

export const PILLARS = [
  { id: 'defi', label: 'DeFi 金融', labelFull: 'DeFi 去中心化金融', icon: '🏛️' },
  { id: 'cefi', label: '中心化金融', labelFull: 'CeFi 中心化金融', icon: '💼' },
  { id: 'infrastructure', label: '基礎設施', labelFull: 'Infrastructure 基礎設施', icon: '⚡' },
  { id: 'consumer', label: '應用與消費', labelFull: 'Consumer 應用與消費', icon: '🛍️' },
  { id: 'developer', label: '開發者工具', labelFull: 'Developer 開發者工具', icon: '🛠️' },
] as const;

export const RELATION_LABELS: Record<string, string> = {
  'child-of': '所屬賽道 / 子項目',
  'routes-liquidity': '💧 路由流動性至',
  integrates: '🔗 生態整合與串接',
  'uses-oracle': '🔮 採用預言機餵價',
  competes: '⚔️ 同賽道競爭',
  'built-on': '🧱 建構於底層',
  lists: '📋 上架與資產支援',
  'also-in': '🏷️ 跨賽道歸屬',
  powers: '⚡ 底層技術驅動',
  'wallet-support': '👛 錢包原生支援',
};

export const RELATION_COLOR_DARK: Record<string, string> = {
  'child-of': '#64748b',
  'routes-liquidity': '#2dd4bf',
  integrates: '#a78bfa',
  'uses-oracle': '#facc15',
  competes: '#fb7185',
  'built-on': '#fb923c',
  lists: '#4ade80',
  'also-in': '#60a5fa',
  powers: '#22d3ee',
  'wallet-support': '#f472b6',
};

export const RELATION_COLOR_LIGHT: Record<string, string> = {
  'child-of': '#94a3b8',
  'routes-liquidity': '#0d9488',
  integrates: '#7c3aed',
  'uses-oracle': '#ca8a04',
  competes: '#e11d48',
  'built-on': '#ea580c',
  lists: '#16a34a',
  'also-in': '#2563eb',
  powers: '#0891b2',
  'wallet-support': '#db2777',
};

export const AMBIENT_PALETTE = {
  dark: {
    /** Viewport edge / clear color. Deep blue-gray, not black. */
    bg: '#0c1220',
    /** Radial field center. */
    bgCenter: '#1a2744',
    /** Very faint inner lift so the center is not a flat disc. */
    bgGlow: '#22365c',
    gridPrimary: '#6e90b8',
    ringGlow: '#9bb8d6',
  },
  light: {
    /** Viewport edge / clear color. Cool gray, not white. */
    bg: '#e4eaf2',
    bgCenter: '#f4f7fb',
    bgGlow: '#f7f9fc',
    gridPrimary: '#8aa0b8',
    ringGlow: '#5d7c9c',
  },
} as const;

export function groupColor(group: string, theme: ThemeMode = 'dark'): string {
  const map = theme === 'light' ? GROUP_COLOR_LIGHT : GROUP_COLOR_DARK;
  return map[group] ?? (theme === 'light' ? '#475569' : '#94a3b8');
}

export function groupLabel(group: string): string {
  return GROUP_LABEL[group] ?? group;
}

export function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

export function pillarIcon(idOrGroup: string): string {
  return PILLAR_ICONS[idOrGroup] ?? '🏛️';
}

export function categoryIcon(
  nodeOrId: string | { id: string; label?: string; labelZh?: string },
): string {
  const id = typeof nodeOrId === 'string' ? nodeOrId : nodeOrId.id;
  if (CATEGORY_ICONS[id]) return CATEGORY_ICONS[id];
  const lower =
    typeof nodeOrId === 'string'
      ? nodeOrId.toLowerCase()
      : `${nodeOrId.id} ${nodeOrId.label ?? ''} ${nodeOrId.labelZh ?? ''}`.toLowerCase();
  if (lower.includes('card') || lower.includes('payfi') || lower.includes('卡')) return '💳';
  if (lower.includes('pay') || lower.includes('支付')) return '💸';
  if (lower.includes('wallet') || lower.includes('錢包')) return '👛';
  if (lower.includes('mobile') || lower.includes('手機') || lower.includes('行動')) return '📱';
  if (lower.includes('amm') || lower.includes('swap')) return '🔄';
  if (lower.includes('lend') || lower.includes('借貸')) return '🏦';
  if (lower.includes('stak') || lower.includes('質押')) return '💧';
  if (lower.includes('oracle') || lower.includes('預言機')) return '🔮';
  if (lower.includes('bridge') || lower.includes('跨鏈')) return '🌉';
  if (lower.includes('nft')) return '🖼️';
  if (lower.includes('gam') || lower.includes('遊戲')) return '🎮';
  if (lower.includes('depin')) return '📡';
  if (lower.includes('cex') || lower.includes('交易所')) return '🏦';
  if (lower.includes('custody') || lower.includes('託管') || lower.includes('主經紀')) return '🔐';
  if (lower.includes('broker') || lower.includes('券商')) return '📜';
  if (/\bai\b/.test(lower) || lower.includes('人工智慧') || lower.includes('代理')) return '🤖';
  return '📂';
}

/**
 * Helper to check if `labelZh` and `label` are redundant or if `labelZh` already embeds `label`.
 */
export function isRedundantBilingual(enRaw?: string, zhRaw?: string): boolean {
  const en = (enRaw ?? '').trim();
  const zh = (zhRaw ?? '').trim();
  if (!en || !zh) return true;
  const enLower = en.toLowerCase();
  const zhLower = zh.toLowerCase();
  if (enLower === zhLower) return true;
  // Normalize alphanumeric tokens
  const enClean = enLower.replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
  const zhClean = zhLower.replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
  if (enClean && enClean === zhClean) return true;
  if (zhLower.includes(enLower) || enLower.includes(zhLower)) return true;
  return false;
}

export type EntityBadgeInfo = {
  icon: string;
  label: string;
  shortLabel: string;
  colorLight: string;
};

const GLOBAL_PAYMENT_INSTITUTIONS = new Set([
  'visa',
  'mastercard',
  'stripe',
  'paypal',
  'worldpay',
  'fiserv',
  'checkout',
]);

const STABLECOIN_ISSUERS = new Set([
  'circle',
  'usdc',
  'paypal',
  'pyusd',
  'paxos',
  'usdp',
  'usdg',
  'tether',
  'usdt',
  'ondo',
  'usdy',
  'sky',
  'usds',
  'fdusd',
  'agora',
  'ausd',
]);

const MOBILE_HARDWARE_DEVICES = new Set([
  'seeker',
  'saga',
  'solana-mobile',
  'ledger',
  'keystone',
  'trezor',
  'tangem',
  'onekey',
  'gridplus',
  'cudis',
]);

const MEME_TRADING_TERMINALS = new Set([
  'gmgn',
  'axiom',
  'trojan',
  'padre',
  'photon',
  'bullx',
  'bonkbot',
  'banana-gun',
  'maestro',
  'vector',
  'moonshot',
]);

const MEME_LAUNCHPADS = new Set([
  'pump-fun',
  'pumpfun',
  'letsbonk',
  'boop',
  'launchlab',
  'moonit',
  'meteora-dbc',
]);

export function getProtocolRoleBadge(node: {
  id: string;
  label?: string;
  labelZh?: string;
  parent?: string | null;
  group?: string;
  tags?: string[];
}): EntityBadgeInfo {
  const id = node.id.toLowerCase();
  const parent = (node.parent ?? '').toLowerCase();
  const labelLower = (node.label ?? '').toLowerCase();
  const zhLower = (node.labelZh ?? '').toLowerCase();
  const text = `${id} ${labelLower} ${zhLower} ${(node.tags ?? []).join(' ')}`.toLowerCase();

  // 1. card-finance (加密卡 / 數位銀行)
  if (
    parent === 'card-finance' ||
    parent === 'card-payfi' ||
    parent === 'cards-payfi' ||
    parent === 'crypto-card' ||
    parent === 'cards'
  ) {
    return {
      icon: '💳',
      label: '💳 加密卡 / 數位銀行',
      shortLabel: '💳 加密卡/銀行',
      colorLight: '#0284c7',
    };
  }

  // 2. payments (國際支付與清算機構 vs 支付與結算協議)
  if (parent === 'payments') {
    const isGlobalInst =
      GLOBAL_PAYMENT_INSTITUTIONS.has(id) ||
      labelLower.includes('visa') ||
      labelLower.includes('mastercard') ||
      labelLower.includes('stripe') ||
      labelLower.includes('paypal');
    if (isGlobalInst) {
      return {
        icon: '🏦',
        label: '🏦 國際支付與清算機構',
        shortLabel: '🏦 國際清算機構',
        colorLight: '#0284c7',
      };
    }
    return {
      icon: '💸',
      label: '💸 支付與結算協議',
      shortLabel: '💸 支付結算協議',
      colorLight: '#0284c7',
    };
  }

  // 3. amm / clmm / orderbook-dex
  if (parent === 'amm' || parent === 'clmm' || parent === 'orderbook-dex') {
    return {
      icon: '🔄',
      label: '🔄 去中心化交易所 (DEX)',
      shortLabel: '🔄 DEX 交易所',
      colorLight: '#4f46e5',
    };
  }

  // 4. aggregator
  if (parent === 'aggregator') {
    return {
      icon: '🧭',
      label: '🧭 交易路由聚合器',
      shortLabel: '🧭 路由聚合器',
      colorLight: '#4f46e5',
    };
  }

  // 5. lending
  if (parent === 'lending') {
    return {
      icon: '🏦',
      label: '🏦 借貸與信用市場',
      shortLabel: '🏦 借貸市場',
      colorLight: '#4f46e5',
    };
  }

  // 6. liquid-staking / restaking
  if (parent === 'liquid-staking' || parent === 'restaking') {
    return {
      icon: '💧',
      label: '💧 質押與再質押協議',
      shortLabel: '💧 質押協議',
      colorLight: '#0284c7',
    };
  }

  // 7. perps / options
  if (parent === 'perps' || parent === 'options') {
    return {
      icon: '📈',
      label: '📈 衍生品交易平台',
      shortLabel: '📈 衍生品平台',
      colorLight: '#6d28d9',
    };
  }

  // 8. yield
  if (parent === 'yield') {
    return {
      icon: '🌾',
      label: '🌾 收益金庫協議',
      shortLabel: '🌾 收益金庫',
      colorLight: '#059669',
    };
  }

  // 9. stablecoin
  if (parent === 'stablecoin') {
    const isIssuer =
      STABLECOIN_ISSUERS.has(id) ||
      text.includes('circle') ||
      text.includes('paypal') ||
      text.includes('paxos') ||
      text.includes('tether') ||
      text.includes('ondo');
    if (isIssuer) {
      return {
        icon: '💵',
        label: '💵 穩定幣發行機構',
        shortLabel: '💵 穩定幣發行商',
        colorLight: '#059669',
      };
    }
    return {
      icon: '💵',
      label: '💵 穩定幣協議',
      shortLabel: '💵 穩定幣協議',
      colorLight: '#059669',
    };
  }

  // 10. launchpad
  if (parent === 'launchpad') {
    return {
      icon: '🚀',
      label: '🚀 代幣發射平台',
      shortLabel: '🚀 代幣發射台',
      colorLight: '#db2777',
    };
  }

  // 11. wallet
  if (parent === 'wallet') {
    return {
      icon: '👛',
      label: '👛 錢包客戶端',
      shortLabel: '👛 錢包客戶端',
      colorLight: '#7c3aed',
    };
  }

  // 12. mobile
  if (parent === 'mobile') {
    const isHardware =
      MOBILE_HARDWARE_DEVICES.has(id) ||
      text.includes('seeker') ||
      text.includes('saga') ||
      text.includes('ledger') ||
      text.includes('keystone') ||
      text.includes('硬體') ||
      text.includes('手機');
    if (isHardware) {
      return {
        icon: '📱',
        label: '📱 終端硬體設備',
        shortLabel: '📱 終端硬體設備',
        colorLight: '#db2777',
      };
    }
    return {
      icon: '📱',
      label: '📱 行動端基礎設施',
      shortLabel: '📱 行動端基建',
      colorLight: '#db2777',
    };
  }

  // 13. rpc / validator-client / indexer
  if (parent === 'rpc' || parent === 'validator-client' || parent === 'indexer') {
    return {
      icon: '🖥️',
      label: '🖥️ 節點與底層基建',
      shortLabel: '🖥️ 節點與底層基建',
      colorLight: '#0891b2',
    };
  }

  // 14. oracle
  if (parent === 'oracle') {
    return {
      icon: '🔮',
      label: '🔮 預言機網路',
      shortLabel: '🔮 預言機網路',
      colorLight: '#ca8a04',
    };
  }

  // 15. bridge
  if (parent === 'bridge') {
    return {
      icon: '🌉',
      label: '🌉 跨鏈互操作協議',
      shortLabel: '🌉 跨鏈互操作',
      colorLight: '#0284c7',
    };
  }

  // 16. identity
  if (parent === 'identity') {
    return {
      icon: '🪪',
      label: '🪪 數位身分與域名',
      shortLabel: '🪪 數位身分/域名',
      colorLight: '#0284c7',
    };
  }

  // 17. sdk / framework
  if (parent === 'sdk' || parent === 'framework') {
    return {
      icon: '🛠️',
      label: '🛠️ 開發工具與框架',
      shortLabel: '🛠️ 開發工具/框架',
      colorLight: '#d97706',
    };
  }

  // 18. explorer / data-api
  if (parent === 'explorer' || parent === 'data-api') {
    return {
      icon: '📊',
      label: '📊 鏈上瀏覽器與數據終端',
      shortLabel: '📊 瀏覽器/數據終端',
      colorLight: '#d97706',
    };
  }

  // 19. security
  if (parent === 'security') {
    return {
      icon: '🛡️',
      label: '🛡️ 資安審計機構',
      shortLabel: '🛡️ 資安審計機構',
      colorLight: '#d97706',
    };
  }

  // 20. nft-marketplace
  if (parent === 'nft-marketplace') {
    return {
      icon: '🖼️',
      label: '🖼️ NFT 市集與資產標準',
      shortLabel: '🖼️ NFT 市集/標準',
      colorLight: '#059669',
    };
  }

  // 21. gaming
  if (parent === 'gaming') {
    return {
      icon: '🎮',
      label: '🎮 鏈遊與娛樂項目',
      shortLabel: '🎮 鏈遊與娛樂',
      colorLight: '#059669',
    };
  }

  // 22. social
  if (parent === 'social') {
    return {
      icon: '💬',
      label: '💬 社交與創作者協議',
      shortLabel: '💬 社交/創作者協議',
      colorLight: '#059669',
    };
  }

  // 23. depin
  if (parent === 'depin') {
    return {
      icon: '📡',
      label: '📡 DePIN 硬體網路',
      shortLabel: '📡 DePIN 網路',
      colorLight: '#059669',
    };
  }

  // 24. rwa
  if (parent === 'rwa') {
    return {
      icon: '🏛️',
      label: '🏛️ RWA 資產代幣化機構',
      shortLabel: '🏛️ RWA 代幣化機構',
      colorLight: '#4f46e5',
    };
  }

  // 25. meme
  if (parent === 'meme') {
    if (
      MEME_LAUNCHPADS.has(id) ||
      labelLower.includes('pump.fun') ||
      labelLower.includes('letsbonk') ||
      text.includes('發射')
    ) {
      return {
        icon: '🚀',
        label: '🚀 迷因發射平台',
        shortLabel: '🚀 迷因發射平台',
        colorLight: '#db2777',
      };
    }
    if (
      MEME_TRADING_TERMINALS.has(id) ||
      labelLower.includes('gmgn') ||
      labelLower.includes('axiom') ||
      labelLower.includes('trojan') ||
      labelLower.includes('padre') ||
      labelLower.includes('photon') ||
      labelLower.includes('bullx') ||
      text.includes('交易終端') ||
      text.includes('trading bot')
    ) {
      return {
        icon: '⚡',
        label: '⚡ 鏈上交易終端',
        shortLabel: '⚡ 鏈上交易終端',
        colorLight: '#ca8a04',
      };
    }
    return {
      icon: '🐕',
      label: '🐕 社群迷因項目',
      shortLabel: '🐕 社群迷因項目',
      colorLight: '#059669',
    };
  }

  // 26. dao
  if (parent === 'dao') {
    return {
      icon: '⚖️',
      label: '⚖️ 治理與多簽金庫',
      shortLabel: '⚖️ 治理與多簽金庫',
      colorLight: '#059669',
    };
  }

  // 27. cex
  if (parent === 'cex') {
    return {
      icon: '🏦',
      label: '🏦 中心化交易所',
      shortLabel: '🏦 中心化交易所',
      colorLight: '#e11d48',
    };
  }

  // 28. custody-prime
  if (parent === 'custody-prime') {
    return {
      icon: '🔐',
      label: '🔐 託管與主經紀',
      shortLabel: '🔐 託管/主經紀',
      colorLight: '#e11d48',
    };
  }

  // 29. broker-dealer
  if (parent === 'broker-dealer') {
    return {
      icon: '📜',
      label: '📜 合規經紀／券商',
      shortLabel: '📜 合規券商',
      colorLight: '#e11d48',
    };
  }

  // 30. ai
  if (parent === 'ai') {
    return {
      icon: '🤖',
      label: '🤖 人工智慧與代理',
      shortLabel: '🤖 AI 代理',
      colorLight: '#059669',
    };
  }

  // Fallbacks by group if parent is custom
  if (node.group === 'cefi') {
    return {
      icon: '🏦',
      label: '🏦 中心化金融機構',
      shortLabel: '🏦 中心化金融',
      colorLight: '#e11d48',
    };
  }
  if (node.group === 'defi') {
    return {
      icon: '🏦',
      label: '🏦 DeFi 金融協議',
      shortLabel: '🏦 DeFi 協議',
      colorLight: '#4f46e5',
    };
  }
  if (node.group === 'infrastructure') {
    return {
      icon: '🖥️',
      label: '🖥️ 節點與底層基建',
      shortLabel: '🖥️ 底層基建',
      colorLight: '#0891b2',
    };
  }
  if (node.group === 'developer') {
    return {
      icon: '🛠️',
      label: '🛠️ 開發工具與框架',
      shortLabel: '🛠️ 開發工具',
      colorLight: '#d97706',
    };
  }

  return {
    icon: '🌐',
    label: '🌐 Web3 應用協議',
    shortLabel: '🌐 應用協議',
    colorLight: '#059669',
  };
}

const KNOWN_DOMAINS: Record<string, string> = {
  solana: 'solana.com',
  evm: 'ethereum.org',
  uniswap: 'uniswap.org',
  aave: 'aave.com',
  lido: 'lido.fi',
  eigenlayer: 'eigenlayer.xyz',
  curve: 'curve.fi',
  pendle: 'pendle.finance',
  makerdao: 'sky.money',
  gmx: 'gmx.io',
  hyperliquid: 'hyperliquid.xyz',
  '1inch': '1inch.io',
  chainlink: 'chain.link',
  metamask: 'metamask.io',
  rabby: 'rabby.io',
  safe: 'safe.global',
  alchemy: 'alchemy.com',
  infura: 'infura.io',
  layerzero: 'layerzero.network',
  thegraph: 'thegraph.com',
  ens: 'ens.domains',
  opensea: 'opensea.io',
  blur: 'blur.io',
  polymarket: 'polymarket.com',
  farcaster: 'farcaster.xyz',
  foundry: 'getfoundry.sh',
  hardhat: 'hardhat.org',
  etherscan: 'etherscan.io',
  dune: 'dune.com',
  openzeppelin: 'openzeppelin.com',
  raydium: 'raydium.io',
  orca: 'orca.so',
  jupiter: 'jup.ag',
  meteora: 'meteora.ag',
  kamino: 'kamino.finance',
  marginfi: 'marginfi.com',
  jito: 'jito.network',
  marinade: 'marinade.finance',
  solayer: 'solayer.org',
  sanctum: 'wonderland.work',
  drift: 'drift.trade',
  phoenix: 'ellipsislabs.xyz',
  pyth: 'pyth.network',
  wormhole: 'wormhole.com',
  helius: 'helius.dev',
  quicknode: 'quicknode.com',
  phantom: 'phantom.app',
  solflare: 'solflare.com',
  backpack: 'backpack.exchange',
  'magic-eden': 'magiceden.io',
  tensor: 'tensor.trade',
  helium: 'helium.com',
  render: 'rendernetwork.com',
  hivemapper: 'hivemapper.com',
  stepn: 'stepn.com',
  'pump-fun': 'pump.fun',
  visa: 'visa.com',
  mastercard: 'mastercard.com',
  stripe: 'stripe.com',
  paypal: 'paypal.com',
  pyusd: 'paypal.com',
  kast: 'kast.xyz',
  solcard: 'solcard.cc',
  reap: 'reap.global',
  redotpay: 'redotpay.com',
  holyheld: 'holyheld.com',
  sphere: 'spherepay.co',
  helio: 'hel.io',
  coinflow: 'coinflow.cash',
  zebec: 'zebec.io',
  seeker: 'solanamobile.com',
  saga: 'solanamobile.com',
  ledger: 'ledger.com',
  keystone: 'keyst.one',
  usdc: 'circle.com',
  usdt: 'tether.to',
  ondo: 'ondo.finance',
  huma: 'huma.finance',
  'sol-strategies': 'solstrategies.io',
  'jito-solana': 'jito.network',
  yellowstone: 'triton.one',
  'solana-kit': 'anza.xyz',
  'wallet-adapter': 'anza.xyz',
  pinocchio: 'anza.xyz',
  'mobile-wallet-adapter': 'solanamobile.com',
  firedancer: 'firedancer.io',
  frankendancer: 'firedancer.io',
  gill: 'gillsdk.com',
  codama: 'codama.idl',
  padre: 'trade.padre.gg',
  binance: 'binance.com',
  coinbase: 'coinbase.com',
  'coinbase-prime': 'coinbase.com',
  okx: 'okx.com',
  kraken: 'kraken.com',
  bybit: 'bybit.com',
  anchorage: 'anchorage.com',
  bitgo: 'bitgo.com',
  falconx: 'falconx.io',
  copper: 'copper.co',
  robinhood: 'robinhood.com',
  fidelity: 'fidelity.com',
  etoro: 'etoro.com',
  revolut: 'revolut.com',
  elizaos: 'elizaos.ai',
  sendai: 'sendai.fun',
  griffain: 'griffain.com',
  arc: 'arc.fun',
  morpheus: 'mor.org',
  wayfinder: 'wayfinder.ai',
  'fetch-ai': 'fetch.ai',
};

export function extractDomain(url?: string, nodeId?: string): string | null {
  if (nodeId && KNOWN_DOMAINS[nodeId.toLowerCase()]) {
    return KNOWN_DOMAINS[nodeId.toLowerCase()];
  }
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (!host || host === 'github.com' || host === 'x.com' || host === 'twitter.com') {
      return null;
    }
    return host;
  } catch {
    return null;
  }
}

export function getDomainLogoUrl(domain: string, stamp = getLogoStamp()): string {
  const normalized = domain.trim().toLowerCase();
  if (import.meta.env.PROD) {
    let file = logoManifest[normalized];
    if (!file) {
      const parts = normalized.split('.');
      if (parts.length > 2) {
        file = logoManifest[parts.slice(-2).join('.')];
      }
    }
    if (file) return `${import.meta.env.BASE_URL}logos/${encodeURIComponent(file)}`;
  }
  const version = stamp > 0 ? `&v=${stamp}` : '';
  return `/api/logo?domain=${encodeURIComponent(normalized)}${version}`;
}

export function getNodeLogoUrl(node: { id: string; url?: string }): string | null {
  const domain = extractDomain(node.url, node.id);
  if (!domain) return null;
  return getDomainLogoUrl(domain);
}

const MONOGRAM_COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#3b82f6',
  '#ef4444',
];

export function getNodeMonogram(node: { id: string; label?: string }): {
  text: string;
  bg: string;
  fg: string;
} {
  const raw = (node.label || node.id).trim();
  const words = raw.split(/[\s\-_./]+/).filter(Boolean);
  let text = '';
  if (words.length >= 2 && /^[A-Za-z0-9]/.test(words[0]) && /^[A-Za-z0-9]/.test(words[1])) {
    text = (words[0][0] + words[1][0]).toUpperCase();
  } else {
    const clean = raw.replace(/[^A-Za-z0-9]/g, '');
    text = (clean.slice(0, 2) || raw.slice(0, 1) || 'S').toUpperCase();
  }

  let hash = 0;
  for (let i = 0; i < node.id.length; i++) {
    hash = (hash * 31 + node.id.charCodeAt(i)) | 0;
  }
  const bg = MONOGRAM_COLORS[Math.abs(hash) % MONOGRAM_COLORS.length];
  return { text, bg, fg: '#ffffff' };
}

export function relationLabel(relation: string): string {
  return RELATION_LABELS[relation] ?? relation;
}

export function relationColor(relation: string, theme: ThemeMode = 'dark'): string {
  const map = theme === 'light' ? RELATION_COLOR_LIGHT : RELATION_COLOR_DARK;
  return map[relation] ?? (theme === 'light' ? '#0284c7' : '#38bdf8');
}

export function nodeRadius(type: string): number {
  switch (type) {
    case 'root':
      return 7.4;
    case 'pillar':
      return 5.4;
    case 'category':
      return 3.6;
    default:
      return 2.0;
  }
}
