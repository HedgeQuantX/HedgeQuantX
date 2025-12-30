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

A powerful command-line interface for connecting to prop trading firms and managing your futures trading accounts with automated algo trading capabilities.

[![npm version](https://img.shields.io/npm/v/hedgequantx.svg)](https://www.npmjs.com/package/hedgequantx)
[![npm downloads](https://img.shields.io/npm/dm/hedgequantx.svg)](https://www.npmjs.com/package/hedgequantx)

---

## Features

- **Multi-platform support** - ProjectX, Rithmic, Tradovate
- **37+ supported prop firms**
- **Multi-account connections** - Connect multiple accounts simultaneously
- **Real-time stats** - Balance, P&L, positions, orders
- **Algo Trading** - One Account & Copy Trading modes
- **HQX Server** - Cloud-based execution engine
- **Secure sessions** - AES-256-GCM encrypted storage
- **Auto-update** - Built-in update with restart

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

## Algo Trading Modes

### One Account Mode
Trade on a single account with automated signals and risk management.

- Symbol selection (ES, NQ, MNQ, etc.)
- Configurable contracts quantity
- Daily target and max risk limits
- Real-time P&L tracking
- Activity log with trade history

### Copy Trading Mode
Mirror trades from a Lead account to Follower accounts.

- Lead -> Follower trade copying
- Different symbols per account
- Configurable contract ratios
- Privacy mode (hide account names)
- Low-latency execution via HQX Server

---

## Supported Prop Firms (37+)

| ProjectX (19) | Rithmic (16) | Tradovate (2) |
|---------------|--------------|---------------|
| TopStep | Apex Trader Funding | Apex |
| Alpha Futures | TopstepTrader | TakeProfitTrader |
| TickTickTrader | MES Capital | |
| Bulenox | Bulenox | |
| TradeDay | TradeFundrr | |
| Blusky | TheTradingPit | |
| Goat Futures | FundedFuturesNetwork | |
| The Futures Desk | PropShopTrader | |
| DayTraders | 4PropTrader | |
| E8 Futures | DayTraders.com | |
| Blue Guardian Futures | 10XFutures | |
| FuturesElite | LucidTrading | |
| FXIFY | ThriveTrading | |
| Hola Prime | LegendsTrading | |
| Top One Futures | Earn2Trade | |
| Funding Futures | Tradesea | |
| TX3 Funding | | |
| Lucid Trading | | |
| Tradeify | | |

---

## Dashboard Features

- **View Accounts** - List all trading accounts with balance and status
- **View Stats** - Trading metrics, equity curve, P&L calendar
- **Add Prop-Account** - Connect multiple prop firms
- **Algo-Trading** - One Account & Copy Trading modes
- **Update HQX** - Auto-update with confirmation and restart

---

## Screenshots

### Main Dashboard
```
╔════════════════════════════════════════════════════════════════════════════════════════════════╗
║ ██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗██╗  ██╗ ║
║ ██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝╚██╗██╔╝ ║
║ ███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║    ╚███╔╝  ║
║ ██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║    ██╔██╗  ║
║ ██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ██╔╝ ██╗ ║
║ ╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝ ║
╠════════════════════════════════════════════════════════════════════════════════════════════════╣
║                                Prop Futures Algo Trading  v1.3.0                               ║
╠════════════════════════════════════════════════════════════════════════════════════════════════╣
║         Connections: 2    Accounts: 3    Balance: $601,526    P&L: +$1,526 (+0.3%)             ║
╚════════════════════════════════════════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════════════════════════════════════════╗
║                                      Welcome, HQX Trader!                                      ║
╠════════════════════════════════════════════════════════════════════════════════════════════════╣
║ ┌────────────────────────────────────────────┐  ┌────────────────────────────────────────────┐ ║
║ │                  TopStep                   │  │            Apex Trader Funding             │ ║
║ └────────────────────────────────────────────┘  └────────────────────────────────────────────┘ ║
╠════════════════════════════════════════════════════════════════════════════════════════════════╣
║  [1] View Accounts                               [2] View Stats                                ║
║  [+] Add Prop-Account                            [A] Algo-Trading                              ║
║  [U] Update HQX                                  [X] Disconnect                                ║
╚════════════════════════════════════════════════════════════════════════════════════════════════╝
```

---

## Project Structure

```
HQX-CLI/
├── bin/
│   └── cli.js                  # Entry point
├── src/
│   ├── app.js                  # Main router (380 lines)
│   ├── config/
│   │   ├── constants.js        # Futures symbols
│   │   └── propfirms.js        # 37+ PropFirms config
│   ├── menus/
│   │   ├── connect.js          # Connection menus
│   │   └── dashboard.js        # Dashboard & update
│   ├── pages/
│   │   ├── algo/
│   │   │   ├── ui.js           # Algo trading UI
│   │   │   ├── one-account.js  # One Account mode
│   │   │   └── copy-trading.js # Copy Trading mode
│   │   ├── accounts.js
│   │   └── stats.js
│   ├── security/
│   │   ├── encryption.js       # AES-256-GCM
│   │   ├── validation.js       # Input sanitization
│   │   └── rateLimit.js        # API rate limiting
│   ├── services/
│   │   ├── projectx/           # ProjectX API
│   │   ├── rithmic/            # Rithmic API
│   │   ├── tradovate/          # Tradovate API
│   │   ├── hqx-server.js       # HQX Server API
│   │   └── session.js          # Encrypted sessions
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
- No credentials stored in plain text

---

## Update

The CLI has a built-in update feature:

1. Select **[U] Update HQX** from the dashboard
2. CLI checks npm registry for latest version
3. Prompts for confirmation before updating
4. Installs new version globally
5. Auto-restarts with new version

Or manually:

```bash
npm install -g hedgequantx@latest
```

---

## Changelog

### v1.3.0
- Major refactoring for maintainability
- Robust update function with confirmation
- Fixed stdin leak in menus
- Split services into modules
- Algo UI: logs now show newest at bottom

### v1.2.x
- Algo Trading: One Account & Copy Trading modes
- HQX Server integration
- Rithmic full support
- Multi-account dashboard
- Privacy mode for account names

---

## Roadmap

- [x] ProjectX integration
- [x] Rithmic integration
- [x] Multi-propfirm support (37+ firms)
- [x] Multi-account connections
- [x] Stats with equity curve
- [x] Encrypted sessions
- [x] Algo Trading - One Account mode
- [x] Algo Trading - Copy Trading mode
- [x] HQX Server integration
- [ ] Tradovate full integration
- [ ] Real-time market data streaming
- [ ] Advanced order types
- [ ] Mobile companion app

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
