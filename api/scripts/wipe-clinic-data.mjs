import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Run with: npm run db:wipe-clinic-data');
  process.exit(1);
}

// Removes every clinic, doctor and patient (plus everything hanging off them:
// branches, appointments, lab tests, payments, subscriptions, documents, ...)
// while keeping the platform itself usable: sys_admin users + their Super Admin
// grants, subscription plans/offers, platform settings and the specialization list.
//
// Without --confirm this is a dry run that only prints row counts.
const confirm = process.argv.includes('--confirm');

// Business data: emptied completely.
const WIPE = [
  'clinics', 'branches', 'branch_operating_days', 'branch_closures', 'branch_staff', 'branch_gallery_images',
  'doctor_invites', 'doctor_invite_specializations', 'doctors', 'doctor_specialization_map',
  'doctor_branch_assignments', 'doctor_slot_templates', 'doctor_slot_exceptions', 'doctor_time_offs',
  'appointments', 'appointment_patients', 'appointment_status_log', 'appointment_waitlist',
  'payments', 'refunds', 'clinic_payment_ledger', 'receipts', 'reviews', 'prescriptions', 'prescription_scan_jobs',
  'medical_documents', 'patient_medical_profile', 'patient_devices', 'medications', 'medication_doses',
  'patient_documents', 'patient_document_deliveries',
  'lab_tests', 'lab_test_categories', 'branch_lab_tests', 'lab_test_schedules', 'lab_test_appointments',
  'lab_test_appointment_patients', 'lab_test_prescriptions', 'lab_test_appointment_status_log', 'lab_test_payments',
  'clinic_subscriptions', 'subscription_payments', 'subscription_history', 'subscription_offer_recipients',
  'audit_logs', 'otp_codes', 'idempotency_keys',
];
// users: only non-sys_admin rows are deleted; the FK cascades clear their tokens,
// notifications, device tokens and any super_admins grant.
const PARTIAL = ['users', 'refresh_tokens', 'password_reset_tokens', 'email_verification_tokens',
  'notifications', 'device_tokens', 'super_admins'];
const KEEP = ['subscription_plans', 'subscription_offers', 'platform_settings', 'doctor_specializations'];

const conn = await createConnection({ uri: url });
try {
  const [[{ db }]] = await conn.query('SELECT DATABASE() AS db');
  const [rows] = await conn.query(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
  );
  const tables = rows.map((r) => r.name);

  // Refuse to guess about tables this script doesn't know (e.g. added by a later migration).
  const known = new Set([...WIPE, ...PARTIAL, ...KEEP]);
  const unknown = tables.filter((t) => !known.has(t));
  if (unknown.length) {
    console.error(`Unclassified table(s): ${unknown.join(', ')}. Add them to WIPE/PARTIAL/KEEP first.`);
    process.exit(1);
  }

  const count = async (t, where = '') => (await conn.query(`SELECT COUNT(*) AS c FROM \`${t}\` ${where}`))[0][0].c;
  console.log(`Database: ${db}\n`);
  for (const t of WIPE.filter((t) => tables.includes(t))) console.log(`  wipe   ${t.padEnd(34)} ${await count(t)}`);
  console.log(`  delete users (non sys_admin)              ${await count('users', "WHERE role <> 'sys_admin'")}`);
  console.log(`  keep   users (sys_admin)                  ${await count('users', "WHERE role = 'sys_admin'")}`);
  for (const t of KEEP.filter((t) => tables.includes(t))) console.log(`  keep   ${t.padEnd(34)} ${await count(t)}`);

  if (!confirm) {
    console.log('\nDry run only. Re-run with -- --confirm to delete. This cannot be undone.');
    process.exit(0);
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of WIPE.filter((t) => tables.includes(t))) await conn.query(`TRUNCATE TABLE \`${t}\``);
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  // FK checks back on so ON DELETE CASCADE / SET NULL fire for the user-owned rows.
  await conn.query("UPDATE users SET preferred_clinic_id = NULL, preferred_branch_id = NULL WHERE role = 'sys_admin'");
  const [res] = await conn.query("DELETE FROM users WHERE role <> 'sys_admin'");
  console.log(`\nDone. Truncated ${WIPE.length} tables, deleted ${res.affectedRows} users.`);
} finally {
  await conn.end();
}
