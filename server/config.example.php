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
  'limiet_per_min' => 60,
  'limiet_reg_per_uur' => 5,
];
