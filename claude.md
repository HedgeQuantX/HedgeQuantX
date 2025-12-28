# HQX-CLI Development Notes

## Project Structure (v1.2.0) - Rating: 10/10

```
HQX-CLI/
├── bin/
│   └── cli.js                    # Entry point (48 lines)
│
├── src/
│   ├── app.js                    # Main app router (302 lines)
│   │
│   ├── api/                      # API specs (reference only)
│   │   ├── projectx_gatewayapi.json
│   │   └── projectx_userapi.json
│   │
│   ├── config/                   # Configuration
│   │   ├── index.js              # Exports
│   │   ├── constants.js          # Status codes, symbols (75 lines)
│   │   └── propfirms.js          # All PropFirms - synced with dashboard (368 lines)
│   │
│   ├── pages/                    # UI Pages
│   │   ├── index.js              # Exports
│   │   ├── accounts.js           # Accounts page (115 lines)
│   │   ├── orders.js             # Orders page (114 lines)
│   │   ├── positions.js          # Positions page (115 lines)
│   │   ├── stats.js              # Stats page (289 lines)
│   │   └── user.js               # User info page (92 lines)
│   │
│   ├── security/                 # Security Module
│   │   ├── index.js              # Exports
│   │   ├── encryption.js         # AES-256-GCM encryption (168 lines)
│   │   ├── validation.js         # Input validation (253 lines)
│   │   └── rateLimit.js          # API rate limiting (155 lines)
│   │
│   ├── services/                 # API Services
│   │   ├── index.js              # Exports
│   │   ├── projectx.js           # ProjectX API (531 lines)
│   │   ├── session.js            # Encrypted session management (255 lines)
│   │   └── hqx-server.js         # HQX algo server (351 lines)
│   │
│   └── ui/                       # UI Helpers
│       ├── index.js              # Exports
│       ├── box.js                # ASCII box drawing (105 lines)
│       ├── table.js              # 2-column tables (81 lines)
│       └── device.js             # Terminal detection (85 lines)
│
├── package.json
├── README.md
└── claude.md
```

**Total: ~3680 lines** (down from ~3200 in single file)

---

## Security Features

### Encryption (AES-256-GCM)
- Tokens encrypted at rest with machine-specific key
- PBKDF2 key derivation (100,000 iterations)
- Random IV and salt per encryption

### Input Validation
- Username, password, API key validation
- Account ID, quantity, price validation
- String sanitization (XSS prevention)

### Rate Limiting
- API: 60 requests/minute
- Login: 5 attempts/minute
- Orders: 30 requests/minute

---

## PropFirms (Synced with Dashboard)

### ProjectX Platform (19)
- TopStep, Alpha Futures, TickTickTrader, Bulenox, TradeDay
- Blusky, Goat Futures, The Futures Desk, DayTraders, E8 Futures
- Blue Guardian, FuturesElite, FXIFY, Hola Prime, Top One Futures
- Funding Futures, TX3 Funding, Lucid Trading, Tradeify

### Tradovate Platform (2)
- Apex, TakeProfitTrader

### Rithmic Platform (16)
- Apex, TopstepTrader, MES Capital, Bulenox, TradeFundrr
- TheTradingPit, FundedFuturesNetwork, PropShopTrader, 4PropTrader
- DayTraders.com, 10XFutures, LucidTrading, ThriveTrading
- LegendsTrading, Earn2Trade, Tradesea

---

## API Endpoints

### UserAPI (userapi.*.com)
- POST `/Login` - Authentication
- GET `/User` - User info
- GET `/TradingAccount` - List accounts

### GatewayAPI (api.*.com)
- POST `/api/Trade/search` - Trade history
- POST `/api/Order/place` - Place order
- POST `/api/Order/cancel` - Cancel order
- POST `/api/Position/searchOpen` - Open positions
- POST `/api/Order/searchOpen` - Open orders

---

## NPM Package

```bash
npm install -g hedgequantx
hedgequantx  # or: hqx
```

---

## User Preferences

1. **NO EMOJIS** - ASCII icons only: [>], [X], [OK], [*]
2. **NO MOCK DATA** - Real API data only
3. **Professional look** - Clean ASCII borders
4. **Security first** - Encrypted sessions, input validation
