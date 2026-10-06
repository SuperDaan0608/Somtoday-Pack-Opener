<?php
// Somtoday Pack Opener: vriendenserver. Eén endpoint, JSON in en uit, actie in veld "a".
// De server bewaart alleen willekeurige id's, publieke sleutels en onleesbare (versleutelde) blobs.
declare(strict_types=1);

const MAX_BODY = 131072;  // 128 KB
const MAX_BLOB = 98304;   // 96 KB

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
tel($db, hash('sha256', $ipHash . ':req'), intdiv($nu, 60), (int)($cfg['limiet_per_min'] ?? 60));

// Opruimen: oude limiet-rijen en gebruikers die 365 dagen niet actief waren (1% van de verzoeken).
function verwijderGebruiker(PDO $db, string $id): void {
  q($db, 'DELETE FROM blobs WHERE owner = ? OR recipient = ?', [$id, $id]);
  q($db, 'DELETE FROM friendships WHERE a = ? OR b = ?', [$id, $id]);
  q($db, 'DELETE FROM users WHERE id = ?', [$id]);
}
if (random_int(1, 100) === 1) {
  q($db, 'DELETE FROM ratelimit WHERE venster < ?', [intdiv($nu, 60) - 120]);
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
    q($db, 'DELETE FROM blobs WHERE owner = ? AND recipient = ?', [$ik, $to]);
    if ($data !== '') q($db, 'INSERT INTO blobs (owner, recipient, data, updated) VALUES (?, ?, ?, ?)', [$ik, $to, $data, $nu]);
    $db->commit();
    uit(200, ['ok' => true]);
  }
  case 'get': {
    $r = q($db, 'SELECT owner, data, updated FROM blobs WHERE recipient = ?', [$ik])->fetchAll();
    foreach ($r as &$x) $x['updated'] = (int)$x['updated'];
    uit(200, ['blobs' => $r]);
  }
  case 'unfriend': {
    $o = $in['other'] ?? null;
    if (!isId($o)) fout(400, 'Ongeldig verzoek.');
    $db->beginTransaction();
    q($db, 'DELETE FROM friendships WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', [$ik, $o, $o, $ik]);
    q($db, 'DELETE FROM blobs WHERE (owner = ? AND recipient = ?) OR (owner = ? AND recipient = ?)', [$ik, $o, $o, $ik]);
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
