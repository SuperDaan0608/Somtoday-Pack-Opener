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
const IP_MAX_DAGEN = 30;  // een ip-hash wordt hoogstens zo lang onthouden
const IP_BAN_MAX = 604800; // een ip-ban duurt hoogstens 7 dagen en is nooit voorgoed
const MELD_REDENEN = ['naam', 'tekst', 'pesten', 'spam', 'anders'];
const FB_SOORTEN = ['fout', 'idee', 'anders'];
const TABELLEN = ['users', 'friendships', 'blobs', 'ratelimit', 'berichten', 'bans', 'accounts', 'acc_codes', 'acc_sessies', 'acc_backup', 'user_versie',
  'blokkades', 'meldingen', 'waarschuwingen', 'ban_email', 'ban_ip', 'acc_ip', 'acc_koppel', 'beheer_mail', 'feedback']; // v3: vanaf 'blokkades'

// Uitnodigingspagina (v3): api.php?uitnodiging=CODE. Statisch: geen database, geen cookies, geen scripts en geen tracking.
function uitnodigingPagina(string $code): void {
  // Streng: precies de vorm van een vriendcode (SPO1-id-sleutel). Alles anders geeft dezelfde pagina zonder code.
  $geldig = preg_match('/^SPO1-[0-9a-f]{32}-[A-Za-z0-9_-]{80,100}$/D', $code) === 1;
  $css = 'body{margin:0;padding:24px 16px;background:#080a14;color:#eef1f8;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}'
    . 'main{max-width:560px;margin:0 auto}h1{font-size:26px;margin:0 0 8px}ol{padding-left:22px}li{margin-bottom:14px}'
    . 'a.knop{display:inline-block;margin-top:6px;padding:10px 16px;border-radius:10px;background:#ffd24a;color:#1a1300;font-weight:700;text-decoration:none}'
    . 'input{width:100%;box-sizing:border-box;margin-top:6px;padding:10px;border-radius:10px;border:1px solid #5a6280;background:#10142a;color:#eef1f8;font:13px ui-monospace,monospace;user-select:all}'
    . 'small{color:#a5aec4}:focus-visible{outline:2px solid #ffd24a;outline-offset:2px}';
  $h = fn(string $t): string => htmlspecialchars($t, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
  $stap3 = $geldig
    ? '<li>Open <strong>Vrienden</strong> in de Pack Opener en vul deze code in:<label for="c"><small>Klik op het veld om de code te selecteren en kopieer hem.</small></label>'
      . '<input id="c" type="text" readonly value="' . $h($code) . '" aria-label="Vriendcode"></li>'
    : '<li>Open <strong>Vrienden</strong> in de Pack Opener en vul de vriendcode in die je hebt gekregen. <small>(Deze link bevat geen geldige code.)</small></li>';
  $html = '<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    . '<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><title>Uitnodiging Pack Opener</title><style>' . $css . '</style></head><body><main>'
    . '<h1>Je bent uitgenodigd voor de Somtoday Pack Opener</h1><p>Doe mee met vrienden in drie stappen.</p><ol>'
    . '<li>Download de extensie:<br><a class="knop" href="https://github.com/SuperDaan0608/Somtoday-Pack-Opener/releases/latest" rel="noopener noreferrer">Download de nieuwste versie</a></li>'
    . '<li>Installeer hem. De extensie staat niet in de winkel, dus dit doe je zelf: pak de zip uit, ga in Chrome naar <strong>chrome://extensions</strong>, zet rechtsboven <strong>Ontwikkelaarsmodus</strong> aan, klik op <strong>Uitgepakte extensie laden</strong> en kies de uitgepakte map. (Firefox: ga naar <strong>about:debugging</strong>, kies <strong>Deze Firefox</strong> en dan <strong>Tijdelijke add-on laden</strong>.)</li>'
    . $stap3 . '</ol></main></body></html>';
  header_remove('Access-Control-Allow-Origin');
  header('Content-Type: text/html; charset=utf-8');
  header('Cache-Control: no-store');
  header("Content-Security-Policy: default-src 'none'; style-src 'sha256-" . base64_encode(hash('sha256', $css, true)) . "'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  header('X-Content-Type-Options: nosniff');
  header('X-Frame-Options: DENY');
  header('Referrer-Policy: no-referrer');
  http_response_code(200);
  echo $html;
  exit;
}

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

// Ontbreekt er een tabel (bijv. migratie-v3.sql nog niet uitgevoerd)? Herken dat aan de foutmelding van SQLite of MySQL.
function tabelOntbreekt(Throwable $e): bool {
  return $e instanceof PDOException && preg_match('/no such table|doesn.t exist|Base table or view not found|42S02/i', $e->getMessage()) === 1;
}
// Onverwachte fouten: nooit details naar buiten lekken.
set_exception_handler(function (Throwable $e) {
  if (tabelOntbreekt($e)) fout(503, 'De server is nog niet bijgewerkt (migratie-v3.sql ontbreekt). Probeer het later opnieuw.');
  fout(500, 'Serverfout.');
});

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && isset($_GET['uitnodiging'])) uitnodigingPagina(is_string($_GET['uitnodiging']) ? $_GET['uitnodiging'] : '');
// Controle voor jezelf: open api.php?status=1 in de browser. Laat zien of config.php en de tabellen kloppen (geen geheimen).
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && isset($_GET['status'])) {
  $pad = getenv('SPO_CONFIG') ?: __DIR__ . '/config.php';
  if (!is_file($pad)) fout(500, 'config.php ontbreekt naast api.php.');
  $c = require $pad;
  try {
    $d = new PDO($c['db_dsn'], $c['db_user'] ?? null, $c['db_pass'] ?? null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
  } catch (Throwable $e) { fout(500, 'Database niet bereikbaar: controleer host, naam, gebruiker en wachtwoord in config.php.'); }
  foreach (TABELLEN as $t) {
    try { $d->query('SELECT 1 FROM ' . $t . ' LIMIT 1'); }
    catch (Throwable $e) { fout(500, 'Tabel ontbreekt: ' . $t . '. Voer schema.sql (of migratie-v3.sql) uit in phpMyAdmin.'); }
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
// Verstuurt een mail: 0 = gelukt, 1 = mail_van ontbreekt, 2 = mislukt. In tests ('mail_bestand') komt de mail in een bestand in plaats van in de post.
function verstuurMail(array $cfg, string $aan, string $onderwerp, string $tekst, array $testInfo): int {
  if (!empty($cfg['mail_bestand'])) {
    file_put_contents((string)$cfg['mail_bestand'], json_encode(['aan' => $aan] + $testInfo) . "\n", FILE_APPEND);
    return 0;
  }
  $van = (string)($cfg['mail_van'] ?? '');
  if ($van === '' || !filter_var($van, FILTER_VALIDATE_EMAIL)) return 1;
  if (!empty($cfg['smtp_wachtwoord'])) return smtpStuur($cfg, $van, $aan, $onderwerp, $tekst) ? 0 : 2;
  $kop = 'From: Somtoday Pack Opener <' . $van . ">\r\nContent-Type: text/plain; charset=utf-8\r\nX-Mailer: SPO";
  return mail($aan, '=?UTF-8?B?' . base64_encode($onderwerp) . '?=', $tekst, $kop, '-f' . $van) ? 0 : 2;
}
function isId($v): bool { return is_string($v) && preg_match('/^[0-9a-f]{32}$/', $v) === 1; }
function knip(string $t, int $n): string { $t = trim($t); return function_exists('mb_substr') ? mb_substr($t, 0, $n) : substr($t, 0, $n); }
// Willekeurig positief geheel getal dat veilig in JSON/JavaScript past (voor melding- en waarschuwing-id's).
function nieuwId(): int { return random_int(1, 9007199254740991); }

// IP-adres voor de hash: IPv6 telt per /64 (één thuisnetwerk heeft er miljarden), IPv4-in-IPv6 wordt gewoon IPv4.
// -- begin ip-functie (de test leest dit stuk los) --
function maskIp(string $ip): string {
  $ip = explode('%', $ip, 2)[0];
  if (strpos($ip, ':') === false) return $ip;
  $b = @inet_pton($ip);
  if ($b === false || strlen($b) !== 16) return $ip;
  if (substr($b, 0, 12) === "\0\0\0\0\0\0\0\0\0\0\xff\xff") return (string)inet_ntop(substr($b, 12));
  return bin2hex(substr($b, 0, 8)) . '/64';
}
// -- eind ip-functie --
// Mailadres gelijktrekken voor de hash: kleine letters, googlemail.com = gmail.com, bij gmail geen punten, overal niets na een '+'.
// -- begin email-functie (de test leest dit stuk los) --
function normEmail(string $e): string {
  $e = strtolower(trim($e));
  $p = strrpos($e, '@');
  if ($p === false) return $e;
  $l = substr($e, 0, $p); $d = substr($e, $p + 1);
  if ($d === 'googlemail.com') $d = 'gmail.com';
  $plus = strpos($l, '+');
  if ($plus !== false && $plus > 0) $l = substr($l, 0, $plus);
  if ($d === 'gmail.com') $l = str_replace('.', '', $l);
  return $l . '@' . $d;
}
// -- eind email-functie --

// Rate limit: alleen een hash van ip + zout wordt bewaard, nooit het ruwe adres.
function tel(PDO $db, string $sleutel, int $venster, int $max, string $tekst = 'Te veel verzoeken. Probeer het zo opnieuw.'): void {
  $n = q($db, 'UPDATE ratelimit SET aantal = aantal + 1 WHERE k = ? AND venster = ?', [$sleutel, $venster])->rowCount();
  if ($n === 0) {
    try { q($db, 'INSERT INTO ratelimit (k, venster, aantal) VALUES (?, ?, 1)', [$sleutel, $venster]); }
    catch (Throwable $e) { q($db, 'UPDATE ratelimit SET aantal = aantal + 1 WHERE k = ? AND venster = ?', [$sleutel, $venster]); }
  }
  $a = (int)q($db, 'SELECT aantal FROM ratelimit WHERE k = ? AND venster = ?', [$sleutel, $venster])->fetchColumn();
  if ($a > $max) { header('Retry-After: 60'); fout(429, $tekst); }
}
$nu = time();
$ipHash = hash('sha256', maskIp((string)($_SERVER['REMOTE_ADDR'] ?? '')) . ($cfg['zout'] ?? ''));
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
  // v3-tabellen: een server zonder migratie-v3.sql blijft gewoon werken. Meldingen blijven bewaard (de beheerder heeft ze nodig).
  foreach (['DELETE FROM blokkades WHERE van = ? OR tegen = ?', 'DELETE FROM waarschuwingen WHERE account = ?', 'DELETE FROM acc_ip WHERE account = ?', 'DELETE FROM acc_koppel WHERE user_id = ?', 'UPDATE feedback SET van = NULL WHERE van = ?'] as $sql) {
    try { q($db, $sql, substr_count($sql, '?') === 2 ? [$id, $id] : [$id]); } catch (Throwable $e) { if (!tabelOntbreekt($e)) throw $e; }
  }
}
if (random_int(1, 100) === 1) {
  // Minuut-vensters (nu rond 29 miljoen) en uur-vensters (rond 490 duizend) staan in dezelfde tabel; elk krijgt zijn eigen drempel.
  q($db, 'DELETE FROM ratelimit WHERE venster >= 10000000 AND venster < ?', [intdiv($nu, 60) - 120]);
  q($db, 'DELETE FROM berichten WHERE created < ?', [$nu - BERICHT_TTL]);
  q($db, 'DELETE FROM ratelimit WHERE venster >= 100000 AND venster < 10000000 AND venster < ?', [intdiv($nu, 3600) - 3]);
  q($db, 'DELETE FROM ratelimit WHERE venster < 100000 AND venster < ?', [intdiv($nu, 86400) - 3]); // dag-vensters (nieuwe accounts)
  q($db, 'DELETE FROM bans WHERE tot > 0 AND tot <= ?', [$nu]);
  q($db, 'DELETE FROM acc_codes WHERE verloopt < ?', [$nu]);
  q($db, 'DELETE FROM acc_sessies WHERE verloopt < ?', [$nu]);
  q($db, 'DELETE FROM accounts WHERE geverifieerd = 0 AND gemaakt < ?', [$nu - 7 * 86400]);
  // v3: ip-geheugen hoogstens 30 dagen; verlopen bans en gelezen waarschuwingen weg.
  foreach ([['DELETE FROM acc_ip WHERE laatst < ?', $nu - IP_MAX_DAGEN * 86400], ['DELETE FROM ban_ip WHERE tot <= ?', $nu], ['DELETE FROM ban_email WHERE tot > 0 AND tot <= ?', $nu],
    ['DELETE FROM waarschuwingen WHERE gezien = 1 AND ts < ?', $nu - 90 * 86400]] as $o) {
    try { q($db, $o[0], [$o[1]]); } catch (Throwable $e) { if (!tabelOntbreekt($e)) throw $e; }
  }
  $oud = q($db, 'SELECT id FROM users WHERE last_seen < ?', [$nu - 365 * 86400])->fetchAll(PDO::FETCH_COLUMN);
  foreach ($oud as $o) verwijderGebruiker($db, $o);
}

$actie = $in['a'] ?? '';
if (!is_string($actie)) fout(400, 'Ongeldige actie.');

// ---- Hulpfuncties voor v3 (blokkeren, melden, ip-geheugen, bans, mail aan de beheerder) ----
// Voert een opruim-opdracht uit en slaat hem over als de tabel (nog) niet bestaat.
function zonderTabel(PDO $db, string $sql, array $p): void {
  try { q($db, $sql, $p); } catch (Throwable $e) { if (!tabelOntbreekt($e)) throw $e; }
}
// Blokkeert 'x' de gebruiker 'y'? (alleen in die richting)
function blokkeertVan(PDO $db, string $x, string $y): bool {
  try { return q($db, 'SELECT 1 FROM blokkades WHERE van = ? AND tegen = ?', [$x, $y])->fetchColumn() !== false; }
  catch (Throwable $e) { if (tabelOntbreekt($e)) return false; throw $e; }
}
function isGeblokkeerd(PDO $db, string $x, string $y): bool { return blokkeertVan($db, $x, $y) || blokkeertVan($db, $y, $x); }
// Weigert registreren/inloggen/codes aanvragen vanaf een geblokkeerd netwerk. Een ip-ban is nooit voorgoed: tot = 0 telt hier niet mee.
function ipGeband(PDO $db, string $ipHash, int $nu): void {
  try { $r = q($db, 'SELECT tot FROM ban_ip WHERE ip_hash = ?', [$ipHash])->fetch(); }
  catch (Throwable $e) { if (tabelOntbreekt($e)) return; throw $e; }
  if ($r && (int)$r['tot'] > $nu) fout(403, 'Registreren en inloggen kan vanaf dit netwerk nu even niet. Probeer het later opnieuw.');
}
// Is dit e-mailadres (een van de hashes) geblokkeerd?
function emailGeband(PDO $db, array $hashes, int $nu): bool {
  foreach ($hashes as $h) {
    try { $r = q($db, 'SELECT tot FROM ban_email WHERE email_hash = ?', [$h])->fetch(); }
    catch (Throwable $e) { if (tabelOntbreekt($e)) return false; throw $e; }
    if ($r && ((int)$r['tot'] === 0 || (int)$r['tot'] > $nu)) return true;
  }
  return false;
}
// Onthoudt de ip-hash van een gebruiker (hoogstens 1x per dag per ip; rijen ouder dan 30 dagen worden opgeruimd).
function ipOnthoud(PDO $db, string $id, string $ipHash, int $nu, bool $nu_zeker = false): void {
  try {
    $l = q($db, 'SELECT laatst FROM acc_ip WHERE account = ? AND ip_hash = ?', [$id, $ipHash])->fetchColumn();
    if ($l === false) {
      try { q($db, 'INSERT INTO acc_ip (account, ip_hash, laatst) VALUES (?, ?, ?)', [$id, $ipHash, $nu]); }
      catch (Throwable $e) { q($db, 'UPDATE acc_ip SET laatst = ? WHERE account = ? AND ip_hash = ?', [$nu, $id, $ipHash]); }
    } elseif ($nu_zeker || $nu - (int)$l >= 86400) q($db, 'UPDATE acc_ip SET laatst = ? WHERE account = ? AND ip_hash = ?', [$nu, $id, $ipHash]);
  } catch (Throwable $e) { if (!tabelOntbreekt($e)) throw $e; }
}
// Controleert X-Id + X-Token. Geeft de rij van de gebruiker of null. Vergelijkt ook bij een onbekende id, zodat de tijd niets verraadt.
function gebruikerUitHeaders(PDO $db): ?array {
  $ik = $_SERVER['HTTP_X_ID'] ?? '';
  $tok = $_SERVER['HTTP_X_TOKEN'] ?? '';
  if (!isId($ik) || !is_string($tok) || $tok === '') return null;
  $rij = q($db, 'SELECT id, token_hash, last_seen, created FROM users WHERE id = ?', [$ik])->fetch();
  if (!hash_equals($rij['token_hash'] ?? str_repeat('0', 64), hash('sha256', $tok)) || !$rij) return null;
  return $rij;
}
// Koppelt de ingelogde gebruiker (als die headers meestuurt) aan een e-mailaccount, voor "ook e-mailadres blokkeren". Er wordt geen adres bewaard.
function koppelAccount(PDO $db, string $account, string $ipHash, int $nu): void {
  $g = gebruikerUitHeaders($db);
  if (!$g) return;
  try {
    if (q($db, 'SELECT 1 FROM acc_koppel WHERE user_id = ? AND account = ?', [$g['id'], $account])->fetchColumn() === false)
      q($db, 'INSERT INTO acc_koppel (user_id, account, laatst) VALUES (?, ?, ?)', [$g['id'], $account, $nu]);
    else q($db, 'UPDATE acc_koppel SET laatst = ? WHERE user_id = ? AND account = ?', [$nu, $g['id'], $account]);
  } catch (Throwable $e) { if (!tabelOntbreekt($e)) throw $e; }
  ipOnthoud($db, $g['id'], $ipHash, $nu, true);
}
// Mail aan de beheerder (config 'beheer_mail'): nooit inhoud, alleen dat er een melding is en welke reden-categorie. Hoogstens 1 mail per 10 minuten;
// wat in die tijd binnenkomt, gaat mee in de eerstvolgende mail (bij de volgende melding of het volgende beheerverzoek). Geen cron nodig.
function beheerMailBundel(PDO $db, array $cfg, int $nu, ?string $cat): void {
  $aan = $cfg['beheer_mail'] ?? '';
  if (!is_string($aan) || $aan === '' || !filter_var($aan, FILTER_VALIDATE_EMAIL)) return;
  try {
    if (q($db, 'SELECT 1 FROM beheer_mail WHERE id = 1')->fetchColumn() === false) {
      try { q($db, 'INSERT INTO beheer_mail (id, laatst, wachtend, redenen) VALUES (1, 0, 0, ?)', ['']); } catch (Throwable $e) { /* een ander verzoek was eerder */ }
    }
    if ($cat !== null && (in_array($cat, MELD_REDENEN, true) || in_array($cat, ['fb-fout', 'fb-idee', 'fb-anders'], true))) {
      $lijst = array_values(array_filter(explode(',', (string)q($db, 'SELECT redenen FROM beheer_mail WHERE id = 1')->fetchColumn())));
      if (!in_array($cat, $lijst, true)) $lijst[] = $cat;
      q($db, 'UPDATE beheer_mail SET wachtend = wachtend + 1, redenen = ? WHERE id = 1', [implode(',', $lijst)]);
    }
    $r = q($db, 'SELECT laatst, wachtend, redenen FROM beheer_mail WHERE id = 1')->fetch();
    $n = (int)$r['wachtend'];
    if ($n < 1 || $nu - (int)$r['laatst'] < 600) return;
    // Claimen: alleen het verzoek dat de tijd als eerste bijwerkt, verstuurt de mail.
    if (q($db, 'UPDATE beheer_mail SET laatst = ?, wachtend = wachtend - ?, redenen = ? WHERE id = 1 AND laatst = ?', [$nu, $n, '', (int)$r['laatst']])->rowCount() !== 1) return;
    $alle = explode(',', (string)$r['redenen']);
    $redenen = array_values(array_filter($alle, fn($x) => in_array($x, MELD_REDENEN, true)));
    $soorten = array_values(array_map(fn($x) => substr($x, 3), array_filter($alle, fn($x) => in_array($x, ['fb-fout', 'fb-idee', 'fb-anders'], true))));
    // Alleen aantallen en categorieën, nooit de tekst van een melding of van feedback.
    if (!$soorten) { $kop = $n === 1 ? 'Er is een nieuwe melding' : $n . ' nieuwe meldingen'; $tekst = $kop . ".\n\nReden: " . ($redenen ? implode(', ', $redenen) : 'onbekend') . "\n\nOpen je beheerpagina.\n"; }
    elseif (!$redenen) { $kop = $n === 1 ? 'Er is nieuwe feedback' : 'Er is nieuwe feedback (' . $n . 'x)'; $tekst = $kop . ".\n\nSoort: " . implode(', ', $soorten) . "\n\nOpen je beheerpagina.\n"; }
    else { $kop = $n . ' nieuwe berichten (meldingen en feedback)'; $tekst = $kop . ".\n\nReden: " . implode(', ', $redenen) . "\nFeedback: " . implode(', ', $soorten) . "\n\nOpen je beheerpagina.\n"; }
    if (verstuurMail($cfg, $aan, 'Pack Opener: ' . $kop, $tekst, ['soort' => 'beheer', 'tekst' => $tekst]) !== 0)
      q($db, 'UPDATE beheer_mail SET wachtend = wachtend + ?, redenen = ? WHERE id = 1', [$n, (string)$r['redenen']]); // later opnieuw (over 10 minuten)
  } catch (Throwable $e) { /* mail is bijzaak: een fout hier mag een melding of beheerverzoek nooit laten mislukken */ }
}

// ---- Beheer (alleen voor de eigenaar) ----
// Aan als config.php een lange 'beheer_sleutel' heeft; anders bestaan deze acties niet (404).
// De beheerder ziet alleen id's, tijden en aantallen/groottes: de inhoud is versleuteld en blijft onleesbaar.
// Uitzondering: bij een melding ziet de beheerder de uitleg en het bewijs die de melder zelf meestuurde (bewijs pas na apart ophalen).
if (strncmp($actie, 'beheer', 6) === 0) {
  $bs = $cfg['beheer_sleutel'] ?? '';
  if (!is_string($bs) || strlen($bs) < 16) fout(404, 'Onbekende actie.');
  // Eigen, strenge limiet per ip-adres (ook voor foute sleutels), tegen raden.
  tel($db, hash('sha256', $ipHash . ':beh'), intdiv($nu, 60), (int)($cfg['limiet_beheer_per_min'] ?? 30));
  $gegeven = $_SERVER['HTTP_X_BEHEER'] ?? ($in['beheer'] ?? '');
  if (!is_string($gegeven) || $gegeven === '' || !hash_equals($bs, $gegeven)) fout(403, 'Geen toegang.');
  unset($in['beheer']);
  beheerMailBundel($db, $cfg, $nu, null); // opgespaarde meldingen alsnog mailen als de 10 minuten voorbij zijn
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
      $ontbreekt = [];
      foreach (TABELLEN as $t) { try { q($db, 'SELECT 1 FROM ' . $t . ' LIMIT 1'); } catch (Throwable $e) { $ontbreekt[] = $t; } }
      $nieuweMeldingen = 0;
      if (!in_array('meldingen', $ontbreekt, true)) $nieuweMeldingen = $n('SELECT COUNT(*) FROM meldingen WHERE status = ?', ['nieuw']);
      $nieuweFeedback = 0;
      if (!in_array('feedback', $ontbreekt, true)) $nieuweFeedback = $n('SELECT COUNT(*) FROM feedback WHERE status = ?', ['nieuw']);
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
        'verbannen' => $n('SELECT COUNT(*) FROM bans WHERE tot = 0 OR tot > ?', [$nu]),
        'nieuweMeldingen' => $nieuweMeldingen,
        'nieuweFeedback' => $nieuweFeedback,
        'ontbrekendeTabellen' => $ontbreekt]);
    }
    case 'beheerMeldingen': {
      $rijen = q($db, 'SELECT id, ts, van, tegen, reden, uitleg, bewijs, status, uitkomst FROM meldingen ORDER BY ts DESC, id DESC LIMIT 300')->fetchAll();
      $tegenAantal = []; $waarsch = []; $bn = []; $bnE = []; $bnI = [];
      foreach (q($db, 'SELECT tegen, COUNT(*) AS n FROM meldingen GROUP BY tegen')->fetchAll() as $x) $tegenAantal[$x['tegen']] = (int)$x['n'];
      foreach (q($db, 'SELECT account, COUNT(*) AS n FROM waarschuwingen GROUP BY account')->fetchAll() as $x) $waarsch[$x['account']] = (int)$x['n'];
      foreach (q($db, 'SELECT id, tot, reden FROM bans WHERE tot = 0 OR tot > ?', [$nu])->fetchAll() as $x) $bn[$x['id']] = ['tot' => (int)$x['tot'], 'reden' => $x['reden']];
      foreach (q($db, 'SELECT bron FROM ban_email WHERE tot = 0 OR tot > ?', [$nu])->fetchAll() as $x) $bnE[$x['bron']] = true;
      foreach (q($db, 'SELECT bron FROM ban_ip WHERE tot > ?', [$nu])->fetchAll() as $x) $bnI[$x['bron']] = true;
      $ipCache = [];
      $ipVan = function (string $id) use ($db, $nu, &$ipCache): array {
        if (isset($ipCache[$id])) return $ipCache[$id];
        $h = q($db, 'SELECT ip_hash FROM acc_ip WHERE account = ? AND laatst >= ? ORDER BY laatst DESC LIMIT 1', [$id, $nu - IP_MAX_DAGEN * 86400])->fetchColumn();
        $n = $h === false ? 0 : (int)q($db, 'SELECT COUNT(DISTINCT account) FROM acc_ip WHERE ip_hash = ? AND laatst >= ?', [$h, $nu - IP_MAX_DAGEN * 86400])->fetchColumn();
        return $ipCache[$id] = [$h !== false, $n];
      };
      $lijst = [];
      foreach ($rijen as $x) {
        $t = $x['tegen']; $ip = $ipVan($t);
        $b = $bn[$t] ?? null;
        if ($b) { $b['ookEmail'] = isset($bnE[$t]); $b['ookIp'] = isset($bnI[$t]); }
        $lijst[] = ['id' => (int)$x['id'], 'ts' => (int)$x['ts'], 'van' => $x['van'], 'tegen' => $t, 'reden' => $x['reden'], 'uitleg' => $x['uitleg'],
          'heeftBewijs' => (string)$x['bewijs'] !== '', 'aantalTegen' => $tegenAantal[$t] ?? 0, 'waarschuwingen' => $waarsch[$t] ?? 0,
          'ipBekend' => $ip[0], 'ipAccounts' => $ip[1], 'banStatus' => $b, 'status' => $x['status'], 'uitkomst' => (string)$x['uitkomst']];
      }
      uit(200, ['nu' => $nu, 'meldingen' => $lijst]);
    }
    case 'beheerFeedback': {
      $alleenNieuw = ($in['alleenNieuw'] ?? false) === true;
      $rijen = q($db, 'SELECT id, ts, van, ip_hash, soort, tekst, info, status FROM feedback' . ($alleenNieuw ? ' WHERE status = ?' : '') . ' ORDER BY (CASE WHEN status = ? THEN 0 ELSE 1 END), ts DESC, id DESC LIMIT 300',
        $alleenNieuw ? ['nieuw', 'nieuw'] : ['nieuw'])->fetchAll();
      $perVan = []; $perIp = [];
      foreach (q($db, 'SELECT van, COUNT(*) AS n FROM feedback WHERE van IS NOT NULL GROUP BY van')->fetchAll() as $x) $perVan[$x['van']] = (int)$x['n'];
      foreach (q($db, 'SELECT ip_hash, COUNT(*) AS n FROM feedback WHERE van IS NULL GROUP BY ip_hash')->fetchAll() as $x) $perIp[$x['ip_hash']] = (int)$x['n'];
      $lijst = [];
      foreach ($rijen as $x) {
        $lijst[] = ['id' => (int)$x['id'], 'ts' => (int)$x['ts'], 'van' => $x['van'], 'soort' => $x['soort'], 'tekst' => (string)$x['tekst'], 'info' => (string)$x['info'],
          'status' => $x['status'], 'aantalVanZelfde' => $x['van'] !== null ? ($perVan[$x['van']] ?? 1) : ($perIp[$x['ip_hash']] ?? 1)];
      }
      uit(200, ['nu' => $nu, 'feedback' => $lijst]);
    }
    case 'beheerFeedbackKlaar': {
      if (!is_int($bid) || $bid < 1) fout(400, 'Ongeldige id.');
      $n = q($db, 'UPDATE feedback SET status = ? WHERE id = ?', ['klaar', $bid])->rowCount();
      if ($n === 0 && q($db, 'SELECT 1 FROM feedback WHERE id = ?', [$bid])->fetchColumn() === false) fout(404, 'Deze feedback bestaat niet (meer).');
      uit(200, ['ok' => true]);
    }
    case 'beheerFeedbackWis': {
      if (!is_int($bid) || $bid < 1) fout(400, 'Ongeldige id.');
      if (q($db, 'DELETE FROM feedback WHERE id = ?', [$bid])->rowCount() === 0) fout(404, 'Deze feedback bestaat niet (meer).');
      uit(200, ['ok' => true]);
    }
    case 'beheerBewijs': {
      if (!is_int($bid) || $bid < 1) fout(400, 'Ongeldige id.');
      $b = q($db, 'SELECT bewijs FROM meldingen WHERE id = ?', [$bid])->fetchColumn();
      if ($b === false) fout(404, 'Deze melding bestaat niet (meer).');
      uit(200, ['bewijs' => (string)$b]);
    }
    case 'beheerMeldingKlaar': {
      if (!is_int($bid) || $bid < 1) fout(400, 'Ongeldige id.');
      $uitkomst = $in['uitkomst'] ?? '';
      if (!is_string($uitkomst)) fout(400, 'Ongeldige uitkomst.');
      $n = q($db, 'UPDATE meldingen SET status = ?, uitkomst = ? WHERE id = ?', ['klaar', knip($uitkomst, 200), $bid])->rowCount();
      if ($n === 0 && q($db, 'SELECT 1 FROM meldingen WHERE id = ?', [$bid])->fetchColumn() === false) fout(404, 'Deze melding bestaat niet (meer).');
      uit(200, ['ok' => true]);
    }
    case 'beheerOnban': { // werkt ook als het account er niet meer is: zo blijft een e-mailban altijd op te heffen
      if (!isId($bid)) fout(400, 'Ongeldige id.');
      $db->beginTransaction();
      q($db, 'DELETE FROM bans WHERE id = ?', [$bid]);
      zonderTabel($db, 'DELETE FROM ban_email WHERE bron = ?', [$bid]);
      zonderTabel($db, 'DELETE FROM ban_ip WHERE bron = ?', [$bid]);
      $db->commit();
      uit(200, ['ok' => true]);
    }
  }
  // Acties met een doelgebruiker.
  if (!isId($bid)) fout(400, 'Ongeldige id.');
  if (!bestaat($db, $bid)) fout(404, 'Deze gebruiker bestaat niet (meer).');
  switch ($actie) {
    case 'beheerBan': {
      $tot = $in['tot'] ?? 0;
      $reden = $in['reden'] ?? '';
      $ookEmail = $in['ook_email'] ?? false;
      $ookIp = $in['ook_ip'] ?? false;
      if (!is_int($tot) || $tot < 0 || ($tot > 0 && $tot <= $nu) || $tot > 4102444800) fout(400, 'Ongeldige einddatum.');
      if (!is_string($reden)) fout(400, 'Ongeldige reden.');
      if (!is_bool($ookEmail) || !is_bool($ookIp)) fout(400, 'Ongeldige keuze voor e-mailadres of ip.');
      $reden = knip($reden, 200);
      $db->beginTransaction();
      q($db, 'DELETE FROM bans WHERE id = ?', [$bid]);
      q($db, 'INSERT INTO bans (id, tot, reden, gemaakt) VALUES (?, ?, ?, ?)', [$bid, $tot, $reden, $nu]);
      $emails = 0; $ipTot = 0;
      try {
        // Een nieuwe ban vervangt de uitgebreide bans van eerder.
        zonderTabel($db, 'DELETE FROM ban_email WHERE bron = ?', [$bid]);
        zonderTabel($db, 'DELETE FROM ban_ip WHERE bron = ?', [$bid]);
        if ($ookEmail) {
          $acc = q($db, 'SELECT a.id AS id, a.email_hash AS h FROM acc_koppel k JOIN accounts a ON a.id = k.account WHERE k.user_id = ? ORDER BY k.laatst DESC LIMIT 5', [$bid])->fetchAll();
          foreach ($acc as $a) {
            q($db, 'DELETE FROM ban_email WHERE email_hash = ?', [$a['h']]);
            q($db, 'INSERT INTO ban_email (email_hash, bron, tot, gemaakt) VALUES (?, ?, ?, ?)', [$a['h'], $bid, $tot, $nu]);
            q($db, 'DELETE FROM acc_sessies WHERE account = ?', [$a['id']]);
            $emails++;
          }
        }
        if ($ookIp) {
          $h = q($db, 'SELECT ip_hash FROM acc_ip WHERE account = ? AND laatst >= ? ORDER BY laatst DESC LIMIT 1', [$bid, $nu - IP_MAX_DAGEN * 86400])->fetchColumn();
          if ($h !== false) {
            // Altijd hoogstens 7 dagen en nooit voorgoed, wat de beheerpagina (of iemand anders) ook vraagt.
            $ipTot = ($tot === 0 || $tot > $nu + IP_BAN_MAX) ? $nu + IP_BAN_MAX : $tot;
            q($db, 'DELETE FROM ban_ip WHERE ip_hash = ?', [$h]);
            q($db, 'INSERT INTO ban_ip (ip_hash, bron, tot, gemaakt) VALUES (?, ?, ?, ?)', [$h, $bid, $ipTot, $nu]);
          }
        }
      } catch (Throwable $e) { $db->rollBack(); throw $e; }
      $db->commit();
      uit(200, ['ok' => true, 'tot' => $tot, 'reden' => $reden, 'emailGeblokkeerd' => $emails, 'ipGeblokkeerd' => $ipTot > 0, 'ipTot' => $ipTot]);
    }
    case 'beheerWaarschuw': {
      $reden = $in['reden'] ?? '';
      if (!is_string($reden) || trim($reden) === '') fout(400, 'Geef een reden voor de waarschuwing.');
      q($db, 'INSERT INTO waarschuwingen (id, account, reden, ts, gezien) VALUES (?, ?, ?, ?, 0)', [nieuwId(), $bid, knip($reden, 200), $nu]);
      uit(200, ['ok' => true]);
    }
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
  // Nieuwe hash: e-mailadres eerst gelijkgetrokken (Gmail-varianten zijn één mailbox). Oude hash: zoals vóór v3, voor bestaande accounts.
  $emailHash = function ($e) use ($cfg): string { return hash('sha256', 'email:' . normEmail((string)$e) . ($cfg['zout'] ?? '')); };
  $emailHashOud = function ($e) use ($cfg): string { return hash('sha256', 'email:' . strtolower(trim((string)$e)) . ($cfg['zout'] ?? '')); };
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
  // Alle accounts die bij dit adres horen: eerst op de nieuwe hash, dan op de oude. Meestal 0 of 1; 2 als twee oude accounts nu dezelfde mailbox blijken.
  $kandidaten = function (string $email) use ($db, $emailHash, $emailHashOud): array {
    $uit = [];
    foreach (array_unique([$emailHash($email), $emailHashOud($email)]) as $h) {
      $r = q($db, 'SELECT id, email_hash, ww_hash, geverifieerd FROM accounts WHERE email_hash = ?', [$h])->fetch();
      if ($r) $uit[$r['id']] = $r;
    }
    return array_values($uit);
  };
  // Zet een account met een oude hash over op de nieuwe, behalve als die al bij een ander account hoort (dan blijft het op de oude: niemand raakt buitengesloten).
  $migreer = function (array $acc, string $email) use ($db, $emailHash): void {
    $nieuw = $emailHash($email);
    if ($acc['email_hash'] === $nieuw) return;
    try {
      if (q($db, 'SELECT 1 FROM accounts WHERE email_hash = ?', [$nieuw])->fetchColumn() !== false) return;
      q($db, 'UPDATE accounts SET email_hash = ? WHERE id = ? AND email_hash = ?', [$nieuw, $acc['id'], $acc['email_hash']]);
    } catch (Throwable $e) { /* UNIQUE-conflict: laten staan */ }
  };
  // Geblokkeerd netwerk of e-mailadres? (Alleen voor registreren, inloggen en codes; een al ingelogd ander account merkt hier niets van.)
  $poort = function (string $email, bool $stil = false) use ($db, $nu, $ipHash, $emailHash, $emailHashOud): bool {
    ipGeband($db, $ipHash, $nu);
    if (emailGeband($db, array_unique([$emailHash($email), $emailHashOud($email)]), $nu)) {
      if ($stil) return true;
      fout(403, 'Met dit e-mailadres kun je de Pack Opener niet gebruiken.');
    }
    return false;
  };
  // Stuurt een code van 6 cijfers. $sleutel is de hash waaronder het account staat (zo hoort de code bij precies dat account).
  $stuurCode = function (string $email, string $soort, string $sleutel) use ($db, $cfg, $nu): void {
    $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    q($db, 'DELETE FROM acc_codes WHERE email_hash = ? AND soort = ?', [$sleutel, $soort]);
    q($db, 'INSERT INTO acc_codes (email_hash, soort, code_hash, verloopt, pogingen) VALUES (?, ?, ?, ?, 0)',
      [$sleutel, $soort, hash('sha256', $code . ':' . $sleutel), $nu + 15 * 60]);
    $onderwerp = $soort === 'reset' ? 'Je code om je wachtwoord te wijzigen' : 'Je code voor Somtoday Pack Opener';
    $tekst = "Hoi!\n\nJe code is: $code\n\nVul deze code in de Pack Opener in. De code werkt 15 minuten.\n"
      . ($soort === 'reset' ? "Heb jij niet gevraagd om je wachtwoord te wijzigen? Dan kun je deze mail negeren.\n" : "Heb jij geen account gemaakt? Dan kun je deze mail negeren.\n")
      . "\nSomtoday Pack Opener";
    $res = verstuurMail($cfg, $email, $onderwerp, $tekst, ['soort' => $soort, 'code' => $code]);
    if ($res === 1) fout(500, 'De server kan nog geen mail sturen (mail_van ontbreekt in config.php).');
    if ($res === 2) fout(500, 'De mail kon niet worden verstuurd. Probeer het later opnieuw.');
  };
  // Controleert een code; na 5 foute pogingen moet je een nieuwe vragen.
  $controleerCode = function (string $soort, string $sleutel) use ($db, $in, $nu): void {
    $code = $in['code'] ?? '';
    if (!is_string($code) || !preg_match('/^[0-9]{6}$/', trim($code))) fout(400, 'Vul de code van 6 cijfers in.');
    $r = q($db, 'SELECT code_hash, verloopt, pogingen FROM acc_codes WHERE email_hash = ? AND soort = ?', [$sleutel, $soort])->fetch();
    if (!$r || (int)$r['verloopt'] < $nu) fout(400, 'Deze code is verlopen. Vraag een nieuwe code aan.');
    if ((int)$r['pogingen'] >= 5) fout(429, 'Te vaak een verkeerde code. Vraag een nieuwe code aan.');
    if (!hash_equals((string)$r['code_hash'], hash('sha256', trim($code) . ':' . $sleutel))) {
      q($db, 'UPDATE acc_codes SET pogingen = pogingen + 1 WHERE email_hash = ? AND soort = ?', [$sleutel, $soort]);
      fout(400, 'Deze code klopt niet.');
    }
    q($db, 'DELETE FROM acc_codes WHERE email_hash = ? AND soort = ?', [$sleutel, $soort]);
  };
  // Welk account hoort bij de code die is gestuurd? Het eerste kandidaat-account met een openstaande code (anders het eerste).
  $kiesMetCode = function (array $kand, string $soort) use ($db): array {
    foreach ($kand as $c) if (q($db, 'SELECT 1 FROM acc_codes WHERE email_hash = ? AND soort = ?', [$c['email_hash'], $soort])->fetchColumn() !== false) return $c;
    return $kand[0];
  };
  $nieuweSessie = function (string $acc) use ($db, $nu, $ipHash): string {
    $t = bin2hex(random_bytes(32));
    q($db, 'INSERT INTO acc_sessies (token_hash, account, verloopt) VALUES (?, ?, ?)', [hash('sha256', $t), $acc, $nu + 365 * 86400]);
    q($db, 'UPDATE accounts SET laatst = ? WHERE id = ?', [$nu, $acc]);
    koppelAccount($db, $acc, $ipHash, $nu);
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
      $poort($email);
      $limietMail($email);
      $kand = $kandidaten($email);
      foreach ($kand as $c) if ((int)$c['geverifieerd'] === 1) fout(409, 'Er bestaat al een account met dit e-mailadres. Log in.');
      $hash = password_hash($ww, PASSWORD_DEFAULT);
      if ($kand) { q($db, 'UPDATE accounts SET ww_hash = ? WHERE id = ?', [$hash, $kand[0]['id']]); $sleutel = $kand[0]['email_hash']; }
      else { $sleutel = $emailHash($email); q($db, 'INSERT INTO accounts (id, email_hash, ww_hash, geverifieerd, gemaakt, laatst) VALUES (?, ?, ?, 0, ?, ?)', [bin2hex(random_bytes(16)), $sleutel, $hash, $nu, $nu]); }
      $stuurCode($email, 'verifieer', $sleutel);
      $g = gebruikerUitHeaders($db);
      if ($g) ipOnthoud($db, $g['id'], $ipHash, $nu, true);
      uit(200, ['ok' => true]);
    }
    case 'accVerifieer': {
      $email = $leesEmail();
      $poort($email);
      $limietLogin($email);
      $kand = $kandidaten($email);
      if (!$kand) fout(404, 'Er is geen account met dit e-mailadres.');
      $r = $kiesMetCode($kand, 'verifieer');
      $controleerCode('verifieer', $r['email_hash']);
      q($db, 'UPDATE accounts SET geverifieerd = 1 WHERE id = ?', [$r['id']]);
      $migreer($r, $email);
      uit(200, ['sessie' => $nieuweSessie($r['id']), 'account' => $r['id'], 'nieuw' => true]);
    }
    case 'accCodeOpnieuw': {
      $email = $leesEmail();
      $limietMail($email);
      if (!$poort($email, true)) {
        foreach ($kandidaten($email) as $c) if ((int)$c['geverifieerd'] === 0) { $stuurCode($email, 'verifieer', $c['email_hash']); break; }
      }
      uit(200, ['ok' => true]); // altijd ok: zo verraad je niet of een adres een account heeft
    }
    case 'accLogin': {
      $email = $leesEmail();
      $ww = $in['ww'] ?? '';
      if (!is_string($ww) || $ww === '' || strlen($ww) > 200) fout(400, 'Vul je wachtwoord in.');
      $poort($email);
      $limietLogin($email);
      $kand = $kandidaten($email);
      // Het wachtwoord moet bij één van de kandidaten passen (meestal is er maar één).
      // Ook zonder account een hash controleren, zodat de tijd niets verraadt.
      $r = null;
      foreach ($kand as $c) if (password_verify($ww, (string)$c['ww_hash'])) { $r = $c; break; }
      if (!$kand) password_verify($ww, '$2y$10$abcdefghijklmnopqrstuuJ0bJHn7ZLqvSMxKjXv5lQ4p1JhPpE1i');
      if (!$r) fout(401, 'E-mailadres of wachtwoord klopt niet.');
      $migreer($r, $email);
      if ((int)$r['geverifieerd'] !== 1) {
        $limietMail($email);
        $stuurCode($email, 'verifieer', (string)q($db, 'SELECT email_hash FROM accounts WHERE id = ?', [$r['id']])->fetchColumn()); // na het migreren kan de hash nieuw zijn
        uit(403, ['fout' => 'Je e-mailadres is nog niet bevestigd. We hebben een nieuwe code gestuurd.', 'nietBevestigd' => true]);
      }
      uit(200, ['sessie' => $nieuweSessie($r['id']), 'account' => $r['id']]);
    }
    case 'accVergeten': {
      $email = $leesEmail();
      $limietMail($email);
      if (!$poort($email, true)) {
        foreach ($kandidaten($email) as $c) if ((int)$c['geverifieerd'] === 1) { $stuurCode($email, 'reset', $c['email_hash']); break; }
      }
      uit(200, ['ok' => true]);
    }
    case 'accReset': {
      $email = $leesEmail();
      $ww = $leesWw();
      $poort($email);
      $limietLogin($email);
      $kand = array_values(array_filter($kandidaten($email), fn($c) => (int)$c['geverifieerd'] === 1));
      if (!$kand) fout(404, 'Er is geen account met dit e-mailadres.');
      $r = $kiesMetCode($kand, 'reset');
      $controleerCode('reset', $r['email_hash']);
      // Nieuw wachtwoord = nieuwe sleutel: de oude back-up is daarmee niet meer te lezen en gaat weg. De browser zet hem opnieuw neer.
      $db->beginTransaction();
      q($db, 'UPDATE accounts SET ww_hash = ? WHERE id = ?', [password_hash($ww, PASSWORD_DEFAULT), $r['id']]);
      q($db, 'DELETE FROM acc_sessies WHERE account = ?', [$r['id']]);
      q($db, 'DELETE FROM acc_backup WHERE account = ?', [$r['id']]);
      $db->commit();
      $migreer($r, $email);
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
      koppelAccount($db, $acc, $ipHash, $nu);
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
      zonderTabel($db, 'DELETE FROM acc_koppel WHERE account = ?', [$acc]);
      $db->commit();
      uit(200, ['ok' => true]);
    }
    default:
      fout(400, 'Onbekende actie.');
  }
}

if ($actie === 'register') {
  ipGeband($db, $ipHash, $nu);
  tel($db, hash('sha256', $ipHash . ':reg'), intdiv($nu, 3600), (int)($cfg['limiet_reg_per_uur'] ?? 5));
  $pub = $in['pub'] ?? null;
  if (!is_string($pub) || !preg_match('/^[A-Za-z0-9_-]{80,100}$/', $pub)) fout(400, 'Ongeldige publieke sleutel.');
  $id = bin2hex(random_bytes(16));
  $token = bin2hex(random_bytes(32));
  q($db, 'INSERT INTO users (id, pub, token_hash, created, last_seen) VALUES (?, ?, ?, ?, ?)',
    [$id, $pub, hash('sha256', $token), $nu, $nu]);
  ipOnthoud($db, $id, $ipHash, $nu, true);
  uit(200, ['id' => $id, 'token' => $token]);
}

// ---- Feedback (v3): een gebruiker stuurt een fout, idee of opmerking. Het vrienden-account is de afzender als het er is; zonder account telt alleen het netwerk. ----
// Verbannen accounts mogen niet; een geblokkeerd netwerk (ban_ip) wel (onschuldigen op school). De tekst is gewone tekst die de afzender zelf kiest te sturen.
if ($actie === 'feedback') {
  $soort = $in['soort'] ?? null;
  $tekst = $in['tekst'] ?? null;
  $info = $in['info'] ?? '';
  if (!is_string($soort) || !in_array($soort, FB_SOORTEN, true) || !is_string($tekst) || !(is_string($info) || $info === null)) fout(400, 'Ongeldige feedback.');
  // Besturingstekens eruit (alleen een nieuwe regel blijft in de tekst), ook de tekens die tekst omdraaien; dan afkappen.
  $schoon = function (string $t, bool $regels): string {
    $t = (string)preg_replace('/\r\n?/u', "\n", $t);
    $t = (string)preg_replace($regels ? '/[^\P{Cc}\n]|[\x{202A}-\x{202E}\x{2066}-\x{2069}]/u' : '/\p{Cc}|[\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', $regels ? '' : ' ', $t);
    return $t;
  };
  $tekst = knip($schoon($tekst, true), 500);
  $info = knip($schoon((string)$info, false), 300);
  if ($tekst === '') fout(400, 'Schrijf eerst je feedback.');
  $g = gebruikerUitHeaders($db);
  $van = $g ? $g['id'] : null;
  if ($van !== null) {
    $ban = q($db, 'SELECT tot, reden FROM bans WHERE id = ?', [$van])->fetch();
    if ($ban && ((int)$ban['tot'] === 0 || (int)$ban['tot'] > $nu)) uit(403, ['fout' => 'Je bent verbannen', 'verbannen' => true, 'tot' => (int)$ban['tot'], 'reden' => (string)$ban['reden']]);
    tel($db, hash('sha256', $van . ':fb'), intdiv($nu, 86400), (int)($cfg['limiet_feedback_per_dag'] ?? 3), 'Je hebt vandaag al 3 keer feedback gestuurd. Probeer het morgen opnieuw.');
  }
  tel($db, hash('sha256', $ipHash . ':fb'), intdiv($nu, 86400), (int)($cfg['limiet_feedback_ip_per_dag'] ?? 20), 'Vanaf dit netwerk is er vandaag al veel feedback gestuurd. Probeer het morgen opnieuw.');
  for ($poging = 0; ; $poging++) {
    try { q($db, 'INSERT INTO feedback (id, ts, van, ip_hash, soort, tekst, info, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [nieuwId(), $nu, $van, $ipHash, $soort, $tekst, $info, 'nieuw']); break; }
    catch (Throwable $e) { if ($poging >= 2 || tabelOntbreekt($e)) throw $e; }
  }
  // Antwoord eerst afleveren; de mail aan de beheerder (zonder de tekst) gaat daarna.
  http_response_code(200);
  echo json_encode(['ok' => true]);
  if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
  beheerMailBundel($db, $cfg, $nu, 'fb-' . $soort);
  exit;
}

// Authenticatie voor alle andere acties.
$rij = gebruikerUitHeaders($db); // vergelijkt ook bij een onbekende id, zodat de tijd geen aanwijzing geeft
if (!$rij) fout(401, 'Niet ingelogd.');
$ik = $rij['id'];
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
ipOnthoud($db, $ik, $ipHash, $nu); // hoogstens 1x per dag per ip; max. 30 dagen bewaard

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
    // Nieuwe accounts (eerste 24 uur): hoogstens 3 vriendverzoeken per dag. De dag-teller staat in dezelfde tabel als de andere limieten.
    if ($nu - (int)$rij['created'] < 86400)
      tel($db, hash('sha256', $ik . ':nieuwreq'), intdiv($nu, 86400), (int)($cfg['limiet_nieuw_verzoek_per_dag'] ?? 3), 'Je account is nieuw: de eerste dag kun je hoogstens 3 vriendverzoeken sturen. Probeer het morgen opnieuw.');
    // Geblokkeerd door de ander? Dan lijkt alles gelukt, maar er wordt niets opgeslagen (de geblokkeerde merkt niets).
    if (blokkeertVan($db, $to, $ik)) uit(200, ['ok' => true, 'status' => 'pending']);
    if (blokkeertVan($db, $ik, $to)) fout(409, 'Je hebt deze persoon geblokkeerd. Deblokkeer hem of haar eerst.');
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
    if ($f === false || ($in['accept'] && isGeblokkeerd($db, $ik, $van))) fout(404, 'Geen openstaand verzoek van deze vriend.');
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
    if ($f === null || $f['status'] !== 'accepted' || isGeblokkeerd($db, $ik, $to)) fout(403, 'Jullie zijn geen vrienden.');
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
    $w = 0; // aantal ongelezen waarschuwingen van de beheerder
    try { $w = (int)q($db, 'SELECT COUNT(*) FROM waarschuwingen WHERE account = ? AND gezien = 0', [$ik])->fetchColumn(); }
    catch (Throwable $e) { if (!tabelOntbreekt($e)) throw $e; }
    uit(200, ['nu' => $nu, 'vh' => substr(hash('sha256', implode(',', $ids)), 0, 16), 'blobs' => $bl, 'post' => $post, 'w' => $w]);
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
    if ($f === null || $f['status'] !== 'accepted' || isGeblokkeerd($db, $ik, $to)) fout(403, 'Jullie zijn geen vrienden.');
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
    if ($f === null || $f['status'] !== 'accepted' || isGeblokkeerd($db, $ik, $van)) fout(403, 'Jullie zijn geen vrienden.');
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
  case 'blokkeer': {
    $id = $in['id'] ?? null;
    if (!isId($id)) fout(400, 'Ongeldig verzoek.');
    if ($id === $ik) fout(400, 'Je kunt jezelf niet blokkeren.');
    if (blokkeertVan($db, $ik, $id)) uit(200, ['ok' => true]);
    if ((int)q($db, 'SELECT COUNT(*) FROM blokkades WHERE van = ?', [$ik])->fetchColumn() >= 500) fout(429, 'Je hebt al heel veel mensen geblokkeerd.');
    $db->beginTransaction();
    q($db, 'DELETE FROM friendships WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', [$ik, $id, $id, $ik]);
    q($db, 'DELETE FROM blobs WHERE (owner = ? AND recipient = ?) OR (owner = ? AND recipient = ?)', [$ik, $id, $id, $ik]);
    q($db, 'DELETE FROM berichten WHERE (afz = ? AND ontv = ?) OR (afz = ? AND ontv = ?)', [$ik, $id, $id, $ik]);
    q($db, 'INSERT INTO blokkades (van, tegen, ts) VALUES (?, ?, ?)', [$ik, $id, $nu]);
    $db->commit();
    uit(200, ['ok' => true]);
  }
  case 'deblokkeer': {
    $id = $in['id'] ?? null;
    if (!isId($id)) fout(400, 'Ongeldig verzoek.');
    q($db, 'DELETE FROM blokkades WHERE van = ? AND tegen = ?', [$ik, $id]);
    uit(200, ['ok' => true]);
  }
  case 'blokkades': {
    uit(200, ['ids' => q($db, 'SELECT tegen FROM blokkades WHERE van = ? ORDER BY ts', [$ik])->fetchAll(PDO::FETCH_COLUMN)]);
  }
  case 'meld': {
    $tegen = $in['tegen'] ?? null;
    $reden = $in['reden'] ?? null;
    $uitleg = $in['uitleg'] ?? '';
    $bewijs = $in['bewijs'] ?? '';
    if (!isId($tegen) || !is_string($reden) || !in_array($reden, MELD_REDENEN, true) || !is_string($uitleg) || !(is_string($bewijs) || $bewijs === null)) fout(400, 'Ongeldige melding.');
    if ($tegen === $ik) fout(400, 'Je kunt jezelf niet melden.');
    if (!bestaat($db, $tegen)) fout(404, 'Deze gebruiker bestaat niet (meer).');
    if ((int)q($db, 'SELECT COUNT(*) FROM meldingen WHERE van = ? AND ts > ?', [$ik, $nu - 86400])->fetchColumn() >= 5) fout(429, 'Je hebt vandaag al 5 meldingen gedaan. Probeer het morgen opnieuw.');
    if (q($db, 'SELECT 1 FROM meldingen WHERE van = ? AND tegen = ? AND ts > ?', [$ik, $tegen, $nu - 86400])->fetchColumn() !== false) fout(429, 'Je hebt deze persoon vandaag al gemeld.');
    $uitleg = knip($uitleg, 300); $bewijs = knip((string)$bewijs, 400);
    for ($poging = 0; ; $poging++) {
      try { q($db, 'INSERT INTO meldingen (id, ts, van, tegen, reden, uitleg, bewijs, status, uitkomst) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [nieuwId(), $nu, $ik, $tegen, $reden, $uitleg, $bewijs, 'nieuw', '']); break; }
      catch (Throwable $e) { if ($poging >= 2 || tabelOntbreekt($e)) throw $e; }
    }
    // Antwoord eerst afleveren; de mail aan de beheerder (kan een paar seconden duren) gaat daarna.
    http_response_code(200);
    echo json_encode(['ok' => true]);
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    beheerMailBundel($db, $cfg, $nu, $reden);
    exit;
  }
  case 'waarschuwingen': {
    $r = q($db, 'SELECT id, reden, ts FROM waarschuwingen WHERE account = ? AND gezien = 0 ORDER BY ts, id LIMIT 50', [$ik])->fetchAll();
    foreach ($r as &$x) { $x['id'] = (int)$x['id']; $x['ts'] = (int)$x['ts']; }
    unset($x);
    uit(200, ['lijst' => $r]);
  }
  case 'waarschuwingGezien': {
    $id = $in['id'] ?? null;
    if (!is_int($id) || $id < 1) fout(400, 'Ongeldig verzoek.');
    if (q($db, 'SELECT 1 FROM waarschuwingen WHERE id = ? AND account = ?', [$id, $ik])->fetchColumn() === false) fout(404, 'Deze waarschuwing bestaat niet (meer).');
    q($db, 'UPDATE waarschuwingen SET gezien = 1 WHERE id = ? AND account = ?', [$id, $ik]);
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
