# HQX-CLI Development History

> Chronological log of major changes and decisions

---

## 2025-01-03 (Session 2) - AI Client Integration

### Added

- **AI Client** (`src/services/ai/client.js`)
  - `callAI()` - Appel générique multi-provider
  - `callAnthropic()` - Claude API
  - `callGemini()` - Google Gemini API
  - `callOpenAICompatible()` - OpenAI, Groq, DeepSeek, Mistral, etc.
  - `analyzeTrading()` - Analyse données trading avec AI

- **Supervisor AI Integration** (`src/services/ai/supervisor.js`)
  - `supervise()` intègre maintenant `analyzeTrading()` pour analyse AI réelle
  - `superviseConsensus()` appelle AI pour chaque agent + calcule consensus
  - `calculateConsensus()` - Vote majoritaire + confiance moyenne
  - `getLatestDecision()` - Dernière décision AI
  - `getDecisions()` - Historique des décisions
  - `getConsensus()` - Résultat du consensus multi-agent

- **Copy Trading - Exécution Réelle** (`src/pages/algo/copy-trading.js`)
  - `placeOrder()` quand lead ouvre position (lignes 328-359)
  - `closePosition()` quand lead ferme position (lignes 361-402)

- **CLAUDE.md** - Fichier contexte auto-lu par Claude à chaque session

### Technical Details
- Les décisions AI sont stockées dans `session.decisions[]` (max 100)
- Métriques trackées: `totalDecisions`, `interventions`, `optimizations`, `riskWarnings`
- Consensus: vote par action + confiance moyenne + taux d'accord

---

## 2025-01-03 (Session 1) - Multi-Agent AI System + Strict Rules

### Added

- **Strict Development Rules System**
  - `RULES.md` - Règles absolues (zéro mock, zéro simulation)
  - `scripts/validate.js` - Validateur automatique de code
  - Détecte: mock data, fake data, estimations, placeholders
  - Obligatoire avant chaque commit

- **AI Supervision avec Données Réelles**
  - Supervisor réécrit pour utiliser uniquement les APIs réelles
  - Stats affiche: comptes supervisés, P&L réel, positions, orders
  - Suppression de toutes les estimations et mock data
- **Multi-Agent AI Consensus System**
  - Support for 15+ AI providers (Claude, GPT-4, DeepSeek, Groq, Gemini, etc.)
  - Weighted voting by expertise (technical, optimization, trading)
  - Auto-switch: individual mode (1 agent) ↔ consensus mode (2+ agents)
  - Files: `src/services/ai/index.js`, `src/services/ai/supervisor.js`

- **AI Token Scanner**
  - Scans macOS Keychain, Linux Secret Service, Windows Credential Manager
  - Detects tokens from VS Code, Cursor, Windsurf, Zed, Claude CLI, etc.
  - Pattern matching for all major AI providers
  - File: `src/services/ai/token-scanner.js`

- **AI Providers Configuration**
  - 15+ providers with models, endpoints, pricing info
  - Categories: Unified (OpenRouter), Direct, Local (Ollama), Custom
  - File: `src/services/ai/providers/index.js`

- **AI Agent Menu**
  - Add/remove/list AI agents
  - Select active agent
  - Token scanning integration
  - File: `src/menus/ai-agent.js`

- **AI Supervision for Algo Trading**
  - AI monitors HQX Ultra Scalping in real-time
  - Makes optimization decisions every 5 seconds
  - Dashboard shows AI status and decisions
  - File: `src/pages/algo/index.js`

### Fixed
- **Dashboard Loading Freeze** - `dashboard.js:23`
  - Bug: `aiConnected` variable used without declaration
  - Fix: Added `const aiConnected = aiService.isConnected();`

- **Duplicate start() Method** - `supervisor.js:112`
  - Bug: `start()` method defined twice
  - Fix: Removed duplicate definition (lines 112-149)

### Architecture Decisions
- AI agents stored in same encrypted file as prop firm sessions
- Supervisor uses 5-second interval for consensus decisions
- Agent weights are configurable per provider and expertise type

---

## Previous Sessions (Summary)

### Core Features Implemented
- ProjectX API integration (TopStep, Bulenox, etc.)
- Rithmic Protocol (binary protobuf)
- Tradovate API
- Session encryption (AES-256-GCM)
- Auto session restore
- HQX Ultra Scalping strategy (protected)
- Copy trading system
- Statistics dashboard
- Rate limiting

### Security Features
- Machine-bound encryption keys
- PBKDF2 key derivation (100k iterations)
- Input validation layer
- Secure credential storage

### UI/UX
- Responsive terminal UI
- Mobile-friendly layout
- Box drawing components
- Native readline for input
- Spinner animations

---

## Version History

| Version | Date | Notes |
|---------|------|-------|
| 2.5.15 | 2025-01-03 | Multi-agent AI, bug fixes |
| 2.5.x | Prior | Core trading features |
| 2.0.0 | Prior | Major refactor |
| 1.x.x | Prior | Initial release |
