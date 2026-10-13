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
-- Welke versie van de extensie iemand gebruikt (v2.3.4): vrienden moeten dezelfde versie hebben. Herhaalbaar.
CREATE TABLE IF NOT EXISTS user_versie (
  id CHAR(32) NOT NULL PRIMARY KEY,
  versie VARCHAR(20) NOT NULL
);

-- v3 (zelfde tabellen als migratie-v3.sql): blokkeren, melden, waarschuwingen, extra bans, ip-geheugen, mail aan de beheerder.
-- Blokkades: 'van' heeft 'tegen' geblokkeerd. Alleen id's.
CREATE TABLE IF NOT EXISTS blokkades (
  van CHAR(32) NOT NULL,
  tegen CHAR(32) NOT NULL,
  ts INT NOT NULL,
  PRIMARY KEY (van, tegen)
);
-- Meldingen van gebruikers over elkaar. reden: naam, tekst, pesten, spam of anders. status: nieuw of klaar.
-- 'bewijs' is alleen wat de melder zelf meestuurde (niet versleuteld, max. 400 tekens); de beheerder haalt het apart op.
CREATE TABLE IF NOT EXISTS meldingen (
  id BIGINT NOT NULL PRIMARY KEY,
  ts INT NOT NULL,
  van CHAR(32) NOT NULL,
  tegen CHAR(32) NOT NULL,
  reden VARCHAR(10) NOT NULL,
  uitleg VARCHAR(300) NOT NULL,
  bewijs VARCHAR(400) NOT NULL,
  status VARCHAR(10) NOT NULL,
  uitkomst VARCHAR(200) NOT NULL
);
-- Waarschuwingen van de beheerder aan een gebruiker.
CREATE TABLE IF NOT EXISTS waarschuwingen (
  id BIGINT NOT NULL PRIMARY KEY,
  account CHAR(32) NOT NULL,
  reden VARCHAR(200) NOT NULL,
  ts INT NOT NULL,
  gezien INT NOT NULL
);
-- Geblokkeerde mailboxen (alleen de hash) en netwerken (alleen de hash met zout, ten hoogste 7 dagen). 'bron' = het gebande gebruikers-id.
CREATE TABLE IF NOT EXISTS ban_email (
  email_hash CHAR(64) NOT NULL PRIMARY KEY,
  bron CHAR(32) NOT NULL,
  tot INT NOT NULL,
  gemaakt INT NOT NULL
);
CREATE TABLE IF NOT EXISTS ban_ip (
  ip_hash CHAR(64) NOT NULL PRIMARY KEY,
  bron CHAR(32) NOT NULL,
  tot INT NOT NULL,
  gemaakt INT NOT NULL
);
-- Ip-geheugen: alleen een hash (IPv6 per /64), hoogstens 30 dagen bewaard.
CREATE TABLE IF NOT EXISTS acc_ip (
  account CHAR(32) NOT NULL,
  ip_hash CHAR(64) NOT NULL,
  laatst INT NOT NULL,
  PRIMARY KEY (account, ip_hash)
);
-- Welke gebruiker bij welk e-mailaccount hoort (alleen id's), om bij een ban ook het e-mailadres te kunnen blokkeren.
CREATE TABLE IF NOT EXISTS acc_koppel (
  user_id CHAR(32) NOT NULL,
  account CHAR(32) NOT NULL,
  laatst INT NOT NULL,
  PRIMARY KEY (user_id, account)
);
-- Bundelen van de mail aan de beheerder: één rij met de laatste verzendtijd en wat er wacht (alleen aantallen en reden-categorieën).
CREATE TABLE IF NOT EXISTS beheer_mail (
  id INT NOT NULL PRIMARY KEY,
  laatst INT NOT NULL,
  wachtend INT NOT NULL,
  redenen VARCHAR(100) NOT NULL
);
-- Feedback van gebruikers (gewone tekst die de afzender zelf stuurt). van = account-id of NULL; ip_hash alleen als hash. soort: fout, idee of anders. status: nieuw of klaar.
CREATE TABLE IF NOT EXISTS feedback (
  id BIGINT NOT NULL PRIMARY KEY,
  ts INT NOT NULL,
  van CHAR(32) NULL,
  ip_hash CHAR(64) NOT NULL,
  soort VARCHAR(10) NOT NULL,
  tekst VARCHAR(500) NOT NULL,
  info VARCHAR(300) NOT NULL,
  status VARCHAR(10) NOT NULL
);
