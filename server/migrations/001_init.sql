


-- ---------------------------------------------------------------
-- Utilisateurs (un seul admin en V1)
-- ---------------------------------------------------------------
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,  -- Moi@x.com = moi@x.com
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'admin'
                CHECK (role IN ('admin', 'author')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ---------------------------------------------------------------
-- Articles
-- content_md = Markdown brut. La conversion en HTML et la
-- sanitisation se font à l'affichage, jamais au stockage.
-- ---------------------------------------------------------------
CREATE TABLE articles (
  id           INTEGER PRIMARY KEY,
  title        TEXT    NOT NULL,
  slug         TEXT    NOT NULL UNIQUE    -- UNIQUE crée déjà l'index
               CHECK (slug = lower(slug)),
  excerpt      TEXT    NOT NULL DEFAULT '',
  content_md   TEXT    NOT NULL,
  cover_url    TEXT,                      -- nullable
  status       TEXT    NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'published')),
  published_at TEXT,                      -- NULL tant que c'est un brouillon
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  author_id    INTEGER NOT NULL
               REFERENCES users(id) ON DELETE RESTRICT,
  -- un article publié a forcément une date de publication
  CHECK (status = 'draft' OR published_at IS NOT NULL)
);

-- Sert la page d'accueil : filtrer sur le statut, trier par date
CREATE INDEX idx_articles_status_published
  ON articles (status, published_at DESC);

-- ---------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------
CREATE TABLE tags (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

-- ---------------------------------------------------------------
-- Liaison N-N articles <-> tags
-- ---------------------------------------------------------------
CREATE TABLE article_tags (
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id)     ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

-- La clé primaire sert les recherches par article ;
-- cet index sert les recherches par tag (filtre V1.5)
CREATE INDEX idx_article_tags_tag ON article_tags (tag_id);

-- ---------------------------------------------------------------
-- Jeu de test à la main (à supprimer ensuite)
-- ---------------------------------------------------------------
-- INSERT INTO users (email, password_hash) VALUES ('moi@exemple.com', 'hash-bidon');
-- INSERT INTO articles (title, slug, content_md, status, published_at, author_id)
--   VALUES ('Mon premier TP Fastify', 'mon-premier-tp-fastify', '# Bonjour', 'published',
--           strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 1);
-- INSERT INTO tags (name, slug) VALUES ('fastify', 'fastify'), ('erreurs', 'erreurs');
-- INSERT INTO article_tags (article_id, tag_id) VALUES (1, 1), (1, 2);
--
-- Vérifications à faire :
--   1. Insérer un article avec un author_id inexistant  -> doit échouer
--   2. Insérer deux articles avec le même slug          -> doit échouer
--   3. Supprimer l'article 1 puis SELECT * FROM article_tags -> plus de lignes
--   4. Supprimer l'utilisateur 1 alors qu'il a des articles  -> doit échouer
