# HQX-CLI Architecture

> Last updated: 2025-01-03
> Version: 2.5.15

## Overview

**HedgeQuantX CLI** - Professional algo trading CLI for prop firms futures.

```
┌─────────────────────────────────────────────────────────────────┐
│                         HQX-CLI                                 │
├─────────────────────────────────────────────────────────────────┤
│  bin/cli.js                    Entry point (Commander.js)       │
│      │                                                          │
│      ▼                                                          │
│  src/app.js                    Main loop + session restore      │
│      │                                                          │
│      ├── services/             Business logic                   │
│      │   ├── session.js        Connections manager              │
│      │   ├── ai/               Multi-agent AI system            │
│      │   ├── projectx/         ProjectX API (TopStep, etc.)     │
│      │   ├── rithmic/          Rithmic Protocol (binary)        │
│      │   └── tradovate/        Tradovate API                    │
│      │                                                          │
│      ├── menus/                Interactive menus                │
│      │   ├── dashboard.js      Main dashboard after login       │
│      │   ├── connect.js        Platform connection              │
│      │   └── ai-agent.js       AI agent management              │
│      │                                                          │
│      ├── pages/                Feature pages                    │
│      │   ├── algo/             Algo trading (HQX Ultra)         │
│      │   ├── stats.js          Statistics view                  │
│      │   └── accounts.js       Accounts management              │
│      │                                                          │
│      ├── security/             Security layer                   │
│      │   ├── encryption.js     AES-256-GCM encryption           │
│      │   ├── validation.js     Input validation                 │
│      │   └── rateLimit.js      API rate limiting                │
│      │                                                          │
│      ├── config/               Configuration                    │
│      │   ├── settings.js       Constants & timeouts             │
│      │   └── propfirms.js      Prop firm configurations         │
│      │                                                          │
│      └── ui/                   UI components                    │
│          ├── box.js            Box drawing                      │
│          ├── table.js          Table rendering                  │
│          └── menu.js           Menu helpers                     │
└─────────────────────────────────────────────────────────────────┘
```

## Supported Platforms

| Platform | Protocol | Status |
|----------|----------|--------|
| ProjectX | REST + WebSocket | Production |
| Rithmic | Binary Protocol (Protobuf) | Production |
| Tradovate | REST + WebSocket | Production |

### Prop Firms via ProjectX
- TopStep, Bulenox, MyFundedFutures, TheTradingPit, etc.

### Prop Firms via Rithmic
- Direct Rithmic connection for firms using Rithmic infrastructure

## Multi-Agent AI System

### Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    AI CONSENSUS SYSTEM                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  CLAUDE  │  │  GPT-4   │  │ DEEPSEEK │  │  GROQ    │   │
│  │  (1.2x)  │  │  (1.3x)  │  │  (1.4x)  │  │  (1.0x)  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │             │             │          │
│       └─────────────┴──────┬──────┴─────────────┘          │
│                            ▼                               │
│                   ┌─────────────────┐                      │
│                   │   SUPERVISOR    │                      │
│                   │  (Consensus)    │                      │
│                   └────────┬────────┘                      │
│                            ▼                               │
│                   ┌─────────────────┐                      │
│                   │  WEIGHTED VOTE  │                      │
│                   │  + APPLY TO     │                      │
│                   │  HQX ULTRA ALGO │                      │
│                   └─────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

### Agent Weights by Expertise
```javascript
const agentWeights = {
  'anthropic': { technical: 1.2, optimization: 1.0, trading: 1.0 },
  'openai':    { technical: 1.0, optimization: 1.3, trading: 0.9 },
  'deepseek':  { technical: 0.9, optimization: 1.0, trading: 1.4 },
  'groq':      { technical: 1.0, optimization: 1.0, trading: 1.0 },
  'gemini':    { technical: 1.1, optimization: 1.0, trading: 0.9 },
};
```

### Key Files
- `src/services/ai/index.js` - Multi-agent service with encrypted storage
- `src/services/ai/supervisor.js` - Consensus decision system
- `src/services/ai/token-scanner.js` - Auto-detect tokens from IDEs
- `src/services/ai/providers/index.js` - 15+ AI providers config
- `src/menus/ai-agent.js` - Agent management menu

### Modes
- **Individual Mode** (1 agent): Direct responses
- **Consensus Mode** (2+ agents): Weighted voting on decisions

## Security

### Encryption
- **Algorithm**: AES-256-GCM
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **Machine-Bound**: Keys derived from hardware identifiers

### Storage
- Sessions: `~/.hedgequantx/session.enc`
- AI Agents stored in same encrypted file
- File permissions: 0o600 (owner only)

### Token Scanner
Scans tokens from:
- macOS Keychain
- Linux Secret Service (libsecret)
- Windows Credential Manager
- VS Code, Cursor, Windsurf, Zed extensions
- Environment variables
- Shell configs (.bashrc, .zshrc, etc.)

## Protected Strategy

The **HQX Ultra Scalping** strategy is proprietary and protected:
```
dist/lib/
├── m/s1.jsc          # HQX Ultra Scalping (compiled bytenode)
└── data.jsc          # Market data feed
```

- Source files compiled to V8 bytecode (`.jsc`) for IP protection
- Strategy is self-contained - no external indicators
- AI supervision can optimize parameters but not modify core logic

## Data Flow

```
User Input → Menu → Service → API/WebSocket → Response → UI
                        ↓
                   AI Supervisor
                        ↓
                   Algo Adjustments
```

## Key Design Decisions

1. **No Simulation/Mock Data** - Everything tested with real APIs
2. **Encrypted Storage** - All credentials encrypted at rest
3. **Multi-Platform** - macOS, Linux, Windows support
4. **Headless Support** - Works on servers without GUI
5. **Session Restore** - Auto-reconnect on restart
6. **Rate Limiting** - Respects API limits
7. **Graceful Degradation** - Works if some services fail
