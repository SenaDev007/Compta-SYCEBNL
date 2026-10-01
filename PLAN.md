# Plan et décisions — Compta SYCEBNL+

## Objectif

Application web française de comptabilité associative, adaptable aux téléphones, tablettes et ordinateurs, déployée sur Vercel avec une base distante. Le nom reste **Compta SYCEBNL+**.

## Accès, confidentialité et continuité hors connexion

- L’accès aux données comptables est toujours précédé d’une connexion au compte ; aucune donnée de compte n’est affichée à un visiteur.
- Une première connexion en ligne est nécessaire pour créer le compte et préparer l’accès hors connexion sur cet appareil.
- Après cette première connexion, la personne peut se reconnecter avec son adresse et son mot de passe hors connexion, continuer à travailler, enregistrer ses changements, puis se déconnecter et revenir hors connexion.
- L’espace conservé sur l’appareil est chiffré avec Web Crypto AES-GCM ; la clé est dérivée du mot de passe par PBKDF2. Aucun mot de passe n’est stocké. Le secret de session nécessaire à une reprise immédiate après un accès hors connexion reste uniquement en mémoire et est effacé après reconnexion ou déconnexion.
- À la reprise du réseau, l’application se reconnecte au compte et envoie les changements en attente à la base distante. Les versions concurrentes ne sont jamais écrasées silencieusement : l’utilisateur compare les deux versions.
- Le service worker met en cache le shell et les ressources de l’application, mais jamais les réponses des API ni les données financières reçues du serveur.
- L’accès hors connexion est propre à l’appareil et à son navigateur : effacer les données de navigation ou changer d’appareil efface ou rend indisponible la copie locale. La création initiale de compte reste une opération en ligne.

## Identité et expérience d’accueil

- **Mouvement** : institutionnel contemporain, registres comptables remis au goût du jour.
- **Principes** : précision lisible ; confiance ; mouvement discret ; hiérarchie claire des chiffres.
- **Palette** : vert forêt profond, ivoire papier, cuivre chaleureux et ardoise.
- **Signatures** : symbole original de registre ouvert et repère cuivre « + » ; lignes de grand livre ; particules flottantes et pictogrammes comptables sur l’écran d’accès.
- **Animations** : lentes, diffuses, sans clignotement ; elles respectent `prefers-reduced-motion`.
- **Mise en page** : première page d’accueil et de connexion expressive, sans données privées, puis navigation comptable responsive.
- **Typographie** : Inter/system UI, avec chiffres tabulaires pour les montants.
- **Voix** : française, claire, chaleureuse et limitée au vocabulaire compréhensible par une organisation utilisatrice.

## Architecture

- Next.js App Router, React, TypeScript strict.
- Service worker sur mesure et manifeste PWA avec icônes PNG `any` et `maskable`, icône Apple, installation proposée lorsqu’elle est disponible.
- `src/lib/offline-vault.ts` : coffre IndexedDB, chiffrement, déchiffrement et validation de la copie hors connexion.
- `src/components/app-shell.tsx` : accès requis, état hors connexion, sauvegarde chiffrée des changements et synchronisation optimiste versionnée.
- `src/components/cloud-access.tsx` : première page animée, connexion/création en ligne et repli vers la connexion locale chiffrée seulement en cas d’indisponibilité du service.
- `public/sw.js`, `public/manifest.webmanifest` et `public/icon-*.png` : chargement hors connexion et installation.
- PostgreSQL serverless reste l’espace distant de référence. Les routes existantes continuent d’imposer l’authentification et la validation du contenu.

## Modules fonctionnels

Tableau de bord ; plan comptable ; journal en partie double ; projets et budgets ; grand livre ; balance ; compte d’exploitation ; emplois-ressources ; suivi budgétaire ; rapprochement ; rapport narratif ; sauvegardes et restauration confirmée. Ces modules conservent leurs règles métier et leurs exports existants ; leur nouvelle persistance locale est chiffrée.

## Mise en service et limites

L’installation PWA est proposée par le navigateur quand celui-ci le permet. Sur iPhone/iPad, l’installation peut nécessiter « Partager » puis « Sur l’écran d’accueil ». Une copie hors connexion ne se partage pas entre appareils et ne remplace pas une sauvegarde téléchargée.
