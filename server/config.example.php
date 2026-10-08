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
  // Accounts (v2.2): het afzenderadres voor de mails met codes. Moet een adres van je eigen domein zijn (maak het aan in Strato).
  'mail_van' => 'noreply@JOUWDOMEIN.nl',
  // Limieten (mogen weg; dit zijn de standaardwaarden).
  'limiet_per_min' => 6000,       // per ip-adres (een school deelt vaak één adres)
  'limiet_user_per_min' => 180,   // per gebruiker: 1 sync per seconde past ruim
  'limiet_relay_per_min' => 1200, // per gebruiker: kanaal voor gevechten (poll elke 0,25 s)
  'limiet_reg_per_uur' => 5,
  'limiet_mail_per_uur' => 200,      // mails met codes per ip-adres (een school deelt vaak één adres)
  'limiet_mail_email_per_uur' => 5,  // mails met codes per e-mailadres
  'limiet_login_per_min' => 120,     // inlogpogingen per ip-adres
  // 'limiet_beheer_per_min' => 30, // beheerverzoeken per ip-adres (ook foute sleutels tellen mee)
];
