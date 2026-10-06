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

## API (alle verzoeken: POST, JSON, actie in `a`)

Auth voor alles behalve `register`: headers `X-Id` en `X-Token`.
`register {pub}` geeft `{id, token}`; `request {to}`; `inbox`; `respond {from, accept}`; `friends`;
`put {to, data}` (max 96 KB, leeg = verwijderen); `get`; `unfriend {other}`; `deleteAccount`.
Foutcodes: 400, 401, 403, 404, 413, 429, met `{fout: "..."}`.

## Beheer

- Limieten (60 verzoeken per minuut en 5 registraties per uur per IP) en het opruimen van accounts die 365 dagen niet actief waren gebeuren in `api.php`.
- Tests lokaal: zie `test/` (vereist php met pdo_sqlite en Node 20+).
