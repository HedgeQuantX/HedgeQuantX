# HQX-CLI Development Notes

## Project Structure (v1.1.1)

```
HQX-CLI/
├── bin/
│   └── cli.js                 # Main entry point (2096 lines)
│
├── src/
│   ├── api/                   # API specs (reference only)
│   │   ├── projectx_gatewayapi.json
│   │   └── projectx_userapi.json
│   │
│   ├── config/                # Configuration
│   │   ├── index.js           # Exports all config
│   │   ├── constants.js       # ACCOUNT_STATUS, ORDER_STATUS, FUTURES_SYMBOLS
│   │   └── propfirms.js       # PropFirm list (Topstep, Alpha, etc.)
│   │
│   ├── pages/                 # UI Pages/Screens
│   │   ├── index.js           # Exports all pages
│   │   └── stats.js           # Stats page (289 lines)
│   │
│   ├── services/              # API Services
│   │   ├── index.js           # Exports: ProjectXService, connections, storage
│   │   ├── projectx.js        # ProjectX API client (369 lines)
│   │   ├── session.js         # Multi-connection manager (143 lines)
│   │   ├── hqx-server.js      # HQX Server service
│   │   └── local-storage.js   # Local storage utils
│   │
│   └── ui/                    # UI Helpers
│       ├── index.js           # Exports all UI functions
│       ├── box.js             # ASCII box drawing (105 lines)
│       ├── table.js           # 2-column tables (81 lines)
│       └── device.js          # Terminal detection (85 lines)
│
├── package.json
├── README.md
└── claude.md                  # This file
```

## Module Responsibilities

### src/config/
- `propfirms.js` - PropFirm API URLs (userApi, gatewayApi)
- `constants.js` - Enums: ACCOUNT_STATUS, ACCOUNT_TYPE, ORDER_STATUS, ORDER_SIDE, FUTURES_SYMBOLS

### src/ui/
- `box.js` - drawBoxHeader(), drawBoxFooter(), drawBoxRow(), printLogo()
- `table.js` - draw2ColHeader(), draw2ColRow(), draw2ColSeparator(), fmtRow()
- `device.js` - getDevice(), getSeparator(), detectDevice()

### src/services/
- `projectx.js` - API calls: login, getUser, getTradingAccounts, getPositions, getOrders, getTradeHistory, placeOrder
- `session.js` - Multi-connection management, session persistence
- `hqx-server.js` - HQX algo server communication

### src/pages/
- `stats.js` - Stats page with metrics, equity curve, calendar

### bin/cli.js
- Main app loop
- Menu navigation
- All other pages (accounts, trading, settings, etc.)

---

## API Endpoints

### UserAPI (userapi.topstepx.com)
- POST `/Login` - Authentication
- GET `/User` - User info
- GET `/TradingAccount` - List accounts

### GatewayAPI (api.topstepx.com)
- POST `/api/Trade/search` - Trade history (with startTimestamp, endTimestamp)
- POST `/api/Order/place` - Place order
- POST `/api/Order/cancel` - Cancel order
- POST `/api/Position/searchOpen` - Open positions
- POST `/api/Order/searchOpen` - Open orders
- POST `/api/Contract/search` - Search contracts

---

## NPM Package

- **Name:** hedgequantx
- **Commands:** `hedgequantx` or `hqx`
- **Registry:** https://www.npmjs.com/package/hedgequantx

```bash
npm install -g hedgequantx
hqx
```

---

## User Preferences

1. **NO EMOJIS** - Use ASCII icons: [>], [X], [OK], [*]
2. **NO MOCK DATA** - Only real API data, show "No data" if empty
3. **Professional look** - Clean ASCII borders, aligned tables
4. **Uppercase username** - Display as "Welcome, RHF!"

---

## Git Repository

- **GitHub:** https://github.com/HedgeQuantX/HQX-CLI
- **Branch:** main
