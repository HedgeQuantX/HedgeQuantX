# HedgeQuantX CLI

<div align="center">

<img src="assets/logo.png" alt="HedgeQuantX" width="700">

### Prop Futures Algo Trading CLI

*Connect to 37+ prop firms and automate your futures trading*

[![Website](https://img.shields.io/badge/Website-hedgequantx.com-00D4AA?style=for-the-badge&logo=google-chrome&logoColor=white)](https://hedgequantx.com)
[![npm version](https://img.shields.io/npm/v/hedgequantx?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/hedgequantx)
[![npm downloads](https://img.shields.io/npm/dm/hedgequantx?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/hedgequantx)
[![GitHub stars](https://img.shields.io/github/stars/HedgeQuantX/HQX-CLI?style=for-the-badge&logo=github&logoColor=white&color=181717)](https://github.com/HedgeQuantX/HQX-CLI)
[![License](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Windows%20%7C%20macOS%20%7C%20Linux-0078D4?style=for-the-badge&logo=windows-terminal&logoColor=white)](https://github.com/HedgeQuantX/HQX-CLI)
[![Discord](https://img.shields.io/badge/Discord-Join%20Us-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/UBKCERctZu)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-FF6B6B?style=for-the-badge&logo=git&logoColor=white)](https://github.com/HedgeQuantX/HQX-CLI/pulls)

[![Futures](https://img.shields.io/badge/Futures-Trading-F7931A?style=flat-square&logo=bitcoin&logoColor=white)](https://hedgequantx.com)
[![Algo](https://img.shields.io/badge/Algo-Trading-00D4AA?style=flat-square&logo=probot&logoColor=white)](https://hedgequantx.com)
[![Prop Firms](https://img.shields.io/badge/37+-Prop%20Firms-8B5CF6?style=flat-square&logo=building&logoColor=white)](https://hedgequantx.com)
[![Secure](https://img.shields.io/badge/AES--256-Encrypted-EF4444?style=flat-square&logo=shield&logoColor=white)](https://hedgequantx.com)

[Website](https://hedgequantx.com) | [Installation](#installation) | [Features](#features) | [Algo Trading](#algo-trading) | [Discord](https://discord.gg/UBKCERctZu)

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

| ProjectX (19) | Rithmic (16) | Tradovate (3) |
|---------------|--------------|---------------|
| TopStep | Apex Trader Funding | Apex |
| TickTickTrader | TopstepTrader | TakeProfitTrader |
| TradeDay | MES Capital | MyFundedFutures |
| Goat Futures | Bulenox | |
| Alpha Futures | TradeFundrr | |
| Bulenox | TheTradingPit | |
| Blusky | FundedFuturesNetwork | |
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

| Done | Done | Coming Soon |
|------|------|-------------|
| :white_check_mark: ProjectX integration | :white_check_mark: One Account mode | :hourglass: Real-time streaming |
| :white_check_mark: Rithmic integration | :white_check_mark: Copy Trading mode | :hourglass: Advanced orders |
| :white_check_mark: 38+ prop firms | :white_check_mark: HQX Server | :hourglass: Mobile app |
| :white_check_mark: Multi-account | :white_check_mark: Market hours check | :hourglass: Telegram alerts |
| :white_check_mark: Stats & equity curve | :white_check_mark: Session summary | :hourglass: Custom strategies |
| :white_check_mark: Encrypted sessions | :white_check_mark: Auto-update | :hourglass: Web dashboard |

---

## Support

<div align="center">

[![Discord](https://img.shields.io/badge/Discord-Join%20Server-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/UBKCERctZu)
[![GitHub Issues](https://img.shields.io/badge/GitHub-Issues-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/HedgeQuantX/HQX-CLI/issues)

</div>

---

## License

MIT License - Open Source

---

## Disclaimer

> This software is for educational and informational purposes only. Trading futures involves substantial risk of loss and is not suitable for all investors. Past performance is not indicative of future results.

---

<div align="center">

**Made with passion by HedgeQuantX**

[![GitHub](https://img.shields.io/badge/GitHub-HedgeQuantX-181717?style=flat-square&logo=github)](https://github.com/HedgeQuantX)

</div>
