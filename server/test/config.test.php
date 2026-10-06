<?php
// Testconfig: SQLite-bestand in de map uit SPO_TESTDB (of /tmp).
$pad = getenv('SPO_TESTDB') ?: sys_get_temp_dir() . '/spo-test.sqlite';
return [
  'db_dsn' => 'sqlite:' . $pad, 'db_user' => null, 'db_pass' => null,
  'zout' => 'testzout-testzout-testzout-testzout',
  'limiet_per_min' => (int)(getenv('SPO_LIMIET') ?: 600),
  'limiet_reg_per_uur' => (int)(getenv('SPO_REGLIMIET') ?: 100),
];
