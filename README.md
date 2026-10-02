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

Prérequis : Node.js 22 ou plus, et une base PostgreSQL (locale, Neon ou Supabase).

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

Tests : ils ont besoin d'une base PostgreSQL de test (elle est vidée à chaque test). Mets son `DATABASE_URL` dans `server/.env.test`, puis :

```bash
npm test
```

Routes disponibles pour l'instant : `GET /api/health`, `GET /api/articles`, `GET /api/articles/:slug`, `GET /api/tags`.