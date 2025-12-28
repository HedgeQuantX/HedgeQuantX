# HedgeQuantX CLI

```
██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗██╗  ██╗
██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝╚██╗██╔╝
███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║    ╚███╔╝ 
██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║    ██╔██╗ 
██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ██╔╝ ██╗
╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝
```

**Prop Futures Algo Trading CLI**

A powerful command-line interface for connecting to prop trading firms and managing your futures trading accounts.

[![npm version](https://img.shields.io/npm/v/hedgequantx.svg)](https://www.npmjs.com/package/hedgequantx)
[![npm downloads](https://img.shields.io/npm/dm/hedgequantx.svg)](https://www.npmjs.com/package/hedgequantx)

---

## Features

- Multi-platform support (ProjectX, Tradovate, Rithmic)
- 37 supported prop firms
- Multi-account connections
- Real-time stats (balance, P&L, positions)
- Secure encrypted session storage
- Auto-update with restart

---

## Installation

### Option 1: NPM (Recommended)

```bash
npm install -g hedgequantx
```

### Option 2: Clone from GitHub

```bash
git clone https://github.com/HedgeQuantX/HQX-CLI.git
cd HQX-CLI
npm install
npm link
```

---

## Usage

```bash
# Launch CLI
hedgequantx

# Or use short alias
hqx

# Show version
hedgequantx version
```

---

## Supported Prop Firms

### ProjectX (19 firms)

| Firm | Status |
|------|--------|
| TopStep | Active |
| Alpha Futures | Active |
| TickTickTrader | Active |
| Bulenox | Active |
| TradeDay | Active |
| Blusky | Active |
| Goat Futures | Active |
| The Futures Desk | Active |
| DayTraders | Active |
| E8 Futures | Active |
| Blue Guardian Futures | Active |
| FuturesElite | Active |
| FXIFY | Active |
| Hola Prime | Active |
| Top One Futures | Active |
| Funding Futures | Active |
| TX3 Funding | Active |
| Lucid Trading | Active |
| Tradeify | Active |

### Tradovate (2 firms)

| Firm | Status |
|------|--------|
| Apex | Coming Soon |
| TakeProfitTrader | Coming Soon |

### Rithmic (16 firms)

| Firm | Status |
|------|--------|
| Apex | Coming Soon |
| TopstepTrader | Coming Soon |
| MES Capital | Coming Soon |
| Bulenox | Coming Soon |
| TradeFundrr | Coming Soon |
| TheTradingPit | Coming Soon |
| FundedFuturesNetwork | Coming Soon |
| PropShopTrader | Coming Soon |
| 4PropTrader | Coming Soon |
| DayTraders.com | Coming Soon |
| 10XFutures | Coming Soon |
| LucidTrading | Coming Soon |
| ThriveTrading | Coming Soon |
| LegendsTrading | Coming Soon |
| Earn2Trade | Coming Soon |
| Tradesea | Coming Soon |

---

## Dashboard Features

- **View Accounts** - List all trading accounts with balance and status
- **View Positions** - Open positions with P&L
- **View Orders** - Pending and filled orders
- **View Stats** - Trading metrics, equity curve, P&L calendar
- **User Info** - Account details
- **Add Prop-Account** - Connect multiple prop firms
- **Algo-Trading** - Automated trading (coming soon)
- **Update HQX** - Auto-update with restart

---

## Screenshots

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗██╗  ██╗║
║██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝╚██╗██╔╝║
║███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║    ╚███╔╝ ║
║██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║    ██╔██╗ ║
║██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ██╔╝ ██╗║
║╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝║
╠══════════════════════════════════════════════════════════════════════════════════════════════╣
║                              Prop Futures Algo Trading  v1.2.0                               ║
╠══════════════════════════════════════════════════════════════════════════════════════════════╣
║         Connections: 1    Accounts: 2    Balance: $299,776    P&L: $-223 (-0.1%)             ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝

? Dashboard:
  > View Accounts
    View Positions
    View Orders
    View Stats
    User Info
    Add Prop-Account
    ──────────────
    Algo-Trading
    ──────────────
    Update HQX
    Disconnect
```

---

## Project Structure

```
HQX-CLI/
├── bin/
│   └── cli.js                # Entry point
├── src/
│   ├── app.js                # Main router
│   ├── config/
│   │   ├── index.js
│   │   ├── constants.js
│   │   └── propfirms.js      # 37 PropFirms config
│   ├── pages/
│   │   ├── accounts.js
│   │   ├── orders.js
│   │   ├── positions.js
│   │   ├── stats.js
│   │   └── user.js
│   ├── security/
│   │   ├── encryption.js     # AES-256-GCM
│   │   ├── validation.js     # Input sanitization
│   │   └── rateLimit.js      # API rate limiting
│   ├── services/
│   │   ├── projectx.js       # ProjectX API
│   │   ├── session.js        # Encrypted sessions
│   │   └── hqx-server.js     # HQX Server API
│   └── ui/
│       ├── box.js
│       ├── table.js
│       └── device.js
├── package.json
└── README.md
```

---

## Security

- AES-256-GCM encrypted session storage
- Machine-bound encryption keys
- Input validation and sanitization
- API rate limiting
- Secure file permissions (0600)

---

## Update

The CLI has a built-in update feature:

1. Select **Update HQX** from the dashboard
2. CLI pulls latest changes from GitHub
3. Installs dependencies
4. Auto-restarts with new version

Or manually:

```bash
cd ~/HQX-CLI && git pull origin main
```

---

## Roadmap

- [x] ProjectX integration
- [x] Multi-propfirm support (37 firms)
- [x] Account viewing
- [x] Position viewing
- [x] Order viewing
- [x] Stats with equity curve
- [x] Encrypted sessions
- [x] Multi-account connections
- [ ] Rithmic integration
- [ ] Tradovate integration
- [ ] Algo trading engine
- [ ] Real-time market data
- [ ] Order placement

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Disclaimer

This software is for educational and informational purposes only. Trading futures involves substantial risk of loss and is not suitable for all investors. Past performance is not indicative of future results.

---

## Support

- Discord: [https://discord.gg/UBKCERctZu](https://discord.gg/UBKCERctZu)
- GitHub Issues: [https://github.com/HedgeQuantX/HQX-CLI/issues](https://github.com/HedgeQuantX/HQX-CLI/issues)

---

**Made with passion by HedgeQuantX**
