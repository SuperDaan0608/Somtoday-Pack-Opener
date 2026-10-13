-- Migratie v3 (blokkeren, melden, waarschuwingen, extra bans, ip-geheugen, mail aan de beheerder).
-- Herhaalbaar (alleen CREATE TABLE IF NOT EXISTS): voer dit uit in phpMyAdmin op een server die al schema.sql had. Dezelfde tabellen staan ook in schema.sql.
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
-- Wekelijkse drop (v3): hoeveel mythische kaarten er in een UTC ISO-week zijn geopend, door alle spelers samen. Alleen weeknummer en aantal: geen namen, geen id's.
CREATE TABLE IF NOT EXISTS week_teller (
  week CHAR(8) NOT NULL PRIMARY KEY,
  aantal INT NOT NULL
);
