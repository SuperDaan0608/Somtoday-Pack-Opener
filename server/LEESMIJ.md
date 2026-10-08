# Vriendenserver (Somtoday Pack Opener)

Kleine PHP 8 + MySQL-API voor de vriendenfunctie. De server ziet alleen willekeurige id's, publieke sleutels en
versleutelde blobs. Geen namen, geen cijfers, geen ruwe IP-adressen (alleen een hash met zout voor de rate limit).

## Installeren op Strato (https://jummysnacks.nl/api.php)

1. Maak in het Strato-klantenmenu een MySQL-database aan (PHP 8 moet aan staan voor het pakket). Noteer host, databasenaam, gebruiker en wachtwoord.
2. Open phpMyAdmin, kies de database en voer de inhoud van `schema.sql` uit (herhaalbaar: opnieuw draaien kan geen kwaad).
3. Kopieer `config.example.php` naar `config.php` en vul de databasegegevens in. Kies bij `zout` een lange willekeurige tekst.
4. Upload via SFTP de bestanden `api.php` en `config.php` naar de hoofdmap van de webspace (het resultaat: `https://jummysnacks.nl/api.php`). De mappen `test/` en bestanden als `schema.sql` en `LEESMIJ.md` hoeven niet mee.
5. Zet `config.php` niet in git en geef het geen publieke leesrechten die je kunt vermijden. Het bevat geen geheimen van gebruikers, wel je databasewachtwoord en het zout.
6. Controleer ook je database en tabellen: open `https://jummysnacks.nl/api.php?status=1`. Je hoort `"ok":true` te zien; anders staat er wat er ontbreekt.
7. Controleer: open `https://jummysnacks.nl/api.php` in de browser. Je hoort een JSON-foutmelding te zien (`{"fout":"Gebruik POST."}`, status 405). Zie je PHP-code, een 500 of een lege pagina, dan staat PHP of config.php niet goed. Of via de terminal: `curl -X POST <adres> -d '{"a":"friends"}'` geeft `{"fout":"Niet ingelogd."}` (401).

HTTPS moet aan staan (de extensie stuurt een token mee).

## Bijwerken naar v2.2 (accounts)

1. Upload de nieuwe `api.php`.
2. Voer `schema.sql` nog een keer uit in phpMyAdmin. Dat kan veilig: hij maakt alleen de nieuwe tabellen `accounts`, `acc_codes`, `acc_sessies` en `acc_backup` erbij.
3. Maak in Strato een e-mailadres op je domein (bijvoorbeeld `noreply@jummysnacks.nl`) en zet in `config.php`: `'mail_van' => 'noreply@jummysnacks.nl',`
4. Controleer met `api.php?status=1`.

Accounts: e-mail + wachtwoord, met een code van 6 cijfers per mail (15 minuten geldig, hoogstens 5 pogingen). De server bewaart alleen een hash van het e-mailadres en een wachtwoord-hash (`password_hash`). De back-up van de voortgang wordt in de browser versleuteld (AES-GCM, sleutel uit wachtwoord + e-mailadres via PBKDF2) en is voor de server en de beheerder onleesbaar. Acties: `accRegistreer`, `accVerifieer`, `accCodeOpnieuw`, `accLogin`, `accVergeten`, `accReset`, en met de header `X-Sessie`: `accBackupLaad`, `accBackupBewaar`, `accUitloggen`, `accVerwijder`.

## API (alle verzoeken: POST, JSON, actie in `a`)

Auth voor alles behalve `register`: headers `X-Id` en `X-Token`.
`register {pub}` geeft `{id, token}`; `request {to}`; `inbox`; `respond {from, accept}`; `friends`;
`put {to, data}` (max 96 KB, leeg = verwijderen); `get`; `unfriend {other}`; `deleteAccount`.
Foutcodes: 400, 401, 403, 404, 413, 429, met `{fout: "..."}`.

## Beheer

- Limieten (60 verzoeken per minuut en 5 registraties per uur per IP) en het opruimen van accounts die 365 dagen niet actief waren gebeuren in `api.php`.
- Tests lokaal: zie `test/` (vereist php met pdo_sqlite en Node 20+).

## Beheer voor de eigenaar

1. Maak een sleutel: `openssl rand -hex 32` en zet in config.php: `'beheer_sleutel' => '...'` (zie config.example.php). Zonder deze regel bestaan de beheeracties niet (404).
2. Voer schema.sql opnieuw uit in phpMyAdmin (herhaalbaar; voegt de tabel `bans` toe).
3. Bouw de eigenaarsversie: `./scripts/package-owner.sh v1.4`, laad de uitgepakte zip in Chrome en open de tab Beheer. De pagina vraagt de sleutel één keer en bewaart hem in chrome.storage.local.

De server ziet en toont alleen id's, tijden, aantallen en groottes; de inhoud blijft versleuteld.
