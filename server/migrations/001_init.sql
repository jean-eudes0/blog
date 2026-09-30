CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'author')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unicité insensible à la casse sans dépendre de l'extension citext
-- (absente de certaines images PostgreSQL, comme celle utilisée par la CI).
CREATE UNIQUE INDEX idx_users_email_lower ON users (lower(email));

CREATE TABLE articles (
  id           SERIAL PRIMARY KEY,
  title        TEXT    NOT NULL,
  slug         TEXT    NOT NULL UNIQUE CHECK (slug = lower(slug)),
  excerpt      TEXT    NOT NULL DEFAULT '',
  content_md   TEXT    NOT NULL,
  cover_url    TEXT,
  status       TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  author_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (status = 'draft' OR published_at IS NOT NULL)
);

CREATE INDEX idx_articles_status_published ON articles (status, published_at DESC);

CREATE TABLE tags (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE article_tags (
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id)     ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

CREATE INDEX idx_article_tags_tag ON article_tags (tag_id);