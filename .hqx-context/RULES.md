# HQX-CLI - RÈGLES ABSOLUES DE DÉVELOPPEMENT

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║   CE FICHIER DOIT ÊTRE LU ET RESPECTÉ À CHAQUE LIGNE DE CODE ÉCRITE          ║
║   AUCUNE EXCEPTION - AUCUN COMPROMIS - AUCUNE EXCUSE                         ║
║                                                                               ║
║   MODÈLE: CLAUDE OPUS 4 - NIVEAU ATTENDU: EXPERT SENIOR                      ║
║   ERREURS DE DÉBUTANT = INACCEPTABLE                                         ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

## RÈGLE #1: ZÉRO DONNÉES FICTIVES

```
INTERDIT:
- Mock data
- Fake data  
- Dummy data
- Test data (en production)
- Placeholder data
- Simulated data
- Estimated values
- Hardcoded trading values
- "Would be real..."
- "For now..."
- "Temporary..."
```

**TOUTES les données affichées DOIVENT provenir d'une API réelle.**

Si pas de données API disponibles → Afficher `N/A` ou ne rien afficher.

---

## RÈGLE #2: ARCHITECTURE STRICTE

### Structure des Services
```javascript
// CORRECT - Service retourne données API
async getAccounts() {
  const response = await this._request('/TradingAccount');
  if (!response.success) return { success: false, accounts: [] };
  return { success: true, accounts: response.data };
}

// INTERDIT - Service invente des données
getAccounts() {
  return { success: true, accounts: [{ balance: 50000 }] }; // FAKE!
}
```

### Structure des Retours
```javascript
// CORRECT - Null si pas de données
return data.value ?? null;

// CORRECT - N/A pour affichage
const display = value !== null ? `$${value}` : 'N/A';

// INTERDIT - Valeur par défaut inventée
return data.value || 100; // D'où vient 100?!
```

---

## RÈGLE #3: VALIDATION AVANT COMMIT

```bash
# OBLIGATOIRE avant chaque commit
node scripts/validate.js

# Le commit est INTERDIT si le validateur trouve des erreurs
```

---

## RÈGLE #4: QUALITÉ DU CODE

### Nommage
- Variables: `camelCase` - explicites, pas d'abréviations obscures
- Fonctions: verbe + nom - `getAccounts()`, `validateOrder()`
- Constantes: `UPPER_SNAKE_CASE`
- Fichiers: `kebab-case.js`

### Documentation
```javascript
/**
 * Description claire de la fonction
 * @param {Type} param - Description du paramètre
 * @returns {Type} Description du retour
 * 
 * Data source: /api/endpoint (GET/POST)
 */
```

### Gestion d'Erreurs
```javascript
// CORRECT - Try/catch avec gestion propre
try {
  const result = await api.call();
  return { success: true, data: result };
} catch (error) {
  return { success: false, error: error.message };
}

// INTERDIT - Erreur silencieuse
try {
  return await api.call();
} catch (e) {
  return null; // Pourquoi? Quelle erreur?
}
```

---

## RÈGLE #5: SOURCES DE DONNÉES AUTORISÉES

### APIs Réelles Uniquement

| Service | Endpoints Autorisés |
|---------|---------------------|
| **ProjectX** | `/TradingAccount`, `/Position`, `/Order`, `/Trade`, `/Contract` |
| **Rithmic** | `ORDER_PLANT`, `PNL_PLANT`, `TICKER_PLANT` |
| **Tradovate** | `/account`, `/position`, `/order`, `/fill`, `/contract` |

### Calculs Autorisés

| Calcul | Source | Autorisé |
|--------|--------|----------|
| Win Rate | Trades API (wins/total) | ✓ |
| Drawdown | Trades API (equity curve) | ✓ |
| Sharpe Ratio | Trades API (returns) | ✓ |
| "Estimated Profit" | Rien | ✗ INTERDIT |
| "Projected Balance" | Rien | ✗ INTERDIT |

---

## RÈGLE #6: CHECKLIST OBLIGATOIRE

Avant CHAQUE fichier modifié, vérifier:

- [ ] Aucune valeur numérique hardcodée (sauf configs techniques)
- [ ] Aucun `return { ... }` avec données inventées
- [ ] Aucun commentaire indiquant du code temporaire
- [ ] Toutes les données viennent d'appels API
- [ ] Cas "pas de données" = `null` ou `N/A`
- [ ] Aucune estimation ou projection
- [ ] Try/catch sur tous les appels async
- [ ] Validation des inputs
- [ ] `node scripts/validate.js` passe

---

## RÈGLE #7: PATTERNS INTERDITS

```javascript
// ═══════════════════════════════════════════════════════════
// PATTERNS ABSOLUMENT INTERDITS - VIOLATION = REVERT IMMÉDIAT
// ═══════════════════════════════════════════════════════════

// 1. Mock objects
const mockAccount = { balance: 50000 };           // ✗ INTERDIT
const fakeData = { pnl: 1250 };                   // ✗ INTERDIT
const testTrade = { profit: 100 };                // ✗ INTERDIT

// 2. Hardcoded trading values
price: 4502.25,                                   // ✗ INTERDIT
balance: 50000,                                   // ✗ INTERDIT
pnl: 145.50,                                      // ✗ INTERDIT
winRate: 0.75,                                    // ✗ INTERDIT
volatility: 0.018,                                // ✗ INTERDIT

// 3. Placeholder comments
// TODO: Replace with real data                   // ✗ INTERDIT
// For now, return mock                           // ✗ INTERDIT
// Placeholder for real implementation            // ✗ INTERDIT
// Would interface with real API                  // ✗ INTERDIT

// 4. Estimations
const estimatedProfit = trades * 50;              // ✗ INTERDIT
const projectedBalance = balance * 1.1;           // ✗ INTERDIT
const expectedReturn = avg * days;                // ✗ INTERDIT

// 5. Random simulations
const decision = Math.random() > 0.5;             // ✗ INTERDIT
const fakeLatency = Math.random() * 100;          // ✗ INTERDIT

// 6. Default values qui cachent l'absence de données
return value || 100;                              // ✗ INTERDIT (si 100 est inventé)
return data ?? { balance: 0 };                    // ✗ INTERDIT (si l'objet est inventé)
```

---

## RÈGLE #8: PATTERNS OBLIGATOIRES

```javascript
// ═══════════════════════════════════════════════════════════
// PATTERNS OBLIGATOIRES - À SUIVRE SYSTÉMATIQUEMENT
// ═══════════════════════════════════════════════════════════

// 1. Données API uniquement
const result = await service.getTradingAccounts();
if (!result.success) return { success: false, error: result.error };
return { success: true, accounts: result.accounts };

// 2. Null checks stricts
const balance = account?.balance ?? null;
const pnl = account?.profitAndLoss ?? null;

// 3. Affichage conditionnel
const balanceDisplay = balance !== null 
  ? `$${balance.toLocaleString()}` 
  : chalk.gray('N/A');

// 4. Calculs depuis données réelles uniquement
const winRate = trades.length > 0
  ? trades.filter(t => t.profitAndLoss > 0).length / trades.length
  : null;

// 5. Documentation des sources
/**
 * Get account balance
 * @returns Balance from /TradingAccount API, null if unavailable
 */

// 6. Gestion d'erreurs explicite
try {
  const data = await fetchData();
  return { success: true, data };
} catch (error) {
  logger.error('fetchData failed', { error: error.message });
  return { success: false, error: error.message };
}
```

---

## RÈGLE #9: REVUE DE CODE MENTALE

Avant d'écrire CHAQUE ligne, se demander:

1. **"D'où vient cette donnée?"**
   - Si API → OK
   - Si inventée → STOP, ne pas écrire

2. **"Que se passe-t-il si pas de données?"**
   - Afficher N/A → OK
   - Inventer une valeur → STOP

3. **"Est-ce que je triche?"**
   - Non, données réelles → OK
   - Oui, c'est temporaire → STOP, pas de temporaire

4. **"Un trader ferait-il confiance à cette donnée?"**
   - Oui, c'est de l'API → OK
   - Non, c'est approximatif → STOP

---

## RÈGLE #10: SANCTIONS

### En cas de violation détectée:

1. **Revert immédiat** du code concerné
2. **Fix** de la violation
3. **Commit** avec message: `fix: remove [type] from [file]`
4. **Re-run** du validateur

### Types de violations:
- `mock-data` - Données fictives
- `hardcoded-value` - Valeur hardcodée
- `estimation` - Estimation/projection
- `placeholder` - Code placeholder
- `simulation` - Simulation

---

## RAPPEL FINAL

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║   CLAUDE OPUS 4 = NIVEAU EXPERT                                               ║
║                                                                               ║
║   → PAS de mock data                                                          ║
║   → PAS d'estimation                                                          ║
║   → PAS de "pour l'instant"                                                   ║
║   → PAS de valeur inventée                                                    ║
║   → PAS d'excuse                                                              ║
║                                                                               ║
║   DONNÉES API RÉELLES OU N/A - POINT FINAL                                    ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

## COMMANDE AVANT CHAQUE COMMIT

```bash
cd /home/hqx/HQX-CLI && node scripts/validate.js
```

Si erreur → **NE PAS COMMIT** → Corriger → Re-valider

---

## RÈGLE #11: CONFIDENTIALITÉ GITHUB

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║   PROJET CONFIDENTIEL - MINIMUM DE FICHIERS SUR GITHUB                       ║
║                                                                               ║
║   NE JAMAIS COMMIT/PUSH:                                                      ║
║   • .hqx-context/        (contexte AI local)                                  ║
║   • CLAUDE.md            (instructions Claude)                                ║
║   • *.md dans la racine  (sauf README minimal si besoin)                      ║
║   • scripts/             (déjà dans .gitignore)                               ║
║   • src/lib/             (code protégé)                                       ║
║                                                                               ║
║   Ces fichiers restent EN LOCAL UNIQUEMENT                                    ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Vérification avant push

```bash
# Vérifier que les fichiers confidentiels ne sont PAS dans le commit
git status
git diff --cached --name-only

# Ces fichiers ne doivent JAMAIS apparaître:
# - .hqx-context/*
# - CLAUDE.md
# - scripts/*
# - src/lib/*
```

### .gitignore obligatoire

```gitignore
# Context files (confidential - local only)
.hqx-context/
CLAUDE.md
```

---

## RÈGLE #12: ARCHITECTURE & ORGANISATION DU CODE

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║   TOUT CODE DOIT ÊTRE OPTIMISÉ AU MAXIMUM                                    ║
║   STRUCTURE LÉGÈRE ET RAPIDE EN EXÉCUTION                                    ║
║   ARCHITECTURE PARFAITEMENT ORGANISÉE                                         ║
║                                                                               ║
║   RÈGLES ABSOLUES:                                                            ║
║   • MAX 500 LIGNES PAR FICHIER - AUCUNE EXCEPTION                            ║
║   • Fichiers > 500 lignes = REFACTORING IMMÉDIAT OBLIGATOIRE                 ║
║   • Séparer en modules logiques et réutilisables                              ║
║   • Chaque fonction = une seule responsabilité                                ║
║                                                                               ║
║   PERFORMANCE:                                                                ║
║   • Code optimisé pour exécution rapide                                       ║
║   • ZÉRO code inutile ou redondant                                           ║
║   • Imports optimisés (pas d'imports inutilisés)                              ║
║   • Pas de boucles inutiles                                                   ║
║   • Pas de calculs répétés (mettre en cache si nécessaire)                   ║
║                                                                               ║
║   STRUCTURE:                                                                  ║
║   • Modules petits et focalisés                                               ║
║   • Séparation claire des responsabilités                                     ║
║   • Réutilisation maximale du code existant                                   ║
║   • Pas de copier-coller - factoriser                                         ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Vérification taille des fichiers

```bash
# Vérifier qu'aucun fichier ne dépasse 500 lignes
wc -l src/**/*.js | awk '$1 > 500 {print "❌ TROP GROS:", $2, "(" $1 " lignes)"}'

# Liste triée par taille
wc -l src/**/*.js | sort -rn | head -20
```

### Aucune Exception

Tous les fichiers respectent la limite de 500 lignes.

**Fichiers refactorés** (Janvier 2026):
- `strategy-supervisor.js`: 1312 -> 353 lignes (modules extraits: `supervisor-patterns.js`, `supervisor-consensus.js`)
- `algo-multi.js`: 801 -> 242 lignes (modules extraits: `algo-events.js`, `algo-risk.js`)

### Structure des fichiers

```
src/
├── pages/algo/
│   ├── index.js         # Menu principal (~100 lignes)
│   ├── algo-utils.js    # Utilitaires partagés (~50 lignes)
│   ├── algo-config.js   # Configuration (selectSymbol, configureAlgo)
│   ├── algo-executor.js # Exécution single symbol
│   ├── algo-multi.js    # Exécution multi-symbol
│   └── ui.js            # Interface utilisateur
├── services/
│   ├── Chaque service < 500 lignes
│   └── Diviser si nécessaire
```

### Règles de refactoring

1. **Avant refactoring**: Sauvegarder l'état fonctionnel
2. **Pendant refactoring**: Tester après CHAQUE modification
3. **Après refactoring**: Vérifier que RIEN n'a changé côté utilisateur
4. **Test obligatoire**: `node -e "require('./module'); console.log('OK')"`

---

## RÈGLE #13: UI/UX COHÉRENTE

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║   AFFICHAGE COHÉRENT SUR TOUTES LES PAGES                                    ║
║                                                                               ║
║   OBLIGATOIRE:                                                                ║
║   • Banner HedgeQuantX visible sur toutes les pages                          ║
║   • Boxes alignés avec la largeur du banner (98 caractères)                  ║
║   • Utiliser les fonctions UI partagées (drawBoxHeader, drawBoxRow, etc.)    ║
║   • Afficher propfirm + accountId pour les comptes                           ║
║                                                                               ║
║   FORMAT COMPTES:                                                             ║
║   [1] TopStep (16316824) $203,446.98                                         ║
║   [2] Apex (16204661) $145,321.44                                            ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Fonctions UI obligatoires

```javascript
const { 
  displayBanner,      // Afficher le banner HQX
  drawBoxHeader,      // Nouveau rectangle avec titre
  drawBoxHeaderContinue, // Continuer un rectangle existant
  drawBoxRow,         // Ligne dans le rectangle
  drawBoxFooter,      // Fermer le rectangle
  getLogoWidth        // Largeur standard (98)
} = require('../../ui');

// Utilisation
const boxWidth = Math.max(getLogoWidth(), 98);
drawBoxHeader('TITRE', boxWidth);
drawBoxRow('Contenu', boxWidth);
drawBoxFooter(boxWidth);
```

---

## RÈGLE #14: RÉUTILISATION DU CODE

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║   NE PAS RÉINVENTER - RÉUTILISER                                             ║
║                                                                               ║
║   Si une fonctionnalité existe déjà:                                          ║
║   • Importer et réutiliser                                                    ║
║   • NE PAS copier-coller                                                      ║
║   • NE PAS recréer une version différente                                     ║
║                                                                               ║
║   EXEMPLE:                                                                     ║
║   • selectSymbol() existe dans one-account.js                                 ║
║   • custom-strategy.js doit l'importer, pas le recréer                        ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Exports obligatoires

Les fonctions réutilisables DOIVENT être exportées:

```javascript
// one-account.js
module.exports = { 
  oneAccountMenu, 
  launchMultiSymbolRithmic, 
  selectSymbol,      // Réutilisable
  configureAlgo      // Réutilisable
};
```

---

## RÈGLE #15: AI CLIENT - PAS DE LIMITES

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║   AI CLIENT - AUCUNE LIMITE DE TOKENS                                        ║
║                                                                               ║
║   • NE PAS mettre max_tokens dans les requêtes AI                            ║
║   • 90% des users ont un plan payant (Claude Pro, ChatGPT Plus)              ║
║   • Les limites sont gérées côté provider                                     ║
║   • Timeout: 60 secondes minimum pour génération de code                     ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

## COMMANDES DE VALIDATION

```bash
# Valider le code
cd /home/hqx/HQX-CLI && node scripts/validate.js

# Tester un module
node -e "require('./src/pages/algo/one-account'); console.log('✓ OK')"

# Vérifier taille des fichiers (max 500 lignes)
wc -l src/pages/algo/*.js | sort -rn

# Publier
npm version patch --no-git-tag-version && git add -A && git commit -m "message" && git push && npm publish
```
