# HQX-CLI - Roadmap & TODO

> Prochaines features et améliorations

---

## Priority: HIGH

### [ ] Real-time AI Optimization
- AI ajuste les paramètres HQX Ultra en temps réel
- Basé sur volatilité, spread, volume
- Consensus multi-agent pour décisions critiques

### [ ] Risk Management AI
- Détection automatique de drawdown
- Pause trading si conditions défavorables
- Alertes intelligentes

---

## Priority: MEDIUM

### [ ] Performance Dashboard
- Graphiques de P&L
- Win rate par symbole/heure
- Comparaison avec benchmarks

### [ ] Multi-Account Sync
- Copier trades entre comptes
- Balance automatique des positions
- Agrégation des stats

### [ ] Notifications
- Telegram/Discord integration
- Alertes trades
- Daily summary

---

## Priority: LOW

### [ ] Web Dashboard (optionnel)
- Interface web pour monitoring
- Accessible depuis mobile
- Real-time updates via WebSocket

### [ ] Backtesting
- Test HQX Ultra sur données historiques
- Comparaison de paramètres
- Rapports détaillés

---

## Bugs connus

- Aucun bug connu actuellement

---

## Ideas / Backlog

- [ ] Voice alerts pour trades
- [ ] Support crypto (futures)
- [ ] Plugin system pour custom strategies
- [ ] API REST pour intégration externe
- [ ] Docker image

---

## Completed (Recent)

- [x] **AI Client intégré dans Supervisor** - Appels réels aux APIs AI (2025-01-03)
- [x] **Copy Trading - exécution réelle** - placeOrder/closePosition sur follower (2025-01-03)
- [x] `client.js` - Client AI pour appels réels (Anthropic, Gemini, OpenAI-compatible)
- [x] `analyzeTrading()` - Analyse données trading avec AI
- [x] `getLatestDecision()` / `getDecisions()` / `getConsensus()` - Récupération décisions AI
- [x] `calculateConsensus()` - Consensus multi-agent
- [x] CLAUDE.md - Fichier contexte auto-lu par Claude
- [x] RULES.md - Règles strictes de développement
- [x] scripts/validate.js - Validateur de code (détecte mock data)
- [x] Nettoyage du supervisor (suppression mock data)
- [x] AI Supervision metrics in Stats page (données réelles)
- [x] Multi-Agent AI Consensus System
- [x] AI Token Scanner (Keychain, VS Code, etc.)
- [x] 15+ AI Providers support
- [x] AI Supervision menu dans Algo Trading
- [x] Fix dashboard loading freeze
- [x] Fix supervisor duplicate method
