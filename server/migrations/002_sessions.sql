-- Sessions d'authentification.
-- On ne stocke JAMAIS le jeton du cookie, seulement son empreinte SHA-256 :
-- une fuite de la base ne permet donc pas de se faire passer pour l'admin.
CREATE TABLE sessions (
  id         TEXT    PRIMARY KEY,          -- SHA-256 (hex) du jeton
  user_id    INTEGER NOT NULL
             REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expires_at TEXT    NOT NULL              -- ISO 8601 UTC
);

CREATE INDEX idx_sessions_user    ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

 