<?php
// Somtoday Pack Opener: vriendenserver. Eén endpoint, JSON in en uit, actie in veld "a".
// De server bewaart alleen willekeurige id's, publieke sleutels en onleesbare (versleutelde) blobs.
declare(strict_types=1);

const MAX_BODY = 131072;  // 128 KB
const MAX_BLOB = 98304;   // 96 KB
const MAX_BERICHT = 2048; // een kanaalbericht (versleuteld) mag hoogstens 2 KB zijn
const BERICHT_TTL = 600;  // berichten in een kanaal verdwijnen na 10 minuten
const MAX_WACHTRIJ = 300; // hoogstens zoveel berichten tegelijk van één afzender naar één ontvanger

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-Id, X-Token');
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
  foreach (['users', 'friendships', 'blobs', 'ratelimit', 'berichten'] as $t) {
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
  q($db, 'DELETE FROM users WHERE id = ?', [$id]);
}
if (random_int(1, 100) === 1) {
  // Minuut-vensters (nu rond 29 miljoen) en uur-vensters (rond 490 duizend) staan in dezelfde tabel; elk krijgt zijn eigen drempel.
  q($db, 'DELETE FROM ratelimit WHERE venster >= 10000000 AND venster < ?', [intdiv($nu, 60) - 120]);
  q($db, 'DELETE FROM berichten WHERE created < ?', [$nu - BERICHT_TTL]);
  q($db, 'DELETE FROM ratelimit WHERE venster < 10000000 AND venster < ?', [intdiv($nu, 3600) - 3]);
  $oud = q($db, 'SELECT id FROM users WHERE last_seen < ?', [$nu - 365 * 86400])->fetchAll(PDO::FETCH_COLUMN);
  foreach ($oud as $o) verwijderGebruiker($db, $o);
}

$actie = $in['a'] ?? '';
if (!is_string($actie)) fout(400, 'Ongeldige actie.');

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
// Per gebruiker: gewone verzoeken (1 per seconde sync + wat extra) en het kanaal voor gevechten (poll elke 0,25 s) apart.
$relayActie = $actie === 'send' || $actie === 'poll';
if ($relayActie) tel($db, hash('sha256', $ik . ':rel'), intdiv($nu, 60), (int)($cfg['limiet_relay_per_min'] ?? 1200));
else tel($db, hash('sha256', $ik . ':usr'), intdiv($nu, 60), (int)($cfg['limiet_user_per_min'] ?? 180));
if ($nu - (int)$rij['last_seen'] > 3600) q($db, 'UPDATE users SET last_seen = ? WHERE id = ?', [$nu, $ik]);

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
    uit(200, ['verzoeken' => $r]);
  }
  case 'respond': {
    $van = $in['from'] ?? null;
    if (!isId($van) || !is_bool($in['accept'] ?? null)) fout(400, 'Ongeldig verzoek.');
    $f = q($db, 'SELECT 1 FROM friendships WHERE a = ? AND b = ? AND status = ?', [$van, $ik, 'pending'])->fetchColumn();
    if ($f === false) fout(404, 'Geen openstaand verzoek van deze vriend.');
    if ($in['accept']) q($db, 'UPDATE friendships SET status = ? WHERE a = ? AND b = ?', ['accepted', $van, $ik]);
    else q($db, 'DELETE FROM friendships WHERE a = ? AND b = ?', [$van, $ik]);
    uit(200, ['ok' => true]);
  }
  case 'friends': {
    $r = q($db, 'SELECT u.id AS id, u.pub AS pub FROM friendships f JOIN users u ON u.id = (CASE WHEN f.a = ? THEN f.b ELSE f.a END) WHERE (f.a = ? OR f.b = ?) AND f.status = ?', [$ik, $ik, $ik, 'accepted'])->fetchAll();
    uit(200, ['vrienden' => $r]);
  }
  case 'put': {
    $to = $in['to'] ?? null;
    $data = $in['data'] ?? null;
    if (!isId($to) || !is_string($data)) fout(400, 'Ongeldig verzoek.');
    if (strlen($data) > MAX_BLOB) fout(413, 'Gegevens te groot (max 96 KB).');
    if ($data !== '' && !preg_match('/^[A-Za-z0-9._-]+$/', $data)) fout(400, 'Ongeldig formaat.');
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
