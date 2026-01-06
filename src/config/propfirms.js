/**
 * @fileoverview PropFirm API Configurations - Rithmic Only
 * @module config/propfirms
 */

/**
 * PropFirm configurations (Rithmic platform only)
 */
const PROPFIRMS = {
  apex_rithmic: {
    id: 'rithmic-apex',
    name: 'Apex',
    displayName: 'Apex (Rithmic)',
    platform: 'Rithmic',
    rithmicSystem: 'Apex',
    wsEndpoint: 'wss://ritpa11120.11.rithmic.com:443',
  },
  topsteptrader: {
    id: 'topsteptrader',
    name: 'TopstepTrader',
    displayName: 'TopstepTrader',
    platform: 'Rithmic',
    rithmicSystem: 'TopstepTrader',
    wsEndpoint: 'wss://ritpa11120.11.rithmic.com:443'
  },
  mes_capital: {
    id: 'mes-capital',
    name: 'MES Capital',
    displayName: 'MES Capital',
    platform: 'Rithmic',
    rithmicSystem: 'MES Capital',
    wsEndpoint: 'wss://ritpa11120.11.rithmic.com:443'
  },
  bulenox_rithmic: {
    id: 'rithmic-bulenox',
    name: 'Bulenox',
    displayName: 'Bulenox (Rithmic)',
    platform: 'Rithmic',
    rithmicSystem: 'Bulenox',
    wsEndpoint: 'wss://ritpa11120.11.rithmic.com:443'
  },
  tradefundrr: {
    id: 'tradefundrr',
    name: 'TradeFundrr',
    displayName: 'TradeFundrr',
    platform: 'Rithmic',
    rithmicSystem: 'TradeFundrr',
    wsEndpoint: 'wss://ritpa11120.11.rithmic.com:443'
  },
  thetradingpit: {
    id: 'thetradingpit',
    name: 'TheTradingPit',
    displayName: 'TheTradingPit',
    platform: 'Rithmic',
    rithmicSystem: 'TheTradingPit',
    wsEndpoint: 'wss://ritpa11120.11.rithmic.com:443'
  },
  fundedfuturesnetwork: {
    id: 'fundedfuturesnetwork',
    name: 'FundedFuturesNetwork',
    displayName: 'FundedFuturesNetwork',
    platform: 'Rithmic',
    rithmicSystem: 'FundedFuturesNetwork',
    wsEndpoint: 'wss://ritpa11120.11.rithmic.com:443'
  },
  propshoptrader: {
    id: 'propshoptrader',
    name: 'PropShopTrader',
    displayName: 'PropShopTrader',
    platform: 'Rithmic',
    rithmicSystem: 'PropShopTrader',
    wsEndpoint: 'wss://ritpa11120.11.rithmic.com:443'
  },
  fourproptrader: {
    id: '4proptrader',
    name: '4PropTrader',
    displayName: '4PropTrader',
    platform: 'Rithmic',
    rithmicSystem: '4PropTrader',
    wsEndpoint: 'wss://ritpa11120.11.rithmic.com:443'
  },
  daytraders_rithmic: {
    id: 'rithmic-daytraders',
    name: 'DayTraders.com',
    displayName: 'DayTraders.com',
    platform: 'Rithmic',
    rithmicSystem: 'DayTraders.com',
    wsEndpoint: 'wss://ritpa11120.11.rithmic.com:443'
  },
  tenxfutures: {
    id: '10xfutures',
    name: '10XFutures',
    displayName: '10XFutures',
    platform: 'Rithmic',
    rithmicSystem: '10XFutures',
    wsEndpoint: 'wss://ritpa11120.11.rithmic.com:443'
  },
  lucidtrading_rithmic: {
    id: 'rithmic-lucidtrading',
    name: 'LucidTrading',
    displayName: 'LucidTrading',
    platform: 'Rithmic',
    rithmicSystem: 'LucidTrading',
    wsEndpoint: 'wss://ritpa11120.11.rithmic.com:443'
  },
  thrivetrading: {
    id: 'thrivetrading',
    name: 'ThriveTrading',
    displayName: 'ThriveTrading',
    platform: 'Rithmic',
    rithmicSystem: 'ThriveTrading',
    wsEndpoint: 'wss://ritpa11120.11.rithmic.com:443'
  },
  legendstrading: {
    id: 'legendstrading',
    name: 'LegendsTrading',
    displayName: 'LegendsTrading',
    platform: 'Rithmic',
    rithmicSystem: 'LegendsTrading',
    wsEndpoint: 'wss://ritpa11120.11.rithmic.com:443'
  },
  earn2trade: {
    id: 'earn2trade',
    name: 'Earn2Trade',
    displayName: 'Earn2Trade',
    platform: 'Rithmic',
    rithmicSystem: 'Earn2Trade',
    wsEndpoint: 'wss://ritpa11120.11.rithmic.com:443'
  },
  tradesea: {
    id: 'tradesea',
    name: 'Tradesea',
    displayName: 'Tradesea',
    platform: 'Rithmic',
    rithmicSystem: 'tradesea',
    wsEndpoint: 'wss://ritpa11120.11.rithmic.com:443'
  }
};

/**
 * PropFirm choices for menus
 */
const PROPFIRM_CHOICES = Object.entries(PROPFIRMS)
  .map(([key, val]) => ({ name: val.displayName, value: key }))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Gets a PropFirm by key
 */
const getPropFirm = (key) => PROPFIRMS[key];

/**
 * Gets PropFirm by ID
 */
const getPropFirmById = (id) => {
  return Object.values(PROPFIRMS).find(pf => pf.id === id);
};

/**
 * Gets all PropFirms
 */
const getAllPropFirms = () => {
  return Object.entries(PROPFIRMS).map(([key, val]) => ({ key, ...val }));
};

module.exports = { 
  PROPFIRMS, 
  PROPFIRM_CHOICES,
  getPropFirm,
  getPropFirmById,
  getAllPropFirms
};
