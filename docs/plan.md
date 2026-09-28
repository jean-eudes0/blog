# Plan de travail


# Etape 1 : Une application fonctionnelle
Socle testable et CI

- app.js /server.js, config validée, erreurs JSON, logs masqués, bodyLimit, /api/health testé, GitHub Actions qui lance npm test


# Etape 2 : Déploiement et mise en ligne
Premier déploiement	

- Choix de l'hébergeur, /api/health en ligne, variables d'environnement, persistance de la base vérifiée


# Etape 3 : Ajout de fonctionnalités
Lecture publique	

- GET /api/articles, /:slug, /api/tags, données de démonstration (avec utilisateur factice)


# Etape 4 : Ajout de fonctionnalités
Comptes et sessions

- Migration 002, create-admin, login, logout, me, limitation de débit, contrôle d'origine, purge des sessions


# Etape 5 : Ajout de fonctionnalités
CRUD admin	

- Créer, modifier, supprimer, publier et dépublier, tags, slug, transactions


# Etape 6 : Ajout de fonctionnalités	
Client React

- Vite, proxy /api, pages publiques, Markdown nettoyé avec DOMPurify


# Etape 7 : Ajout de fonctionnalités
Connexion côté front	

- Login, routes protégées, ErrorBoundary


# Etape 8 : Ajout de fonctionnalités
Interface admin	

- Liste, formulaire, publication, suppression


# Etape 9 : Ajout de fonctionnalités
Un seul serveur

- Fastify sert le build React, retour à index.html, helmet et CSP, redéploiement


# Etape 10 : Ajout de fonctionnalités
Finition

-	README avec captures et choix d'architecture, lien en ligne, nettoyage de l'historique