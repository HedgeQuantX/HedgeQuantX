/**
 * PropFirm API Configurations
 * UserAPI: Authentication, accounts, user info
 * GatewayAPI: Trading (orders, positions, trades)
 */

const PROPFIRMS = {
  topstep: {
    name: 'Topstep',
    userApi: 'userapi.topstepx.com',
    gatewayApi: 'api.topstepx.com'
  },
  alpha_futures: {
    name: 'Alpha Futures',
    userApi: 'userapi.alphafutures.projectx.com',
    gatewayApi: 'api.alphafutures.projectx.com'
  },
  tickticktrader: {
    name: 'TickTickTrader',
    userApi: 'userapi.tickticktrader.projectx.com',
    gatewayApi: 'api.tickticktrader.projectx.com'
  },
  bulenox: {
    name: 'Bulenox',
    userApi: 'userapi.bulenox.projectx.com',
    gatewayApi: 'api.bulenox.projectx.com'
  },
  tradeday: {
    name: 'TradeDay',
    userApi: 'userapi.tradeday.projectx.com',
    gatewayApi: 'api.tradeday.projectx.com'
  },
  blusky: {
    name: 'Blusky',
    userApi: 'userapi.blusky.projectx.com',
    gatewayApi: 'api.blusky.projectx.com'
  },
  goat_futures: {
    name: 'Goat Futures',
    userApi: 'userapi.goatfunded.projectx.com',
    gatewayApi: 'api.goatfunded.projectx.com'
  },
  futures_desk: {
    name: 'The Futures Desk',
    userApi: 'userapi.thefuturesdesk.projectx.com',
    gatewayApi: 'api.thefuturesdesk.projectx.com'
  }
};

// PropFirm display list for menus
const PROPFIRM_CHOICES = Object.entries(PROPFIRMS).map(([key, val]) => ({
  name: val.name,
  value: key
}));

module.exports = { PROPFIRMS, PROPFIRM_CHOICES };
