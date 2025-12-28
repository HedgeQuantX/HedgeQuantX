/**
 * ProjectX API Service
 * UserAPI: Connexion, gestion des comptes, stats, trades
 * GatewayAPI: Trading (orders, positions)
 */

const https = require('https');

// Configuration des URLs par PropFirm
// UserAPI: userapi.[propfirm].projectx.com
// GatewayAPI: api.[propfirm].projectx.com
const PROPFIRM_CONFIG = {
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
  },
  daytraders: {
    name: 'DayTraders',
    userApi: 'userapi.daytraders.projectx.com',
    gatewayApi: 'api.daytraders.projectx.com'
  },
  e8_futures: {
    name: 'E8 Futures',
    userApi: 'userapi.e8x.projectx.com',
    gatewayApi: 'api.e8x.projectx.com'
  },
  blue_guardian: {
    name: 'Blue Guardian Futures',
    userApi: 'userapi.blueguardian.projectx.com',
    gatewayApi: 'api.blueguardian.projectx.com'
  },
  futures_elite: {
    name: 'FuturesElite',
    userApi: 'userapi.futureselite.projectx.com',
    gatewayApi: 'api.futureselite.projectx.com'
  },
  fxify: {
    name: 'FXIFY',
    userApi: 'userapi.fxify.projectx.com',
    gatewayApi: 'api.fxify.projectx.com'
  },
  hola_prime: {
    name: 'Hola Prime',
    userApi: 'userapi.holaprime.projectx.com',
    gatewayApi: 'api.holaprime.projectx.com'
  },
  top_one_futures: {
    name: 'Top One Futures',
    userApi: 'userapi.toponefutures.projectx.com',
    gatewayApi: 'api.toponefutures.projectx.com'
  },
  funding_futures: {
    name: 'Funding Futures',
    userApi: 'userapi.fundingfutures.projectx.com',
    gatewayApi: 'api.fundingfutures.projectx.com'
  },
  tx3_funding: {
    name: 'TX3 Funding',
    userApi: 'userapi.tx3funding.projectx.com',
    gatewayApi: 'api.tx3funding.projectx.com'
  },
  lucid_trading: {
    name: 'Lucid Trading',
    userApi: 'userapi.lucidtrading.projectx.com',
    gatewayApi: 'api.lucidtrading.projectx.com'
  },
  tradeify: {
    name: 'Tradeify',
    userApi: 'userapi.tradeify.projectx.com',
    gatewayApi: 'api.tradeify.projectx.com'
  }
};

class ProjectXService {
  constructor(propfirmKey) {
    this.propfirm = PROPFIRM_CONFIG[propfirmKey];
    if (!this.propfirm) {
      throw new Error(`Unknown propfirm: ${propfirmKey}`);
    }
    this.token = null;
    this.user = null;
  }

  /**
   * Helper pour faire des requêtes HTTPS
   */
  _request(host, path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: host,
        port: 443,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };

      if (this.token) {
        options.headers['Authorization'] = `Bearer ${this.token}`;
      }

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            resolve({ statusCode: res.statusCode, data: json });
          } catch (e) {
            resolve({ statusCode: res.statusCode, data: body });
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  // ==================== USER API ====================

  /**
   * Login avec username/password via UserAPI
   * @param {string} userName 
   * @param {string} password 
   * @returns {Promise<{success: boolean, token?: string, error?: string}>}
   */
  async login(userName, password) {
    try {
      const response = await this._request(
        this.propfirm.userApi,
        '/Login',
        'POST',
        { userName, password }
      );

      if (response.statusCode === 200 && response.data.token) {
        this.token = response.data.token;
        return { success: true, token: this.token };
      } else {
        return { 
          success: false, 
          error: response.data.errorMessage || 'Invalid credentials' 
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Login avec API Key via UserAPI
   * @param {string} userName 
   * @param {string} apiKey 
   * @returns {Promise<{success: boolean, token?: string, error?: string}>}
   */
  async loginWithApiKey(userName, apiKey) {
    try {
      const response = await this._request(
        this.propfirm.userApi,
        '/Login/key',
        'POST',
        { userName, apiKey }
      );

      if (response.statusCode === 200 && response.data.token) {
        this.token = response.data.token;
        return { success: true, token: this.token };
      } else {
        return { 
          success: false, 
          error: response.data.errorMessage || 'Invalid API key' 
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Récupérer les infos de l'utilisateur connecté
   * @returns {Promise<{success: boolean, user?: object, error?: string}>}
   */
  async getUser() {
    try {
      const response = await this._request(
        this.propfirm.userApi,
        '/User',
        'GET'
      );

      if (response.statusCode === 200) {
        this.user = response.data;
        return { success: true, user: response.data };
      } else {
        return { 
          success: false, 
          error: response.data.errorMessage || 'Failed to get user info' 
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Récupérer les comptes de trading
   * @returns {Promise<{success: boolean, accounts?: array, error?: string}>}
   */
  async getTradingAccounts() {
    try {
      const response = await this._request(
        this.propfirm.userApi,
        '/TradingAccount',
        'GET'
      );

      if (response.statusCode === 200) {
        return { success: true, accounts: response.data };
      } else {
        return { 
          success: false, 
          error: response.data.errorMessage || 'Failed to get accounts' 
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Récupérer les détails d'un compte spécifique
   * @param {number} accountId 
   * @returns {Promise<{success: boolean, account?: object, error?: string}>}
   */
  async getAccountDetails(accountId) {
    try {
      const response = await this._request(
        this.propfirm.userApi,
        `/TradingAccount/${accountId}`,
        'GET'
      );

      if (response.statusCode === 200) {
        return { success: true, account: response.data };
      } else {
        return { 
          success: false, 
          error: response.data.errorMessage || 'Failed to get account details' 
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Récupérer les ordres d'un compte
   * @param {number} accountId 
   * @returns {Promise<{success: boolean, orders?: array, error?: string}>}
   */
  async getOrders(accountId) {
    try {
      const response = await this._request(
        this.propfirm.userApi,
        `/Order?accountId=${accountId}`,
        'GET'
      );

      if (response.statusCode === 200) {
        return { success: true, orders: response.data };
      } else {
        return { 
          success: false, 
          error: response.data.errorMessage || 'Failed to get orders' 
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Récupérer les positions d'un compte
   * @param {number} accountId 
   * @returns {Promise<{success: boolean, positions?: array, error?: string}>}
   */
  async getPositions(accountId) {
    try {
      const response = await this._request(
        this.propfirm.userApi,
        `/Position?accountId=${accountId}`,
        'GET'
      );

      if (response.statusCode === 200) {
        return { success: true, positions: response.data };
      } else {
        return { 
          success: false, 
          error: response.data.errorMessage || 'Failed to get positions' 
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Rechercher les comptes via UserAPI
   * @param {boolean} onlyActiveAccounts 
   * @returns {Promise<{success: boolean, accounts?: array, error?: string}>}
   */
  async searchAccounts(onlyActiveAccounts = true) {
    try {
      // UserAPI: use getTradingAccounts as primary method
      const result = await this.getTradingAccounts();
      if (result.success && result.accounts) {
        if (onlyActiveAccounts) {
          // Filter only active accounts (status 0 = Active)
          const activeAccounts = result.accounts.filter(a => a.status === 0);
          return { success: true, accounts: activeAccounts };
        }
        return { success: true, accounts: result.accounts };
      }
      return { success: false, error: 'Failed to search accounts' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Récupérer l'historique des trades d'un compte via UserAPI /Statistics/trades
   * @param {number} accountId 
   * @param {number} days - Nombre de jours d'historique (default: 30)
   * @returns {Promise<{success: boolean, trades?: array, error?: string}>}
   */
  async getTradeHistory(accountId, days = 30) {
    try {
      // Use UserAPI /Statistics/trades endpoint (POST with accountId in body)
      const response = await this._request(
        this.propfirm.userApi,
        `/Statistics/trades`,
        'POST',
        { accountId: parseInt(accountId) }
      );

      if (response.statusCode === 200 && response.data) {
        const tradesData = Array.isArray(response.data) ? response.data : (response.data.trades || response.data.items || []);
        const trades = tradesData.map(t => ({
          ...t,
          timestamp: t.creationTimestamp || t.timestamp || t.date || t.fillTime || t.time,
          pnl: t.profitAndLoss || t.pnl || t.realizedPnl || t.pl || 0
        }));
        return { success: true, trades: trades };
      }

      return { success: true, trades: [], error: 'No trade history available' };
    } catch (error) {
      return { success: true, trades: [], error: error.message };
    }
  }
  
  /**
   * Récupérer les trades du jour via UserAPI /Statistics/daytrades
   * @param {number} accountId 
   * @returns {Promise<{success: boolean, trades?: array, error?: string}>}
   */
  async getDayTrades(accountId) {
    try {
      const response = await this._request(
        this.propfirm.userApi,
        `/Statistics/daytrades`,
        'POST',
        { accountId: parseInt(accountId) }
      );

      if (response.statusCode === 200 && response.data) {
        const tradesData = Array.isArray(response.data) ? response.data : (response.data.trades || response.data.items || []);
        return { success: true, trades: tradesData };
      }

      return { success: true, trades: [], error: 'No day trades available' };
    } catch (error) {
      return { success: true, trades: [], error: error.message };
    }
  }

  /**
   * Récupérer les statistiques du jour via UserAPI /Statistics/todaystats
   * @param {number} accountId 
   * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
   */
  async getTodayStats(accountId) {
    try {
      const response = await this._request(
        this.propfirm.userApi,
        `/Statistics/todaystats`,
        'POST',
        { accountId: parseInt(accountId) }
      );

      if (response.statusCode === 200 && response.data) {
        return { success: true, stats: response.data };
      }
      return { success: false, stats: null, error: 'Failed to get today stats' };
    } catch (error) {
      return { success: false, stats: null, error: error.message };
    }
  }

  /**
   * Récupérer les statistiques d'un jour spécifique via UserAPI /Statistics/daystats
   * @param {number} accountId 
   * @param {string} date - Date au format YYYY-MM-DD
   * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
   */
  async getDayStats(accountId, date) {
    try {
      const response = await this._request(
        this.propfirm.userApi,
        `/Statistics/daystats`,
        'POST',
        { accountId: parseInt(accountId), date: date }
      );

      if (response.statusCode === 200 && response.data) {
        return { success: true, stats: response.data };
      }
      return { success: false, stats: null, error: 'Failed to get day stats' };
    } catch (error) {
      return { success: false, stats: null, error: error.message };
    }
  }

  /**
   * Récupérer les statistiques lifetime via UserAPI /Statistics/lifetimestats
   * @param {number} accountId 
   * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
   */
  async getLifetimeStats(accountId) {
    try {
      const response = await this._request(
        this.propfirm.userApi,
        `/Statistics/lifetimestats`,
        'POST',
        { accountId: parseInt(accountId) }
      );

      if (response.statusCode === 200 && response.data) {
        return { success: true, stats: response.data };
      }
      return { success: false, stats: null, error: 'Failed to get lifetime stats' };
    } catch (error) {
      return { success: false, stats: null, error: error.message };
    }
  }

  /**
   * Récupérer les statistiques daily (par jour) via UserAPI /Statistics/daily
   * @param {number} accountId 
   * @returns {Promise<{success: boolean, stats?: array, error?: string}>}
   */
  async getDailyStats(accountId) {
    try {
      const response = await this._request(
        this.propfirm.userApi,
        `/Statistics/daily`,
        'POST',
        { accountId: parseInt(accountId) }
      );

      if (response.statusCode === 200 && response.data) {
        const statsData = Array.isArray(response.data) ? response.data : (response.data.days || response.data.items || []);
        return { success: true, stats: statsData };
      }
      return { success: false, stats: [], error: 'Failed to get daily stats' };
    } catch (error) {
      return { success: false, stats: [], error: error.message };
    }
  }

  /**
   * Récupérer les statistiques weekly via UserAPI /Statistics/weekly
   * @param {number} accountId 
   * @returns {Promise<{success: boolean, stats?: array, error?: string}>}
   */
  async getWeeklyStats(accountId) {
    try {
      const response = await this._request(
        this.propfirm.userApi,
        `/Statistics/weekly`,
        'POST',
        { accountId: parseInt(accountId) }
      );

      if (response.statusCode === 200 && response.data) {
        const statsData = Array.isArray(response.data) ? response.data : (response.data.weeks || response.data.items || []);
        return { success: true, stats: statsData };
      }
      return { success: false, stats: [], error: 'Failed to get weekly stats' };
    } catch (error) {
      return { success: false, stats: [], error: error.message };
    }
  }

  /**
   * Récupérer les statistiques monthly via UserAPI /Statistics/monthly
   * @param {number} accountId 
   * @returns {Promise<{success: boolean, stats?: array, error?: string}>}
   */
  async getMonthlyStats(accountId) {
    try {
      const response = await this._request(
        this.propfirm.userApi,
        `/Statistics/monthly`,
        'POST',
        { accountId: parseInt(accountId) }
      );

      if (response.statusCode === 200 && response.data) {
        const statsData = Array.isArray(response.data) ? response.data : (response.data.months || response.data.items || []);
        return { success: true, stats: statsData };
      }
      return { success: false, stats: [], error: 'Failed to get monthly stats' };
    } catch (error) {
      return { success: false, stats: [], error: error.message };
    }
  }

  /**
   * Récupérer win/loss average via UserAPI /Statistics/winlossavg
   * @param {number} accountId 
   * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
   */
  async getWinLossAvg(accountId) {
    try {
      const response = await this._request(
        this.propfirm.userApi,
        `/Statistics/winlossavg`,
        'POST',
        { accountId: parseInt(accountId) }
      );

      if (response.statusCode === 200 && response.data) {
        return { success: true, stats: response.data };
      }
      return { success: false, stats: null, error: 'Failed to get win/loss avg' };
    } catch (error) {
      return { success: false, stats: null, error: error.message };
    }
  }

  /**
   * Récupérer profit factor via UserAPI /Statistics/profitFactor
   * @param {number} accountId 
   * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
   */
  async getProfitFactor(accountId) {
    try {
      const response = await this._request(
        this.propfirm.userApi,
        `/Statistics/profitFactor`,
        'POST',
        { accountId: parseInt(accountId) }
      );

      if (response.statusCode === 200 && response.data) {
        return { success: true, stats: response.data };
      }
      return { success: false, stats: null, error: 'Failed to get profit factor' };
    } catch (error) {
      return { success: false, stats: null, error: error.message };
    }
  }
  
  /**
   * Récupérer les statistiques d'un compte via UserAPI
   * @param {number} accountId 
   * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
   */
  async getAccountStats(accountId) {
    try {
      // Try /TradingAccount/stats endpoint
      let response = await this._request(
        this.propfirm.userApi,
        `/TradingAccount/${accountId}/stats`,
        'GET'
      );

      if (response.statusCode === 200 && response.data) {
        return { success: true, stats: response.data };
      }
      
      // Try /Stats endpoint
      response = await this._request(
        this.propfirm.userApi,
        `/Stats?accountId=${accountId}`,
        'GET'
      );

      if (response.statusCode === 200 && response.data) {
        return { success: true, stats: response.data };
      }
      
      // Try /AccountStats endpoint
      response = await this._request(
        this.propfirm.userApi,
        `/AccountStats?accountId=${accountId}`,
        'GET'
      );

      if (response.statusCode === 200 && response.data) {
        return { success: true, stats: response.data };
      }

      return { success: false, stats: null, error: 'Stats not available' };
    } catch (error) {
      return { success: false, stats: null, error: error.message };
    }
  }
  
  /**
   * Récupérer l'historique des ordres exécutés (filled) d'un compte
   * @param {number} accountId 
   * @param {number} days - Nombre de jours d'historique (default: 30)
   * @returns {Promise<{success: boolean, orders?: array, error?: string}>}
   */
  async getFilledOrders(accountId, days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // Get all orders
      const response = await this._request(
        this.propfirm.userApi,
        `/Order?accountId=${accountId}`,
        'GET'
      );

      if (response.statusCode === 200 && Array.isArray(response.data)) {
        // Filter filled orders (status 2 = Filled)
        const filledOrders = response.data.filter(o => o.status === 2);
        
        // Filter by date if needed
        const filteredOrders = filledOrders.filter(o => {
          if (o.fillTime || o.timestamp || o.createdAt) {
            const orderDate = new Date(o.fillTime || o.timestamp || o.createdAt);
            return orderDate >= startDate && orderDate <= endDate;
          }
          return true; // Include if no date
        });
        
        return { success: true, orders: filteredOrders };
      }

      return { success: true, orders: [], error: 'No filled orders' };
    } catch (error) {
      return { success: true, orders: [], error: error.message };
    }
  }

  /**
   * Vérifier si le marché est ouvert pour un compte
   * @param {number} accountId 
   * @returns {Promise<{success: boolean, isOpen?: boolean, message?: string, error?: string}>}
   */
  async getMarketStatus(accountId) {
    try {
      // Try to get account details which includes market status
      const response = await this._request(
        this.propfirm.userApi,
        `/TradingAccount/${accountId}`,
        'GET'
      );

      if (response.statusCode === 200 && response.data) {
        const account = response.data;
        // Check account status: 0 = Active, can trade
        // Also check if there's a marketOpen or canTrade field
        const isActive = account.status === 0;
        const canTrade = account.canTrade !== false; // Default to true if not specified
        const isOpen = isActive && canTrade;
        
        return { 
          success: true, 
          isOpen,
          accountStatus: account.status,
          message: isOpen ? 'Market is OPEN' : 'Market is CLOSED or account cannot trade'
        };
      }
      
      return { success: false, error: 'Failed to get market status' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Vérifier les heures de marché (estimation basée sur les futures CME)
   * Futures CME: Dimanche 17h CT - Vendredi 16h CT (avec pause 16h-17h chaque jour)
   * @returns {{isOpen: boolean, message: string, nextOpen?: string, nextClose?: string}}
   */
  checkMarketHours() {
    const now = new Date();
    const utcDay = now.getUTCDay();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();
    
    // Convert to CT (Central Time) - UTC-6 (CST) or UTC-5 (CDT)
    // Using UTC-6 as approximation
    let ctHour = utcHour - 6;
    let ctDay = utcDay;
    if (ctHour < 0) {
      ctHour += 24;
      ctDay = (ctDay + 6) % 7;
    }
    
    // Market closed times:
    // - Saturday all day
    // - Sunday before 17:00 CT
    // - Friday after 16:00 CT
    // - Daily maintenance: 16:00-17:00 CT (Mon-Thu)
    
    let isOpen = true;
    let message = 'Market is OPEN';
    
    // Saturday - closed
    if (ctDay === 6) {
      isOpen = false;
      message = 'Market CLOSED (Weekend)';
    }
    // Sunday before 17:00 CT
    else if (ctDay === 0 && ctHour < 17) {
      isOpen = false;
      message = 'Market CLOSED (Opens Sunday 5:00 PM CT)';
    }
    // Friday after 16:00 CT
    else if (ctDay === 5 && ctHour >= 16) {
      isOpen = false;
      message = 'Market CLOSED (Weekend)';
    }
    // Daily maintenance 16:00-17:00 CT (Mon-Thu)
    else if (ctDay >= 1 && ctDay <= 4 && ctHour === 16) {
      isOpen = false;
      message = 'Market CLOSED (Daily Maintenance 4:00-5:00 PM CT)';
    }
    
    return { isOpen, message };
  }

  // ==================== GATEWAY API (Trading Only) ====================

  /**
   * Placer un ordre via GatewayAPI
   * @param {object} orderData 
   * @returns {Promise<{success: boolean, orderId?: number, error?: string}>}
   */
  async placeOrder(orderData) {
    try {
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Order/place',
        'POST',
        orderData
      );

      if (response.statusCode === 200 && response.data.success) {
        return { success: true, orderId: response.data.orderId };
      } else {
        return { 
          success: false, 
          error: response.data.errorMessage || 'Failed to place order' 
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Annuler un ordre via GatewayAPI
   * @param {number} accountId 
   * @param {number} orderId 
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async cancelOrder(accountId, orderId) {
    try {
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Order/cancel',
        'POST',
        { accountId, orderId }
      );

      if (response.statusCode === 200 && response.data.success) {
        return { success: true };
      } else {
        return { 
          success: false, 
          error: response.data.errorMessage || 'Failed to cancel order' 
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Rechercher des contrats via GatewayAPI
   * @param {string} searchText - Texte à rechercher (ex: "NQ", "ES")
   * @param {boolean} live - Utiliser les données live ou sim
   * @returns {Promise<{success: boolean, contracts?: array, error?: string}>}
   */
  async searchContracts(searchText, live = false) {
    try {
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Contract/search',
        'POST',
        { searchText, live }
      );

      if (response.statusCode === 200 && response.data.success) {
        return { success: true, contracts: response.data.contracts };
      } else {
        return { 
          success: false, 
          error: response.data.errorMessage || 'Failed to search contracts' 
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Récupérer les contrats disponibles via GatewayAPI
   * @param {boolean} live - Utiliser les données live ou sim
   * @returns {Promise<{success: boolean, contracts?: array, error?: string}>}
   */
  async getAvailableContracts(live = false) {
    try {
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Contract/available',
        'POST',
        { live }
      );

      if (response.statusCode === 200 && response.data.success) {
        return { success: true, contracts: response.data.contracts };
      } else {
        return { 
          success: false, 
          error: response.data.errorMessage || 'Failed to get available contracts' 
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Fermer une position via GatewayAPI
   * @param {number} accountId 
   * @param {string} contractId 
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async closePosition(accountId, contractId) {
    try {
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Position/closeContract',
        'POST',
        { accountId, contractId }
      );

      if (response.statusCode === 200 && response.data.success) {
        return { success: true };
      } else {
        return { 
          success: false, 
          error: response.data.errorMessage || 'Failed to close position' 
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Getter pour le nom de la propfirm
   */
  getPropfirmName() {
    return this.propfirm.name;
  }

  /**
   * Getter pour le token
   */
  getToken() {
    return this.token;
  }

  /**
   * Getter pour les URLs
   */
  getUrls() {
    return {
      userApi: `https://${this.propfirm.userApi}`,
      gatewayApi: `https://${this.propfirm.gatewayApi}`
    };
  }

  /**
   * Vérifier si connecté
   */
  isConnected() {
    return this.token !== null;
  }

  /**
   * Déconnexion
   */
  logout() {
    this.token = null;
    this.user = null;
  }
}

module.exports = { ProjectXService, PROPFIRM_CONFIG };
