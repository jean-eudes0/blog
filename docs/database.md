# Base de données

Base PostgreSQL du blog (Neon ou Supabase). Le schéma exécutable est dans `server/migrations/`.

## Diagramme entité-relation

```mermaid
erDiagram
    users ||--o{ articles : "écrit"
    articles ||--o{ article_tags : "porte"
    tags ||--o{ article_tags : "classe"

    users {
        INTEGER id PK
        TEXT email UK "NOT NULL, unicité via lower(email)"
        TEXT password_hash "NOT NULL, bcrypt"
        TEXT role "admin | author, défaut admin"
        TIMESTAMPTZ created_at "géré par la base (now())"
    }

    articles {
        INTEGER id PK
        TEXT title "NOT NULL"
        TEXT slug UK "NOT NULL, minuscules, figé dès la création"
        TEXT excerpt "défaut vide"
        TEXT content_md "Markdown brut"
        TEXT cover_url "nullable"
        TEXT status "draft | published"
        TIMESTAMPTZ published_at "NULL tant que jamais publié ; conservée après dépublication"
        TIMESTAMPTZ created_at "géré par la base (now())"
        TIMESTAMPTZ updated_at "mis à jour par le code applicatif"
        INTEGER author_id FK "ON DELETE RESTRICT"
    }

    tags {
        INTEGER id PK
        TEXT name UK "NOT NULL"
        TEXT slug UK "NOT NULL"
    }

    article_tags {
        INTEGER article_id PK, FK "ON DELETE CASCADE"
        INTEGER tag_id PK, FK "ON DELETE CASCADE"
    }

        users ||--o{ sessions : "ouvre"

    sessions {
        TEXT id PK "empreinte SHA-256 du jeton"
        INTEGER user_id FK "ON DELETE CASCADE"
        TIMESTAMPTZ created_at "géré par la base (now())"
        TIMESTAMPTZ expires_at "NOT NULL"
    }
```

## Relations

| Relation | Cardinalité | Règle de suppression |
|---|---|---|
| `users` → `articles` | 1-N | `RESTRICT` : impossible de supprimer un utilisateur qui a des articles |
| `articles` ↔ `tags` | N-N via `article_tags` | `CASCADE` : supprimer un article ou un tag supprime les liens, jamais l'autre entité |

## Index

| Index | Rôle |
|---|---|
| `articles(slug)` UNIQUE | Retrouver un article depuis son URL |
| `articles(status, published_at DESC)` | Page d'accueil : articles publiés, du plus récent au plus ancien |
| `article_tags(article_id, tag_id)` PK (clé primaire, index automatique) | Tags d'un article |
| `article_tags(tag_id)` | Articles d'un tag (filtre V1.5) |

## Décisions de conception

- **Markdown stocké, HTML généré.** Le contenu est conservé brut. La conversion et la sanitisation ont lieu à l'affichage, ce qui permet de changer le rendu sans migrer les données.
- **`published_at` distinct de `created_at`.** La date affichée est celle de la publication, pas celle du premier brouillon.
- **Slug stable.** Généré à la création, il ne change plus après publication, pour ne pas casser les liens partagés.
- **Contraintes dans la base.** Les `CHECK`, `UNIQUE`, `NOT NULL` et clés étrangères protègent les données même si le code applicatif contient un bug. Exemples : un article publié doit avoir une `published_at`, un slug est toujours en minuscules, et un email est unique sans tenir compte de la casse.
- **Dates en `TIMESTAMPTZ`.** PostgreSQL gère nativement les dates avec fuseau horaire ; on les compare et on les trie sans conversion.
- **Colonne `role` prévue dès la V1** (un seul rôle utilisé) pour éviter une migration lors de l'ajout des auteurs.
- **Sessions hors de ce schéma initial.** Ajoutées dans `002_sessions.sql`.
- **Index fonctionnel sur `lower(email)` plutôt que `CITEXT`.** L'extension `citext` 
  n'est pas disponible sur toutes les images PostgreSQL. On utilise à la place un 
  index `UNIQUE` sur `lower(email)`,  sans dépendance d'extension.
