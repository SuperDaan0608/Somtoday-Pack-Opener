<?php
// Somtoday Pack Opener: vriendenserver. Eén endpoint, JSON in en uit, actie in veld "a".
// De server bewaart alleen willekeurige id's, publieke sleutels en onleesbare (versleutelde) blobs.
declare(strict_types=1);

const MAX_BODY = 786432;  // 768 KB (alleen de back-up van een account is zo groot; de rest heeft eigen, kleinere grenzen)
const MAX_BACKUP = 700000; // versleutelde back-up van een account (zonder kaartplaatjes)
const MAX_BLOB = 98304;   // 96 KB
const MAX_BERICHT = 2048; // een kanaalbericht (versleuteld) mag hoogstens 2 KB zijn
const BERICHT_TTL = 600;  // berichten in een kanaal verdwijnen na 10 minuten
const MAX_WACHTRIJ = 300; // hoogstens zoveel berichten tegelijk van één afzender naar één ontvanger

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-Id, X-Token, X-Beheer, X-Sessie, X-Versie');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function uit(int $code, array $data): void {
  http_response_code($code);
  echo json_encode($data === [] ? new stdClass() : $data, JSON_UNESCAPED_SLASHES);
  exit;
}
function fout(int $code, string $tekst): void { uit($code, ['fout' => $tekst]); }

// Onverwachte fouten: nooit details naar buiten lekken.
set_exception_handler(function (Throwable $e) { fout(500, 'Serverfout.'); });

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
// Controle voor jezelf: open api.php?status=1 in de browser. Laat zien of config.php en de tabellen kloppen (geen geheimen).
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && isset($_GET['status'])) {
  $pad = getenv('SPO_CONFIG') ?: __DIR__ . '/config.php';
  if (!is_file($pad)) fout(500, 'config.php ontbreekt naast api.php.');
  $c = require $pad;
  try {
    $d = new PDO($c['db_dsn'], $c['db_user'] ?? null, $c['db_pass'] ?? null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
  } catch (Throwable $e) { fout(500, 'Database niet bereikbaar: controleer host, naam, gebruiker en wachtwoord in config.php.'); }
  foreach (['users', 'friendships', 'blobs', 'ratelimit', 'berichten', 'bans', 'accounts', 'acc_codes', 'acc_sessies', 'acc_backup', 'user_versie'] as $t) {
    try { $d->query('SELECT 1 FROM ' . $t . ' LIMIT 1'); }
    catch (Throwable $e) { fout(500, 'Tabel ontbreekt: ' . $t . '. Voer schema.sql uit in phpMyAdmin.'); }
  }
  uit(200, ['ok' => true, 'tekst' => 'Alles klopt: config en tabellen zijn in orde.']);
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST')
  fout(405, 'Gebruik POST.');

// Configuratie: standaard config.php naast dit bestand (voor tests via omgevingsvariabele SPO_CONFIG).
$cfgPad = getenv('SPO_CONFIG') ?: __DIR__ . '/config.php';
if (!is_file($cfgPad)) fout(500, 'Server niet geconfigureerd.');
$cfg = require $cfgPad;

// Body lezen met harde grens.
$lengte = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($lengte > MAX_BODY) fout(413, 'Verzoek te groot.');
$ruw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
if ($ruw === false || strlen($ruw) > MAX_BODY) fout(413, 'Verzoek te groot.');
$in = json_decode($ruw === '' ? '{}' : $ruw, true);
unset($ruw);
if (!is_array($in)) fout(400, 'Ongeldige JSON.');

try {
  $db = new PDO($cfg['db_dsn'], $cfg['db_user'] ?? null, $cfg['db_pass'] ?? null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
} catch (Throwable $e) { fout(500, 'Database niet bereikbaar.'); }

function q(PDO $db, string $sql, array $p = []): PDOStatement {
  $s = $db->prepare($sql);
  $s->execute($p);
  return $s;
}
// Mail via SMTP (bijv. Gmail: smtp.gmail.com, poort 465, met een app-wachtwoord). Geeft true als de server de mail aannam.
function smtpStuur(array $cfg, string $van, string $aan, string $onderwerp, string $tekst): bool {
  $host = (string)($cfg['smtp_host'] ?? 'smtp.gmail.com');
  $poort = (int)($cfg['smtp_poort'] ?? 465);
  $schema = ($cfg['smtp_beveiliging'] ?? 'ssl') === 'geen' ? 'tcp' : 'ssl'; // 'geen' alleen voor tests
  $s = @stream_socket_client($schema . '://' . $host . ':' . $poort, $en, $es, 15);
  if (!$s) return false;
  stream_set_timeout($s, 15);
  $lees = function () use ($s): string {
    $r = '';
    while (($l = fgets($s, 1024)) !== false) { $r .= $l; if (strlen($l) < 4 || $l[3] === ' ') break; }
    return $r;
  };
  $zeg = function (string $c, string $verwacht) use ($s, $lees): bool {
    if ($c !== '') fwrite($s, $c . "\r\n");
    return strncmp($lees(), $verwacht, 3) === 0;
  };
  $gebr = (string)($cfg['smtp_gebruiker'] ?? $van);
  $ok = $zeg('', '220') && $zeg('EHLO pack-opener', '250')
    && $zeg('AUTH LOGIN', '334') && $zeg(base64_encode($gebr), '334') && $zeg(base64_encode((string)$cfg['smtp_wachtwoord']), '235')
    && $zeg('MAIL FROM:<' . $van . '>', '250') && $zeg('RCPT TO:<' . $aan . '>', '250') && $zeg('DATA', '354');
  if ($ok) {
    $bericht = 'From: Somtoday Pack Opener <' . $van . ">\r\nTo: <" . $aan . ">\r\nSubject: =?UTF-8?B?" . base64_encode($onderwerp) . "?=\r\n"
      . "Date: " . date('r') . "\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
      . chunk_split(base64_encode($tekst));
    $ok = $zeg($bericht . "\r\n.", '250');
  }
  @fwrite($s, "QUIT\r\n");
  fclose($s);
  return $ok;
}
function isId($v): bool { return is_string($v) && preg_match('/^[0-9a-f]{32}$/', $v) === 1; }

// Rate limit: alleen een hash van ip + zout wordt bewaard, nooit het ruwe adres.
function tel(PDO $db, string $sleutel, int $venster, int $max): void {
  $n = q($db, 'UPDATE ratelimit SET aantal = aantal + 1 WHERE k = ? AND venster = ?', [$sleutel, $venster])->rowCount();
  if ($n === 0) {
    try { q($db, 'INSERT INTO ratelimit (k, venster, aantal) VALUES (?, ?, 1)', [$sleutel, $venster]); }
    catch (Throwable $e) { q($db, 'UPDATE ratelimit SET aantal = aantal + 1 WHERE k = ? AND venster = ?', [$sleutel, $venster]); }
  }
  $a = (int)q($db, 'SELECT aantal FROM ratelimit WHERE k = ? AND venster = ?', [$sleutel, $venster])->fetchColumn();
  if ($a > $max) { header('Retry-After: 60'); fout(429, 'Te veel verzoeken. Probeer het zo opnieuw.'); }
}
$nu = time();
$ipHash = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . ($cfg['zout'] ?? ''));
// Per ip-adres ruim (een school deelt vaak één adres); de strengere grenzen per gebruiker staan hieronder na het inloggen.
tel($db, hash('sha256', $ipHash . ':req'), intdiv($nu, 60), (int)($cfg['limiet_per_min'] ?? 6000));

// Opruimen: oude limiet-rijen en gebruikers die 365 dagen niet actief waren (1% van de verzoeken).
function verwijderGebruiker(PDO $db, string $id): void {
  q($db, 'DELETE FROM blobs WHERE owner = ? OR recipient = ?', [$id, $id]);
  q($db, 'DELETE FROM berichten WHERE afz = ? OR ontv = ?', [$id, $id]);
  q($db, 'DELETE FROM friendships WHERE a = ? OR b = ?', [$id, $id]);
  q($db, 'DELETE FROM bans WHERE id = ?', [$id]);
  q($db, 'DELETE FROM user_versie WHERE id = ?', [$id]);
  q($db, 'DELETE FROM users WHERE id = ?', [$id]);
}
if (random_int(1, 100) === 1) {
  // Minuut-vensters (nu rond 29 miljoen) en uur-vensters (rond 490 duizend) staan in dezelfde tabel; elk krijgt zijn eigen drempel.
  q($db, 'DELETE FROM ratelimit WHERE venster >= 10000000 AND venster < ?', [intdiv($nu, 60) - 120]);
  q($db, 'DELETE FROM berichten WHERE created < ?', [$nu - BERICHT_TTL]);
  q($db, 'DELETE FROM ratelimit WHERE venster < 10000000 AND venster < ?', [intdiv($nu, 3600) - 3]);
  q($db, 'DELETE FROM bans WHERE tot > 0 AND tot <= ?', [$nu]);
  q($db, 'DELETE FROM acc_codes WHERE verloopt < ?', [$nu]);
  q($db, 'DELETE FROM acc_sessies WHERE verloopt < ?', [$nu]);
  q($db, 'DELETE FROM accounts WHERE geverifieerd = 0 AND gemaakt < ?', [$nu - 7 * 86400]);
  $oud = q($db, 'SELECT id FROM users WHERE last_seen < ?', [$nu - 365 * 86400])->fetchAll(PDO::FETCH_COLUMN);
  foreach ($oud as $o) verwijderGebruiker($db, $o);
}

$actie = $in['a'] ?? '';
if (!is_string($actie)) fout(400, 'Ongeldige actie.');

// ---- Beheer (alleen voor de eigenaar) ----
// Aan als config.php een lange 'beheer_sleutel' heeft; anders bestaan deze acties niet (404).
// De beheerder ziet alleen id's, tijden en aantallen/groottes: de inhoud is versleuteld en blijft onleesbaar.
if (strncmp($actie, 'beheer', 6) === 0) {
  $bs = $cfg['beheer_sleutel'] ?? '';
  if (!is_string($bs) || strlen($bs) < 16) fout(404, 'Onbekende actie.');
  // Eigen, strenge limiet per ip-adres (ook voor foute sleutels), tegen raden.
  tel($db, hash('sha256', $ipHash . ':beh'), intdiv($nu, 60), (int)($cfg['limiet_beheer_per_min'] ?? 30));
  $gegeven = $_SERVER['HTTP_X_BEHEER'] ?? ($in['beheer'] ?? '');
  if (!is_string($gegeven) || $gegeven === '' || !hash_equals($bs, $gegeven)) fout(403, 'Geen toegang.');
  unset($in['beheer']);
  $bid = $in['id'] ?? null;
  switch ($actie) {
    case 'beheerLijst': {
      $u = q($db, 'SELECT id, created, last_seen FROM users ORDER BY last_seen DESC')->fetchAll();
      $vr = []; $bl = []; $be = []; $bn = [];
      foreach (q($db, 'SELECT a, b FROM friendships WHERE status = ?', ['accepted'])->fetchAll() as $x) { $vr[$x['a']] = ($vr[$x['a']] ?? 0) + 1; $vr[$x['b']] = ($vr[$x['b']] ?? 0) + 1; }
      foreach (q($db, 'SELECT owner, COUNT(*) AS n, SUM(LENGTH(data)) AS g FROM blobs GROUP BY owner')->fetchAll() as $x) $bl[$x['owner']] = [(int)$x['n'], (int)$x['g']];
      foreach (q($db, 'SELECT afz, COUNT(*) AS n, SUM(LENGTH(data)) AS g FROM berichten GROUP BY afz')->fetchAll() as $x) $be[$x['afz']] = [(int)$x['n'], (int)$x['g']];
      foreach (q($db, 'SELECT id, tot, reden FROM bans WHERE tot = 0 OR tot > ?', [$nu])->fetchAll() as $x) $bn[$x['id']] = ['tot' => (int)$x['tot'], 'reden' => $x['reden']];
      $lijst = [];
      foreach ($u as $x) {
        $i = $x['id'];
        $lijst[] = ['id' => $i, 'aangemaakt' => (int)$x['created'], 'laatstActief' => (int)$x['last_seen'], 'vrienden' => $vr[$i] ?? 0,
          'blobs' => $bl[$i][0] ?? 0, 'blobBytes' => $bl[$i][1] ?? 0, 'berichten' => $be[$i][0] ?? 0, 'berichtBytes' => $be[$i][1] ?? 0, 'ban' => $bn[$i] ?? null];
      }
      uit(200, ['nu' => $nu, 'gebruikers' => $lijst]);
    }
    case 'beheerStats': {
      $n = fn(string $sql, array $p = []) => (int)q($db, $sql, $p)->fetchColumn();
      uit(200, ['nu' => $nu,
        'gebruikers' => $n('SELECT COUNT(*) FROM users'),
        'actief24u' => $n('SELECT COUNT(*) FROM users WHERE last_seen >= ?', [$nu - 86400]),
        'actief7d' => $n('SELECT COUNT(*) FROM users WHERE last_seen >= ?', [$nu - 7 * 86400]),
        'nieuw24u' => $n('SELECT COUNT(*) FROM users WHERE created >= ?', [$nu - 86400]),
        'vriendschappen' => $n('SELECT COUNT(*) FROM friendships WHERE status = ?', ['accepted']),
        'verzoeken' => $n('SELECT COUNT(*) FROM friendships WHERE status = ?', ['pending']),
        'blobs' => $n('SELECT COUNT(*) FROM blobs'),
        'blobBytes' => $n('SELECT COALESCE(SUM(LENGTH(data)), 0) FROM blobs'),
        'berichten' => $n('SELECT COUNT(*) FROM berichten'),
        'verbannen' => $n('SELECT COUNT(*) FROM bans WHERE tot = 0 OR tot > ?', [$nu])]);
    }
  }
  // Acties met een doelgebruiker.
  if (!isId($bid)) fout(400, 'Ongeldige id.');
  if (!bestaat($db, $bid)) fout(404, 'Deze gebruiker bestaat niet (meer).');
  switch ($actie) {
    case 'beheerBan': {
      $tot = $in['tot'] ?? 0;
      $reden = $in['reden'] ?? '';
      if (!is_int($tot) || $tot < 0 || ($tot > 0 && $tot <= $nu) || $tot > 4102444800) fout(400, 'Ongeldige einddatum.');
      if (!is_string($reden)) fout(400, 'Ongeldige reden.');
      $reden = function_exists('mb_substr') ? mb_substr(trim($reden), 0, 200) : substr(trim($reden), 0, 200);
      $db->beginTransaction();
      q($db, 'DELETE FROM bans WHERE id = ?', [$bid]);
      q($db, 'INSERT INTO bans (id, tot, reden, gemaakt) VALUES (?, ?, ?, ?)', [$bid, $tot, $reden, $nu]);
      $db->commit();
      uit(200, ['ok' => true, 'tot' => $tot, 'reden' => $reden]);
    }
    case 'beheerOnban':
      q($db, 'DELETE FROM bans WHERE id = ?', [$bid]);
      uit(200, ['ok' => true]);
    case 'beheerWisKaarten': {
      $db->beginTransaction();
      q($db, 'DELETE FROM blobs WHERE owner = ? OR recipient = ?', [$bid, $bid]);
      q($db, 'DELETE FROM berichten WHERE afz = ? OR ontv = ?', [$bid, $bid]);
      $db->commit();
      uit(200, ['ok' => true]);
    }
    case 'beheerWisAccount': {
      $db->beginTransaction();
      verwijderGebruiker($db, $bid);
      $db->commit();
      uit(200, ['ok' => true]);
    }
    default:
      fout(400, 'Onbekende actie.');
  }
}

// ---- Accounts (v2.2): e-mail + wachtwoord, met een code per e-mail ----
// Het e-mailadres wordt niet bewaard: alleen een hash (met zout). Het adres staat alleen even in het verzoek om de mail te sturen.
// De back-up is in de browser versleuteld met een sleutel uit het wachtwoord: de server (en de beheerder) kan hem niet lezen.
// Grote verzoeken mogen alleen voor de back-up; de rest blijft onder de oude grens.
if ($actie !== 'accBackupBewaar' && $lengte > 131072) fout(413, 'Verzoek te groot.');
if (strncmp($actie, 'acc', 3) === 0) {
  $emailHash = function ($e) use ($cfg): string { return hash('sha256', 'email:' . strtolower(trim((string)$e)) . ($cfg['zout'] ?? '')); };
  $leesEmail = function () use ($in): string {
    $e = $in['email'] ?? '';
    if (!is_string($e) || strlen($e) > 200) fout(400, 'Vul een geldig e-mailadres in.');
    $e = strtolower(trim($e));
    if (!filter_var($e, FILTER_VALIDATE_EMAIL)) fout(400, 'Vul een geldig e-mailadres in.');
    return $e;
  };
  $leesWw = function () use ($in): string {
    $w = $in['ww'] ?? '';
    if (!is_string($w) || strlen($w) < 8) fout(400, 'Je wachtwoord moet minstens 8 tekens hebben.');
    if (strlen($w) > 200) fout(400, 'Je wachtwoord is te lang.');
    return $w;
  };
  // Stuurt een code van 6 cijfers. In tests ('mail_bestand') komt de mail in een bestand in plaats van in de post.
  $stuurCode = function (string $email, string $soort) use ($db, $cfg, $nu, $emailHash): void {
    $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $eh = $emailHash($email);
    q($db, 'DELETE FROM acc_codes WHERE email_hash = ? AND soort = ?', [$eh, $soort]);
    q($db, 'INSERT INTO acc_codes (email_hash, soort, code_hash, verloopt, pogingen) VALUES (?, ?, ?, ?, 0)',
      [$eh, $soort, hash('sha256', $code . ':' . $eh), $nu + 15 * 60]);
    $onderwerp = $soort === 'reset' ? 'Je code om je wachtwoord te wijzigen' : 'Je code voor Somtoday Pack Opener';
    $tekst = "Hoi!\n\nJe code is: $code\n\nVul deze code in de Pack Opener in. De code werkt 15 minuten.\n"
      . ($soort === 'reset' ? "Heb jij niet gevraagd om je wachtwoord te wijzigen? Dan kun je deze mail negeren.\n" : "Heb jij geen account gemaakt? Dan kun je deze mail negeren.\n")
      . "\nSomtoday Pack Opener";
    $van = (string)($cfg['mail_van'] ?? '');
    if (!empty($cfg['mail_bestand'])) {
      file_put_contents((string)$cfg['mail_bestand'], json_encode(['aan' => $email, 'soort' => $soort, 'code' => $code]) . "\n", FILE_APPEND);
      return;
    }
    if ($van === '' || !filter_var($van, FILTER_VALIDATE_EMAIL)) fout(500, 'De server kan nog geen mail sturen (mail_van ontbreekt in config.php).');
    if (!empty($cfg['smtp_wachtwoord'])) {
      if (!smtpStuur($cfg, $van, $email, $onderwerp, $tekst)) fout(500, 'De mail kon niet worden verstuurd. Probeer het later opnieuw.');
      return;
    }
    $kop = 'From: Somtoday Pack Opener <' . $van . ">\r\nContent-Type: text/plain; charset=utf-8\r\nX-Mailer: SPO";
    if (!mail($email, '=?UTF-8?B?' . base64_encode($onderwerp) . '?=', $tekst, $kop, '-f' . $van)) fout(500, 'De mail kon niet worden verstuurd. Probeer het later opnieuw.');
  };
  // Controleert een code; na 5 foute pogingen moet je een nieuwe vragen.
  $controleerCode = function (string $email, string $soort) use ($db, $in, $nu, $emailHash): void {
    $code = $in['code'] ?? '';
    if (!is_string($code) || !preg_match('/^[0-9]{6}$/', trim($code))) fout(400, 'Vul de code van 6 cijfers in.');
    $eh = $emailHash($email);
    $r = q($db, 'SELECT code_hash, verloopt, pogingen FROM acc_codes WHERE email_hash = ? AND soort = ?', [$eh, $soort])->fetch();
    if (!$r || (int)$r['verloopt'] < $nu) fout(400, 'Deze code is verlopen. Vraag een nieuwe code aan.');
    if ((int)$r['pogingen'] >= 5) fout(429, 'Te vaak een verkeerde code. Vraag een nieuwe code aan.');
    if (!hash_equals((string)$r['code_hash'], hash('sha256', trim($code) . ':' . $eh))) {
      q($db, 'UPDATE acc_codes SET pogingen = pogingen + 1 WHERE email_hash = ? AND soort = ?', [$eh, $soort]);
      fout(400, 'Deze code klopt niet.');
    }
    q($db, 'DELETE FROM acc_codes WHERE email_hash = ? AND soort = ?', [$eh, $soort]);
  };
  $nieuweSessie = function (string $acc) use ($db, $nu): string {
    $t = bin2hex(random_bytes(32));
    q($db, 'INSERT INTO acc_sessies (token_hash, account, verloopt) VALUES (?, ?, ?)', [hash('sha256', $t), $acc, $nu + 365 * 86400]);
    q($db, 'UPDATE accounts SET laatst = ? WHERE id = ?', [$nu, $acc]);
    return $t;
  };
  // Mails en inlogpogingen zijn beperkt per ip-adres en per e-mailadres.
  $limietMail = function (string $email) use ($ipHash, $db, $nu, $cfg, $emailHash): void {
    tel($db, hash('sha256', $ipHash . ':mail'), intdiv($nu, 3600), (int)($cfg['limiet_mail_per_uur'] ?? 20));
    tel($db, hash('sha256', $emailHash($email) . ':mail'), intdiv($nu, 3600), (int)($cfg['limiet_mail_email_per_uur'] ?? 5));
  };
  $limietLogin = function (string $email) use ($ipHash, $db, $nu, $cfg, $emailHash): void {
    tel($db, hash('sha256', $ipHash . ':login'), intdiv($nu, 60), (int)($cfg['limiet_login_per_min'] ?? 30));
    tel($db, hash('sha256', $emailHash($email) . ':login'), intdiv($nu, 3600), (int)($cfg['limiet_login_email_per_uur'] ?? 30));
  };

  switch ($actie) {
    case 'accRegistreer': {
      $email = $leesEmail();
      $ww = $leesWw();
      $limietMail($email);
      $eh = $emailHash($email);
      $r = q($db, 'SELECT id, geverifieerd FROM accounts WHERE email_hash = ?', [$eh])->fetch();
      if ($r && (int)$r['geverifieerd'] === 1) fout(409, 'Er bestaat al een account met dit e-mailadres. Log in.');
      $hash = password_hash($ww, PASSWORD_DEFAULT);
      if ($r) q($db, 'UPDATE accounts SET ww_hash = ? WHERE id = ?', [$hash, $r['id']]);
      else q($db, 'INSERT INTO accounts (id, email_hash, ww_hash, geverifieerd, gemaakt, laatst) VALUES (?, ?, ?, 0, ?, ?)', [bin2hex(random_bytes(16)), $eh, $hash, $nu, $nu]);
      $stuurCode($email, 'verifieer');
      uit(200, ['ok' => true]);
    }
    case 'accVerifieer': {
      $email = $leesEmail();
      $limietLogin($email);
      $r = q($db, 'SELECT id FROM accounts WHERE email_hash = ?', [$emailHash($email)])->fetch();
      if (!$r) fout(404, 'Er is geen account met dit e-mailadres.');
      $controleerCode($email, 'verifieer');
      q($db, 'UPDATE accounts SET geverifieerd = 1 WHERE id = ?', [$r['id']]);
      uit(200, ['sessie' => $nieuweSessie($r['id']), 'account' => $r['id'], 'nieuw' => true]);
    }
    case 'accCodeOpnieuw': {
      $email = $leesEmail();
      $limietMail($email);
      $r = q($db, 'SELECT geverifieerd FROM accounts WHERE email_hash = ?', [$emailHash($email)])->fetch();
      if ($r && (int)$r['geverifieerd'] === 0) $stuurCode($email, 'verifieer');
      uit(200, ['ok' => true]); // altijd ok: zo verraad je niet of een adres een account heeft
    }
    case 'accLogin': {
      $email = $leesEmail();
      $ww = $in['ww'] ?? '';
      if (!is_string($ww) || $ww === '' || strlen($ww) > 200) fout(400, 'Vul je wachtwoord in.');
      $limietLogin($email);
      $r = q($db, 'SELECT id, ww_hash, geverifieerd FROM accounts WHERE email_hash = ?', [$emailHash($email)])->fetch();
      // ook zonder account een hash controleren, zodat de tijd niets verraadt
      $ok = password_verify($ww, $r ? (string)$r['ww_hash'] : '$2y$10$abcdefghijklmnopqrstuuJ0bJHn7ZLqvSMxKjXv5lQ4p1JhPpE1i');
      if (!$r || !$ok) fout(401, 'E-mailadres of wachtwoord klopt niet.');
      if ((int)$r['geverifieerd'] !== 1) {
        $limietMail($email);
        $stuurCode($email, 'verifieer');
        uit(403, ['fout' => 'Je e-mailadres is nog niet bevestigd. We hebben een nieuwe code gestuurd.', 'nietBevestigd' => true]);
      }
      uit(200, ['sessie' => $nieuweSessie($r['id']), 'account' => $r['id']]);
    }
    case 'accVergeten': {
      $email = $leesEmail();
      $limietMail($email);
      $r = q($db, 'SELECT geverifieerd FROM accounts WHERE email_hash = ?', [$emailHash($email)])->fetch();
      if ($r && (int)$r['geverifieerd'] === 1) $stuurCode($email, 'reset');
      uit(200, ['ok' => true]);
    }
    case 'accReset': {
      $email = $leesEmail();
      $ww = $leesWw();
      $limietLogin($email);
      $r = q($db, 'SELECT id FROM accounts WHERE email_hash = ? AND geverifieerd = 1', [$emailHash($email)])->fetch();
      if (!$r) fout(404, 'Er is geen account met dit e-mailadres.');
      $controleerCode($email, 'reset');
      // Nieuw wachtwoord = nieuwe sleutel: de oude back-up is daarmee niet meer te lezen en gaat weg. De browser zet hem opnieuw neer.
      $db->beginTransaction();
      q($db, 'UPDATE accounts SET ww_hash = ? WHERE id = ?', [password_hash($ww, PASSWORD_DEFAULT), $r['id']]);
      q($db, 'DELETE FROM acc_sessies WHERE account = ?', [$r['id']]);
      q($db, 'DELETE FROM acc_backup WHERE account = ?', [$r['id']]);
      $db->commit();
      uit(200, ['sessie' => $nieuweSessie($r['id']), 'account' => $r['id']]);
    }
  }
  // Vanaf hier: ingelogd met een sessie.
  $st = $_SERVER['HTTP_X_SESSIE'] ?? ($in['sessie'] ?? '');
  if (!is_string($st) || !preg_match('/^[0-9a-f]{64}$/', $st)) fout(401, 'Niet ingelogd.');
  $ses = q($db, 'SELECT account, verloopt FROM acc_sessies WHERE token_hash = ?', [hash('sha256', $st)])->fetch();
  if (!$ses || (int)$ses['verloopt'] < $nu) fout(401, 'Je bent uitgelogd. Log opnieuw in.');
  $acc = (string)$ses['account'];
  tel($db, hash('sha256', $acc . ':acc'), intdiv($nu, 60), (int)($cfg['limiet_acc_per_min'] ?? 60));
  switch ($actie) {
    case 'accBackupLaad': {
      $b = q($db, 'SELECT data, versie, bijgewerkt FROM acc_backup WHERE account = ?', [$acc])->fetch();
      uit(200, $b ? ['data' => (string)$b['data'], 'versie' => (int)$b['versie'], 'bijgewerkt' => (int)$b['bijgewerkt']] : ['data' => null, 'versie' => 0]);
    }
    case 'accBackupBewaar': {
      $data = $in['data'] ?? null;
      if (!is_string($data) || $data === '' || strlen($data) > MAX_BACKUP || !preg_match('/^[A-Za-z0-9_.-]+$/', $data)) fout(400, 'Ongeldige back-up (te groot of verkeerde vorm).');
      $n = q($db, 'UPDATE acc_backup SET data = ?, versie = versie + 1, bijgewerkt = ? WHERE account = ?', [$data, $nu, $acc])->rowCount();
      if ($n === 0) q($db, 'INSERT INTO acc_backup (account, data, versie, bijgewerkt) VALUES (?, ?, 1, ?)', [$acc, $data, $nu]);
      uit(200, ['ok' => true, 'versie' => (int)q($db, 'SELECT versie FROM acc_backup WHERE account = ?', [$acc])->fetchColumn()]);
    }
    case 'accUitloggen': {
      q($db, 'DELETE FROM acc_sessies WHERE token_hash = ?', [hash('sha256', $st)]);
      uit(200, ['ok' => true]);
    }
    case 'accVerwijder': {
      $db->beginTransaction();
      q($db, 'DELETE FROM acc_backup WHERE account = ?', [$acc]);
      q($db, 'DELETE FROM acc_sessies WHERE account = ?', [$acc]);
      q($db, 'DELETE FROM accounts WHERE id = ?', [$acc]);
      $db->commit();
      uit(200, ['ok' => true]);
    }
    default:
      fout(400, 'Onbekende actie.');
  }
}

if ($actie === 'register') {
  tel($db, hash('sha256', $ipHash . ':reg'), intdiv($nu, 3600), (int)($cfg['limiet_reg_per_uur'] ?? 5));
  $pub = $in['pub'] ?? null;
  if (!is_string($pub) || !preg_match('/^[A-Za-z0-9_-]{80,100}$/', $pub)) fout(400, 'Ongeldige publieke sleutel.');
  $id = bin2hex(random_bytes(16));
  $token = bin2hex(random_bytes(32));
  q($db, 'INSERT INTO users (id, pub, token_hash, created, last_seen) VALUES (?, ?, ?, ?, ?)',
    [$id, $pub, hash('sha256', $token), $nu, $nu]);
  uit(200, ['id' => $id, 'token' => $token]);
}

// Authenticatie voor alle andere acties.
$ik = $_SERVER['HTTP_X_ID'] ?? '';
$tok = $_SERVER['HTTP_X_TOKEN'] ?? '';
if (!isId($ik) || !is_string($tok) || $tok === '') fout(401, 'Niet ingelogd.');
$rij = q($db, 'SELECT token_hash, last_seen FROM users WHERE id = ?', [$ik])->fetch();
// Ook bij een onbekende id vergelijken we, zodat de tijd geen aanwijzing geeft.
if (!hash_equals($rij['token_hash'] ?? str_repeat('0', 64), hash('sha256', $tok)) || !$rij) fout(401, 'Niet ingelogd.');
// Verbannen? Dan alleen deleteAccount en mijnStatus. Een verlopen ban wordt hier meteen opgeruimd.
$ban = q($db, 'SELECT tot, reden FROM bans WHERE id = ?', [$ik])->fetch();
if ($ban && (int)$ban['tot'] > 0 && (int)$ban['tot'] <= $nu) { q($db, 'DELETE FROM bans WHERE id = ?', [$ik]); $ban = false; }
if ($actie === 'mijnStatus') {
  uit(200, $ban ? ['verbannen' => true, 'tot' => (int)$ban['tot'], 'reden' => (string)$ban['reden']] : ['verbannen' => false]);
}
if ($ban && $actie !== 'deleteAccount') uit(403, ['fout' => 'Je bent verbannen', 'verbannen' => true, 'tot' => (int)$ban['tot'], 'reden' => (string)$ban['reden']]);
// Per gebruiker: gewone verzoeken (1 per seconde sync + wat extra) en het kanaal voor gevechten (poll elke 0,25 s) apart.
$relayActie = $actie === 'send' || $actie === 'poll';
if ($relayActie) tel($db, hash('sha256', $ik . ':rel'), intdiv($nu, 60), (int)($cfg['limiet_relay_per_min'] ?? 1200));
else tel($db, hash('sha256', $ik . ':usr'), intdiv($nu, 60), (int)($cfg['limiet_user_per_min'] ?? 180));
if ($nu - (int)$rij['last_seen'] > 3600) q($db, 'UPDATE users SET last_seen = ? WHERE id = ?', [$nu, $ik]);

// Vrienden alleen met dezelfde versie (v2.3.4). Oude versies sturen geen X-Versie mee en moeten eerst updaten.
$versieCheck = ($cfg['vrienden_zelfde_versie'] ?? true) !== false;
$mijnVersie = $_SERVER['HTTP_X_VERSIE'] ?? '';
if (!is_string($mijnVersie) || !preg_match('/^[0-9]{1,4}(\.[0-9]{1,4}){0,3}$/', $mijnVersie)) $mijnVersie = '';
if ($versieCheck && $actie !== 'deleteAccount') {
  if ($mijnVersie === '') uit(426, ['fout' => 'Je Pack Opener is te oud. Update naar de nieuwste versie om vrienden te gebruiken.', 'update' => true]);
  $oudV = q($db, 'SELECT versie FROM user_versie WHERE id = ?', [$ik])->fetchColumn();
  if ($oudV !== $mijnVersie) {
    if ($oudV === false) q($db, 'INSERT INTO user_versie (id, versie) VALUES (?, ?)', [$ik, $mijnVersie]);
    else q($db, 'UPDATE user_versie SET versie = ? WHERE id = ?', [$mijnVersie, $ik]);
  }
}
function versieVan(PDO $db, string $id): string {
  $v = q($db, 'SELECT versie FROM user_versie WHERE id = ?', [$id])->fetchColumn();
  return $v === false ? '' : (string)$v;
}
// Weigert als de ander een andere versie heeft.
function zelfdeVersie(PDO $db, string $ander): void {
  global $versieCheck, $mijnVersie;
  if (!$versieCheck) return;
  $v = versieVan($db, $ander);
  if ($v !== $mijnVersie) uit(409, ['fout' => 'Je vriend heeft een andere versie van de Pack Opener (' . ($v === '' ? 'een oude' : $v) . ', jij ' . $mijnVersie . '). Jullie moeten allebei de nieuwste versie hebben.', 'andereVersie' => true, 'zijnVersie' => $v]);
}

// Zoekt de vriendschap in beide richtingen.
function vriendschap(PDO $db, string $x, string $y): ?array {
  $r = q($db, 'SELECT a, b, status FROM friendships WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', [$x, $y, $y, $x])->fetch();
  return $r ?: null;
}
function bestaat(PDO $db, string $id): bool {
  return q($db, 'SELECT 1 FROM users WHERE id = ?', [$id])->fetchColumn() !== false;
}

switch ($actie) {
  case 'request': {
    $to = $in['to'] ?? null;
    if (!isId($to)) fout(400, 'Ongeldige vriendcode.');
    if ($to === $ik) fout(400, 'Je kunt jezelf niet toevoegen.');
    if (!bestaat($db, $to)) fout(404, 'Deze vriendcode bestaat niet (meer).');
    zelfdeVersie($db, $to);
    $f = vriendschap($db, $ik, $to);
    if ($f === null) {
      q($db, 'INSERT INTO friendships (a, b, status, created) VALUES (?, ?, ?, ?)', [$ik, $to, 'pending', $nu]);
      uit(200, ['status' => 'pending']);
    }
    if ($f['status'] === 'pending' && $f['a'] === $to) { // de ander had al een verzoek gestuurd
      q($db, 'UPDATE friendships SET status = ? WHERE a = ? AND b = ?', ['accepted', $to, $ik]);
      uit(200, ['status' => 'accepted']);
    }
    uit(200, ['status' => $f['status']]);
  }
  case 'inbox': {
    $r = q($db, 'SELECT u.id AS id, u.pub AS pub FROM friendships f JOIN users u ON u.id = f.a WHERE f.b = ? AND f.status = ? ORDER BY f.created', [$ik, 'pending'])->fetchAll();
    foreach ($r as &$x) { $x['versie'] = versieVan($db, $x['id']); $x['andereVersie'] = $versieCheck && $x['versie'] !== $mijnVersie; }
    unset($x);
    uit(200, ['verzoeken' => $r]);
  }
  case 'respond': {
    $van = $in['from'] ?? null;
    if (!isId($van) || !is_bool($in['accept'] ?? null)) fout(400, 'Ongeldig verzoek.');
    if ($in['accept']) zelfdeVersie($db, $van);
    $f = q($db, 'SELECT 1 FROM friendships WHERE a = ? AND b = ? AND status = ?', [$van, $ik, 'pending'])->fetchColumn();
    if ($f === false) fout(404, 'Geen openstaand verzoek van deze vriend.');
    if ($in['accept']) q($db, 'UPDATE friendships SET status = ? WHERE a = ? AND b = ?', ['accepted', $van, $ik]);
    else q($db, 'DELETE FROM friendships WHERE a = ? AND b = ?', [$van, $ik]);
    uit(200, ['ok' => true]);
  }
  case 'friends': {
    $r = q($db, 'SELECT u.id AS id, u.pub AS pub FROM friendships f JOIN users u ON u.id = (CASE WHEN f.a = ? THEN f.b ELSE f.a END) WHERE (f.a = ? OR f.b = ?) AND f.status = ?', [$ik, $ik, $ik, 'accepted'])->fetchAll();
    foreach ($r as &$x) { $x['versie'] = versieVan($db, $x['id']); $x['andereVersie'] = $versieCheck && $x['versie'] !== $mijnVersie; }
    unset($x);
    uit(200, ['vrienden' => $r]);
  }
  case 'put': {
    $to = $in['to'] ?? null;
    $data = $in['data'] ?? null;
    if (!isId($to) || !is_string($data)) fout(400, 'Ongeldig verzoek.');
    if (strlen($data) > MAX_BLOB) fout(413, 'Gegevens te groot (max 96 KB).');
    if ($data !== '' && !preg_match('/^[A-Za-z0-9._-]+$/', $data)) fout(400, 'Ongeldig formaat.');
    zelfdeVersie($db, $to);
    $f = vriendschap($db, $ik, $to);
    if ($f === null || $f['status'] !== 'accepted') fout(403, 'Jullie zijn geen vrienden.');
    $db->beginTransaction();
    // `updated` gaat altijd omhoog (ook bij twee wijzigingen in dezelfde seconde), zodat 'puls' elke wijziging ziet.
    $vorig = (int)q($db, 'SELECT updated FROM blobs WHERE owner = ? AND recipient = ?', [$ik, $to])->fetchColumn();
    q($db, 'DELETE FROM blobs WHERE owner = ? AND recipient = ?', [$ik, $to]);
    if ($data !== '') q($db, 'INSERT INTO blobs (owner, recipient, data, updated) VALUES (?, ?, ?, ?)', [$ik, $to, $data, max($nu, $vorig + 1)]);
    $db->commit();
    uit(200, ['ok' => true]);
  }
  case 'get': {
    $r = q($db, 'SELECT owner, data, updated FROM blobs WHERE recipient = ?', [$ik])->fetchAll();
    if ($versieCheck) $r = array_values(array_filter($r, function ($x) use ($db, $mijnVersie) { return versieVan($db, $x['owner']) === $mijnVersie; }));
    foreach ($r as &$x) $x['updated'] = (int)$x['updated'];
    uit(200, ['blobs' => $r]);
  }
  case 'puls': {
    // Goedkoop: geen blobs, alleen wat er veranderd is. 'vh' verandert als vrienden of verzoeken veranderen.
    $v = q($db, 'SELECT f.a AS a, f.b AS b, f.status AS status FROM friendships f WHERE f.a = ? OR f.b = ?', [$ik, $ik])->fetchAll();
    $ids = [];
    foreach ($v as $x) $ids[] = ($x['a'] === $ik ? $x['b'] : $x['a']) . ':' . $x['status'] . ':' . ($x['a'] === $ik ? 'u' : 'i');
    sort($ids);
    $bl = q($db, 'SELECT owner, updated FROM blobs WHERE recipient = ?', [$ik])->fetchAll();
    foreach ($bl as &$x) $x['updated'] = (int)$x['updated'];
    unset($x);
    $po = q($db, 'SELECT afz, MAX(seq) AS seq FROM berichten WHERE ontv = ? AND created >= ? GROUP BY afz', [$ik, $nu - BERICHT_TTL])->fetchAll();
    $post = [];
    foreach ($po as $x) $post[] = ['van' => $x['afz'], 'seq' => (int)$x['seq']];
    uit(200, ['nu' => $nu, 'vh' => substr(hash('sha256', implode(',', $ids)), 0, 16), 'blobs' => $bl, 'post' => $post]);
  }
  case 'send': {
    // Kanaal voor gevechten: een klein, versleuteld bericht naar een vriend. De server kijkt niet in de inhoud.
    $to = $in['to'] ?? null;
    $data = $in['data'] ?? null;
    $seq = $in['seq'] ?? null;
    if (!isId($to) || !is_string($data) || !is_int($seq) || $seq < 1 || $seq > 9007199254740991) fout(400, 'Ongeldig verzoek.');
    if ($data === '' || strlen($data) > MAX_BERICHT) fout(413, 'Bericht te groot (max 2 KB).');
    if (!preg_match('/^[A-Za-z0-9._-]+$/', $data)) fout(400, 'Ongeldig formaat.');
    zelfdeVersie($db, $to);
    $f = vriendschap($db, $ik, $to);
    if ($f === null || $f['status'] !== 'accepted') fout(403, 'Jullie zijn geen vrienden.');
    q($db, 'DELETE FROM berichten WHERE afz = ? AND ontv = ? AND created < ?', [$ik, $to, $nu - BERICHT_TTL]);
    $n = (int)q($db, 'SELECT COUNT(*) FROM berichten WHERE afz = ? AND ontv = ?', [$ik, $to])->fetchColumn();
    if ($n >= MAX_WACHTRIJ) fout(429, 'Te veel berichten in de wachtrij.');
    try { q($db, 'INSERT INTO berichten (afz, ontv, seq, data, created) VALUES (?, ?, ?, ?, ?)', [$ik, $to, $seq, $data, $nu]); }
    catch (Throwable $e) { fout(409, 'Volgnummer is al gebruikt.'); }
    uit(200, ['ok' => true]);
  }
  case 'poll': {
    $van = $in['from'] ?? null;
    $na = $in['after'] ?? 0;
    if (!isId($van) || !is_int($na) || $na < 0) fout(400, 'Ongeldig verzoek.');
    zelfdeVersie($db, $van);
    $f = vriendschap($db, $ik, $van);
    if ($f === null || $f['status'] !== 'accepted') fout(403, 'Jullie zijn geen vrienden.');
    $r = q($db, 'SELECT seq, data, created FROM berichten WHERE afz = ? AND ontv = ? AND seq > ? AND created >= ? ORDER BY seq LIMIT 50', [$van, $ik, $na, $nu - BERICHT_TTL])->fetchAll();
    foreach ($r as &$x) { $x['seq'] = (int)$x['seq']; $x['leeftijd'] = $nu - (int)$x['created']; unset($x['created']); }
    unset($x);
    uit(200, ['nu' => $nu, 'berichten' => $r]);
  }
  case 'unfriend': {
    $o = $in['other'] ?? null;
    if (!isId($o)) fout(400, 'Ongeldig verzoek.');
    $db->beginTransaction();
    q($db, 'DELETE FROM friendships WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', [$ik, $o, $o, $ik]);
    q($db, 'DELETE FROM blobs WHERE (owner = ? AND recipient = ?) OR (owner = ? AND recipient = ?)', [$ik, $o, $o, $ik]);
    q($db, 'DELETE FROM berichten WHERE (afz = ? AND ontv = ?) OR (afz = ? AND ontv = ?)', [$ik, $o, $o, $ik]);
    $db->commit();
    uit(200, ['ok' => true]);
  }
  case 'deleteAccount': {
    $db->beginTransaction();
    verwijderGebruiker($db, $ik);
    $db->commit();
    uit(200, ['ok' => true]);
  }
  default:
    fout(400, 'Onbekende actie.');
}
