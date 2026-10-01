# Plan de réalisation — Compta SYCEBNL+

## Objectif et décisions

Construire une application web de tenue comptable SYCEBNL en français, adaptée à Chrome/Edge sur PC et mobile, avec montants en FCFA sans décimales. Le dépôt GitHub fourni est initialement vide. La cible de déploiement demandée est Vercel ; le stockage persistant sera PostgreSQL compatible Neon, provisionné via l’intégration du Marketplace Vercel. Le code ne contiendra aucun secret de connexion.

Le modèle SYCEBNL fourni guide les calculs, mais ne constitue pas une certification de conformité. Les fichiers distincts contenant les 1 130 libellés MAP AFRIQUE et le budget GSAT n’étant pas fournis, l’application proposera leur import et des données de démonstration explicitement marquées ; elle ne fabriquera pas un plan comptable prétendument officiel.

La base stockera les comptes utilisateurs avec hash de mot de passe et un espace de travail JSON versionné par utilisateur. Les API liront et écriront seulement l’espace de l’utilisateur authentifié ; les sauvegardes/export locaux restent utilisables hors connexion. Un contrôle de version optimiste évite qu’une version obsolète écrase silencieusement un espace cloud plus récent.

## Direction artistique

- **Mouvement** : institutionnel contemporain, inspiré des registres comptables imprimés et des outils de gestion des organisations à impact.
- **Principes** : précision lisible ; confiance sans austérité ; densité maîtrisée des tableaux ; hiérarchie claire entre décisions et chiffres.
- **Philosophie couleur** : vert forêt profond pour la confiance et la stabilité, ivoire papier pour la lecture prolongée, cuivre discret pour les repères importants, ardoise pour les données secondaires.
- **Paradigme de mise en page** : navigation latérale persistante sur grand écran, barre compacte sur mobile, vues de travail à dominante tableau et fiches de synthèse en tête, sans écran d’accueil générique.
- **Signatures** : monogramme « S+ » construit comme deux colonnes de journal ; fines lignes de registre ; repères de projet colorés par code.
- **Interaction** : saisie directe et contextualisée, calculs visibles, validation avant écriture, confirmation explicite en deux étapes avant suppression/restauration.
- **Animation** : transitions courtes (140–200 ms), uniquement sur panneau/état ; aucun mouvement décoratif dans les tableaux ; respect de `prefers-reduced-motion`.
- **Typographie** : Inter pour l’interface, `ui-monospace` pour les numéros de compte et montants ; titres 24–30 px, libellés 12–14 px, chiffres tabulaires.
- **Essence de marque** : « La comptabilité SYCEBNL claire et pilotée par projet pour les associations et ONG. » Personnalité : rigoureuse, accessible, engagée.
- **Voix** : claire et opérationnelle. Exemples : « Vos écritures, équilibrées avant enregistrement. » « Chaque franc rattaché à son projet. »
- **Logo** : sceau géométrique composé de deux colonnes verticales en forme de S et d’un signe +, accompagné du nom « Compta SYCEBNL+ ».
- **Couleur signature** : vert registre `#176B52`, avec fond ivoire `#F5F6F2`, texte encre `#142522` et accent cuivre `#B9823B`.

## Architecture technique

- Next.js App Router, TypeScript strict, interface responsive, composants réutilisables.
- PostgreSQL via Neon/Vercel Marketplace et pilote serverless ; API Node pour inscription, connexion, synchronisation cloud et état de santé.
- Authentification email/mot de passe, hash bcrypt, cookie de session HTTP-only signé ; espaces strictement isolés par utilisateur.
- Sauvegarde locale automatique, synchronisation cloud temporisée, détection de conflit, sauvegarde/restauration JSON.
- Modules comptables calculant localement les états à partir du journal ; les écritures déséquilibrées, comptes inexistants ou lignes budgétaires étrangères au projet sont refusés.
- Le compte d’exploitation suit l’hypothèse du document : charges classe 6 et classe 8 à deuxième chiffre impair ; produits classe 7 et classe 8 à deuxième chiffre pair. Ces hypothèses restent signalées comme à valider.

## Structure prévue

- `src/app/` : page principale et API auth, santé et espace cloud.
- `src/components/` : navigation, formulaires, tableaux et indicateurs.
- `src/lib/accounting/` : modèles, calculs et validation comptable.
- `src/lib/auth/` : sessions, mots de passe et contrôle d’accès.
- `src/lib/db/` : accès PostgreSQL, initialisation/migration.
- `public/manus-routes.json` : manifeste complet des routes applicatives.
- `scripts/` : migration et chargement optionnel des exemples.
- `.env.example`, `README.md`, `PLAN.md` : configuration locale et déploiement Vercel.

## Modules fonctionnels

Tableau de bord ; plan comptable importable/recherchable/ajoutable ; journal AC, VE, BQ, CA, OD en partie double ; projets ; budgets Outcome/Output/activité/ligne avec partage bailleur/porteur calculé ; grand livre ; balance ; compte d’exploitation ; emplois-ressources simplifié ; suivi budgétaire ; rapprochement bancaire ; rapport financier narratif en cinq parties ; exports CSV/XLSX et PDF par impression ; sauvegarde/restauration JSON.

## Limites documentées

Le plan intégral et le budget GSAT exacts sont absents des pièces disponibles ; ils ne seront donc pas simulés. Les fonctions hors périmètre initial (bilan complet, annexes OHADA détaillées, import bancaire CSV automatique avancé, export DOCX, clôture et piste d’audit) seront signalées comme extensions. Le provisionnement de Neon/Vercel et un déploiement public nécessitent l’accès au compte Vercel de l’utilisateur ; cette livraison prépare les fichiers et les commandes mais ne crée pas de ressource distante sans cet accès.
