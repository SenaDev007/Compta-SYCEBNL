# Compta SYCEBNL+

Application web française de tenue comptable SYCEBNL, de suivi des budgets de projets et de production d’états financiers pour une organisation à but non lucratif.

**État du dépôt :** l’application et les routes de téléchargement sont préparées pour un déploiement Next.js sur Vercel. La base de production et les variables de connexion doivent encore être fournies par l’administrateur. Le cahier des charges Word demeure la référence fonctionnelle.

## Modules

- **Tableau de bord** : ressources, charges, résultat, balance et progression budgétaire. Le raccourci de création ouvre directement le formulaire du journal.
- **Plan comptable** : recherche, ajout, modification, import Excel/CSV et suppression protégée lorsqu’un compte est utilisé.
- **Journal** : journaux AC, VE, BQ, CA et OD ; saisie en partie double, rattachement aux projets et budgets, modification et suppression confirmée. Toute écriture doit être équilibrée et ne peut référencer un compte ou une dépense budgétaire inexistants.
- **Projets et budgets** : fiches projet modifiables, budgets hiérarchiques, quantités, coûts unitaires, parts bailleur/porteur, réalisé antérieur et suivi des lignes de dépense ; import de budgets Excel/CSV.
- **États financiers** : grand livre, balance générale, compte d’exploitation, emplois-ressources, suivi budgétaire et rapprochements. Les classeurs et PDF sont produits par les routes serveur.
- **Rapprochement bancaire** : création, mise à jour, pointage des lignes, calcul de l’écart et suppression du rapprochement sans supprimer les écritures.
- **Rapport narratif** : cinq parties, chiffres calculés, financements, réalisations, contributions et perspectives ; téléchargement en PDF professionnel.
- **Données et sauvegardes** : compte privé obligatoire, enregistrement différé, protection contre les modifications concurrentes, téléchargement d’une sauvegarde `.sycebnl` et restauration vérifiée après confirmation.
- **Sécurité** : mots de passe hachés, session HTTP-only signée, contrôle d’origine, validation serveur, cloisonnement par compte et limitation des tentatives.

L’interface est responsive, en français, avec montants en FCFA sans décimales et une palette vert forêt/ivoire.

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

Un compte doit être créé ou ouvert avant de consulter les données. Sans base configurée, les formulaires de connexion restent accessibles, mais aucun compte ne peut être créé et aucun espace comptable ne peut être chargé. Le plan comptable initial est un jeu réduit de comptes d’exemple à vérifier avant usage.

Générez `AUTH_SECRET` avec un outil cryptographiquement sûr, par exemple `openssl rand -base64 48`. Ne partagez jamais `.env.local` ni les identifiants de base de données.

## Déploiement sur Vercel

1. Importez ce dépôt comme application **Next.js**.
2. Provisionnez une base PostgreSQL auprès d’une intégration compatible et reliez-la au projet.
3. Ajoutez `DATABASE_URL` et `AUTH_SECRET` dans les variables d’environnement de Production et Preview. Utilisez une base distincte pour Preview.
4. Exécutez une seule fois `pnpm db:migrate` avec l’URL de la base ciblée, depuis un terminal sécurisé.
5. Déployez `main`. La commande de production est `pnpm build` ; l’application utilise Node.js pour ses routes de compte, de données et de génération des documents.

Le dépôt n’a pas été relié à un compte Vercel ni à une base de production pendant cette préparation. La connexion et la création de comptes doivent être testées après l’ajout des variables et la migration.

## Variables d’environnement

| Variable       | Obligatoire                            | Usage                                                                                          |
| -------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | Oui pour les comptes et espaces privés | Connexion sécurisée à PostgreSQL, utilisée côté serveur.                                       |
| `AUTH_SECRET`  | Oui pour les sessions                  | Clé aléatoire d’au moins 32 caractères, identique entre les instances d’un même environnement. |

Aucun secret n’est inclus dans le dépôt. La limitation des tentatives est conservée par instance ; ajoutez les règles de sécurité de la plateforme d’hébergement pour une couverture globale.

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

Les tests couvrent les calculs de balance et de budget, les rapprochements, les contrôles de données, les fichiers Excel/CSV, les sauvegardes, ainsi que la génération des PDF et classeurs.

## Périmètre et limites

Le référentiel comptable complet et les budgets détaillés propres à l’organisation ne sont pas fournis ; ils doivent être importés et vérifiés avant toute utilisation réelle. Les hypothèses relatives aux comptes 701 et 842, au classement des comptes 8 et au tableau emplois-ressources doivent être confirmées par un professionnel compétent.

Le bilan complet, les annexes OHADA, la clôture et le report à nouveau, l’import bancaire automatique, l’audit des modifications, le verrouillage de période et le travail partagé à plusieurs avec rôles ne font pas partie de cette version.
