# Plan et décisions — Compta SYCEBNL+

## Objectif

Application web de tenue comptable SYCEBNL en français, pour PC et mobile, avec montants en FCFA sans décimales. La cible de déploiement demandée est Vercel. Une base PostgreSQL compatible, provisionnée séparément, conserve les comptes et espaces comptables ; aucun secret d’accès ne doit être inclus dans le dépôt.

Le cahier des charges guide les calculs, sans constituer une certification de conformité. Les référentiels comptables et budgets propres à l’organisation doivent être fournis et vérifiés ; les données de départ sont identifiées comme exemples.

## Accès et confidentialité

- La page de connexion ou de création de compte est le seul écran présenté avant authentification. Les données d’exemple et de compte ne sont pas exposées aux visiteurs.
- Chaque compte dispose d’un espace isolé ; l’API contrôle la session et la cohérence des données avant de les lire ou les modifier.
- Après connexion, une copie liée au compte peut être conservée sur l’appareil. L’enregistrement vers la base est différé et les versions concurrentes doivent être comparées avant résolution.
- Les sauvegardes sont téléchargées au moyen d’une route protégée. La restauration valide le fichier, affiche son contenu et demande une confirmation avant remplacement.
- Les téléchargements de PDF, classeurs et sauvegardes sont générés côté serveur après validation de la session et des données.

## Direction artistique

- **Mouvement** : institutionnel contemporain, inspiré des registres comptables imprimés et des outils de gestion des organisations à impact.
- **Principes** : précision lisible ; confiance sans austérité ; densité maîtrisée des tableaux ; hiérarchie claire entre décisions et chiffres.
- **Palette** : vert forêt profond pour la stabilité, ivoire papier pour la lecture prolongée, cuivre discret pour les repères importants, ardoise pour les données secondaires.
- **Mise en page** : navigation persistante sur grand écran, barre compacte sur mobile, tableaux et fiches de synthèse clairs.
- **Signatures** : monogramme « S+ », fines lignes de registre, repères de projet colorés.
- **Interaction** : saisie contextualisée, contrôles visibles et confirmation avant suppression ou restauration.
- **Typographie** : Inter pour l’interface, chiffres tabulaires pour les montants et numéros de compte.
- **Voix** : claire, opérationnelle et limitée au vocabulaire comptable.

## Architecture

- Next.js App Router et TypeScript strict.
- Interface française, responsive, avec navigation par modules.
- PostgreSQL compatible Neon, client adapté aux routes serverless de Vercel ; migration idempotente des tables de comptes et d’espaces.
- Authentification courriel/mot de passe, mot de passe haché et cookie de session HTTP-only signé.
- Routes privées pour l’espace, les exports, les sauvegardes et la restauration ; vérification d’origine pour les modifications.
- Modules comptables : contrôles en partie double, référence aux comptes et projets existants, calcul des états, budgets et rapprochements.
- Production des PDF et classeurs sur le serveur, avec présentation professionnelle.

## Modules fonctionnels

Tableau de bord ; plan comptable (lecture, création, modification, import, suppression protégée) ; journal en partie double (lecture, création, modification, suppression) ; projets et budgets (création, édition, lignes hiérarchiques et import) ; grand livre ; balance ; compte d’exploitation ; emplois-ressources simplifié ; suivi budgétaire ; rapprochement bancaire (création, pointage, mise à jour, suppression) ; rapport narratif en cinq parties ; sauvegarde, restauration confirmée et téléchargements PDF/classeur.

Les intitulés visibles de la hiérarchie budgétaire sont Section, Résultat, Produit, Activité et Dépense. Les formats historiques anglais sont reconnus par l’import, sans être présentés comme libellés à l’écran.

## Vérifications et mise en service

Le dépôt fournit les commandes `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` et `pnpm build`. Les essais automatisés couvrent les calculs, imports Excel/CSV, restauration, génération PDF/classeur et contrôles de données.

L’application n’est pas encore reliée au compte Vercel de l’utilisateur ni à sa base de production. L’ajout des variables de déploiement, l’exécution de la migration, puis un essai réel de création et connexion nécessitent cet accès. Le contrôle local ne remplace pas cet essai en environnement réel.

## Limites

Le bilan complet, les annexes OHADA détaillées, la clôture/report à nouveau, l’import bancaire automatique, l’audit des modifications, le verrouillage de période et le travail partagé à plusieurs avec rôles ne sont pas inclus. Les hypothèses relatives aux comptes 701 et 842, au classement des comptes 8 et au tableau emplois-ressources doivent être confirmées par un professionnel compétent.
