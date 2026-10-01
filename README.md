# Compta SYCEBNL+

Application web française de tenue comptable SYCEBNL, de suivi des budgets de projets et de production d’états financiers pour une organisation à but non lucratif.

**État du dépôt :** application préparée pour être configurée et déployée sur Vercel. Le dépôt GitHub d’origine était vide au début du travail. Le cahier des charges Word reste une pièce fournie par le demandeur ; le plan d’architecture est dans [`PLAN.md`](./PLAN.md).

## Modules livrés

- **Tableau de bord** : ressources, charges, résultat, balance et progression budgétaire par projet.
- **Plan comptable** : recherche par numéro/libellé, ajout de comptes, import Excel/CSV et protection contre la suppression d’un compte utilisé. Les comptes d’exemple sont explicitement marqués ; le fichier MAP AFRIQUE contenant les 1 130 comptes n’était pas joint.
- **Journal** : journaux AC, VE, BQ, CA et OD ; date, pièce, libellé, lignes débit/crédit, projet et ligne budgétaire ; refus d’une écriture déséquilibrée, incomplète ou faisant référence à un compte/projet inexistant ; suppression confirmée en deux clics.
- **Projets et budgets** : partenaire, organisation, code, réalisations majeures ; structure section / Outcome / Output / activité / ligne ; quantité × coût unitaire, part bailleur, part porteur calculée, réalisé antérieur, réalisé du journal, reste, taux et sous-totaux ; import du budget Excel/CSV.
- **États** : grand livre avec solde cumulé, balance générale, compte d’exploitation, emplois-ressources simplifié et suivi budgétaire par ligne ou compte, global ou par projet. L’export Excel comprend le journal, le plan, les états et des feuilles de budget/rapprochement ; les tableaux peuvent être imprimés ou enregistrés en PDF depuis le navigateur.
- **Rapprochement bancaire** : compte de banque classe 52, solde/date de relevé, pointage individuel, solde théorique et écart.
- **Rapport narratif** : cinq parties, chiffres calculés par exercice, financements par source, réalisations par projet, bénévolat/cotisations, perspectives et impression PDF.
- **Données** : autosauvegarde navigateur, compte cloud isolé par utilisateur, synchronisation différée, détection de versions concurrentes, export et restauration JSON confirmée en deux étapes.
- **Sécurité** : mots de passe hachés, session HTTP-only signée, protection d’origine, validation serveur et limitation d’authentification par instance.
- Interface responsive PC/mobile, navigation en français, thème vert forêt/ivoire, montants en FCFA sans décimales et icône installable.

## Démarrage local

Prérequis : Node.js 20.9+ (Node 22 recommandé) et pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Sans configuration cloud, l’application fonctionne en **mode local** et conserve les données dans le profil du navigateur. Le plan comptable initial est un jeu de démonstration réduit, non officiel ; aucun jeu de données détaillé du projet GSAT n’est inventé.

Pour activer les comptes utilisateurs et la synchronisation cloud en local, renseignez `DATABASE_URL` et `AUTH_SECRET`, puis exécutez :

```bash
pnpm db:migrate
```

Générez un secret aléatoire avec `openssl rand -base64 48`. Ne partagez jamais `.env.local` ni les identifiants PostgreSQL.

## Déploiement sur Vercel avec PostgreSQL

1. Importez le dépôt GitHub dans Vercel comme application **Next.js**.
2. Dans le Marketplace Vercel, provisionnez une base PostgreSQL (par exemple Neon) et liez-la au projet. Vercel documente désormais les bases PostgreSQL par les intégrations Marketplace, plutôt qu’un ancien service PostgreSQL propriétaire.
3. Dans **Settings → Environment Variables**, ajoutez `DATABASE_URL` (URL PostgreSQL avec TLS) et `AUTH_SECRET` (au moins 32 caractères aléatoires). Définissez-les dans Production et Preview ; utilisez une base distincte pour Preview afin d’éviter que les essais ne modifient les données de production.
4. Avant la première inscription, exécutez une fois `pnpm db:migrate` avec le `DATABASE_URL` de production depuis un terminal sécurisé. La migration crée les tables `app_users` et `workspaces`.
5. Déployez la branche `main`. Vercel sélectionne automatiquement le gestionnaire déclaré par le lockfile ; la commande de build est `pnpm build`. Le statut `/api/health` confirme la disponibilité de PostgreSQL sans révéler l’URL.

Documentation officielle : [PostgreSQL sur Vercel](https://vercel.com/docs/postgres), [intégration Neon pour Vercel](https://neon.com/docs/guides/neon-managed-vercel-integration), [déployer Next.js sur Vercel](https://vercel.com/docs/frameworks/nextjs).

### Variables

| Variable       | Obligatoire   | Usage                                                                        |
| -------------- | ------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL` | Pour le cloud | Connexion PostgreSQL Neon/compatible, conservée côté serveur.                |
| `AUTH_SECRET`  | Pour le cloud | Signature HMAC des sessions HTTP-only. Identique entre les instances Vercel. |

Les écritures cloud sont isolées par compte et protégées par contrôle de version. La limitation de tentatives est en mémoire par instance serverless : configurez également des limites/règles WAF Vercel pour disposer d’une protection globale. Aucun secret n’est inclus dans le dépôt.

## Formats d’import

### Plan comptable Excel/CSV

La première feuille ou le fichier CSV doit contenir deux colonnes, avec des intitulés proches de **Numéro** (ou Compte/Code) et **Libellé** (ou Intitulé). Chaque numéro doit être numérique et unique. L’import fusionne les numéros importés ; les comptes personnalisés distincts restent présents. Les libellés du fichier importé remplacent les mêmes numéros existants.

### Budget Excel/CSV

Colonnes reconnues : `Niveau` (0 à 4, ou Section/Outcome/Output/Activité/Ligne de dépense), `Code`, `Intitulé`/`Libellé`, `Unité`, `Quantité`, `Coût unitaire`, `Part bailleur`, `Réalisé antérieur` et `Compte`. Niveaux : 0 Section, 1 Outcome, 2 Output, 3 Activité, 4 Ligne de dépense. Si la colonne Niveau manque, les lignes sont importées comme lignes de dépense ; vérifiez les rattachements après import.

## Données et limites

La base conserve un espace JSONB versionné par utilisateur ; la synchronisation cloud refuse un état obsolète plutôt que d’écraser silencieusement la version la plus récente. Le navigateur conserve une copie locale. L’API refuse les espaces cloud au-delà de 8 Mo et les fichiers de sauvegarde au-delà de 16 Mo.

Le plan complet MAP AFRIQUE et le budget détaillé GSAT ne figuraient pas parmi les pièces disponibles : ils doivent être importés avant une utilisation comptable réelle. Le référentiel et les hypothèses des comptes 701 et 842 doivent être vérifiés par un professionnel. Le classement des comptes 8 et le tableau emplois-ressources restent des interprétations simplifiées du cahier des charges, pas une attestation de conformité OHADA.

Le bilan complet, les annexes OHADA, la clôture/report à nouveau, l’import bancaire automatique avec pointage, le document Word, l’audit des modifications, le verrouillage de période et les livres partagés avec rôles ne sont pas inclus dans cette version. Le compte cloud par utilisateur sépare les espaces ; il ne permet pas à plusieurs personnes de travailler ensemble sur les mêmes livres.

L’application n’a pas été connectée à un compte Vercel ni à une base de production pendant cette préparation. Il reste à provisionner l’intégration PostgreSQL et les variables ci-dessus avant d’activer la connexion cloud.
