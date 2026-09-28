

Readme · MD
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
 
###  — indispensable pour une première version utilisable et déployée
 
- Page d'accueil avec la liste des articles publiés, paginée
- Page article : titre, date, contenu rendu depuis le Markdown (nettoyé), tags
- Connexion admin (session par cookie, mot de passe haché avec bcrypt) et déconnexion
- Espace admin : créer, modifier, supprimer un article
- Statut brouillon / publié (les brouillons ne sont visibles que par l'admin)
- Gestion propre des erreurs : 404, erreur API, `ErrorBoundary` sur les sections
- Quelques tests d'API (connexion, création d'article, accès refusé sans session)
- Sanitisation du Markdown rendu (contre l'injection de script)
- Hébergement qui garde les données entre deux déploiements
- Déploiement avec un lien qui marche
###  — dès que la version est utilisable et est en ligne
 
- Filtrer par tag
- Recherche par titre
- Coloration syntaxique des blocs de code
- Temps de lecture estimé
### Plus tard
 
- Rôles multiples (admin / auteur)
- Commentaires
- Flux RSS
- Aperçu Markdown en direct dans l'éditeur
## Documentation
 
- [`docs/database.md`](docs/database.md) — modèle de données, diagramme, décisions
- [`docs/api.md`](docs/api.md) — spécification des routes de l'API
- [`docs/plan.md`](docs/plan.md) — découpage de la construction en étapes
## Lancer le projet
 
À compléter au fil de la construction du projet.
 