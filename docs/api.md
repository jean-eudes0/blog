# API du blog : conception

Document de référence de l'API. Il est écrit **avant** le code : chaque route de la V1 doit correspondre à une ligne de ce document, et toute modification de comportement commence ici.

## 1. Principes

| Décision | Choix | Raison |
|---|---|---|
| Préfixe | Toutes les routes sous `/api` | Sépare l'API des pages servies par React |
| Origine | **Même origine** : Fastify sert l'API et le build React. En développement, Vite redirige `/api` vers `localhost:3000` | Pas de CORS, cookie `SameSite` simple |
| Format | JSON uniquement (`Content-Type: application/json`) | Réduit aussi la surface CSRF |
| Nommage JSON | `camelCase` (`publishedAt`), alors que la base reste en `snake_case` | Convention JavaScript ; la conversion se fait dans les requêtes SQL (`published_at AS publishedAt`) |
| Dates | ISO 8601 UTC (`2026-09-28T10:00:00Z`) | Triable, sans ambiguïté de fuseau |
| Versionnage | Aucun en V1 | Un seul client, tu contrôles les deux côtés. À ajouter le jour où un tiers consomme l'API |
| Mise à jour | `PATCH` (partielle), pas `PUT` | On n'oblige pas le client à renvoyer tout l'article |

## 2. Authentification

### Le mécanisme : session opaque stockée en base

1. À la connexion, le serveur génère un **jeton aléatoire de 32 octets** (`crypto.randomBytes`).
2. Le jeton est envoyé dans un cookie. En base, on stocke uniquement son **empreinte SHA-256** dans la table `sessions` (voir `002_sessions.sql`).
3. À chaque requête protégée, le serveur hache le cookie reçu, cherche la ligne, vérifie `expires_at`, et charge l'utilisateur.
4. À la déconnexion, la ligne est supprimée : la session est **révoquée immédiatement**.

Pourquoi pas un cookie signé sans état (`@fastify/secure-session`) ? Il est plus court à mettre en place, mais on ne peut pas révoquer une session volée avant son expiration. Ici la table coûte une migration et une dizaine de lignes de code, pour un vrai logout.

Pourquoi pas un JWT ? Pour un blog avec un seul front sur la même origine, un JWT n'apporte rien et complique la révocation.

### Nettoyage des sessions expirées

Une session expirée est refusée à la lecture, mais sa ligne reste en base. Une purge (`DELETE FROM sessions WHERE expires_at < <maintenant>`) s'exécute au démarrage du serveur puis toutes les heures (`setInterval`, avec `.unref()` pour ne pas empêcher l'arrêt du processus). L'index sur `expires_at` sert cette requête.

### Cookie

| Attribut | Valeur |
|---|---|
| Nom | `sid` |
| `HttpOnly` | oui (illisible depuis JavaScript) |
| `SameSite` | `Lax` |
| `Secure` | oui en production |
| `Path` | `/` |
| Durée | 7 jours, fixe (pas de prolongation glissante en V1) |

### Protection CSRF

- `SameSite=Lax` empêche le navigateur d'envoyer le cookie dans une requête `POST`/`PATCH`/`DELETE` venant d'un autre site.
- En plus, un hook vérifie l'en-tête `Origin` (ou `Referer`) sur toute requête qui modifie des données : s'il est présent et différent de l'origine attendue, réponse `403`. L'origine attendue vient de la configuration (`PUBLIC_URL`), pas de l'en-tête `Host`, que le client contrôle.
- L'API n'accepte que `application/json`, ce qu'un formulaire HTML classique ne peut pas envoyer.

### Attaques par force brute

- `@fastify/rate-limit` sur `POST /api/auth/login` : **5 tentatives par minute et par IP**.
- Message d'erreur **identique** pour un email inconnu et pour un mauvais mot de passe.
- Si l'email est inconnu, on exécute quand même une comparaison bcrypt factice, pour que le temps de réponse ne révèle pas l'existence du compte.
- bcryptjs(version Javascript de bcrypt) avec un coût de 12. **Attention : bcrypt ignore silencieusement tout ce qui dépasse 72 octets** d'un mot de passe. À la création du compte, le script refuse donc un mot de passe de plus de 72 octets (pas 72 caractères : un accent en pèse 2), plutôt que de le tronquer sans le dire.

### Création du compte admin

Il n'y a pas d'inscription publique. Le compte est créé par un script, hors de l'API :

```bash
npm run create-admin -- moi@exemple.com
```

Le script demande le mot de passe (jamais en argument, pour qu'il n'apparaisse pas dans l'historique du terminal), vérifie une longueur minimale de 12 caractères et maximale de 72 octets, hache et insère.

## 3. Vue d'ensemble des routes

| Méthode | Route | Accès | Phase |
|---|---|---|---|
| GET | `/api/health` | public | V1 |
| GET | `/api/articles` | public | V1 |
| GET | `/api/articles/:slug` | public | V1 |
| GET | `/api/tags` | public | V1 |
| POST | `/api/auth/login` | public (limité) | V1 |
| POST | `/api/auth/logout` | toute requête (idempotent) | V1 |
| GET | `/api/auth/me` | session | V1 |
| GET | `/api/admin/articles` | session | V1 |
| GET | `/api/admin/articles/:id` | session | V1 |
| POST | `/api/admin/articles` | session | V1 |
| PATCH | `/api/admin/articles/:id` | session | V1 |
| POST | `/api/admin/articles/:id/publish` | session | V1 |
| POST | `/api/admin/articles/:id/unpublish` | session | V1 |
| DELETE | `/api/admin/articles/:id` | session | V1 |
| GET | `/api/articles?tag=` et `?q=` | public | V1.5 |

### Routes hors API : le front React

En production, Fastify sert aussi le build de React (`@fastify/static`). Deux règles à ne pas oublier :

- toute requête `GET` **hors `/api`** qui ne correspond pas à un fichier renvoie `index.html`, pour que React Router prenne le relais. Sans cette règle, actualiser la page `/articles/mon-slug` donne une `404` du serveur ;
- toute route inconnue **sous `/api`** renvoie la `404` JSON du §5, jamais `index.html`.

Les articles se retrouvent **par `slug` côté public** (URL lisible) et **par `id` côté admin** (le slug ne sert pas de clé de gestion).

## 4. Détail des routes

### `GET /api/articles`

Liste paginée des articles **publiés**, du plus récent au plus ancien.

Paramètres : `page` (entier ≥ 1, défaut 1), `limit` (entier 1 à 50, défaut 10).

```json
{
  "data": [
    {
      "slug": "mon-premier-tp-fastify",
      "title": "Mon premier TP Fastify",
      "excerpt": "Ce que j'ai compris, et ce qui m'a bloqué.",
      "coverUrl": null,
      "publishedAt": "2026-09-28T10:00:00Z",
      "readingTime": 4,
      "tags": [{ "name": "fastify", "slug": "fastify" }]
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 23, "totalPages": 3 }
}
```

- Le contenu (`contentMd`) n'est **pas** dans la liste : on ne transfère pas des milliers de caractères pour rien.
- Tri : `published_at DESC, id DESC` (l'`id` départage deux articles publiés à la même seconde, sans quoi la pagination peut répéter ou sauter un article).
- Une page au-delà de la fin renvoie `200` avec `data: []`, pas `404`.
- Une valeur invalide (`page=0`, `limit=abc`) renvoie `400`.

### `GET /api/articles/:slug`

Un article publié, avec son contenu Markdown brut.

```json
{
  "slug": "mon-premier-tp-fastify",
  "title": "Mon premier TP Fastify",
  "excerpt": "...",
  "coverUrl": null,
  "contentMd": "# Bonjour\n...",
  "publishedAt": "2026-09-28T10:00:00Z",
  "updatedAt": "2026-09-29T08:12:00Z",
  "readingTime": 4,
  "tags": [{ "name": "fastify", "slug": "fastify" }]
}
```

Un brouillon ou un slug inconnu renvoie le **même** `404` : on ne révèle pas qu'un brouillon existe.

### `GET /api/tags`

Tags qui ont au moins un article publié, avec leur compteur.

```json
{ "data": [{ "name": "fastify", "slug": "fastify", "articleCount": 5 }] }
```

### `POST /api/auth/login`

Corps : `{ "email": "...", "password": "..." }`

- `200` : `{ "user": { "id": 1, "email": "moi@exemple.com", "role": "admin" } }` et `Set-Cookie: sid=...`
- `401` `INVALID_CREDENTIALS` : identifiants incorrects (message unique)
- `429` `RATE_LIMITED` : trop de tentatives

Chaque connexion crée une **nouvelle** session (pas de réutilisation d'un ancien jeton).

### `POST /api/auth/logout`

`204`, la session est supprimée en base et le cookie effacé. La route est **idempotente** : sans session valide, elle répond aussi `204`.

### `GET /api/auth/me`

`200` avec `{ "user": {...} }` ou `401`. Le front l'appelle au chargement pour savoir s'il affiche l'espace admin.

### `GET /api/admin/articles`

Tous les articles, brouillons compris. Paramètres : `page`, `limit`, `status` (`draft` ou `published`, optionnel).

Chaque élément : `id`, `slug`, `title`, `status`, `publishedAt`, `updatedAt`, `tags`.

### `GET /api/admin/articles/:id`

L'article complet pour le formulaire d'édition : les champs de la vue publique plus `id`, `status`, `createdAt`.

### `POST /api/admin/articles`

```json
{
  "title": "Pourquoi mon ErrorBoundary ne captait rien",
  "contentMd": "# ...",
  "excerpt": "Optionnel",
  "coverUrl": "https://exemple.com/image.jpg",
  "tags": ["react", "erreurs"]
}
```

- Toujours créé en **brouillon** : la publication est une action explicite.
- Le `slug` est généré à partir du titre (voir règles métier) et **ne change plus** ensuite.
- Réponse `201`, en-tête `Location: /api/admin/articles/12`, corps = l'article complet.
- `409` `CONFLICT` seulement si la génération de slug échoue après plusieurs essais (cas très rare).

### `PATCH /api/admin/articles/:id`

Champs modifiables, tous optionnels mais **au moins un** : `title`, `contentMd`, `excerpt`, `coverUrl` (peut valoir `null` pour l'enlever), `tags` (**remplace** la liste complète). Met `updated_at` à jour. Réponse `200` avec l'article complet.

Champs interdits (`slug`, `status`, `publishedAt`, `id`, `authorId`) : refusés en `400` grâce à `additionalProperties: false`, **à condition de désactiver le comportement par défaut de Fastify** (voir §6). Le statut ne se change que par les routes d'action ci-dessous.

### `POST /api/admin/articles/:id/publish` et `/unpublish`

Des **actions** plutôt qu'un champ `status` modifiable, parce que le serveur doit appliquer des règles (voir §7) que le client n'a pas à connaître.

- `publish` : passe en `published`. Si l'article n'a jamais été publié, `published_at` = maintenant. Sinon la date d'origine est conservée.
- `unpublish` : repasse en `draft`, `published_at` est conservée.
- Les deux sont **idempotentes** et renvoient `200` avec l'article.

### `DELETE /api/admin/articles/:id`

`204`. Les liens avec les tags disparaissent par cascade. Les tags eux-mêmes restent.

## 5. Erreurs

Un seul format, produit par un gestionnaire d'erreurs central. Le code HTTP (parexemple `400`) est dans la ligne de statut de la réponse, pas dans le corps 

```json
{
  "error": {
    "code": "VALIDATION_ERROR",  
    "message": "Données invalides",
    "details": [{ "field": "title", "message": "Le titre est obligatoire" }]
  }
}
```
- `details` n'apparaît que pour les erreurs de validation d'un schéma (champ manquant, type ou valeur invalide). 
- Les `message` de `details` viennent de la bibliothèque de validation (Ajv)
 et sont ** en anglais ** pour l'instant.
- Une requête mal formée avant même la validation (Json invalide, corps ou URL trop longs) renvoie `VALIDATION_ERROR` avec le message `Requête invalide`, sans `details`.


| HTTP | `code` | Quand |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Corps, paramètres ou query invalides |
| 401 | `UNAUTHENTICATED` | Pas de session valide sur une route protégée |
| 401 | `INVALID_CREDENTIALS` | Échec de connexion |
| 403 | `FORBIDDEN` | Origine refusée (CSRF), ou, plus tard, droits insuffisants |
| 404 | `NOT_FOUND` | Ressource ou route inconnue |
| 409 | `CONFLICT` | Conflit d'unicité non résolu |
| 429 | `RATE_LIMITED` | Trop de requêtes |
| 500 | `INTERNAL_ERROR` | Erreur serveur : message générique, le détail va **uniquement** dans les logs |

Règle : **`401` = "je ne sais pas qui tu es"**, **`403` = "je sais qui tu es, mais non"**. Le client React s'en sert pour rediriger vers la page de connexion sur un `401`.

## 6. Validation

Chaque route déclare un **schéma JSON** (Fastify + Ajv) pour `params`, `querystring` et `body`, avec `additionalProperties: false`. La validation a lieu avant ton code, donc ton code ne voit jamais une donnée hors format.

> **Piège vérifié :** par défaut, Fastify configure Ajv avec `removeAdditional: true`. Un champ en trop n'est alors **pas refusé** : il est supprimé en silence et la requête passe en `200`. Pour obtenir le `400` promis, construis l'application avec `Fastify({ ajv: { customOptions: { removeAdditional: false } } })`. Ajv convertit aussi les types par défaut (`"12"` devient `12`), ce qui est acceptable ici.

| Champ | Règle |
|---|---|
| `title` | texte, 1 à 150 caractères, après suppression des espaces autour |
| `excerpt` | texte, 0 à 300 caractères |
| `contentMd` | texte, 1 à 100 000 caractères |
| `coverUrl` | `null` ou URL commençant par `http://` ou `https://`, 500 caractères max |
| `tags` | tableau de 0 à 5 textes de 1 à 30 caractères |
| `email` | format email, 254 caractères max |
| `password` | texte, 1 à 200 caractères à la connexion (minimum 12 caractères et maximum 72 octets vérifiés seulement à la création du compte) |
| `page`, `limit` | entiers, voir §4 |

Le `coverUrl` restreint à `http(s)` n'est pas décoratif : une URL de type `javascript:...` injectée dans un `<img>` ou un lien serait une faille XSS.

**Des schémas de réponse** sont aussi déclarés. Fastify ne sérialise alors que les champs listés : même si une requête SQL ramène par erreur `password_hash`, il ne sortira jamais de l'API.

## 7. Règles métier

**Génération du slug**
1. minuscules ;
2. suppression des accents (`normalize('NFD')` puis retrait des marques diacritiques) : "Déclic" devient "declic" ;
3. tout ce qui n'est pas une lettre ou un chiffre devient `-`, tirets répétés fusionnés, tirets de début et de fin retirés ;
4. si le résultat est vide, repli sur `article` ;
5. en cas de doublon, suffixe `-2`, `-3`... ;
6. le résultat respecte forcément `slug = lower(slug)` (contrainte de la base).

**Écritures atomiques** : créer ou modifier un article touche `articles`, `tags` et `article_tags`. Tout cela se fait dans **une seule transaction PostgreSQL** (`BEGIN` / `COMMIT` / `ROLLBACK` sur un client dédié du pool `pg`) : si l'insertion d'un lien échoue, l'article n'est pas créé à moitié.

**Tags** : le nom est nettoyé (espaces) et le slug généré comme ci-dessus. Un tag inexistant est créé automatiquement à l'enregistrement de l'article. Il n'y a pas de CRUD de tags en V1.

**Temps de lecture** : calculé, jamais stocké. Approximation `max(1, round(nombre de caractères de contentMd / 1100))`, faite en SQL pour ne pas charger les contenus dans la liste.

**Publication**
- `published_at` est fixée à la **première** publication seulement.
- Un article dépublié garde donc sa `published_at`. Ce que garantit la base, c'est `status = 'draft' OR published_at IS NOT NULL`, et non l'inverse.
- Le descriptif de la colonne dans `database.md` doit se lire : "NULL tant que l'article n'a jamais été publié".

## 8. Sécurité : liste de contrôle

- [x] Requêtes SQL **préparées** uniquement, jamais de concaténation de texte
- [x] Schémas de réponse sur toutes les routes
- [x] Jeton de session aléatoire, seule l'empreinte SHA-256 en base
- [x] Cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production
- [x] Nouvelle session à chaque connexion, suppression à la déconnexion
- [x] Limitation de débit sur la connexion
- [x] Message et temps de réponse identiques pour email inconnu et mauvais mot de passe
- [x] Vérification de l'`Origin` sur les requêtes qui modifient des données
- [ ] `coverUrl` limité à `http(s)`
- [ ] Markdown converti puis **nettoyé côté client** (DOMPurify), plus une politique CSP via `@fastify/helmet`
- [x] Taille du corps limitée (`bodyLimit` à 512 Ko : `contentMd` peut atteindre 100 000 caractères, soit jusqu'à 200 Ko avec des accents, plus l'échappement JSON)
- [x] Le cookie et les mots de passe **masqués dans les logs** (option `redact` de pino)
- [x] Secrets dans `.env`, jamais commités ; un `.env.example` documente les variables
- [x] `TRUST_PROXY`  renseigné avec une liste d'adresses ou de plages, jamais `true` : sinon un client peut forger son adresse IP 
- [x] Pas d'inscription publique
- [x] Sur Render, il faut aussi les plages de Cloudfare 

## 9. Structure du code

```
server/
├── migrations/
│   ├── 001_init.sql
│   └── 002_sessions.sql
├── scripts/
│   └── create-admin.js
├── src/
│   ├── app.js            # buildApp({ db }) : construit l'app SANS écouter de port
│   ├── server.js         # démarre : lit la config, ouvre la base, écoute
│   ├── config.js         # variables d'environnement, validées au démarrage
│   ├── db.js
│   ├── plugins/           # chacun enveloppé dans fastify-plugin (voir ci-dessous)
│   │   ├── origine.js             
│   │   ├── errors.js     # gestionnaire d'erreurs central
│   │   └── auth.js       # lecture du cookie, chargement de la session
│   ├── routes/
│   │   ├── auth.js
│   │   ├── articles.js   # public
│   │   ├── tags.js
│   │   └── admin-articles.js
│   └── lib/
│       ├── http-errors.js 
│       ├── purge-sessions.js 
│       ├── users.js      # gestion des utilisateurs
│       ├── slug.js       # fonction pure, facile à tester
│       └── sessions.js

└── tests/
```

Deux points qui comptent :

1. **`app.js` construit l'application et `server.js` la lance**.
2. **Un plugin qui définit un gestionnaire d'erreurs ou un hook global doit être enveloppé dans `fastify-plugin`.** Sinon Fastify l'encapsule : le gestionnaire ne s'applique qu'à l'intérieur du plugin, et les routes du reste de l'application gardent la réponse d'erreur par défaut (vérifié : sans `fastify-plugin`, une exception renvoie le format Fastify et non le nôtre).

Premier point, en détail : **`app.js` construit l'application et `server.js` la lance**. Les tests appellent `buildApp({ db })` avec une base PostgreSQL de test et envoient des requêtes avec `app.inject()`, sans ouvrir de port ni dépendre de l'état d'une vraie base.

Dépendances à ajouter : `fastify-plugin` (dès l'étape 1), puis `@fastify/cookie`, `@fastify/static`, `@fastify/helmet`, `@fastify/rate-limit`, `bcryptjs`.

## 10. Ce qui est volontairement hors V1

Recherche et filtre par tag (V1.5), rôles multiples, CRUD de tags, édition du slug d'un brouillon, réinitialisation de mot de passe, versionnage d'API, prolongation glissante des sessions.
