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
  'limiet_mail_per_uur' => (int)(getenv('SPO_LIMIET_MAIL') ?: 20),
  'limiet_login_per_min' => (int)(getenv('SPO_LIMIET_LOGIN') ?: 30),
  'vrienden_zelfde_versie' => getenv('SPO_VERSIECHECK') === '1',
  'beheer_mail' => getenv('SPO_BEHEERMAIL') ?: null,
  'limiet_nieuw_verzoek_per_dag' => getenv('SPO_NIEUWLIMIET') ? (int)getenv('SPO_NIEUWLIMIET') : 3,
  'groq_sleutel' => getenv('SPO_GROQ_SLEUTEL') ?: '',
  'groq_url' => getenv('SPO_GROQ_URL') ?: 'http://127.0.0.1:9/geen-groq',
  'groq_timeout' => (int)(getenv('SPO_GROQ_TIMEOUT') ?: 5),
  'limiet_jaar_per_dag' => (int)(getenv('SPO_JAAR_DAG') ?: 150),
  'limiet_jaar_per_account_per_dag' => (int)(getenv('SPO_JAAR_ACC') ?: 1),
  'jaar_gelijktijdig' => (int)(getenv('SPO_JAAR_GELIJK') ?: 2),
  'limiet_beheer_per_min' => (int)(getenv('SPO_LIMIET_BEHEER') ?: 30),
];
