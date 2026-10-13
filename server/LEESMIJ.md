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
3. Afzender: of een adres op je eigen domein (`'mail_van' => 'noreply@jummysnacks.nl',`), of Gmail met een app-wachtwoord (`mail_van`, `smtp_gebruiker` en `smtp_wachtwoord`, zie `config.example.php`).
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

## Bijwerken naar v3 (blokkeren, melden, waarschuwingen, extra bans)

1. Upload de nieuwe `api.php` (vervangt de oude; `config.php` blijft staan).
2. Voer `migratie-v3.sql` uit in phpMyAdmin (herhaalbaar; maakt alleen de nieuwe tabellen: `blokkades`, `meldingen`, `waarschuwingen`, `ban_email`, `ban_ip`, `acc_ip`, `acc_koppel`, `beheer_mail`, `feedback`). Ook `schema.sql` bevat ze nu.
3. Optioneel: zet `'beheer_mail' => 'jij@voorbeeld.nl'` in `config.php` (zie `config.example.php`). Zonder die regel komt er geen mail.
4. Controleer met `api.php?status=1` en met de beheerpagina (die meldt ontbrekende tabellen).

Zolang stap 2 nog niet is gedaan, werkt de rest van de server gewoon; de nieuwe acties geven dan 503 ("nog niet bijgewerkt").

### Contract voor de client (alle acties: POST, JSON, headers `X-Id` en `X-Token`)

- `blokkeer {id}` -> `{ok:true}`. Haalt de vriendschap (en kaarten/berichten) weg aan beide kanten. `deblokkeer {id}` -> `{ok:true}`. `blokkades` -> `{ids:[...]}` (alleen wie jij blokkeerde; de geblokkeerde ziet niets). Een vriendverzoek van de geblokkeerde aan de blokkeerder geeft `200 {ok:true,status:'pending'}` maar wordt niet opgeslagen. Verzoek van de blokkeerder aan de geblokkeerde geeft 409. send/put/poll tussen hen geven 403 zoals bij niet-vrienden. Max. 500 blokkades per gebruiker (429).
- `meld {tegen, reden: 'naam'|'tekst'|'pesten'|'spam'|'anders', uitleg (max 300), bewijs (max 400, optioneel)}` -> `{ok:true}`. Langere tekst wordt afgekapt. Fouten: 400 (ongeldig, of jezelf), 404 (onbekende gebruiker), 429 (5 per dag per account; 1 per tegen-id per 24 uur).
- `waarschuwingen` -> `{lijst:[{id,reden,ts}]}` (alleen ongelezen; `id` is een getal). `waarschuwingGezien {id}` -> `{ok:true}` (404 als de waarschuwing niet van jou is). `puls` heeft nu het veld `w` (aantal ongelezen waarschuwingen).
- Nieuwe accounts (eerste 24 uur): hoogstens 3 vriendverzoeken per (UTC-)dag, anders 429 met `{fout:"Je account is nieuw: ..."}`. Verzoeken aan blokkeerders tellen mee.
- Koppeling voor "ook e-mailadres blokkeren": stuur bij `accRegistreer`, `accVerifieer`, `accLogin`, `accReset` en `accBackupBewaar` ook de headers `X-Id` en `X-Token` mee. De server bewaart dan alleen de id's van gebruiker en account. Zonder die headers kan de beheerder het e-mailadres niet blokkeren.
- Een geblokkeerd e-mailadres of netwerk geeft bij `register`, `accRegistreer`, `accVerifieer`, `accLogin`, `accReset` een 403 (`{fout}`); `accCodeOpnieuw` en `accVergeten` geven stil 200 zonder mail. Een al ingelogd ander account merkt niets van een ip-ban.

Beheeracties (header `X-Beheer`): `beheerMeldingen` -> `{nu, meldingen:[{id, ts, van, tegen, reden, uitleg, heeftBewijs, aantalTegen, waarschuwingen, ipBekend, ipAccounts, banStatus (null of {tot,reden,ookEmail,ookIp}), status, uitkomst}]}` (nieuw eerst, max. 300); `beheerBewijs {id}` -> `{bewijs}`; `beheerMeldingKlaar {id, uitkomst}`; `beheerWaarschuw {id, reden}`; `beheerBan {id, tot (0 = voorgoed), reden, ook_email, ook_ip}` -> `{ok, tot, reden, emailGeblokkeerd, ipGeblokkeerd, ipTot}`; `beheerOnban {id}` ruimt ook `ban_email`/`ban_ip` op (ook als het account er niet meer is). `beheerStats` toont nu ook `nieuweMeldingen` en `ontbrekendeTabellen`. De IP-ban is altijd hoogstens 7 dagen en nooit voorgoed, wat er ook gevraagd wordt.

### Feedback (v3)

- `feedback {soort: 'fout'|'idee'|'anders', tekst (1..500 tekens), info (0..300 tekens, optioneel)}` -> `200 {ok:true}`. Headers `X-Id` en `X-Token` zijn optioneel: met een geldig vrienden-account is dat de afzender (limiet 3 per dag per account, en een verbannen account krijgt 403 `{verbannen:true,...}`); zonder (of met een ongeldig token) telt alleen het netwerk. Altijd ook hoogstens 20 per dag per ip-hash (429 met `{fout}`). Een geblokkeerd netwerk (`ban_ip`) mag nog wel feedback sturen (onschuldigen op school). Ongeldige soort, geen tekst of tekst/info die geen tekst is: 400. Te lange tekst wordt afgekapt; besturingstekens (en tekens die de leesrichting omkeren) worden eruit gehaald, alleen een nieuwe regel blijft in `tekst`. Zonder tabel `feedback`: 503 ("nog niet bijgewerkt"). Er is geen versiecontrole.
- Tabel `feedback` (id, ts, van = account-id of NULL, ip_hash (alleen hash), soort, tekst, info, status 'nieuw'|'klaar'). Bij het verwijderen van een account wordt `van` leeg gemaakt; de tekst blijft bewaard tot je hem wist.
- Beheer (header `X-Beheer`): `beheerFeedback {alleenNieuw?: bool}` -> `{nu, feedback:[{id, ts, van, soort, tekst, info, status, aantalVanZelfde}]}` (nieuw eerst, daarna nieuwste eerst, max. 300; `aantalVanZelfde` = aantal van hetzelfde account, of van hetzelfde netwerk als er geen account is); `beheerFeedbackKlaar {id}` en `beheerFeedbackWis {id}` -> `{ok:true}` (404 als de id niet bestaat, 400 bij een ongeldige id). `beheerStats` heeft nu ook `nieuweFeedback`.
- Mail aan de beheerder: hergebruikt het gebundelde mailmechanisme (config `beheer_mail`, hoogstens 1 mail per 10 minuten). De mail zegt alleen "Er is nieuwe feedback", het aantal en de soort(en), nooit de tekst of info. Komen er in dezelfde 10 minuten ook meldingen binnen, dan gaat het in één mail ("n nieuwe berichten"), ook zonder inhoud.
- Beheerpagina: tabblad Feedback naast Gebruikers en Meldingen (teller van nieuwe feedback, filter Nieuw/Alles/Klaar en per soort, technische info ingeklapt, knoppen Klaar en Wissen met bevestiging). De tekst wordt altijd als tekst getoond, nooit als HTML.
- Optionele limieten in `config.php`: `limiet_feedback_per_dag` (3) en `limiet_feedback_ip_per_dag` (20).

### E-mailadressen (Gmail-varianten)

Voor het hashen wordt het adres gelijkgetrokken: kleine letters, `googlemail.com` wordt `gmail.com`, bij gmail vallen punten weg, bij alle domeinen valt alles vanaf `+` weg. Bestaande accounts staan nog op de oude hash: bij inloggen en code-controle probeert de server eerst de nieuwe en dan de oude hash; werkt de oude, dan wordt het account omgezet (behalve als die plek al bezet is door een ander account: dan blijft het op de oude hash staan en kan de eigenaar gewoon blijven inloggen met het adres zoals het was). Een bestaand account is pas voor alle varianten vindbaar nadat het één keer is ingelogd met het oorspronkelijke adres.

### Privacy

De server bewaart alleen hashes en id's: geen e-mailadressen, geen ruwe IP-adressen. IP-adressen worden gehasht met het geheime `zout` (IPv6 per /64). Het ip-geheugen (`acc_ip`) wordt na 30 dagen opgeruimd; een ip-ban duurt hoogstens 7 dagen. De mail aan de beheerder bevat nooit inhoud: alleen dat er een melding of feedback is en de reden-categorie (bij feedback de soort), hoogstens 1 mail per 10 minuten. De beheerder ziet bij een melding wel de uitleg en het bewijs die de melder zelf meestuurde (bewijs pas na apart ophalen); dat is niet versleuteld. Meldingen blijven bewaard tot je ze zelf verwijdert. Feedback is gewone tekst die de afzender zelf kiest te sturen (niet versleuteld, geen persoonsgegevens vragen); ook die blijft bewaard tot je hem wist, zonder id van de afzender als het account is verwijderd.
