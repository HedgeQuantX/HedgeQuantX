# CLAUDE.md - HQX-CLI Project Context

> **INSTRUCTION OBLIGATOIRE**: Lire ce fichier ET `.hqx-context/RULES.md` AVANT toute action.

## COMMANDE INITIALE OBLIGATOIRE

```bash
cat /home/hqx/HQX-CLI/.hqx-context/RULES.md
```

---

## RÈGLE ABSOLUE #1

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║   ZÉRO MOCK DATA - ZÉRO SIMULATION - ZÉRO ESTIMATION                         ║
║                                                                               ║
║   • Toutes les données viennent des APIs réelles                             ║
║   • Si pas de données → afficher N/A                                         ║
║   • Valider avant commit: node scripts/validate.js                           ║
║                                                                               ║
║   CLAUDE OPUS 4/4.5 = NIVEAU EXPERT SENIOR                                   ║
║   ERREURS DE DÉBUTANT = INACCEPTABLE                                         ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

## Projet

**HedgeQuantX CLI** - CLI professionnel pour algo trading sur prop firms futures.

| Info | Valeur |
|------|--------|
| Repo local | `/home/hqx/HQX-CLI/` |
| npm package | `hedgequantx` |
| Plateformes | ProjectX (19 prop firms), Rithmic (16), Tradovate (3) |

---

## Fichiers Contexte (lire dans l'ordre)

1. **`.hqx-context/RULES.md`** - Règles strictes (CRITIQUE - lire en premier)
2. `.hqx-context/ARCHITECTURE.md` - Structure projet
3. `.hqx-context/CONVENTIONS.md` - Patterns de code
4. `.hqx-context/TODO.md` - Roadmap
5. `.hqx-context/HISTORY.md` - Historique des changements

---

## Commandes Essentielles

```bash
# Lire les règles (OBLIGATOIRE)
cat /home/hqx/HQX-CLI/.hqx-context/RULES.md

# Valider le code (OBLIGATOIRE avant commit)
cd /home/hqx/HQX-CLI && node scripts/validate.js

# Tester les composants
node -e "
const AISupervisor = require('./src/services/ai/supervisor');
const { analyzeTrading } = require('./src/services/ai/client');
console.log('Supervisor:', typeof AISupervisor);
console.log('AI Client:', typeof analyzeTrading);
"

# Lancer le CLI
node bin/cli.js
```

---

## Structure Principale

```
src/
├── services/
│   ├── ai/
│   │   ├── index.js          # Multi-agent service
│   │   ├── supervisor.js     # Supervision trading + AI analysis
│   │   ├── client.js         # Appels API réels aux AI providers
│   │   ├── token-scanner.js  # Scan tokens depuis Keychain/VS Code
│   │   └── providers/        # Config 15+ providers AI
│   ├── projectx/             # API ProjectX (REAL DATA)
│   ├── rithmic/              # API Rithmic (REAL DATA)
│   └── tradovate/            # API Tradovate (REAL DATA)
├── pages/algo/
│   ├── copy-trading.js       # Copy trading (exécution réelle)
│   └── ultra-scalping.js     # Algo ultra-scalping
└── security/                 # Encryption, validation
```

---

## Patterns Interdits (VIOLATIONS)

```javascript
// ✗ INTERDIT - Mock data
const mockAccount = { balance: 50000 };

// ✗ INTERDIT - Hardcoded trading values
price: 4502.25,
balance: 50000,

// ✗ INTERDIT - Estimations
const estimatedProfit = trades * 50;

// ✗ INTERDIT - Placeholder comments
// TODO: Replace with real data
// For now, return mock

// ✗ INTERDIT - Random simulations
const decision = Math.random() > 0.5;
```

---

## Patterns Obligatoires

```javascript
// ✓ CORRECT - Données API uniquement
const result = await service.getTradingAccounts();
if (!result.success) return { success: false, error: result.error };

// ✓ CORRECT - Null checks stricts
const balance = account?.balance ?? null;

// ✓ CORRECT - Affichage conditionnel
const display = balance !== null ? `$${balance}` : 'N/A';

// ✓ CORRECT - Try/catch explicite
try {
  const data = await fetchData();
  return { success: true, data };
} catch (error) {
  return { success: false, error: error.message };
}
```

---

## Checklist Avant Commit

- [ ] `node scripts/validate.js` passe sans erreur
- [ ] Aucune valeur numérique hardcodée
- [ ] Aucun mock/fake/dummy data
- [ ] Toutes les données viennent d'APIs réelles
- [ ] Cas "pas de données" = `null` ou `N/A`
- [ ] Try/catch sur tous les appels async

---

## Rappel Final

```
SI TU NE LIS PAS .hqx-context/RULES.md → TU VIOLES LES RÈGLES DU PROJET

Première action à chaque session:
cat /home/hqx/HQX-CLI/.hqx-context/RULES.md
```
