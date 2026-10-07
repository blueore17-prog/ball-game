-- accounts, sessions, ranked runs and the leaderboard
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,                 -- stored lowercase
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,   -- shown on the leaderboard
  color TEXT NOT NULL,
  pid TEXT NOT NULL UNIQUE,                   -- player id used by challenges
  pass_hash TEXT NOT NULL,
  pass_salt TEXT NOT NULL,
  pass_iter INTEGER NOT NULL,
  created INTEGER NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,           -- sum of ranked season scores (the leaderboard)
  runs INTEGER NOT NULL DEFAULT 0,
  best INTEGER NOT NULL DEFAULT 0,
  best_w INTEGER NOT NULL DEFAULT 0,
  titles INTEGER NOT NULL DEFAULT 0,
  perfect INTEGER NOT NULL DEFAULT 0          -- 82-0 regular seasons
);
CREATE INDEX users_total ON users (total DESC);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  seed INTEGER NOT NULL,                      -- draft spins
  sim INTEGER,                                -- season + playoffs, drawn only after the team is locked
  created INTEGER NOT NULL,
  finished INTEGER,
  score INTEGER,
  w INTEGER,
  po_w INTEGER,
  po_l INTEGER,
  title INTEGER,
  team TEXT                                   -- JSON list of player ids, slot order
);
CREATE INDEX runs_user ON runs (user_id, finished DESC);

CREATE TABLE login_fails (
  email TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  since INTEGER NOT NULL
);
