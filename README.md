# Blog

Mon blog de développeur : j'y publie ce que j'apprends (mes TP, mes erreurs, mes déclics).

## Cadrage

> Un blog de développeur où je publie ce que j'apprends (TP, erreurs, déclics), lisible par n'importe quel visiteur, avec un espace d'administration protégé pour écrire et gérer mes articles.

Je suis le seul auteur : un unique rôle admin gère les articles, pas de compte "auteur" séparé en V1.

## Ce que le projet ne fera pas (pour l'instant)

- Pas de commentaires, ni de likes, ni de système d'abonnement
- Pas d'inscription publique : le compte admin est créé par un script, pas par un formulaire
- Pas d'upload d'images complexe : une URL d'image de couverture suffit
- Pas d'éditeur riche type Notion : Markdown simple dans un `textarea`
- Pas d'envoi d'e-mails, pas de notifications
- Pas de multilingue, pas de SEO avancé
- Pas d'application mobile

## Fonctionnalités

### V1 : indispensable pour une première version utilisable et déployée

- Page d'accueil avec la liste des articles publiés, paginée
- Page article : titre, date, temps de lecture, contenu rendu depuis le Markdown (nettoyé), tags
- Connexion admin (session par cookie, mot de passe haché avec bcrypt) et déconnexion
- Espace admin : créer, modifier, supprimer un article
- Statut brouillon / publié (les brouillons ne sont visibles que par l'admin)
- Gestion propre des erreurs : 404, erreur API, `ErrorBoundary` sur les sections
- Quelques tests d'API (connexion, création d'article, accès refusé sans session)
- Sanitisation du Markdown rendu (contre l'injection de script)
- Hébergement qui garde les données entre deux déploiements
- Déploiement avec un lien qui marche

### V1.5 : dès que la version est utilisable et en ligne

- Filtrer par tag
- Recherche par titre
- Coloration syntaxique des blocs de code

### Plus tard

- Rôles multiples (admin / auteur)
- Commentaires
- Flux RSS
- Aperçu Markdown en direct dans l'éditeur

## Documentation

- [`docs/database.md`](docs/database.md) : modèle de données, diagramme, décisions
- [`docs/api.md`](docs/api.md) : spécification des routes de l'API
- [`docs/plan.md`](docs/plan.md) : découpage de la construction en étapes

## Lancer le projet

Prérequis : Node.js 22.22 ou plus (exigé par le client), et une base PostgreSQL (locale, Neon ou Supabase).

```bash
cd server
npm install
cp .env.example .env     # Windows : copy .env.example .env
# puis renseigner DATABASE_URL et, en production, PUBLIC_URL dans .env
npm run dev              # démarre l'API avec rechargement automatique
```

Données de démonstration (jamais en production) :

```bash
npm run seed
```

Tests : ils ont besoin d'une base PostgreSQL **dédiée aux tests** (locale, ou une base séparée
comme `blog_test` sur Neon). Elle est vidée à chaque test : ne mets jamais dans
`server/.env.test` l'adresse de ta base de développement ou de production. Mets son
`DATABASE_URL` dans `server/.env.test`, puis :

```bash
npm test
```

Routes disponibles pour l'instant : `GET /api/health`, `GET /api/articles`, `GET /api/articles/:slug`, `GET /api/tags`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, puis, avec une session admin : `GET /api/admin/articles`, `GET /api/admin/articles/:id`, `POST /api/admin/articles`, `PATCH /api/admin/articles/:id`, `POST /api/admin/articles/:id/publish`, `POST /api/admin/articles/:id/unpublish`, `DELETE /api/admin/articles/:id`.

Créer le compte admin (il n'y a pas d'inscription publique) :

```bash
npm run create-admin -- moi@exemple.com
```

Mot de passe oublié (pas de réinitialisation par e-mail en V1) : le mot de passe est lu
sur l'entrée standard, saisi deux fois, jamais en argument.

```powershell
$s = Read-Host "Nouveau mot de passe (12 caracteres minimum, sans accent)" -AsSecureString
$p = [System.Net.NetworkCredential]::new("", $s).Password
"$p`n$p" | npm run reset-password -- moi@exemple.com
Remove-Variable p, s
```

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | URL PostgreSQL (obligatoire) |
| `PORT` | port d'écoute (3000 par défaut) |
| `NODE_ENV` | `development`, `test` ou `production` |
| `PUBLIC_URL` | adresse publique du site, obligatoire en production, sert au contrôle d'origine |
| `TRUST_PROXY` | proxys de confiance, séparés par des virgules : noms (`loopback`, `linklocal`, `uniquelocal`), adresses ou plages. Pas un nombre de sauts (refusé). Vide en local. |

### Déploiement sur Render

Render est placé derrière Cloudflare : sans réglage, l'application prend l'adresse de
Cloudflare pour celle du visiteur, et la limite de connexion est partagée entre tous.
`TRUST_PROXY` doit contenir les réseaux internes **et** les plages de Cloudflare :

```
loopback,linklocal,uniquelocal,103.21.244.0/22,103.22.200.0/22,103.31.4.0/22,104.16.0.0/13,104.24.0.0/14,108.162.192.0/18,131.0.72.0/22,141.101.64.0/18,162.158.0.0/15,172.64.0.0/13,173.245.48.0/20,188.114.96.0/20,190.93.240.0/20,197.234.240.0/22,198.41.128.0/17,2400:cb00::/32,2606:4700::/32,2803:f800::/32,2405:b500::/32,2405:8100::/32,2a06:98c0::/29,2c0f:f248::/32
```

Source : https://www.cloudflare.com/ips-v4 et https://www.cloudflare.com/ips-v6.
Liste vérifiée le 12 octobre 2026. Cloudflare la modifie de temps en temps : à relire de
temps en temps et à comparer avec la valeur dans Render.

Vérification : provoquer un échec de connexion sur le site, puis lire `"ip"` dans les
journaux Render. Ce doit être ton adresse publique, jamais une adresse Cloudflare (`172.64.` à `172.71.`).

### Créer ou réinitialiser le compte admin en production

En production, la variable du terminal l'emporte sur `.env` : vérifie la base visée avant de lancer le script.

```powershell
$env:DATABASE_URL = Read-Host "DATABASE_URL de production"
([uri]$env:DATABASE_URL).AbsolutePath        # doit afficher /blog_prod
$s = Read-Host "Mot de passe (12 caracteres minimum, sans accent)" -AsSecureString
$p = [System.Net.NetworkCredential]::new("", $s).Password
"$p`n$p" | node --env-file=.env scripts/create-admin.js moi@exemple.com
Remove-Variable p, s
Remove-Item Env:DATABASE_URL
```

Mot de passe oublié (pas de réinitialisation par e-mail en V1) : même commande avec `scripts/reset-password.js`. Les sessions ouvertes du compte sont alors supprimées.


### Lancer le client (React)

Dans un second terminal, pendant que l'API tourne (`npm run dev` dans `server`) :

```bash
cd client
npm install
npm run dev
```

Le site s'ouvre sur http://localhost:5173. Vite redirige les appels `/api` vers l'API sur
`http://127.0.0.1:3000` (voir `client/vite.config.js`) : le navigateur ne voit qu'une seule
origine, donc pas de CORS. L'API doit donc tourner sur le port 3000, qui est le port par défaut.

Avant un commit : `npm run lint` puis `npm run build`.

Pages : `/`, `/articles/:slug`, `/connexion`, `/admin ` (réservée à l’admin, l’espace de gestion arrive à l’étape 8)

