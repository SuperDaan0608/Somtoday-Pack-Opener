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
CREATE TABLE IF NOT EXISTS berichten (
  afz CHAR(32) NOT NULL,
  ontv CHAR(32) NOT NULL,
  seq BIGINT NOT NULL,
  data VARCHAR(4096) NOT NULL,
  created INT NOT NULL,
  PRIMARY KEY (afz, ontv, seq)
);
-- Beheer: verbannen gebruikers. tot = unix-tijd waarop de ban afloopt, 0 = voorgoed. Herhaalbaar, dus ook de migratie voor bestaande servers.
CREATE TABLE IF NOT EXISTS bans (
  id CHAR(32) NOT NULL PRIMARY KEY,
  tot INT NOT NULL,
  reden VARCHAR(200) NOT NULL,
  gemaakt INT NOT NULL
);
-- Accounts (v2.2). Alleen een hash van het e-mailadres; de back-up is in de browser versleuteld. Herhaalbaar, dus ook de migratie.
CREATE TABLE IF NOT EXISTS accounts (
  id CHAR(32) NOT NULL PRIMARY KEY,
  email_hash CHAR(64) NOT NULL UNIQUE,
  ww_hash VARCHAR(255) NOT NULL,
  geverifieerd INT NOT NULL,
  gemaakt INT NOT NULL,
  laatst INT NOT NULL
);
CREATE TABLE IF NOT EXISTS acc_codes (
  email_hash CHAR(64) NOT NULL,
  soort VARCHAR(10) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  verloopt INT NOT NULL,
  pogingen INT NOT NULL,
  PRIMARY KEY (email_hash, soort)
);
CREATE TABLE IF NOT EXISTS acc_sessies (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  account CHAR(32) NOT NULL,
  verloopt INT NOT NULL
);
CREATE TABLE IF NOT EXISTS acc_backup (
  account CHAR(32) NOT NULL PRIMARY KEY,
  data MEDIUMTEXT NOT NULL,
  versie INT NOT NULL,
  bijgewerkt INT NOT NULL
);
