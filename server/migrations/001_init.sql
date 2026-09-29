CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'author')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE articles (
  id           INTEGER PRIMARY KEY,
  title        TEXT    NOT NULL,
  slug         TEXT    NOT NULL UNIQUE CHECK (slug = lower(slug)),
  excerpt      TEXT    NOT NULL DEFAULT '',
  content_md   TEXT    NOT NULL,
  cover_url    TEXT,
  status       TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  author_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (status = 'draft' OR published_at IS NOT NULL)
);

CREATE INDEX idx_articles_status_published ON articles (status, published_at DESC);

CREATE TABLE tags (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE article_tags (
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id)     ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

CREATE INDEX idx_article_tags_tag ON article_tags (tag_id);
