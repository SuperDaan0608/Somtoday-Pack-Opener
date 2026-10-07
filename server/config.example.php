<?php
// Kopieer dit bestand naar config.php en vul de gegevens in. config.php nooit publiek delen.
return [
  // MySQL (Strato): host staat in je Strato-klantenmenu bij "Datenbank".
  'db_dsn'  => 'mysql:host=DATABASEHOST;dbname=DBNAAM;charset=utf8mb4',
  'db_user' => 'DBGEBRUIKER',
  'db_pass' => 'DBWACHTWOORD',
  // Willekeurige tekst (minstens 32 tekens), alleen gebruikt om IP-adressen onomkeerbaar te hashen.
  'zout' => 'VERVANG-DIT-DOOR-EEN-LANGE-WILLEKEURIGE-TEKST',
  // Limieten (mogen weg; dit zijn de standaardwaarden).
  'limiet_per_min' => 6000,       // per ip-adres (een school deelt vaak één adres)
  'limiet_user_per_min' => 180,   // per gebruiker: 1 sync per seconde past ruim
  'limiet_relay_per_min' => 1200, // per gebruiker: kanaal voor gevechten (poll elke 0,25 s)
  'limiet_reg_per_uur' => 5,
];
