export const API_URL = import.meta.env.VITE_API_URL || 'https://hedgequantx-production.up.railway.app/api';
export const WS_URL =
  import.meta.env.VITE_WS_URL || 'wss://hedgequantx-production.up.railway.app';

// Propfirms fetched from API at runtime - this is the fallback list
export const PROPFIRMS = [
  { id: 'apex', name: 'Apex Trader Funding', icon: 'Mountain' },
  { id: 'bulenox_r', name: 'Bulenox', icon: 'Shield' },
  { id: 'topstep_r', name: 'Topstep', icon: 'TrendingUp' },
  { id: 'earn2trade', name: 'Earn2Trade', icon: 'GraduationCap' },
  { id: 'mescapital', name: 'MES Capital', icon: 'Zap' },
  { id: 'tradefundrr', name: 'TradeFundrr', icon: 'DollarSign' },
  { id: 'thetradingpit', name: 'The Trading Pit', icon: 'Target' },
  { id: 'fundedfutures', name: 'Funded Futures Network', icon: 'Globe' },
  { id: 'propshop', name: 'PropShop Trader', icon: 'Store' },
  { id: '4proptrader', name: '4PropTrader', icon: 'BarChart3' },
  { id: 'daytraders', name: 'DayTraders.com', icon: 'BarChart3' },
  { id: '10xfutures', name: '10X Futures', icon: 'Rocket' },
  { id: 'lucidtrading', name: 'Lucid Trading', icon: 'Gem' },
  { id: 'thrivetrading', name: 'Thrive Trading', icon: 'TrendingUp' },
  { id: 'legendstrading', name: 'Legends Trading', icon: 'Crown' },
  { id: 'rithmic_paper', name: 'Rithmic Paper Trading', icon: 'FileText' },
];

export const ACCOUNT_STATUS = {
  ACTIVE: 'Active',
  EVAL: 'Evaluation',
  FUNDED: 'Funded',
};

export const POSITION_SIDES = {
  LONG: 'LONG',
  SHORT: 'SHORT',
  FLAT: 'FLAT',
};
