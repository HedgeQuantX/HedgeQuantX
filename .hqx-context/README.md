# HQX-CLI Context

> Ce dossier contient le contexte du projet pour les agents AI (Claude Opus 4, etc.)

## AVANT DE CODER - LIRE OBLIGATOIREMENT

```bash
# 1. Lire les règles strictes
cat .hqx-context/RULES.md

# 2. Avant chaque commit
node scripts/validate.js
```

## Usage

Quand tu démarres une nouvelle session, dis :

```
Lis .hqx-context/ dans /home/hqx/HQX-CLI
```

## Fichiers

| Fichier | Description | Priorité |
|---------|-------------|----------|
| `RULES.md` | **RÈGLES STRICTES** - Lire en premier | CRITIQUE |
| `ARCHITECTURE.md` | Structure du projet, diagrammes | Haute |
| `CONVENTIONS.md` | Patterns de code, naming | Haute |
| `HISTORY.md` | Log chronologique des changements | Moyenne |
| `TODO.md` | Roadmap et features | Moyenne |

## Règle Absolue

```
╔═══════════════════════════════════════════════════════════╗
║  ZÉRO MOCK DATA - ZÉRO SIMULATION - ZÉRO ESTIMATION      ║
║  DONNÉES API RÉELLES OU N/A - POINT FINAL                ║
╚═══════════════════════════════════════════════════════════╝
```

## Validation Obligatoire

```bash
# AVANT chaque commit
cd /home/hqx/HQX-CLI && node scripts/validate.js

# Doit afficher:
# ✓ NO VIOLATIONS FOUND
# ✓ CODE IS CLEAN - READY TO COMMIT
```

## Quick Start

```bash
cd /home/hqx/HQX-CLI

# Tester les composants
node -e "
const aiService = require('./src/services/ai');
const { connections } = require('./src/services/session');
console.log('AI Agents:', aiService.getAgents().length);
console.log('Connected:', connections.isConnected());
"

# Lancer le CLI
node bin/cli.js

# Valider puis publier
node scripts/validate.js && npm version patch && npm publish --access public
```

## Structure

```
src/
├── app.js              # Main loop
├── services/
│   ├── ai/             # Multi-agent AI system
│   ├── projectx/       # ProjectX API (REAL DATA)
│   ├── rithmic/        # Rithmic Protocol (REAL DATA)
│   └── tradovate/      # Tradovate API (REAL DATA)
├── menus/              # Interactive menus
├── pages/algo/         # HQX Ultra Scalping
├── security/           # Encryption, validation
└── ui/                 # Terminal UI components

scripts/
└── validate.js         # Code validator (run before commit)
```

## Package

npm: `hedgequantx`
