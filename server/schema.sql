-- Schema voor MySQL en SQLite; herhaalbaar (alleen CREATE TABLE IF NOT EXISTS, geen losse indexen).
CREATE TABLE IF NOT EXISTS users (
  id CHAR(32) NOT NULL PRIMARY KEY,
  pub TEXT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created INT NOT NULL,
  last_seen INT NOT NULL
);
CREATE TABLE IF NOT EXISTS friendships (
  a CHAR(32) NOT NULL,
  b CHAR(32) NOT NULL,
  status VARCHAR(10) NOT NULL,
  created INT NOT NULL,
  PRIMARY KEY (a, b)
);
CREATE TABLE IF NOT EXISTS blobs (
  owner CHAR(32) NOT NULL,
  recipient CHAR(32) NOT NULL,
  data MEDIUMTEXT NOT NULL,
  updated INT NOT NULL,
  PRIMARY KEY (owner, recipient)
);
CREATE TABLE IF NOT EXISTS ratelimit (
  k CHAR(64) NOT NULL,
  venster INT NOT NULL,
  aantal INT NOT NULL,
  PRIMARY KEY (k, venster)
);
