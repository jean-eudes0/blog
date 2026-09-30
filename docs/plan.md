# Plan de construction

Chaque étape livre quelque chose qui marche de bout en bout, se vérifie à la main et par un test, et se termine par un commit. Le projet ne doit jamais rester cassé entre deux étapes.

## Règles

1. Une étape = une branche (`etape-1-socle`), fusionnée dans `main` une fois finie.
2. "Finie" veut dire : `npm test` est vert, testé à la main, et le README a été mis à jour (comment lancer, ce qui vient d'être ajouté).
3. Messages de commit au format `type: description` (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`).
4. Une migration déjà appliquée ne se modifie jamais : on en ajoute une nouvelle.
5. Si une étape prend plus de deux ou trois sessions de travail, elle est trop grosse : on la découpe.

## Les étapes

| # | Étape | Ce qui marche à la fin |
|---|---|---|
| 1 | Socle testable et CI | `app.js` / `server.js` séparés, config validée, erreurs JSON uniformes, logs sans cookie ni mot de passe, taille du corps limitée, `GET /api/health` testé avec `app.inject()`, GitHub Actions qui lance `npm test` contre un vrai PostgreSQL de service |
| 2 | Premier déploiement | Base PostgreSQL gratuite (Neon ou Supabase), service web sur Render, `/api/health` en ligne, `DATABASE_URL` configurée, persistance vérifiée après un redéploiement |
| 3 | Lecture publique | `GET /api/articles` (paginé), `GET /api/articles/:slug`, `GET /api/tags`, script de données de démonstration (avec utilisateur factice, hash inutilisable) |
| 4 | Comptes et sessions | Migration 002, script `create-admin`, `login`, `logout`, `me`, limitation de débit, contrôle d'origine, purge des sessions expirées |
| 5 | CRUD admin | Créer, modifier, supprimer, publier et dépublier un article, gestion des tags, génération du slug, écritures en transaction |
| 6 | Client React | Projet Vite, proxy `/api` en développement, page liste et page article, Markdown rendu et nettoyé avec DOMPurify |
| 7 | Connexion côté front | Page de connexion, contexte d'authentification, routes protégées, `ErrorBoundary` |
| 8 | Interface admin | Liste des articles, formulaire de création et d'édition, bouton publier/dépublier, suppression |
| 9 | Un seul serveur | Fastify sert le build React, retour à `index.html` hors `/api`, `helmet` avec politique CSP, redéploiement |
| 10 | Finition | README complété (captures, choix d'architecture), lien en ligne, nettoyage de l'historique Git |

## Pourquoi cet ordre

- Le **déploiement vient tôt** (étape 2), pas à la fin : ça valide l'hébergeur et la persistance de la base (PostgreSQL gratuit chez Neon ou Supabase) avant d'avoir construit tout le reste dessus.
- La **lecture publique précède l'authentification** : elle ne demande aucun compte et rend un résultat visible rapidement.
- Le **back-end est terminé avant le front** : chaque route se teste sans interface.
- La **sécurité n'est pas une étape séparée** : elle est intégrée dans chaque étape concernée (logs et limites dès l'étape 1, purge des sessions à l'étape 4, CSP à l'étape 9 une fois le front servi).
- Les fonctionnalités V1.5 (filtre par tag, recherche, coloration du code) viennent après l'étape 10, une fois le projet en ligne.

## Détail de l'étape 1

**À produire :**
- `src/config.js` : lit `PORT`, `DB_FILE`, `PUBLIC_URL`, `NODE_ENV` depuis l'environnement, refuse de démarrer avec un message clair si une valeur est invalide ; `.env.example` fourni
- `src/app.js` : exporte `buildApp({ db })`, construit l'application sans écouter de port
- `src/server.js` : lit la config, ouvre la base, appelle `buildApp`, écoute (`node src/server.js`, sans `--env-file` en production)
- `src/plugins/errors.js` : gestionnaire d'erreurs et de route inconnue au format défini dans `docs/api.md` (§5)
- `GET /api/health`
- Workflow GitHub Actions qui lance `npm test` à chaque push

**Critères de réussite (testés avec `app.inject()`) :**
1. `GET /api/health` → `200`
2. `GET /api/nimportequoi` → `404`, `error.code = "NOT_FOUND"`, en JSON
3. Une route de test qui lève une exception → `500`, `INTERNAL_ERROR`, sans détail interne dans la réponse
4. Une requête qui ne respecte pas un schéma → `400`, `VALIDATION_ERROR`
