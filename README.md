# HedgeQuantX CLI

**Prop Futures Algo Trading CLI**

A powerful command-line interface for connecting to prop trading firms and managing your futures trading accounts.

---

## Features

- Multi-platform connection support (ProjectX, Rithmic, Tradovate)
- 19+ supported prop firms via ProjectX
- Real-time account management
- View positions, orders, and account stats
- Secure authentication

## Supported Prop Firms (ProjectX)

| Firm | Status |
|------|--------|
| Topstep | Active |
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
| Earn2Trade | Coming Soon |

---

## Installation

### Prerequisites

- Node.js >= 16.x
- npm >= 8.x

### Option 1: Install from GitHub

```bash
npm install -g github:HedgeQuantX/HQX-CLI
```

### Option 2: Clone and Install

```bash
git clone https://github.com/HedgeQuantX/HQX-CLI.git
cd HQX-CLI
npm install
npm link
```

### Option 3: Download and Install

```bash
# Download the package
curl -L -o hedgequantx.tgz https://github.com/HedgeQuantX/HQX-CLI/releases/latest/download/hedgequantx-1.0.0.tgz

# Install globally
npm install -g hedgequantx.tgz
```

---

## Usage

### Launch the CLI

```bash
hedgequantx
```

### CLI Commands

```bash
hedgequantx --version    # Show version
hedgequantx --help       # Show help
hedgequantx status       # Show system status
```

---

## Quick Start

1. **Launch the CLI**
   ```bash
   hedgequantx
   ```

2. **Select your connection**
   - ProjectX
   - Rithmic (coming soon)
   - Tradovate (coming soon)

3. **Choose your prop firm**
   - Select from the list of supported firms

4. **Login with your credentials**
   - Enter your username
   - Enter your password

5. **Access your dashboard**
   - View Accounts
   - View Positions
   - View Orders
   - User Info

---

## Screenshots

```
██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗██╗  ██╗
██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝╚██╗██╔╝
███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║    ╚███╔╝ 
██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║    ██╔██╗ 
██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ██╔╝ ██╗
╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝
────────────────────────────────────────────────────────────────────────────────────────────
  Prop Futures Algo Trading
────────────────────────────────────────────────────────────────────────────────────────────

? Choose Your Connection:
  ❯ ProjectX
    Rithmic
    Tradovate
    ──────────────
    Exit
```

---

## Project Structure

```
HQX-CLI/
├── bin/
│   └── cli.js              # Main CLI entry point
├── src/
│   ├── api/
│   │   ├── projectx_userapi.json     # ProjectX User API spec
│   │   └── projectx_gatewayapi.json  # ProjectX Gateway API spec
│   └── services/
│       └── projectx.js     # ProjectX API service
├── package.json
├── claude.md               # Development rules
└── README.md
```

---

## API Documentation

### ProjectX APIs

- **UserAPI**: Authentication, account management, stats, trades
  - Host: `userapi.[propfirm].projectx.com`
  
- **GatewayAPI**: Trading operations (orders, positions)
  - Host: `api.[propfirm].projectx.com`

---

## Development

### Run in development mode

```bash
cd HQX-CLI
npm run dev
```

### Run tests

```bash
npm test
```

---

## Roadmap

- [x] ProjectX integration
- [x] Multi-propfirm support
- [x] Account viewing
- [x] Position viewing
- [x] Order viewing
- [ ] Rithmic integration
- [ ] Tradovate integration
- [ ] Algo trading engine
- [ ] Real-time market data
- [ ] Order placement
- [ ] Strategy builder

---

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Disclaimer

This software is for educational and informational purposes only. Trading futures involves substantial risk of loss and is not suitable for all investors. Past performance is not indicative of future results.

---

## Support

- GitHub Issues: [https://github.com/HedgeQuantX/HQX-CLI/issues](https://github.com/HedgeQuantX/HQX-CLI/issues)
- Email: marat.himet@gmail.com

---

**Made with passion by HedgeQuantX**
