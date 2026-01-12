# RULES.md - HedgeQuantX CLI

> **CE FICHIER EST SACRÉ ET NE DOIT JAMAIS ÊTRE SUPPRIMÉ**
> 
> Ce fichier est au-dessus de tous les autres fichiers, y compris CLAUDE.md
> Aucun code ne doit être écrit sans avoir d'abord lu ce fichier

---

## Règles Fondamentales

### 1. Données Réelles Uniquement
- **JAMAIS** de mock data
- **JAMAIS** de simulation
- **JAMAIS** d'estimation ou d'invention
- **TOUJOURS** utiliser des vraies données via les APIs (ProjectX, Rithmic, Tradovate)
- Toutes les valeurs affichées doivent provenir directement des APIs

### 2. Charte des Règles
- **TOUJOURS** respecter cette charte des règles
- **TOUJOURS** lire et relire ce fichier RULES.md avant toute modification
- Ce fichier est la source de vérité absolue du projet

### 3. Limite de Code
- **AUCUN** fichier de code ne doit dépasser **500 lignes**
- Si un fichier approche cette limite, il doit être divisé en modules plus petits
- Favoriser la modularité et la séparation des responsabilités

### 4. Protection du Fichier
- **CE FICHIER NE DOIT JAMAIS ÊTRE SUPPRIMÉ**
- **CE FICHIER NE DOIT JAMAIS ÊTRE RENOMMÉ**
- Ce fichier a priorité sur tous les autres fichiers de configuration

### 5. Règles pour IA et Agents
- L'IA et les agents ne doivent **JAMAIS mentir**
- L'IA et les agents doivent **TOUJOURS exécuter** ce qui est demandé
- L'IA et les agents **PEUVENT proposer** des alternatives ou solutions
- **RIEN ne doit être implémenté sans autorisation explicite** de l'utilisateur
- Toujours demander confirmation avant d'appliquer des changements majeurs

### 6. Architecture et Organisation
- **TOUJOURS** veiller à une structure parfaitement organisée
- **TOUJOURS** maintenir une architecture modulaire
- **TOUJOURS** garder le code configuré et allégé
- **TOUJOURS** optimiser pour une exécution rapide et performante
- Les futures mises à jour doivent respecter l'architecture existante

### 7. Validation et Intégration du Code
- **CHAQUE fichier** codé doit être conforme à la structure du CLI
- **CHAQUE fichier** doit être testé et validé AVANT d'être intégré au projet
- **AUCUN code** non testé ne doit être mergé ou déployé
- Vérifier que le code fonctionne correctement avec les autres modules
- S'assurer que les imports/exports sont corrects et fonctionnels

### 8. Synchronisation des Repositories
- **TOUJOURS** vérifier la synchronisation entre `/root/HQX-CLI` et `/home/hqx/HQX-CLI` en début de session
- **AVANT** toute modification, exécuter:
  ```bash
  cd /root/HQX-CLI && git log --oneline -1 && cd /home/hqx/HQX-CLI && git log --oneline -1
  ```
- Si les commits sont **différents**, synchroniser AVANT de travailler
- `/home/hqx/HQX-CLI` = version de référence (source de vérité)
- **NE JAMAIS** faire de git pull sans vérifier les conséquences
- **NE JAMAIS** écraser les modifications locales

---

## Checklist Avant Modification

- [ ] J'ai lu RULES.md en entier
- [ ] J'ai vérifié la synchronisation des repos (règle #8)
- [ ] Ma modification n'utilise pas de mock data
- [ ] Ma modification n'ajoute pas de simulation
- [ ] Ma modification utilise uniquement des données API réelles
- [ ] Le fichier modifié reste sous 500 lignes
- [ ] Le code est conforme à la structure du CLI
- [ ] Le code a été testé et validé
- [ ] Les imports/exports sont corrects
- [ ] J'ai demandé l'autorisation pour les changements majeurs

---

## Exceptions Documentées

### MiniMax Models (hardcoded)

MiniMax ne fournit **pas d'endpoint API `/models`** pour lister les modèles disponibles.
Cette exception est documentée et justifiée par:

**Preuves:**
- Test API: `GET /v1/models` retourne 404
- Documentation officielle MiniMax: https://platform.minimax.io/docs/api-reference/text-intro
- MiniMax-MCP officiel n'a pas de `list_models`, seulement `list_voices`
- OpenCode, Cursor, LiteLLM utilisent tous des modèles hardcodés pour MiniMax

**Modèles hardcodés:**
- `MiniMax-M2.1` (Coding Plan)

**Validation de connexion:**
Le test de connexion utilise `POST /v1/chat/completions` et vérifie que
la réponse contient `"model": "MiniMax-M2.1"` pour confirmer le bon modèle.

---

## Rappel

> **LIRE ET RELIRE CES RÈGLES TOUT LE TEMPS**
> 
> Ces règles existent pour garantir la qualité, la fiabilité et l'intégrité du projet HedgeQuantX CLI.

---

*Dernière mise à jour: Janvier 2025*
