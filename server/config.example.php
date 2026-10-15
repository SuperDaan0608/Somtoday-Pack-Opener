<?php
// Kopieer dit bestand naar config.php en vul de gegevens in. config.php nooit publiek delen.
return [
  // MySQL (Strato): host staat in je Strato-klantenmenu bij "Datenbank".
  'db_dsn'  => 'mysql:host=DATABASEHOST;dbname=DBNAAM;charset=utf8mb4',
  'db_user' => 'DBGEBRUIKER',
  'db_pass' => 'DBWACHTWOORD',
  // Willekeurige tekst (minstens 32 tekens), alleen gebruikt om IP-adressen onomkeerbaar te hashen.
  'zout' => 'VERVANG-DIT-DOOR-EEN-LANGE-WILLEKEURIGE-TEKST',
  // Beheer voor de eigenaar: een lange geheime tekst (minstens 16 tekens; maak er een met: openssl rand -hex 32).
  // Zonder deze regel (of leeg) bestaan de beheeracties niet. Zet hem nooit in git of in de extensie.
  // 'beheer_sleutel' => 'VERVANG-DIT-DOOR-EEN-LANGE-GEHEIME-TEKST',
  // Mail aan jezelf bij een nieuwe melding van een gebruiker (v3, optioneel; zonder deze regel komt er geen mail).
  // De mail bevat nooit inhoud: alleen "Er is een nieuwe melding", de reden-categorie en "Open je beheerpagina". Hoogstens 1 mail per 10 minuten
  // (meldingen in die tijd gaan mee in de volgende mail). Gebruikt dezelfde mail-instellingen als de codes hieronder.
  // 'beheer_mail' => 'jij@voorbeeld.nl',
  // Accounts (v2.2): het afzenderadres voor de mails met codes. Moet een adres van je eigen domein zijn (maak het aan in Strato).
  'mail_van' => 'noreply@JOUWDOMEIN.nl',
  // Liever via Gmail? Zet dan mail_van op je Gmail-adres en vul hieronder een app-wachtwoord in
  // (Google-account > Beveiliging > 2-stapsverificatie aan > App-wachtwoorden). Niet je gewone wachtwoord!
  // 'mail_van' => 'jouwnaam@gmail.com',
  // 'smtp_host' => 'smtp.gmail.com',
  // 'smtp_poort' => 465,
  // 'smtp_gebruiker' => 'jouwnaam@gmail.com',
  // 'smtp_wachtwoord' => 'abcd efgh ijkl mnop',
  // Jaaroverzicht met AI (v3, optioneel): de terugblik 'Jouw jaar' wordt dan door Groq geschreven, op basis van een paar getallen (geen namen, geen vaknamen,
  // geen tekst) die de gebruiker na uitdrukkelijke toestemming laat versturen. Zonder groq_sleutel (of leeg) gebruikt de extensie de lokale terugblik zonder AI.
  // Maak een sleutel op https://console.groq.com/keys en zet hem ALLEEN hier in config.php op de server. Nooit in git, nooit in de extensie.
  'groq_sleutel' => '',                          // bijv. 'gsk_...'
  // 'groq_model' => 'llama-3.3-70b-versatile',  // een snel Groq-model
  // 'groq_url' => 'https://api.groq.com/openai/v1/chat/completions', // alleen veranderen voor tests
  // 'limiet_jaar_per_dag' => 150,               // hoeveel jaaroverzichten er per dag in totaal gemaakt mogen worden
  // 'limiet_jaar_per_account_per_dag' => 1,     // per account per dag
  // 'jaar_gelijktijdig' => 2,                   // hoeveel aanvragen tegelijk naar Groq mogen
  // Limieten (mogen weg; dit zijn de standaardwaarden).
  'limiet_per_min' => 6000,       // per ip-adres (een school deelt vaak één adres)
  'limiet_user_per_min' => 180,   // per gebruiker: 1 sync per seconde past ruim
  'limiet_relay_per_min' => 1200, // per gebruiker: kanaal voor gevechten (poll elke 0,25 s)
  'limiet_reg_per_uur' => 5,
  'limiet_mail_per_uur' => 200,      // mails met codes per ip-adres (een school deelt vaak één adres)
  'limiet_mail_email_per_uur' => 5,  // mails met codes per e-mailadres
  'limiet_login_per_min' => 120,     // inlogpogingen per ip-adres
  // 'limiet_nieuw_verzoek_per_dag' => 3, // vriendverzoeken per dag voor accounts van minder dan 24 uur oud
  // 'limiet_feedback_per_dag' => 3,      // feedback per account per dag
  // 'limiet_feedback_ip_per_dag' => 20,  // feedback per netwerk (ip-hash) per dag
  // 'limiet_drop_per_dag' => 5,         // mythische kaarten melden per account per dag (wekelijkse drop)
  // 'limiet_drop_ip_per_dag' => 30,      // idem per netwerk (ip-hash) per dag
  // 'limiet_beheer_per_min' => 30, // beheerverzoeken per ip-adres (ook foute sleutels tellen mee)
];
