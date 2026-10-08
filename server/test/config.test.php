<?php
// Testconfig: SQLite-bestand in de map uit SPO_TESTDB (of /tmp).
$pad = getenv('SPO_TESTDB') ?: sys_get_temp_dir() . '/spo-test.sqlite';
return [
  'db_dsn' => 'sqlite:' . $pad, 'db_user' => null, 'db_pass' => null,
  'zout' => 'testzout-testzout-testzout-testzout',
  'limiet_per_min' => (int)(getenv('SPO_LIMIET') ?: 6000),
  'limiet_user_per_min' => (int)(getenv('SPO_LIMIET_USER') ?: 180),
  'limiet_relay_per_min' => (int)(getenv('SPO_LIMIET_REL') ?: 1200),
  'limiet_reg_per_uur' => (int)(getenv('SPO_REGLIMIET') ?: 100),
  'beheer_sleutel' => getenv('SPO_BEHEER') ?: null,
  'mail_bestand' => getenv('SPO_MAILBESTAND') ?: (sys_get_temp_dir() . '/spo-mail.jsonl'),
  'limiet_mail_email_per_uur' => 50,
  'limiet_login_email_per_uur' => 200,
  'vrienden_zelfde_versie' => getenv('SPO_VERSIECHECK') === '1',
  'limiet_beheer_per_min' => (int)(getenv('SPO_LIMIET_BEHEER') ?: 30),
];
