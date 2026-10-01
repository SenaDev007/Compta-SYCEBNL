# Tests automatisés

La commande `pnpm test` vérifie les calculs du journal et du budget, les rapprochements, les contrôles des données, les limites de tentatives, l’import Excel/CSV, la restauration, ainsi que la création des PDF et classeurs.

Les tests du coffre hors connexion vérifient qu’une copie se rouvre avec le bon mot de passe, qu’un mauvais mot de passe est refusé, que les données comptables ne sont pas stockées en clair et que les modifications en attente ainsi que les comparaisons à résoudre persistent après fermeture.
