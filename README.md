# Compta SYCEBNL+

Application web française de tenue comptable SYCEBNL, de suivi des budgets de projets et de production d’états financiers pour les organisations à but non lucratif.

**Déploiement visé : Vercel.** Le dépôt contient l’application Next.js, le schéma PostgreSQL et la migration idempotente. La migration de la base Neon fournie a déjà été exécutée puis vérifiée. Les variables d’environnement sont gérées par l’administrateur dans Vercel ; aucune valeur de connexion ou clé privée n’est conservée dans le dépôt. Un déploiement Vercel n’est pas lancé par ces instructions.

## Modules

- **Tableau de bord** : ressources, charges, résultat, balance et progression budgétaire. Le raccourci de création ouvre directement la saisie du journal.
- **Plan comptable** : recherche, ajout, modification, import Excel/CSV et suppression protégée lorsqu’un compte est utilisé.
- **Journal** : journaux AC, VE, BQ, CA et OD ; saisie en partie double, rattachement aux projets et budgets, modification et suppression confirmée. Toute écriture doit être équilibrée et ne peut référencer un compte ou une dépense budgétaire inexistants.
- **Projets et budgets** : fiches projet modifiables, budgets hiérarchiques, quantités, coûts unitaires, parts bailleur/porteur, réalisé antérieur et suivi des dépenses ; import de budgets Excel/CSV.
- **États financiers** : grand livre, balance générale, compte d’exploitation, emplois-ressources, suivi budgétaire et rapprochements bancaires.
- **Rapport narratif** : synthèse calculée, financements, réalisations, contributions et perspectives ; PDF mis en page.
- **Données et sauvegardes** : espace personnel, copie téléchargeable `.sycebnl` et restauration vérifiée après confirmation.
- **Accès hors connexion** : après une première connexion réussie, une copie des données est protégée sur l’appareil. L’utilisateur peut se reconnecter sans réseau, poursuivre ses saisies, fermer sa session et revenir plus tard. Lorsque la connexion revient, les modifications sont transmises automatiquement. En cas de versions différentes, aucun écrasement n’est effectué avant un choix explicite.
- **Installation** : application web installable sur ordinateur et téléphone, avec le logo Compta SYCEBNL+ comme icône et une page d’accueil animée.

La copie privée est chiffrée avec AES-GCM et une clé dérivée du mot de passe par PBKDF2. Le mot de passe n’est jamais enregistré dans la copie. Le service worker conserve uniquement la page d’accueil et les ressources statiques ; il ne met jamais en cache les routes personnelles ou les réponses contenant des données comptables.

Les PDF et classeurs sont produits par l’application en ligne. Sans réseau, la sauvegarde et le classeur professionnel peuvent être créés sur l’appareil ; pour un PDF, le rapport actuellement ouvert peut être imprimé ou enregistré en PDF depuis la fenêtre d’impression.

## Démarrage local

Prérequis : Node.js 20.9+ (Node 22 recommandé) et pnpm.

```bash
pnpm install
cp .env.example .env.local
```

Renseignez `DATABASE_URL` et `AUTH_SECRET` dans `.env.local`, puis créez les tables et démarrez l’application :

```bash
pnpm db:migrate
pnpm dev
```

Un compte doit être créé ou ouvert avant de consulter les données. L’inscription initiale et les espaces personnels nécessitent une première connexion Internet. Une copie locale n’est créée qu’après cette première ouverture du compte sur l’appareil.

Générez `AUTH_SECRET` avec un outil cryptographiquement sûr, par exemple `openssl rand -base64 48`. Ne partagez jamais `.env.local` ni les identifiants de la base de données.

## Déploiement sur Vercel

1. Importez le dépôt comme application **Next.js**.
2. Vérifiez que les variables `DATABASE_URL` et `AUTH_SECRET` sont déjà définies pour l’environnement visé.
3. La migration idempotente est `pnpm db:migrate` ; elle a été appliquée à la base fournie. Ne la relancez qu’après avoir vérifié que l’environnement pointe sur la base souhaitée.
4. Déployez la branche `main`. La commande de production est `pnpm build` ; l’application utilise Node.js pour les comptes, les données et la création des documents.

## Variables d’environnement

| Variable       | Obligatoire                                | Usage                                                                                          |
| -------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | Oui pour les comptes et espaces personnels | Adresse de la base PostgreSQL, utilisée uniquement côté serveur.                               |
| `AUTH_SECRET`  | Oui pour les sessions                      | Clé aléatoire d’au moins 32 caractères, identique entre les instances d’un même environnement. |

Aucun secret n’est inclus dans le dépôt. La limitation des tentatives est conservée par instance ; complétez-la par les règles de sécurité de l’hébergement si une couverture globale est nécessaire.

## Fichiers importés

### Plan comptable

La première feuille Excel ou le fichier CSV doit contenir une colonne **Numéro** (ou Compte/Code) et une colonne **Libellé** (ou Intitulé). Les numéros doivent être numériques. L’import actualise les numéros déjà présents et conserve les autres comptes.

### Budget de projet

Les colonnes reconnues comprennent **Niveau** (0 à 4), **Code**, **Intitulé/Libellé**, **Unité**, **Quantité**, **Coût unitaire**, **Part bailleur**, **Réalisé antérieur** et **Compte**. Les niveaux sont : Section, Résultat, Produit, Activité et Dépense. Sans niveau, une ligne est importée comme dépense ; vérifiez les rattachements et montants après import.

Les fichiers déposés sont contrôlés et limités à 16 Mo. La restauration refuse les sauvegardes non reconnues ou incohérentes ; elle ne remplace les données qu’après une confirmation explicite.

## Vérifications

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

Les tests couvrent les calculs comptables, les rapprochements, les contrôles des données, les fichiers Excel/CSV, la restauration, les PDF et classeurs ainsi que le chiffrement, le refus d’un mauvais mot de passe et la conservation des modifications en attente hors connexion.

## Périmètre et limites

Le référentiel comptable complet et les budgets détaillés propres à l’organisation doivent être importés et vérifiés avant toute utilisation réelle. Les hypothèses relatives aux comptes 701 et 842, au classement des comptes 8 et au tableau emplois-ressources doivent être confirmées par un professionnel compétent.

Le bilan complet, les annexes OHADA, la clôture et le report à nouveau, l’import bancaire automatique, l’audit des modifications, le verrouillage de période et le travail partagé à plusieurs avec rôles ne font pas partie de cette version.
