# HedgeQuantX CLI

<div align="center">

<img src="assets/logo.png" alt="HedgeQuantX" width="700">

### Prop Futures Algo Trading CLI

*Connect to 37+ prop firms and automate your futures trading*

[![npm version](https://img.shields.io/npm/v/@hedgequantx/cli?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hedgequantx/cli)
[![npm downloads](https://img.shields.io/npm/dm/@hedgequantx/cli?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hedgequantx/cli)
[![GitHub stars](https://img.shields.io/github/stars/HedgeQuantX/HQX-CLI?style=for-the-badge&logo=github&logoColor=white&color=181717)](https://github.com/HedgeQuantX/HQX-CLI)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey?style=flat-square)](https://github.com/HedgeQuantX/HQX-CLI)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/HedgeQuantX/HQX-CLI/pulls)

[Installation](#-installation) | [Features](#-features) | [Usage](#-usage) | [Algo Trading](#-algo-trading) | [Support](#-support)

</div>

---

## Features

| Feature | Description |
|---------|-------------|
| **Multi-Platform** | ProjectX & Rithmic APIs |
| **37+ Prop Firms** | TopStep, Apex, Bulenox, and more |
| **Multi-Account** | Connect multiple accounts simultaneously |
| **Real-Time Stats** | Balance, P&L, positions, orders |
| **Algo Trading** | One Account & Copy Trading modes |
| **Algo Trading** | Proprietary HQX Strategy |
| **Market Hours** | Auto-blocks when market closed |
| **Local Execution** | Direct API trading, no server needed |
| **Secure Storage** | AES-256-GCM encrypted sessions |
| **Auto-Update** | Built-in version checker |

---

## Installation

### NPM (Recommended)

```bash
npm i -g hedgequantx
```

### Update

```bash
npm update -g hedgequantx
```

### From Source

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
hqx

# Or full command
hedgequantx

# Show version
hqx --version
```

---

## Dashboard Preview

<div align="center">
<img src="assets/dashboard.png" alt="HQX Dashboard" width="800">
</div>

---

## Algo Trading

### One Account Mode

Trade on a single account with HQX algo strategy.

<div align="center">
<img src="assets/algo-trading.png" alt="HQX Algo Trading" width="800">
</div>

### Copy Trading Mode

Mirror trades from Lead to Follower accounts.

<div align="center">
<img src="assets/copy-trading.png" alt="HQX Copy Trading" width="800">
</div>

---

## Supported Prop Firms

### ProjectX Platform (19 firms)

| Firm | Firm |
|------|------|
| TopStep | Alpha Futures |
| TickTickTrader | Bulenox |
| TradeDay | Blusky |
| Goat Futures | The Futures Desk |
| DayTraders | E8 Futures |
| Blue Guardian Futures | FuturesElite |
| FXIFY | Hola Prime |
| Top One Futures | Funding Futures |
| TX3 Funding | Lucid Trading |
| Tradeify | |

### Rithmic Platform (16 firms)

| Firm | Firm |
|------|------|
| Apex Trader Funding | TopstepTrader |
| MES Capital | Bulenox |
| TradeFundrr | TheTradingPit |
| FundedFuturesNetwork | PropShopTrader |
| 4PropTrader | DayTraders.com |
| 10XFutures | LucidTrading |
| ThriveTrading | LegendsTrading |
| Earn2Trade | Tradesea |

### Tradovate Platform (3 firms)

| Firm | Firm |
|------|------|
| Apex | TakeProfitTrader |
| MyFundedFutures | |

---

## Security

| Feature | Implementation |
|---------|---------------|
| Encryption | AES-256-GCM |
| Key Binding | Machine-bound keys |
| Input | Validated & sanitized |
| Rate Limiting | API protection |
| File Permissions | 0600 (owner only) |
| Credentials | Never stored in plain text |

---

## Changelog

<details>
<summary><b>v1.8.x (Current)</b></summary>

- Separate UI for One Account and Copy Trading
- Market hours validation
- Arrow keys navigation
- Contracts from API
- Native readline input
- Seamless UI design
- 40 visible activity logs

</details>

<details>
<summary><b>v1.7.x</b></summary>

- HQX algo strategy
- Copy Trading single symbol
- Spinner indicators
- Cyan color theme

</details>

<details>
<summary><b>v1.3.x</b></summary>

- Major refactoring
- Robust update function
- Modular services

</details>

---

## Roadmap

- [x] ProjectX integration
- [x] Rithmic integration
- [x] 37+ prop firms
- [x] Multi-account
- [x] Stats & equity curve
- [x] Encrypted sessions
- [x] One Account mode
- [x] Copy Trading mode
- [x] HQX Server
- [x] Market hours check
- [ ] Real-time streaming
- [ ] Advanced orders
- [ ] Mobile app

---

## Support

<div align="center">

[![Discord](https://img.shields.io/badge/Discord-Join%20Server-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/UBKCERctZu)
[![GitHub Issues](https://img.shields.io/badge/GitHub-Issues-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/HedgeQuantX/HQX-CLI/issues)

</div>

---

## License

Proprietary - HedgeQuantX

---

## Disclaimer

> This software is for educational and informational purposes only. Trading futures involves substantial risk of loss and is not suitable for all investors. Past performance is not indicative of future results.

---

<div align="center">

**Made with passion by HedgeQuantX**

[![GitHub](https://img.shields.io/badge/GitHub-HedgeQuantX-181717?style=flat-square&logo=github)](https://github.com/HedgeQuantX)

</div>
